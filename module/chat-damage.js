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
	// Convert jQuery object to DOM element if needed
	const element = html[0] || html

	// Find damage rolls (inline-roll with damage-inline-roll class)
	const damageRolls = element.querySelectorAll('.inline-roll.damage-inline-roll')

	damageRolls.forEach(rollElement => {
		rollElement.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()

			// Get damage total from the roll - parse from the encoded JSON or use text content
			let damageTotal = 0
			const rollData = rollElement.dataset

			if (rollData.roll) {
				try {
					// Decode the URL-encoded JSON and parse it
					const rollJson = JSON.parse(decodeURIComponent(rollData.roll))
					damageTotal = rollJson.total || 0
				} catch (e) {
					console.warn('Dolmenwood: Failed to parse roll data, using text content', e)
					// Fallback to text content
					damageTotal = parseInt(rollElement.textContent) || 0
				}
			} else {
				// Fallback to text content
				damageTotal = parseInt(rollElement.textContent) || 0
			}

			if (damageTotal === 0) {
				console.warn('Dolmenwood: No damage total found, aborting')
				return
			}

			// Check if weapon has cold-iron quality
			const damageSection = rollElement.closest('.damage-section')
			const weaponQualities = damageSection?.dataset.weaponQualities || ''
			const hasColdIron = weaponQualities.split(',').includes('cold-iron')

			// Build cold-iron option if applicable
			const coldIronOption = hasColdIron ? `
				<div class="menu-item" data-damage="${damageTotal + 1}">
					<i class="fas fa-heart-circle-plus"></i>
					<span>${game.i18n.format('DOLMEN.Damage.ApplyPlus', { damage: damageTotal })}</span>
				</div>` : ''

			// Build menu HTML
			const menuHtml = `
				<h3>${game.i18n.localize('DOLMEN.Damage.ApplyDamage')}</h3>
				<div class="menu-item" data-damage="${damageTotal}">
					<i class="fas fa-heart-broken"></i>
					<span>${game.i18n.format('DOLMEN.Damage.ApplyAmount', { damage: damageTotal })}</span>
				</div>
				${coldIronOption}
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

			return false
		}, { capture: true })
	})
}
