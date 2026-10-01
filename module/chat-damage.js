/* global game, canvas, ui, foundry */
import { createContextMenu } from './sheet/context-menu.js'

/**
 * Apply damage or healing to a single actor.
 * Players lacking ownership delegate the update to the active GM via socket.
 * @param {Actor} actor - The actor to modify
 * @param {number} amount - HP to remove (damage) or restore (heal)
 * @param {'damage'|'heal'} mode - Whether to damage or heal
 * @returns {Promise<boolean>} Whether the change was applied or delegated
 */
async function applyHpChange(actor, amount, mode) {
	if (!actor.isOwner) {
		if (!game.users.activeGM) {
			ui.notifications.warn(game.i18n.format('DOLMEN.Damage.NoGM', { name: actor.name }))
			return false
		}
		game.socket.emit('system.dolmenwood', { action: 'applyHpChange', actorUuid: actor.uuid, amount, mode })
		return true
	}
	const { value, max } = actor.system.hp
	const newHP = mode === 'heal' ? Math.min(max, value + amount) : Math.max(0, value - amount)
	await actor.update({ 'system.hp.value': newHP })
	return true
}

/**
 * Resolve the tokens a chat card's damage should apply to: the attack's
 * stored target if it still exists on a scene, otherwise the controlled tokens.
 * @param {ChatMessage} [message] - The chat message the damage roll belongs to
 * @returns {TokenDocument[]} Token documents to apply damage to
 */
function getDamageTargets(message) {
	const targetUuid = message?.getFlag('dolmenwood', 'damage')?.targetUuid
	if (targetUuid) {
		const token = foundry.utils.fromUuidSync(targetUuid)
		if (token?.actor) return [token]
	}
	return canvas.tokens.controlled.map(t => t.document).filter(t => t.actor)
}

/**
 * Apply damage or healing to the chat card's target or the controlled tokens.
 * @param {ChatMessage} [message] - The chat message the roll belongs to
 * @param {number} amount - HP amount
 * @param {'damage'|'heal'} mode - Whether to damage or heal
 */
async function applyToTargets(message, amount, mode) {
	const tokens = getDamageTargets(message)
	if (tokens.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Damage.NoTokensSelected'))
		return
	}

	const applied = []
	for (const token of tokens) {
		if (await applyHpChange(token.actor, amount, mode)) applied.push(token)
	}
	if (applied.length === 0) return

	const key = mode === 'heal' ? 'DOLMEN.Damage.Healed' : 'DOLMEN.Damage.Applied'
	const label = applied.length === 1
		? game.i18n.format(key, { damage: amount, name: applied[0].name })
		: game.i18n.format(`${key}Multiple`, { damage: amount, count: applied.length })
	ui.notifications.info(label)
}

/**
 * Whether an actor counts as fey (fairy or demi-fey) for cold-iron damage.
 * @param {Actor} actor
 * @returns {boolean}
 */
function isFey(actor) {
	const type = actor.type === 'Adventurer' ? actor.system.creatureType : actor.system.monsterType
	return type === 'fairy' || type === 'demi-fey'
}

/**
 * Socket handler: apply HP changes requested by players (active GM only).
 * @param {object} data - Socket payload
 */
export async function handleDamageSocket(data) {
	if (data.action !== 'applyHpChange' || game.user !== game.users.activeGM) return
	const actor = foundry.utils.fromUuidSync(data.actorUuid)
	if (actor) await applyHpChange(actor, data.amount, data.mode)
}

/**
 * Automatically apply an attack's damage to its target, when the
 * autoApplyDamage setting is enabled. Runs on the active GM's client only.
 * Missed attacks and attacks without a target are ignored.
 * @param {ChatMessage} message - The newly created chat message
 */
export async function autoApplyDamage(message) {
	if (game.user !== game.users.activeGM) return
	if (!game.settings.get('dolmenwood', 'autoApplyDamage')) return
	const flag = message.getFlag('dolmenwood', 'damage')
	if (!flag?.targetUuid || flag.hitResult === 'miss') return

	const token = foundry.utils.fromUuidSync(flag.targetUuid)
	const actor = token?.actor
	if (!actor) return

	let amount = flag.total
	if (flag.coldIron) amount = isFey(actor) ? amount + 1 : Math.max(0, amount - 1)

	// Don't reveal the result before Dice So Nice finishes animating
	if (game.dice3d) await game.dice3d.waitFor3DAnimationByMessageID(message.id)

	await applyHpChange(actor, amount, 'damage')
	ui.notifications.info(game.i18n.format('DOLMEN.Damage.Applied', { damage: amount, name: token.name }))
}

/**
 * Show the damage/healing context menu for a given roll total.
 * @param {MouseEvent} event - The contextmenu event
 * @param {number} damageTotal - The roll total
 * @param {HTMLElement} excludeEl - Element to exclude from close detection
 * @param {object} [options] - Extra options
 * @param {boolean} [options.hasColdIron] - Whether the weapon has cold-iron quality
 * @param {ChatMessage} [options.message] - The chat message the roll belongs to
 */
function showDamageMenu(event, damageTotal, excludeEl, { hasColdIron = false, message = null } = {}) {
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

	const [target] = getDamageTargets(message)
	const isStoredTarget = !!target && target.uuid === message?.getFlag('dolmenwood', 'damage')?.targetUuid
	const heading = isStoredTarget
		? game.i18n.format('DOLMEN.Damage.ApplyDamageTo', { name: target.name })
		: game.i18n.localize('DOLMEN.Damage.ApplyDamage')

	const menuHtml = `
		<h3>${heading}</h3>
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
			menu.remove()
			await applyToTargets(message, amount, item.dataset.action === 'heal' ? 'heal' : 'damage')
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
 * @param {ChatMessage} [message] - The chat message being rendered
 */
export function setupDamageContextMenu(html, message) {
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

			showDamageMenu(event, damageTotal, rollElement, { hasColdIron, message })
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

			showDamageMenu(event, damageTotal, totalElement, { message })
			return false
		}, { capture: true })
	})
}
