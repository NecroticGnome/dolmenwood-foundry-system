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
 * Apply healing to controlled tokens.
 * @param {number} healing - Amount of HP to restore
 */
async function applyHealingToControlled(healing) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Damage.NoTokensSelected'))
		return
	}

	for (const token of controlled) {
		const actor = token.actor
		if (!actor) continue

		const currentHP = actor.system.hp.value
		const maxHP = actor.system.hp.max
		const newHP = Math.min(maxHP, currentHP + healing)

		await actor.update({ 'system.hp.value': newHP })
	}

	const count = controlled.length
	const label = count === 1
		? game.i18n.format('DOLMEN.Damage.Healed', { damage: healing, name: controlled[0].name })
		: game.i18n.format('DOLMEN.Damage.HealedMultiple', { damage: healing, count })
	ui.notifications.info(label)
}

/**
 * Show the damage/healing context menu for a given roll total.
 * @param {MouseEvent} event - The contextmenu event
 * @param {number} damageTotal - The roll total
 * @param {HTMLElement} excludeEl - Element to exclude from close detection
 * @param {object} [options] - Extra options
 * @param {boolean} [options.hasColdIron] - Whether the weapon has cold-iron quality
 */
function showDamageMenu(event, damageTotal, excludeEl, { hasColdIron = false } = {}) {
	const halfDamage = Math.floor(damageTotal / 2)
	const doubleDamage = damageTotal * 2
	const coldIronPlus = damageTotal + 1
	const coldIronMinus = Math.max(0, damageTotal - 1)

	// Build primary damage option(s)
	// Cold-iron: base roll is standard damage, +1 vs fey, -1 vs non-fey
	const damageOptions = hasColdIron ? `
		<div class="menu-item" data-damage="${coldIronPlus}" data-action="damage">
			<i class="fa-duotone fa-regular fa-heart-circle-plus"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyPlus', { damage: coldIronPlus })}</span>
		</div>
		<div class="menu-item" data-damage="${coldIronMinus}" data-action="damage">
			<i class="fa-duotone fa-regular fa-heart-circle-minus"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyMinus', { damage: coldIronMinus })}</span>
		</div>` : `
		<div class="menu-item" data-damage="${damageTotal}" data-action="damage">
			<i class="fa-duotone fa-regular fa-heart"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyAmount', { damage: damageTotal })}</span>
		</div>`

	const halfDoubleOptions = hasColdIron ? '' : `
		<div class="menu-item" data-damage="${doubleDamage}" data-action="damage">
			<i class="fa-duotone fa-regular fa-heart-crack"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyDouble', { damage: doubleDamage })}</span>
		</div>
		<div class="menu-item" data-damage="${halfDamage}" data-action="damage">
			<i class="fa-duotone fa-regular fa-heart-half-stroke"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyHalf', { damage: halfDamage })}</span>
		</div>`

	const menuHtml = `
		<h3>${game.i18n.localize('DOLMEN.Damage.ApplyDamage')}</h3>
		${damageOptions}
		${halfDoubleOptions}
		${hasColdIron ? `
		<div class="menu-item" data-damage="${coldIronPlus}" data-action="heal">
			<i class="fa-duotone fa-solid fa-hand-holding-medical"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyHealing', { damage: coldIronPlus })}</span>
		</div>
		<div class="menu-item" data-damage="${coldIronMinus}" data-action="heal">
			<i class="fa-duotone fa-solid fa-hand-holding-medical"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyHealing', { damage: coldIronMinus })}</span>
		</div>` : `
		<div class="menu-item" data-damage="${damageTotal}" data-action="heal">
			<i class="fa-duotone fa-solid fa-hand-holding-medical"></i>
			<span>${game.i18n.format('DOLMEN.Damage.ApplyHealing', { damage: damageTotal })}</span>
		</div>`}
	`

	createContextMenu(document.body, {
		html: menuHtml,
		position: { top: event.clientY, left: event.clientX },
		menuClass: 'damage-context-menu',
		itemSelector: '.menu-item',
		excludeFromClose: excludeEl,
		onItemClick: async (item, menu) => {
			const amount = parseInt(item.dataset.damage)
			if (item.dataset.action === 'heal') {
				await applyHealingToControlled(amount)
			} else {
				await applyDamageToControlled(amount)
			}
			menu.remove()
		}
	})
}

/**
 * Parse a roll total from an inline-roll element.
 * @param {HTMLElement} el - The inline-roll element
 * @returns {number} The roll total, or 0 if unparseable
 */
function parseInlineRollTotal(el) {
	if (el.dataset.roll) {
		try {
			const rollJson = JSON.parse(decodeURIComponent(el.dataset.roll))
			return rollJson.total || 0
		} catch (e) {
			console.warn('Dolmenwood: Failed to parse roll data, using text content', e)
		}
	}
	return parseInt(el.textContent) || 0
}

/**
 * Setup context menu for damage rolls in chat.
 * @param {HTMLElement} html - Chat message HTML
 */
export function setupDamageContextMenu(html) {
	const element = html[0] || html

	// System damage rolls (inline-roll with damage-inline-roll class)
	element.querySelectorAll('.inline-roll.damage-inline-roll').forEach(rollElement => {
		rollElement.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()

			const damageTotal = parseInlineRollTotal(rollElement)
			if (damageTotal === 0) return

			const damageSection = rollElement.closest('.damage-section')
			const weaponQualities = damageSection?.dataset.weaponQualities || ''
			const hasColdIron = weaponQualities.split(',').includes('cold-iron')

			showDamageMenu(event, damageTotal, rollElement, { hasColdIron })
			return false
		}, { capture: true })
	})

	// Regular Foundry dice rolls (.dice-roll with .dice-total)
	element.querySelectorAll('.dice-roll .dice-total').forEach(totalElement => {
		totalElement.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()

			const damageTotal = parseInt(totalElement.textContent) || 0
			if (damageTotal === 0) return

			showDamageMenu(event, damageTotal, totalElement)
			return false
		}, { capture: true })
	})
}
