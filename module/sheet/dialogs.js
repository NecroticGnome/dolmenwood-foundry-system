/* global game, CONFIG, ui, foundry, Roll, ChatMessage, CONST */

const { DialogV2 } = foundry.applications.api
/**
 * Dialog Handlers
 * XP dialogs, add/remove skill dialogs, and level up/down.
 * All functions receive the sheet instance as the first parameter.
 */

import { computeAdjustedValues, computeXPModifier } from './data-context.js'
import { getDieIconFromFormula } from './attack-rolls.js'

/**
 * Open the XP add dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function openXPDialog(sheet) {
	const currentXP = sheet.actor.system.xp.value || 0
	const adjusted = computeAdjustedValues(sheet.actor)
	const baseXPMod = computeXPModifier(sheet.actor, adjusted.abilities)
	const xpModAdj = sheet.actor.system.adjustments.xpModifier || 0
	const modifier = baseXPMod + xpModAdj

	const content = `
		<div class="xp-modal-content">
			<div class="form-group">
				<label>${game.i18n.localize('DOLMEN.XPGained')}</label>
				<input type="number" id="xp-gained" value="0" min="0" autofocus>
			</div>
			<div class="form-group">
				<label>${game.i18n.localize('DOLMEN.XPModifier')}</label>
				<div class="flexrow">
					<input type="number" id="xp-bonus" value="${modifier}" disabled>
					<span class="unit">%</span>
				</div>
			</div>
			<div class="xp-calculation">
				<div>${game.i18n.localize('DOLMEN.XPAdjustedGain')}: <strong id="xp-adjusted">0</strong></div>
				<div>${game.i18n.localize('DOLMEN.XPTotal')}: <strong id="xp-total">${currentXP}</strong></div>
			</div>
		</div>
	`

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.XPAddTitle') },
		content: content,
		buttons: [
			{
				action: 'add',
				icon: 'fas fa-plus',
				label: game.i18n.localize('DOLMEN.XPAddButton'),
				default: true,
				callback: (event, button, html) => {
					const gained = parseInt(html.element.querySelector('#xp-gained').value) || 0
					const adjustedXP = Math.floor(gained * (1 + modifier / 100))
					const newXP = currentXP + adjustedXP
					sheet.actor.update({ 'system.xp.value': newXP })
				}
			},
			{
				action: 'cancel',
				icon: 'fas fa-times',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		],
		render: (event) => {
			const html = event.target.element
			const gainedInput = html.querySelector('#xp-gained')
			const adjustedSpan = html.querySelector('#xp-adjusted')
			const totalSpan = html.querySelector('#xp-total')

			const updateTotal = () => {
				const gained = parseInt(gainedInput.value) || 0
				const adjustedXP = Math.floor(gained * (1 + modifier / 100))
				adjustedSpan.textContent = adjustedXP
				totalSpan.textContent = currentXP + adjustedXP
			}

			gainedInput.addEventListener('input', updateTotal)
		},
		rejectClose: false
	})
}

/**
 * Open the XP edit dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function openXPEditDialog(sheet) {
	const currentXP = sheet.actor.system.xp.value || 0
	const content = `
		<div class="xp-modal-content">
			<div class="form-group" style="grid-column: span 2;">
				<label>${game.i18n.localize('DOLMEN.XPCurrent')}</label>
				<input type="number" id="xp-edit-value" value="${currentXP}" min="0" autofocus>
			</div>
		</div>
	`
	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.XPCurrent') },
		content: content,
		buttons: [
			{
				action: 'save',
				icon: 'fas fa-check',
				label: game.i18n.localize('DOLMEN.Save'),
				default: true,
				callback: (event, button, html) => {
					const newXP = parseInt(html.element.querySelector('#xp-edit-value').value) || 0
					sheet.actor.update({ 'system.xp.value': newXP })
				}
			},
			{
				action: 'cancel',
				icon: 'fas fa-times',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		],
		rejectClose: false
	})
}

/**
 * Open the coin adjustment dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function openCoinDialog(sheet) {
	const coins = sheet.actor.system.coins
	const denominations = ['copper', 'silver', 'gold', 'pellucidium']

	const rows = denominations.map(denom => {
		const label = game.i18n.localize(`DOLMEN.Coins.${denom.charAt(0).toUpperCase() + denom.slice(1)}`)
		return `
			<div class="coin-adjust-row">
				<label>${label}</label>
				<span class="coin-current">${coins[denom] || 0}</span>
				<input type="number" id="coin-${denom}" value="0" min="0">
			</div>
		`
	}).join('')

	const content = `
		<div class="coin-modal-content">
			<div class="coin-adjust-header">
				<span></span>
				<span>${game.i18n.localize('DOLMEN.Coins.Title')}</span>
				<span>${game.i18n.localize('DOLMEN.Amount')}</span>
			</div>
			${rows}
		</div>
	`

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.Coins.AdjustTitle') },
		content: content,
		buttons: [
			{
				action: 'add',
				icon: 'fas fa-plus',
				label: game.i18n.localize('DOLMEN.Coins.AdjustAdd'),
				default: true,
				callback: (event, button, html) => {
					const update = {}
					for (const denom of denominations) {
						const amount = parseInt(html.element.querySelector(`#coin-${denom}`).value) || 0
						if (amount > 0) {
							update[`system.coins.${denom}`] = (coins[denom] || 0) + amount
						}
					}
					if (Object.keys(update).length > 0) {
						sheet.actor.update(update)
					}
				}
			},
			{
				action: 'subtract',
				icon: 'fas fa-minus',
				label: game.i18n.localize('DOLMEN.Coins.AdjustSubtract'),
				callback: (event, button, html) => {
					const update = {}
					for (const denom of denominations) {
						const amount = parseInt(html.element.querySelector(`#coin-${denom}`).value) || 0
						if (amount > 0) {
							update[`system.coins.${denom}`] = Math.max(0, (coins[denom] || 0) - amount)
						}
					}
					if (Object.keys(update).length > 0) {
						sheet.actor.update(update)
					}
				}
			},
			{
				action: 'cancel',
				icon: 'fas fa-times',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		],
		rejectClose: false
	})
}

/**
 * Open the add skill dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function openAddSkillDialog(sheet) {
	const currentSkills = sheet.actor.system.extraSkills || []
	const currentSkillIds = currentSkills.map(s => s.id)
	const availableSkills = CONFIG.DOLMENWOOD.extraSkills.filter(id => !currentSkillIds.includes(id))

	if (availableSkills.length === 0 || currentSkills.length >= CONFIG.DOLMENWOOD.maxExtraSkills) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.NoSkillsAvailable') || 'No more skills available to add.')
		return
	}

	const options = availableSkills.map(id => {
		const label = game.i18n.localize(`DOLMEN.Skills.${id}`)
		return `<option value="${id}">${label}</option>`
	}).join('')

	const content = `
		<div class="add-skill-modal">
			<div class="form-group">
				<label>${game.i18n.localize('DOLMEN.SelectSkill')}</label>
				<select id="skill-select">${options}</select>
			</div>
		</div>
	`

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.AddSkillTitle') },
		position: { width: 350 },
		content: content,
		buttons: [
			{
				action: 'add',
				icon: 'fas fa-plus',
				label: game.i18n.localize('DOLMEN.AddSkill'),
				default: true,
				callback: (event, button, html) => {
					const selectedSkill = html.element.querySelector('#skill-select').value
					addSkill(sheet, selectedSkill)
				}
			},
			{
				action: 'cancel',
				icon: 'fas fa-times',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		],
		rejectClose: false
	})
}

/**
 * Add a skill to the actor.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} skillId - The skill ID to add
 */
