/* global game, Roll, ChatMessage, CONST */
/**
 * Roll Handlers
 * Ability check, saving throw, skill check, and trait roll functions.
 * All functions receive the sheet instance as the first parameter.
 */

import { AdventurerDataModel } from '../data-models.mjs'
import { createContextMenu } from './context-menu.js'
import { computeAdjustedValues } from './data-context.js'
import { getTraitRollOptions } from './trait-helpers.js'
import { getDieIconFromFormula } from './attack-rolls.js'

/* -------------------------------------------- */
/*  Trait Roll Context Menu                     */
/* -------------------------------------------- */

/**
 * Open context menu to select trait bonuses for a roll.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} key - The ability/save/skill key
 * @param {string} rollType - 'ability', 'save', or 'skill'
 * @param {object[]} options - Available trait options
 * @param {object} position - Position {top, left}
 * @param {number} [skillTargetOverride] - For skill rolls, the target override value
 */
export function openTraitRollContextMenu(sheet, key, rollType, options, position, skillTargetOverride = null) {
	const normalLabel = game.i18n.localize('DOLMEN.Roll.NormalRoll')

	let html = `
		<div class="weapon-menu-item" data-bonus="0" data-trait-id="">
			<i class="fas fa-dice"></i>
			<span class="weapon-name">${normalLabel}</span>
		</div>
	`

	for (const opt of options) {
		const bonusStr = opt.bonus >= 0 ? `+${opt.bonus}` : `${opt.bonus}`
		html += `
			<div class="weapon-menu-item" data-bonus="${opt.bonus}" data-trait-id="${opt.id}">
				<i class="fas fa-sparkles"></i>
				<span class="weapon-name">${opt.name}</span>
				<span class="weapon-damage">${bonusStr}</span>
			</div>
		`
	}

	createContextMenu(sheet, {
		html,
		position,
		onItemClick: (item, menu) => {
			const bonus = parseInt(item.dataset.bonus) || 0
			const traitName = item.dataset.traitId ? options.find(o => o.id === item.dataset.traitId)?.name : null
			menu.remove()

			if (rollType === 'ability') {
				performAbilityCheck(sheet, key, bonus, traitName)
			} else if (rollType === 'save') {
				performSavingThrow(sheet, key, bonus, traitName)
			} else if (rollType === 'skill') {
				performSkillCheck(sheet, key, skillTargetOverride, bonus, traitName)
			}
		}
	})
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

	if (rollOptions.length === 0) {
		performAbilityCheck(sheet, abilityKey, 0)
	} else {
		const position = event ? {
			top: event.currentTarget.getBoundingClientRect().top,
			left: event.currentTarget.getBoundingClientRect().left
		} : { top: 100, left: 100 }

		openTraitRollContextMenu(sheet, abilityKey, 'ability', rollOptions, position)
	}
}

/**
 * Perform an ability check roll. Roll 1d6 + ability modifier vs DC 4.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} abilityKey - The ability key
 * @param {number} traitScoreBonus - Bonus to ability score from selected trait
 * @param {string} [traitName] - Name of the trait providing bonus
 */
export async function performAbilityCheck(sheet, abilityKey, traitScoreBonus = 0, traitName = null) {
	const adjusted = computeAdjustedValues(sheet.actor)
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

	// Build formula with effective modifier
	const formula = effectiveMod >= 0 ? `1d6 + ${effectiveMod}` : `1d6 - ${Math.abs(effectiveMod)}`
	const roll = new Roll(formula)
	await roll.evaluate()

	const total = roll.total
	const isSuccess = total >= dc

	let resultClass = isSuccess ? 'success' : 'failure'
	let resultLabel = ''

	if (isSuccess) {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
	} else {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
	}

	const anchor = await roll.toAnchor({ classes: ['ability-inline-roll'] })

	// Build breakdown string showing components
	let breakdownParts = [`1d6`]
	if (traitScoreBonus !== 0 && traitName) {
		breakdownParts.push(`+ ${effectiveMod} (${baseScore}+${traitScoreBonus}=${effectiveScore})`)
	} else if (effectiveMod !== 0) {
		breakdownParts.push(effectiveMod >= 0 ? `+ ${effectiveMod}` : `- ${Math.abs(effectiveMod)}`)
	}
	const breakdown = breakdownParts.join(' ')

	const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''

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

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
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
	const rollOptions = getTraitRollOptions(sheet.actor, `saves.${saveKey}`)

	if (rollOptions.length === 0) {
		performSavingThrow(sheet, saveKey, 0)
	} else {
		const position = event ? {
			top: event.currentTarget.getBoundingClientRect().top,
			left: event.currentTarget.getBoundingClientRect().left
		} : { top: 100, left: 100 }

		openTraitRollContextMenu(sheet, saveKey, 'save', rollOptions, position)
	}
}

