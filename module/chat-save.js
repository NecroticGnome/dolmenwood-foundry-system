/* global game, canvas, ui, ChatMessage, Roll, CONST, CONFIG */
import { createChatMessage } from './sheet/chat-helpers.js'
import { getTraitRollOptions } from './sheet/trait-helpers.js'
import { parseSaveLinks } from './utils/save-links.js'

export { parseSaveLinks }

/**
 * Get an actor's magic resistance value.
 * Adventurers: computed from WIS mod + adjustments + traits (stored in system.final).
 * Creatures: +2 if they have a "Magic Resistance" special ability, otherwise 0.
 * @param {Actor} actor
 * @returns {number}
 */
function getActorMagicResistance(actor) {
	if (actor.type === 'Adventurer') return actor.system.final?.magicResistance || 0
	const hasAbility = actor.system.specialAbilities?.some(
		a => a.name.toLowerCase() === 'magic resistance'
	)
	return hasAbility ? 2 : 0
}

/**
 * Get the save modifier options available to an actor: trait roll options
 * plus magic resistance (if any).
 * @param {Actor} actor
 * @param {string} saveKey - The save type
 * @returns {object[]} Options as { id, name, bonus, exclusiveGroup }
 */
function getActorSaveOptions(actor, saveKey) {
	const options = getTraitRollOptions(actor, `saves.${saveKey}`)
	const mr = getActorMagicResistance(actor)
	if (mr > 0) {
		options.push({
			id: 'magicResistance',
			name: game.i18n.localize('DOLMEN.Traits.MagicResistance'),
			bonus: mr,
			exclusiveGroup: null
		})
	}
	return options
}

/**
 * TextEditor enricher callback for save links.
 * Used by CONFIG.TextEditor.enrichers to process [text](save:key) in
 * enriched text fields (journal entries, item descriptions, etc.).
 * @param {RegExpMatchArray} match - Regex match with [1]=label, [2]=saveKey
 * @returns {HTMLElement} Anchor element with inline-save-link class
 */
export function createSaveLinkEnricher(match) {
	const label = match[1]
	const saveKey = match[2]
	const a = document.createElement('a')
	a.classList.add('inline-save-link')
	a.dataset.save = saveKey
	a.textContent = label
	return a
}

/**
 * Roll a saving throw for controlled tokens.
 * @param {string} saveKey - The save type (doom, ray, hold, blast, spell)
 * @param {number} [bonus=0] - Numeric bonus added to roll
 * @param {string[]} [modifierNames=[]] - Names of applied modifiers for display
 * @param {string[]} [optionIds=[]] - Selected save options (trait roll options, magic resistance);
 *   each is applied only to actors that have it
 */
export async function rollSaveForControlled(saveKey, bonus = 0, modifierNames = [], optionIds = []) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.SaveRoll.NoTokensSelected'))
		return
	}

	for (const token of controlled) {
		const actor = token.actor
		if (!actor) continue

		let actorBonus = bonus
		const actorModNames = [...modifierNames]

		for (const option of getActorSaveOptions(actor, saveKey)) {
			if (!optionIds.includes(option.id)) continue
			actorBonus += option.bonus
			actorModNames.push(option.name)
		}

		await performSaveRollForActor(actor, saveKey, actorBonus, actorModNames)
	}
}

/**
 * Perform a saving throw roll for a single actor.
 * @param {Actor} actor - The actor rolling the save
 * @param {string} saveKey - The save type
 * @param {number} [bonus=0] - Total bonus that lowers save target
 * @param {string[]} [modifierNames=[]] - Names of applied modifiers for display
 */
