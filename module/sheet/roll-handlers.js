/* global game, Roll, ChatMessage, CONST, CONFIG */
import { createChatMessage } from './chat-helpers.js'
/**
 * Roll Handlers
 * Ability check, saving throw, skill check, and trait roll functions.
 * All functions receive the sheet instance as the first parameter.
 */

import { AdventurerDataModel } from '../data-models.mjs'
import { getTraitRollOptions } from './trait-helpers.js'
import { getDieIconFromFormula } from './attack-rolls.js'

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Format a number as a formula term, e.g. ' + 2' or ' - 1'.
 * @param {number} value
 * @param {boolean} [includeZero] - Emit ' + 0' instead of '' for zero
 * @returns {string}
 */
function signedTerm(value, includeZero = false) {
	if (!value && !includeZero) return ''
	return value >= 0 ? ` + ${value}` : ` - ${Math.abs(value)}`
}

/**
 * Format a bonus for display, e.g. '+2' or '-1'.
 * @param {number} value
 * @returns {string}
 */
function formatBonus(value) {
	return value >= 0 ? `+${value}` : `${value}`
}

/**
 * Screen position for a roll panel, anchored to the clicked element.
 * @param {Event} [event]
 * @returns {{top: number, left: number}}
 */
function getPanelPosition(event) {
	if (!event?.currentTarget) return { top: 100, left: 100 }
	const rect = event.currentTarget.getBoundingClientRect()
	return { top: rect.top, left: rect.left }
}

/**
 * Resolve a d6 check: a natural 1 always fails and a natural 6 always succeeds,
 * irrespective of modifiers; otherwise the total must meet the target.
 * @param {number} natural - The face rolled on the d6
 * @param {number} total - The roll total including modifiers
 * @param {number} target - The total needed to succeed
 * @returns {{isSuccess: boolean, naturalNote: string}} naturalNote is set only when the natural roll changed the outcome
 */
function resolveD6Check(natural, total, target) {
	const byTotal = total >= target
	if (natural === 1 && byTotal) return { isSuccess: false, naturalNote: game.i18n.localize('DOLMEN.Roll.Natural1') }
	if (natural === 6 && !byTotal) return { isSuccess: true, naturalNote: game.i18n.localize('DOLMEN.Roll.Natural6') }
	return { isSuccess: byTotal, naturalNote: '' }
}

/* -------------------------------------------- */
/*  Ability Check Roll Methods                  */
/* -------------------------------------------- */

/**
 * Handle ability check roll - checks for trait options and shows context menu if needed.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} abilityKey - The ability key (e.g., 'strength', 'dexterity')
 * @param {Event} event - The click event for positioning
 */
export function onAbilityRoll(sheet, abilityKey, event) {
	const rollOptions = getTraitRollOptions(sheet.actor, `abilities.${abilityKey}`)

	openRollModifierPanel(sheet, rollOptions, event, ({ traitBonus, traitNames, numericMod }) => {
		performAbilityCheck(sheet.actor, abilityKey, traitBonus, traitNames.join(', ') || null, numericMod)
	})
}

/**
 * Perform an ability check roll. Roll 1d6 + ability modifier vs DC 4.
 * @param {Actor} actor - The rolling adventurer
 * @param {string} abilityKey - The ability key
 * @param {number} traitScoreBonus - Bonus to ability score from selected trait
 * @param {string} [traitName] - Name of the trait providing bonus
 * @param {number} [rollModifier] - Situational modifier added to the roll (e.g. a Referee-imposed penalty)
 */