/**
 * Perform a saving throw roll. Success if d20 >= save target.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} saveKey - The save key
 * @param {number} traitBonus - Additional bonus from selected trait (lowers target)
 * @param {string} [traitName] - Name of the trait providing bonus
 */
export async function performSavingThrow(sheet, saveKey, traitBonus = 0, traitName = null) {
	const adjusted = computeAdjustedValues(sheet.actor)
	const baseSaveTarget = adjusted.saves[saveKey]
	if (baseSaveTarget === undefined) return

	// Trait bonus lowers the save target (making it easier)
	const saveTarget = baseSaveTarget - traitBonus

	const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

	const roll = new Roll('1d20')
	await roll.evaluate()

	const d20Result = roll.dice[0].results[0].result
	const isSuccess = d20Result >= saveTarget
	const isCriticalSuccess = d20Result === 20
	const isCriticalFailure = d20Result === 1

	let resultClass = isSuccess ? 'success' : 'failure'
	let resultLabel = ''

	if (isCriticalSuccess) {
		resultClass = 'critical'
		resultLabel = game.i18n.localize('DOLMEN.Roll.CriticalSuccess')
	} else if (isCriticalFailure) {
		resultClass = 'fumble'
		resultLabel = game.i18n.localize('DOLMEN.Roll.CriticalFailure')
	} else if (isSuccess) {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
	} else {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
	}

	const anchor = await roll.toAnchor({ classes: ['save-inline-roll'] })

	const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''
	const targetDisplay = traitBonus !== 0
		? `${baseSaveTarget} - ${traitBonus} = ${saveTarget}+`
		: `${saveTarget}+`

	const chatContent = `
		<div class="dolmen save-roll">
			<div class="roll-header save">
				<i class="fa-solid fa-shield-halved"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Roll.SaveVs')} ${saveName} ${traitBadge}</h3>
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

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
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
 */
export function onSkillRoll(sheet, skillKey, targetOverride, event) {
	const rollOptions = getTraitRollOptions(sheet.actor, `skills.${skillKey}`)

	if (rollOptions.length === 0) {
		performSkillCheck(sheet, skillKey, targetOverride, 0)
	} else {
		const position = event ? {
			top: event.currentTarget.getBoundingClientRect().top,
			left: event.currentTarget.getBoundingClientRect().left
		} : { top: 100, left: 100 }

		openTraitRollContextMenu(sheet, skillKey, 'skill', rollOptions, position, targetOverride)
	}
}

/**
 * Perform a skill check roll. Success if d6 >= skill target.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} skillKey - The skill key
 * @param {number} [targetOverride] - Override the target value (for extra skills)
 * @param {number} traitBonus - Additional bonus from selected trait
 * @param {string} [traitName] - Name of the trait providing bonus
 */
export async function performSkillCheck(sheet, skillKey, targetOverride = null, traitBonus = 0, traitName = null) {
	const adjusted = computeAdjustedValues(sheet.actor)
	let baseSkillTarget = targetOverride

	if (baseSkillTarget === null) {
		baseSkillTarget = adjusted.skills[skillKey]
	}

	if (baseSkillTarget === undefined || baseSkillTarget === null) return

	// Trait bonus increases the skill target (making it easier)
	const skillTarget = baseSkillTarget + traitBonus

	const localeKey = `DOLMEN.Skills.${skillKey}`
	const skillName = game.i18n.localize(localeKey)

	const roll = new Roll('1d6')
	await roll.evaluate()

	const d6Result = roll.dice[0].results[0].result
	const isSuccess = d6Result >= skillTarget

	let resultClass = isSuccess ? 'success' : 'failure'
	let resultLabel = ''

	if (isSuccess) {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
	} else {
		resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
	}

	const anchor = await roll.toAnchor({ classes: ['skill-inline-roll'] })

	const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''
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

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
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
				${(await roll.toAnchor({ classes: ['trait-inline-roll'] })).outerHTML}
				${resultSection}
			</div>
			<span class="roll-breakdown">${formula}${rollTarget !== null ? ` (${rollTarget} ${game.i18n.localize('DOLMEN.Roll.OrLess')})` : ''}</span>
		</div>
	`

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls: [roll],
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}