function addSkill(sheet, skillId) {
	const currentSkills = foundry.utils.deepClone(sheet.actor.system.extraSkills || [])
	currentSkills.push({ id: skillId, target: 6 })
	sheet.actor.update({ 'system.extraSkills': currentSkills })
}

/**
 * Remove a skill from the actor.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {number} index - The index of the skill to remove
 */
export function removeSkill(sheet, index) {
	const currentSkills = foundry.utils.deepClone(sheet.actor.system.extraSkills || [])
	currentSkills.splice(index, 1)
	sheet.actor.update({ 'system.extraSkills': currentSkills })
}

/**
 * Level up the character: increment level, roll HP, update XP threshold.
 * If XP is insufficient, prompts for confirmation before proceeding.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export async function levelUp(sheet) {
	const actor = sheet.actor
	const sys = actor.system
	const level = sys.level
	const classItem = actor.getClassItem()

	if (level >= 15) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.LevelMaxReached'))
		return
	}
	if (!classItem) return

	const newLevel = level + 1
	const thresholds = classItem.system.xpThresholds
	const hitDice = classItem.system.hitDice
	if (!thresholds?.length || !hitDice) return

	const requiredXP = thresholds[newLevel - 1] || 0

	const doLevelUp = async () => {
		let hpGain
		let formula = ''
		const conMod = sys.abilities.constitution.mod
		let rollBody = ''
		let rolls = []

		if (newLevel <= 10) {
			// Roll hit die + CON modifier, minimum 1
			formula = hitDice.die
			const roll = await new Roll(formula).evaluate()
			hpGain = Math.max(1, roll.total + conMod)
			rolls = [roll]

			const rollAnchor = (await roll.toAnchor()).outerHTML
			const conLabel = conMod >= 0 ? `+${conMod}` : String(conMod)
			const iconClass = getDieIconFromFormula(formula)
			rollBody = `
				<div class="roll-section">
					<div class="roll-result ${iconClass}">${rollAnchor}</div>
					<div class="roll-breakdown">${game.i18n.format('DOLMEN.LevelUpHPBreakdown', { formula, conMod: conLabel })}</div>
				</div>`
		} else {
			// Flat bonus, no CON modifier
			hpGain = hitDice.flat
			rollBody = `
				<div class="roll-section">
					<div class="roll-result"><span class="flat-hp">${hpGain}</span></div>
					<div class="roll-breakdown">${game.i18n.localize('DOLMEN.LevelUpFlat')}</div>
				</div>`
		}

		const hpLabel = game.i18n.format('DOLMEN.LevelUpHP', { total: hpGain })
		const content = `
			<div class="dolmen level-card">
				<div class="level-header">
					<i class="fas fa-arrow-up"></i>
					<div class="level-info">
						<h3>${game.i18n.localize('DOLMEN.LevelUpTitle')}</h3>
						<span class="level-label">${game.i18n.format('DOLMEN.LevelUpTo', { level: newLevel })}</span>
					</div>
				</div>
				<div class="level-body">
					${rollBody}
					<div class="level-summary">${hpLabel}</div>
				</div>
			</div>`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor }),
			content,
			rolls,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})

		await actor.update({
			'system.level': newLevel,
			'system.hp.max': sys.hp.max + hpGain,
			'system.hp.value': sys.hp.value + hpGain,
			[`system.hpPerLevel.${newLevel}`]: hpGain
		})
	}

	if (sys.xp.value < requiredXP) {
		const confirmed = await DialogV2.confirm({
			window: { title: game.i18n.localize('DOLMEN.LevelUpTitle') },
			content: `<p>${game.i18n.localize('DOLMEN.LevelUpConfirm')}</p>`,
			rejectClose: false,
			modal: true
		})
		if (!confirmed) return
	}

	await doLevelUp()
}

/**
 * Level down the character: decrement level, subtract stored HP, restore XP threshold.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export async function levelDown(sheet) {
	const actor = sheet.actor
	const sys = actor.system
	const level = sys.level

	if (level <= 1) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.LevelMinReached'))
		return
	}

	const storedHP = sys.hpPerLevel?.[level]
	if (storedHP === undefined || storedHP === null) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.LevelDownNoRecord'))
	}

	const hpToSubtract = storedHP ?? 0
	const newMax = Math.max(1, sys.hp.max - hpToSubtract)
	const newValue = Math.min(sys.hp.value, newMax)

	await actor.update({
		'system.level': level - 1,
		'system.hp.max': newMax,
		'system.hp.value': newValue,
		[`system.hpPerLevel.-=${level}`]: null
	})
}