export async function performAbilityCheck(actor, abilityKey, traitScoreBonus = 0, traitName = null, rollModifier = 0) {
	const adjusted = actor.system.final
	const baseScore = adjusted.abilities[abilityKey]?.score
	const baseMod = adjusted.abilities[abilityKey]?.mod
	if (baseScore === undefined) return

	const abilityName = game.i18n.localize(`DOLMEN.Abilities.${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)}`)
	const dc = 4

	// If trait bonus is applied, recalculate modifier from adjusted score
	let effectiveScore = baseScore
	let effectiveMod = baseMod
	if (traitScoreBonus !== 0) {
		effectiveScore = Math.min(18, baseScore + traitScoreBonus)
		effectiveMod = AdventurerDataModel.computeModifier(effectiveScore)
	}

	// Build formula with effective modifier and any situational roll modifier
	const formula = `1d6${signedTerm(effectiveMod)}${signedTerm(rollModifier)}`
	const roll = new Roll(formula)
	await roll.evaluate()

	const { isSuccess, naturalNote } = resolveD6Check(roll.dice[0].results[0].result, roll.total, dc)

	let resultClass = isSuccess ? 'success' : 'failure'
	let resultLabel = game.i18n.localize(isSuccess ? 'DOLMEN.Roll.Success' : 'DOLMEN.Roll.Failure')
	if (naturalNote) resultLabel += ` (${naturalNote})`

	const anchor = await roll.toAnchor({ classes: ['ability-inline-roll', 'inline-dsn-hidden'] })

	// Build breakdown string showing components
	let breakdownParts = [`1d6`]
	if (traitScoreBonus !== 0 && traitName) {
		breakdownParts.push(`${signedTerm(effectiveMod, true)} (${baseScore}+${traitScoreBonus}=${effectiveScore})`)
	} else if (effectiveMod !== 0) {
		breakdownParts.push(signedTerm(effectiveMod))
	}
	if (rollModifier !== 0) breakdownParts.push(signedTerm(rollModifier))
	const breakdown = breakdownParts.join(' ').replace(/ {2,}/g, ' ').trim()

	const traitBadge = [
		traitName ? `<span class="trait-badge">${traitName}</span>` : '',
		rollModifier !== 0 ? `<span class="trait-badge">${formatBonus(rollModifier)}</span>` : ''
	].filter(Boolean).join(' ')

	const chatContent = `
		<div class="dolmen ability-roll">
			<div class="roll-header ability">
				<i class="fa-solid fa-dice-d6"></i>
				<div class="roll-info">
					<h3>${abilityName} ${traitBadge}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.AbilityCheck')}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result force-d6-icon">
						${anchor.outerHTML}
					</div>
					<span class="roll-breakdown">${breakdown}</span>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.DC')}: ${dc}</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/* -------------------------------------------- */
/*  Saving Throw Roll Methods                   */
/* -------------------------------------------- */

/**
 * Handle saving throw roll - checks for trait options and shows context menu if needed.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} saveKey - The save key (e.g., 'doom', 'ray', 'hold', 'blast', 'spell')
 * @param {Event} event - The click event for positioning
 */
export function onSaveRoll(sheet, saveKey, event) {
	const modifiers = getTraitRollOptions(sheet.actor, `saves.${saveKey}`)

	// Add Magic Resistance option if actor has MR > 0
	const mr = sheet.actor.type === 'Adventurer'
		? (sheet.actor.system.final?.magicResistance || 0)
		: (sheet.actor.system.specialAbilities?.some(a => a.name.toLowerCase() === 'magic resistance') ? 2 : 0)
	if (mr > 0) {
		modifiers.push({
			id: 'magicResistance',
			name: game.i18n.localize('DOLMEN.Traits.MagicResistance'),
			bonus: mr,
			condition: null
		})
	}

	openRollModifierPanel(sheet, modifiers, event, ({ traitBonus, traitNames, numericMod }) => {
		const names = numericMod !== 0 ? [...traitNames, formatBonus(numericMod)] : traitNames
		performSavingThrow(sheet, saveKey, traitBonus + numericMod, names)
	})
}

/**
 * Open a roll modifier panel (multi-select trait bonuses + numeric grid).
 * Shared by ability checks, saving throws, and skill checks.
 * Shift-click skips the panel and rolls with the default-selected trait options only.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object[]} modifiers - Available trait modifier options
 * @param {Event} [event] - The click event (for positioning and Shift fast-forward)
 * @param {Function} onRoll - Called with { traitBonus, traitNames, numericMod } when ROLL is clicked
 */
function openRollModifierPanel(sheet, modifiers, event, onRoll) {
	if (event?.shiftKey) {
		const defaults = modifiers.filter(m => m.defaultSelected)
		onRoll({
			traitBonus: defaults.reduce((sum, m) => sum + m.bonus, 0),
			traitNames: defaults.map(m => m.name),
			numericMod: 0
		})
		return
	}
	const position = getPanelPosition(event)

	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Build HTML
	const hint = game.i18n.localize('DOLMEN.Roll.ShiftClickHint')
	let html = `<div class="roll-btn" data-tooltip="${hint}"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	// Modifier toggles (multi-select)
	if (modifiers.length > 0) {
		html += '<div class="menu-separator"></div>'
		for (const mod of modifiers) {
			const bonusStr = mod.bonus >= 0 ? `+${mod.bonus}` : `${mod.bonus}`
			html += `
				<div class="modifier-item${mod.defaultSelected ? ' selected' : ''}" data-mod-id="${mod.id}"${mod.exclusiveGroup ? ` data-exclusive-group="${mod.exclusiveGroup}"` : ''}>
					<span class="mod-check">${mod.defaultSelected ? '✓' : ''}</span>
					<span class="mod-name">${mod.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

	// Numeric modifier grid
	html += '<div class="menu-separator"></div>'
	html += '<div class="numeric-grid">'
	for (const val of [-4, -3, -2, -1]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
	}
	for (const val of [1, 2, 3, 4]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
	}
	html += '</div>'

	// Create panel element
	const panel = document.createElement('div')
	panel.className = 'dolmen-weapon-context-menu modifier-panel'
	panel.innerHTML = html
	panel.style.position = 'fixed'
	panel.style.top = `${position.top}px`
	panel.style.left = `${position.left}px`
	sheet.element.appendChild(panel)

	// Adjust position (appear to left of click)
	const panelRect = panel.getBoundingClientRect()
	panel.style.left = `${position.left - panelRect.width - 5}px`

	// Modifier toggle behavior (multi-select; options sharing an exclusive group deselect each other)
	panel.querySelectorAll('.modifier-item').forEach(item => {
		item.addEventListener('click', () => {
			const group = item.dataset.exclusiveGroup
			if (group && !item.classList.contains('selected')) {
				panel.querySelectorAll(`.modifier-item[data-exclusive-group="${group}"].selected`).forEach(other => {
					other.classList.remove('selected')
					other.querySelector('.mod-check').textContent = ''
				})
			}
			item.classList.toggle('selected')
			const check = item.querySelector('.mod-check')
			check.textContent = item.classList.contains('selected') ? '\u2713' : ''
		})
	})

	// Numeric button behavior (single-select toggle)
	panel.querySelectorAll('.numeric-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const wasSelected = btn.classList.contains('selected')
			panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
			if (!wasSelected) btn.classList.add('selected')
		})
	})

	// Close panel when clicking outside
	const closePanel = (e) => {
		if (!panel.contains(e.target)) {
			panel.remove()
			document.removeEventListener('click', closePanel)
		}
	}

	// ROLL button
	panel.querySelector('.roll-btn').addEventListener('click', () => {
		// Gather selected trait modifiers
		const traitNames = []
		let traitBonus = 0
		panel.querySelectorAll('.modifier-item.selected').forEach(item => {
			const mod = modifiers.find(m => m.id === item.dataset.modId)
			if (mod) {
				traitBonus += mod.bonus
				traitNames.push(mod.name)
			}
		})

		// Gather numeric modifier
		const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
		const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0

		panel.remove()
		document.removeEventListener('click', closePanel)
		onRoll({ traitBonus, traitNames, numericMod })
	})

	setTimeout(() => document.addEventListener('click', closePanel), 0)
}

/**
 * Perform a saving throw roll. Success if d20 + bonus >= save target.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} saveKey - The save key
 * @param {number} traitBonus - Total bonus added to the roll
 * @param {string[]} [modifierNames] - Names of applied modifiers for display
 */
async function performSavingThrow(sheet, saveKey, traitBonus = 0, modifierNames = []) {
	const baseSaveTarget = sheet.actor.system.final?.saves?.[saveKey]
		?? sheet.actor.system.saves[saveKey]
	if (baseSaveTarget === undefined) return

	const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

	const formula = traitBonus !== 0 ? `1d20 + ${traitBonus}` : '1d20'
	const roll = new Roll(formula)
	await roll.evaluate()

	const total = roll.total
	const isSuccess = total >= baseSaveTarget

	const resultClass = isSuccess ? 'success' : 'failure'
	const resultLabel = isSuccess
		? game.i18n.localize('DOLMEN.Roll.Success')
		: game.i18n.localize('DOLMEN.Roll.Failure')

	const anchor = await roll.toAnchor({ classes: ['save-inline-roll', 'inline-dsn-hidden'] })

	const traitBadges = modifierNames.map(n => `<span class="trait-badge">${n}</span>`).join(' ')
	const targetDisplay = `${baseSaveTarget}+`

	const chatContent = `
		<div class="dolmen save-roll">
			<div class="roll-header save">
				<i class="fa-solid fa-shield-halved"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Roll.SaveVs')} ${saveName} ${traitBadges}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SavingThrow')}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${targetDisplay}</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/* -------------------------------------------- */
/*  Skill Check Roll Methods                    */
/* -------------------------------------------- */

/**
 * Handle skill check roll - checks for trait options and shows context menu if needed.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} skillKey - The skill key (e.g., 'listen', 'search', 'survival')
 * @param {number} [targetOverride] - Override the target value (for extra skills)
 * @param {Event} event - The click event for positioning
 * @param {string} [customName] - Custom display name for user-defined skills
 */
export function onSkillRoll(sheet, skillKey, targetOverride, event, customName) {
	const rollOptions = getTraitRollOptions(sheet.actor, `skills.${skillKey}`)

	openRollModifierPanel(sheet, rollOptions, event, ({ traitBonus, traitNames, numericMod }) => {
		performSkillCheck(sheet.actor, skillKey, targetOverride, traitBonus, traitNames.join(', ') || null, customName, numericMod)
	})
}

/**
 * Perform a skill check roll. Success if d6 >= skill target.
 * @param {Actor} actor - The rolling adventurer
 * @param {string} skillKey - The skill key
 * @param {number} [targetOverride] - Override the target value (for extra skills)
 * @param {number} traitBonus - Additional bonus from selected trait
 * @param {string} [traitName] - Name of the trait providing bonus
 * @param {string} [customName] - Custom display name for user-defined skills
 * @param {number} [rollModifier] - Situational modifier added to the d6 roll
 */
export async function performSkillCheck(actor, skillKey, targetOverride = null, traitBonus = 0, traitName = null, customName = null, rollModifier = 0) {
	const adjusted = actor.system.final
	let baseSkillTarget = targetOverride

	if (baseSkillTarget === null) {
		baseSkillTarget = adjusted.skills[skillKey]
	}

	if (baseSkillTarget === undefined || baseSkillTarget === null) return

	// Trait bonus increases the skill target (making it easier)
	const skillTarget = baseSkillTarget + traitBonus

	const skillName = customName || game.i18n.localize(`DOLMEN.Skills.${skillKey}`)

	const roll = new Roll(`1d6${signedTerm(rollModifier)}`)
	await roll.evaluate()

	const { isSuccess, naturalNote } = resolveD6Check(roll.dice[0].results[0].result, roll.total, skillTarget)

	let resultClass = isSuccess ? 'success' : 'failure'
	let resultLabel = game.i18n.localize(isSuccess ? 'DOLMEN.Roll.Success' : 'DOLMEN.Roll.Failure')
	if (naturalNote) resultLabel += ` (${naturalNote})`

	const anchor = await roll.toAnchor({ classes: ['skill-inline-roll', 'inline-dsn-hidden'] })

	const traitBadge = [
		traitName ? `<span class="trait-badge">${traitName}</span>` : '',
		rollModifier !== 0 ? `<span class="trait-badge">${formatBonus(rollModifier)}</span>` : ''
	].filter(Boolean).join(' ')
	const targetDisplay = traitBonus !== 0
		? `${baseSkillTarget} + ${traitBonus} = ${skillTarget}`
		: `${skillTarget}`

	const chatContent = `
		<div class="dolmen skill-roll">
			<div class="roll-header skill">
				<i class="fa-solid fa-magnifying-glass"></i>
				<div class="roll-info">
					<h3>${skillName} ${traitBadge}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SkillCheck')}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result force-d6-icon">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${targetDisplay}+</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/* -------------------------------------------- */
/*  Trait Roll                                  */
/* -------------------------------------------- */

/**
 * Roll a trait ability and send result to chat.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} traitId - The trait identifier
 * @param {string} traitName - Display name of the trait
 * @param {string} formula - Dice formula to roll
 * @param {number|null} rollTarget - Success target for chance rolls
 */
export async function rollTrait(sheet, traitId, traitName, formula, rollTarget = null) {
	const roll = new Roll(formula)
	await roll.evaluate()

	// Determine success/failure for chance rolls (X-in-6)
	let resultSection = ''
	if (rollTarget !== null && !isNaN(rollTarget)) {
		const isSuccess = roll.total <= rollTarget
		const resultClass = isSuccess ? 'success' : 'failure'
		const resultLabel = isSuccess
			? game.i18n.localize('DOLMEN.Roll.Success')
			: game.i18n.localize('DOLMEN.Roll.Failure')
		resultSection = `<span class="roll-label ${resultClass}">${resultLabel}</span>`
	}

	const diceIconClass = getDieIconFromFormula(formula)

	const chatContent = `
		<div class="dolmen trait-roll">
			<div class="trait-header">
				<h3>${traitName}</h3>
			</div>
			<div class="roll-result ${diceIconClass}">
				${(await roll.toAnchor({ classes: ['trait-inline-roll', 'inline-dsn-hidden'] })).outerHTML}
				${resultSection}
			</div>
			<span class="roll-breakdown">${formula}${rollTarget !== null ? ` (${rollTarget} ${game.i18n.localize('DOLMEN.Roll.OrLess')})` : ''}</span>
		</div>
	`

	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Post a trait to chat (name + description), optionally with a roll.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} options - Trait options
 * @param {string} options.name - Display name of the trait
 * @param {string} options.desc - Description text of the trait
 * @param {string} [options.value] - Trait value badge (e.g. "1d6")
 * @param {string} [options.mode='shared'] - 'shared' or 'used'
 * @param {string|null} [options.formula] - Dice formula to roll
 * @param {number|null} [options.rollTarget] - Success target for chance rolls
 * @param {number|null} [options.usesRemaining] - Remaining uses after this use
 * @param {string|null} [options.usageFrequency] - Usage frequency label (e.g. "1/day")
 */
export async function useTrait(sheet, { name, desc, value = null, mode = 'shared', formula = null, rollTarget = null, usesRemaining = null, usageFrequency = null } = {}) {
	let rollSection = ''
	let sound = null
	let traitRoll = null

	if (formula) {
		traitRoll = new Roll(formula)
		await traitRoll.evaluate()
		const roll = traitRoll

		let resultHtml = ''
		if (rollTarget !== null && !isNaN(rollTarget)) {
			const isSuccess = roll.total <= rollTarget
			const resultClass = isSuccess ? 'success' : 'failure'
			const resultLabel = isSuccess
				? game.i18n.localize('DOLMEN.Roll.Success')
				: game.i18n.localize('DOLMEN.Roll.Failure')
			resultHtml = `<span class="roll-label ${resultClass}">${resultLabel}</span>`
		}

		const diceIconClass = getDieIconFromFormula(formula)
		rollSection = `
			<div class="roll-result ${diceIconClass}">
				${(await roll.toAnchor({ classes: ['trait-inline-roll', 'inline-dsn-hidden'] })).outerHTML}
				${resultHtml}
			</div>
			<span class="roll-breakdown">${formula}${rollTarget !== null ? ` (${rollTarget} ${game.i18n.localize('DOLMEN.Roll.OrLess')})` : ''}</span>
		`
		sound = CONFIG.sounds.dice
	}

	const valueBadge = value ? `<span class="trait-badge">${value}</span>` : ''
	const usageHtml = usesRemaining !== null
		? `<span class="trait-chat-usage">${usageFrequency || ''} (${usesRemaining} ${game.i18n.localize('DOLMEN.Traits.Remaining')})</span>`
		: ''

	const chatContent = `
		<div class="dolmen trait-roll">
			<div class="trait-header">
				<h3>${name}${valueBadge}</h3>
			</div>
			<p class="trait-chat-desc">${desc}</p>
			${rollSection}
			${usageHtml}
		</div>
	`

	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: traitRoll ? [traitRoll] : [],
		sound,
		style: mode === 'shared' ? CONST.CHAT_MESSAGE_STYLES.OOC : CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}
