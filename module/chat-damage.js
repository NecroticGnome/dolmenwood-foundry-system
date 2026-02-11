/* global game, canvas, ui */
import { createContextMenu } from './sheet/context-menu.js'

/**
 * Apply damage to controlled tokens.
 * @param {number} damage - Amount of damage to apply
 */
export async function applyDamageToControlled(damage) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Damage.NoTokensSelected'))
		return
	}

	for (const token of controlled) {
		const actor = token.actor
		if (!actor) continue

		const currentHP = actor.system.hp.value
		const newHP = Math.max(0, currentHP - damage)

		await actor.update({ 'system.hp.value': newHP })
	}

	const count = controlled.length
	const label = count === 1
		? game.i18n.format('DOLMEN.Damage.Applied', { damage, name: controlled[0].name })
		: game.i18n.format('DOLMEN.Damage.AppliedMultiple', { damage, count })
	ui.notifications.info(label)
}

/**
 * Setup context menu for damage rolls in chat.
 * @param {HTMLElement} html - Chat message HTML
 */
export function setupDamageContextMenu(html) {
	html.on('contextmenu', '.damage-inline-roll', (event) => {
		event.preventDefault()
		const rollElement = event.currentTarget
		const rollData = rollElement.dataset

		// Get damage total from the roll
		const damageTotal = parseInt(rollData.total) || 0
		if (damageTotal === 0) return

		// Build menu HTML
		const menuHtml = `
			<h3>${game.i18n.localize('DOLMEN.Damage.ApplyDamage')}</h3>
			<div class="menu-item" data-damage="${damageTotal}">
				<i class="fas fa-heart-broken"></i>
				<span>${game.i18n.format('DOLMEN.Damage.ApplyAmount', { damage: damageTotal })}</span>
			</div>
		`

		// Create context menu using generic utility
		createContextMenu(document.body, {
			html: menuHtml,
			position: { top: event.clientY, left: event.clientX },
			menuClass: 'damage-context-menu',
			itemSelector: '.menu-item',
			excludeFromClose: rollElement,
			onItemClick: async (item, menu) => {
				const damage = parseInt(item.dataset.damage)
				await applyDamageToControlled(damage)
				menu.remove()
			}
		})
	})
}