async function performSaveRollForActor(actor, saveKey, bonus = 0, modifierNames = []) {
	// Get save target - different for adventurers (with adjustments) vs creatures
	let baseSaveTarget
	if (actor.type === 'Adventurer') {
		baseSaveTarget = actor.system.final?.saves[saveKey]
	} else {
		// Creature - use saves directly
		baseSaveTarget = actor.system.saves?.[saveKey]
	}

	if (baseSaveTarget === undefined) return

	const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

	const formula = bonus !== 0 ? `1d20 + ${bonus}` : '1d20'
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
		speaker: ChatMessage.getSpeaker({ actor }),
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Open a modifier panel for inline save links: save options of the controlled
 * tokens (trait roll options, magic resistance) plus a numeric grid -4 to +4.
 * @param {string} saveKey - The save type
 * @param {object} position - Screen position {top, left}
 */
export function openInlineSaveModifierPanel(saveKey, position) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	// Dismiss any active Foundry tooltip
	if (typeof game !== 'undefined') game.tooltip?.deactivate()

	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Collect save options across controlled tokens; the bonus is shown only
	// when it is the same for every token that has the option
	const options = new Map()
	for (const token of canvas.tokens.controlled) {
		if (!token.actor) continue
		for (const option of getActorSaveOptions(token.actor, saveKey)) {
			const existing = options.get(option.id)
			if (!existing) options.set(option.id, { ...option })
			else if (existing.bonus !== option.bonus) existing.bonus = null
		}
	}

	// Build HTML - ROLL button + save options + numeric modifier grid
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	if (options.size > 0) {
		html += '<div class="menu-separator"></div>'
		for (const option of options.values()) {
			const bonusStr = option.bonus === null ? '' : option.bonus >= 0 ? `+${option.bonus}` : `${option.bonus}`
			html += `
				<div class="modifier-item${option.defaultSelected ? ' selected' : ''}" data-mod-id="${option.id}"${option.exclusiveGroup ? ` data-exclusive-group="${option.exclusiveGroup}"` : ''}>
					<span class="mod-check">${option.defaultSelected ? '✓' : ''}</span>
					<span class="mod-name">${option.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

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
	panel.className = 'dolmen dolmen-weapon-context-menu modifier-panel'
	panel.innerHTML = html
	panel.style.position = 'fixed'
	panel.style.top = `${position.top}px`
	panel.style.left = `${position.left}px`
	document.body.appendChild(panel)

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
		const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
		const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0
		const modifierNames = numericMod !== 0
			? [numericMod > 0 ? `+${numericMod}` : `${numericMod}`]
			: []

		const optionIds = [...panel.querySelectorAll('.modifier-item.selected')].map(item => item.dataset.modId)

		panel.remove()
		document.removeEventListener('click', closePanel)
		rollSaveForControlled(saveKey, numericMod, modifierNames, optionIds)
	})

	setTimeout(() => document.addEventListener('click', closePanel), 0)
}

/**
 * TextEditor enricher callback for chance links.
 * Syntax: [visible text](chance:target)
 * @param {RegExpMatchArray} match - Regex match with [1]=label, [2]=target number
 * @returns {HTMLElement} Anchor element with inline-chance-link class
 */
export function createChanceLinkEnricher(match) {
	const label = match[1]
	const target = match[2]
	const a = document.createElement('a')
	a.classList.add('inline-chance-link')
	a.dataset.target = target
	a.textContent = label
	return a
}

/**
 * Roll a chance check (1d6, target or less).
 * Uses the selected token's actor as speaker if available, otherwise the current user.
 * @param {number} target - The target number (roll this or less to succeed)
 */
export async function rollChance(target) {
	const roll = new Roll('1d6')
	await roll.evaluate()

	const isSuccess = roll.total <= target
	const resultClass = isSuccess ? 'success' : 'failure'
	const resultLabel = isSuccess
		? game.i18n.localize('DOLMEN.Roll.Success')
		: game.i18n.localize('DOLMEN.Roll.Failure')

	const anchor = await roll.toAnchor({ classes: ['chance-inline-roll', 'inline-dsn-hidden'] })

	const chatContent = `
		<div class="dolmen save-roll">
			<div class="roll-header save">
				<i class="fa-solid fa-dice-d6"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Roll.ChanceRoll')}</h3>
					<span class="roll-type">${target}-in-6</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${target} ${game.i18n.localize('DOLMEN.Roll.OrLess')}</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	const speaker = canvas.tokens?.controlled?.[0]?.actor
		? ChatMessage.getSpeaker({ actor: canvas.tokens.controlled[0].actor })
		: ChatMessage.getSpeaker()

	await createChatMessage({
		speaker,
		content: chatContent,
		rolls: [roll],
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

