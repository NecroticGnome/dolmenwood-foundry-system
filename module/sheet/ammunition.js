/* global game, ui */
/**
 * Ammunition for missile weapons: bows, crossbows and slings shoot equipped arrows, quarrels and sling
 * stones, one per attack; a stack whose last piece is shot is removed. Without any equipped, they
 * cannot shoot. All of this only with the Auto Consume Ammunition setting on.
 */

// the missile weapons that shoot ammunition, and which kind
export const WEAPON_AMMO = { longbow: 'arrow', shortbow: 'arrow', crossbow: 'quarrel', sling: 'stone' }

// items not marked as ammunition (such as those made before the setting) are known by their name
const AMMO_NAMES = {
	arrow: /\barrows?\b|strzał/i,
	quarrel: /\bquarrels?\b|\bbolts?\b|bełt/i,
	stone: /\bsling ?stones?\b|kamie[nń]\w* do procy/i
}

/**
 * The kind of ammunition an item is, if any.
 * @param {Item} item
 * @returns {string|null} 'arrow', 'quarrel', 'stone' or null
 */
export function getAmmoType(item) {
	if (item.type !== 'Item') return null
	const set = item.system.ammoType
	if (set && set !== 'none') return set
	return Object.keys(AMMO_NAMES).find(kind => AMMO_NAMES[kind].test(item.name)) ?? null
}

/**
 * The equipped stacks of the ammunition a weapon shoots.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Item[]|null} null for a weapon that shoots none
 */
export function getEquippedAmmo(actor, weapon) {
	const kind = WEAPON_AMMO[weapon.system.weaponType]
	if (!kind) return null
	return actor.items.filter(i => i.system.equipped && getAmmoType(i) === kind)
}

/**
 * Use one piece of a weapon's equipped ammunition for an attack.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Promise<{ ok: boolean, text: string|null }>} ok is false (and a warning shown) when the
 *   weapon shoots ammunition and none is equipped; text is the chat card's line on what is left
 */
export async function consumeAmmo(actor, weapon) {
	if (!game.settings.get('dolmenwood', 'autoConsumeAmmo')) return { ok: true, text: null }
	const stacks = getEquippedAmmo(actor, weapon)
	if (!stacks) return { ok: true, text: null } // a weapon that shoots none (thrown weapons)
	const kind = WEAPON_AMMO[weapon.system.weaponType]
	const label = game.i18n.localize(`DOLMEN.Ammo.Types.${kind}`)
	if (!stacks.length) {
		ui.notifications.warn(game.i18n.format('DOLMEN.Ammo.NoneEquipped', { ammo: label, name: actor.name }))
		return { ok: false, text: null }
	}
	// the stack with the fewest pieces goes first, so loose ones are used before a full bundle
	const stack = stacks.reduce((a, b) => ((b.system.quantity || 1) < (a.system.quantity || 1) ? b : a))
	const quantity = stack.system.quantity || 1
	if (quantity > 1) await stack.update({ 'system.quantity': quantity - 1 })
	else await stack.delete()
	const total = stacks.reduce((n, i) => n + (i === stack ? quantity - 1 : (i.system.quantity || 1)), 0)
	return {
		ok: true,
		text: `<i class="fas fa-bow-arrow"></i> ${game.i18n.format('DOLMEN.Ammo.Left', { ammo: label, count: total })}`
	}
}
