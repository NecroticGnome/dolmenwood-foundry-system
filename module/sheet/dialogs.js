/* global game, Dialog, CONFIG, ui, foundry */
/**
 * Dialog Handlers
 * XP dialogs and add/remove skill dialogs.
 * All functions receive the sheet instance as the first parameter.
 */

import { computeAdjustedValues, computeXPModifier } from './data-context.js'

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
				<input type="number" id="xp-bonus" value="${modifier}" disabled>
				<span class="unit">%</span>
			</div>
			<div class="xp-calculation">
				<div>${game.i18n.localize('DOLMEN.XPCurrent')}: <strong>${currentXP}</strong></div>
				<div class="xp-total">${game.i18n.localize('DOLMEN.XPTotal')}: <span id="xp-total">${currentXP}</span></div>
			</div>
		</div>
	`

	const dialog = new Dialog({
		title: game.i18n.localize('DOLMEN.XPAddTitle'),
		content: content,
		buttons: {
			add: {
				icon: '<i class="fas fa-plus"></i>',
				label: game.i18n.localize('DOLMEN.XPAddButton'),
				callback: (html) => {
					const gained = parseInt(html.find('#xp-gained').val()) || 0
					const adjustedXP = Math.floor(gained * (1 + modifier / 100))
					const newXP = currentXP + adjustedXP
					sheet.actor.update({
						'system.xp.value': newXP
					})
				}
			},
			cancel: {
				icon: '<i class="fas fa-times"></i>',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		},
		default: 'add',
		render: (html) => {
			const gainedInput = html.find('#xp-gained')
			const totalSpan = html.find('#xp-total')

			const updateTotal = () => {
				const gained = parseInt(gainedInput.val()) || 0
				const adjustedXP = Math.floor(gained * (1 + modifier / 100))
				totalSpan.text(currentXP + adjustedXP)
			}

			gainedInput.on('input', updateTotal)
		}
	})

	dialog.render(true)
}

/**
 * Open the XP edit dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function openXPEditDialog(sheet) {
	const currentXP = sheet.actor.system.xp.value || 0
	const content = `
		<div class="xp-modal-content">
			<div class="form-group">
				<label>${game.i18n.localize('DOLMEN.XPCurrent')}</label>
				<input type="number" id="xp-edit-value" value="${currentXP}" min="0" autofocus>
			</div>
		</div>
	`
	new Dialog({
		title: game.i18n.localize('DOLMEN.XPCurrent'),
		content: content,
		buttons: {
			save: {
				icon: '<i class="fas fa-check"></i>',
				label: game.i18n.localize('DOLMEN.Save'),
				callback: (html) => {
					const newXP = parseInt(html.find('#xp-edit-value').val()) || 0
					sheet.actor.update({ 'system.xp.value': newXP })
				}
			},
			cancel: {
				icon: '<i class="fas fa-times"></i>',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		},
		default: 'save'
	}).render(true)
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

	new Dialog({
		title: game.i18n.localize('DOLMEN.Coins.AdjustTitle'),
		content: content,
		buttons: {
			add: {
				icon: '<i class="fas fa-plus"></i>',
				label: game.i18n.localize('DOLMEN.Coins.AdjustAdd'),
				callback: (html) => {
					const update = {}
					for (const denom of denominations) {
						const amount = parseInt(html.find(`#coin-${denom}`).val()) || 0
						if (amount > 0) {
							update[`system.coins.${denom}`] = (coins[denom] || 0) + amount
						}
					}
					if (Object.keys(update).length > 0) {
						sheet.actor.update(update)
					}
				}
			},
			subtract: {
				icon: '<i class="fas fa-minus"></i>',
				label: game.i18n.localize('DOLMEN.Coins.AdjustSubtract'),
				callback: (html) => {
					const update = {}
					for (const denom of denominations) {
						const amount = parseInt(html.find(`#coin-${denom}`).val()) || 0
						if (amount > 0) {
							update[`system.coins.${denom}`] = Math.max(0, (coins[denom] || 0) - amount)
						}
					}
					if (Object.keys(update).length > 0) {
						sheet.actor.update(update)
					}
				}
			},
			cancel: {
				icon: '<i class="fas fa-times"></i>',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		},
		default: 'add'
	}).render(true)
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

	const dialog = new Dialog({
		title: game.i18n.localize('DOLMEN.AddSkillTitle'),
		content: content,
		buttons: {
			add: {
				icon: '<i class="fas fa-plus"></i>',
				label: game.i18n.localize('DOLMEN.AddSkill'),
				callback: (html) => {
					const selectedSkill = html.find('#skill-select').val()
					addSkill(sheet, selectedSkill)
				}
			},
			cancel: {
				icon: '<i class="fas fa-times"></i>',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		},
		default: 'add'
	})

	dialog.render(true)
}

/**
 * Add a skill to the actor.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} skillId - The skill ID to add
 */
export function addSkill(sheet, skillId) {
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
