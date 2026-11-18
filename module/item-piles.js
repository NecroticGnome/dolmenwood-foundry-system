/* global Hooks, game, foundry, ui, Actor */
import { promptItemQuantity } from './sheet/quantity-dialog.js'

/**
 * Item Piles integration. Item Piles 3 ships no system settings: each system registers its own
 * through game.itempiles.API.addSystemIntegration once Item Piles is ready.
 */

// value of each coin in gold pieces (the primary currency)
const GOLD_VALUE = { cp: 0.01, sp: 0.1, gp: 1, pp: 10 }

// item types that are not loot (magic known, kindred/class data, effects)
const NON_LOOT_TYPES = ['Spell', 'HolySpell', 'Glamour', 'Rune', 'Kindred', 'Class', 'Effect']

/**
 * A coin as an Item Piles currency, stored on the actor's coins.
 * @param {string} key - The coins field (copper, silver, gold, pellucidium)
 * @param {string} abbreviation - The coin's abbreviation
 * @param {string} img - The coin's image
 * @param {boolean} [primary] - Whether this is the primary currency
 * @returns {object}
 */
function coin(key, abbreviation, img, primary = false) {
	return {
		type: 'attribute',
		name: `DOLMEN.Coins.${key.charAt(0).toUpperCase()}${key.slice(1)}`,
		img,
		abbreviation: `{#}${abbreviation}`,
		data: { path: `system.coins.${key}` },
		primary,
		exchangeRate: GOLD_VALUE[abbreviation]
	}
}

/**
 * An item dragged out of an Item Piles pile onto a sheet: take it through Item Piles, so it leaves
 * the pile (players don't own piles) and the pile's sharing and deletion rules apply.
 * @param {Actor} actor - The actor receiving the item
 * @param {Item} item - The dropped item
 * @param {object} [placement] - Where it goes on the sheet
 * @param {boolean} [placement.equipped] - Whether it is carried equipped
 * @param {string} [placement.containerId] - The container it goes into
 * @returns {Promise<boolean>} Whether the drop came from a pile (and is handled here)
 */
export async function takeFromItemPile(actor, item, { equipped = false, containerId = '' } = {}) {
	const api = game.itempiles?.API
	const pile = item?.parent
	if (!api || !(pile instanceof Actor) || pile === actor || !api.isValidItemPile(pile)) return false
	if (api.isItemPileMerchant(pile)) {
		ui.notifications.warn('DOLMEN.ItemPiles.BuyFromMerchant', { localize: true })
		return true
	}
	if (api.isItemPileLocked(pile) || api.isItemPileClosed(pile)) {
		ui.notifications.warn('DOLMEN.ItemPiles.Closed', { localize: true })
		return true
	}

	const available = Number(foundry.utils.getProperty(item, 'system.quantity')) || 1
	const quantity = available > 1 ? await promptItemQuantity(item, available, {
		title: 'DOLMEN.ItemPiles.TakeTitle', button: 'DOLMEN.ItemPiles.Take', icon: 'fa-solid fa-hand'
	}) : 1
	if (!quantity) return true

	const results = await api.transferItems(pile, actor, [{ _id: item.id, quantity }])
	// place the taken stack where it was dropped (Item Piles adds it stowed, outside containers)
	const takenId = results?.[0]?.item?._id
	const taken = takenId ? actor.items.get(takenId) : null
	if (taken && (equipped || containerId)) {
		const isContainer = taken.type === 'Container'
		await taken.update({
			'system.equipped': containerId && !isContainer ? false : equipped,
			'system.containerId': isContainer ? '' : containerId
		})
	}
	return true
}

export function registerItemPilesIntegration() {
	Hooks.once('item-piles-ready', () => {
		const api = game.itempiles?.API
		if (!api?.addSystemIntegration) return
		api.addSystemIntegration({
			VERSION: '1.0.0',
			// new piles are Vehicles: they already hold cargo and coins (creatures have no coins)
			ACTOR_CLASS_TYPE: 'Vehicle',
			ITEM_CLASS_LOOT_TYPE: 'Treasure',
			ITEM_CLASS_WEAPON_TYPE: 'Weapon',
			ITEM_CLASS_EQUIPMENT_TYPE: 'Item',
			ITEM_QUANTITY_ATTRIBUTE: 'system.quantity',
			ITEM_PRICE_ATTRIBUTE: 'system.cost',
			ITEM_FILTERS: [{ path: 'type', filters: NON_LOOT_TYPES.join(',') }],
			ITEM_SIMILARITIES: ['name', 'type'],
			// a container's contents don't travel with it, so containers never merge into one stack
			UNSTACKABLE_ITEM_TYPES: ['Container'],
			// an item leaving an actor is no longer worn or inside one of its containers
			ITEM_TRANSFORMER: itemData => {
				if (itemData.system) {
					itemData.system.equipped = false
					itemData.system.containerId = ''
				}
				return itemData
			},
			// costs are stored in their own coin (cost + costDenomination); Item Piles wants gold
			ITEM_COST_TRANSFORMER: item => {
				const cost = Number(item.system?.cost) || 0
				return cost * (GOLD_VALUE[item.system?.costDenomination] ?? 1)
			},
			CURRENCIES: [
				coin('pellucidium', 'pp', 'icons/commodities/gems/gem-faceted-round-white.webp'),
				coin('gold', 'gp', 'icons/commodities/currency/coins-plain-stack-gold.webp', true),
				coin('silver', 'sp', 'icons/commodities/currency/coins-plain-stack-silver.webp'),
				coin('copper', 'cp', 'icons/commodities/currency/coins-wheat-stack-copper.webp')
			],
			CURRENCY_DECIMAL_DIGITS: 0.01
		})
	})
}
