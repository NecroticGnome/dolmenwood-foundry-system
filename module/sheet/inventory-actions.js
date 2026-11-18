/* global foundry, game, Item, Actor */
/**
 * Shared inventory action handlers for actor sheets.
 * These static action handlers are identical across adventurer, horse, and vehicle sheets.
 * Each function expects `this` to be the sheet instance (bound via Foundry's action system).
 */
import { takeFromItemPile } from '../item-piles.js'
import { promptItemQuantity } from './quantity-dialog.js'

export function onOpenItem(_event, target) {
	const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	item?.sheet?.render(true)
}

/**
 * Delete an item with container-aware dialog.
 * @param {Function} [onBeforeDelete] - Optional async callback(actor, item) called before non-container deletes
 */
export function createDeleteItemHandler(onBeforeDelete) {
	return async function onDeleteItem(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (!item) return

		// Container delete: offer choice to delete contents or just the container
		if (item.type === 'Container') {
			const contained = this.actor.items.filter(i => i.system.containerId === itemId)
			const action = await foundry.applications.api.DialogV2.wait({
				window: { title: game.i18n.localize('DOLMEN.Inventory.DeleteContainerTitle') },
				content: `<p>${game.i18n.format('DOLMEN.Inventory.DeleteContainerContent', { name: item.name })}</p>`,
				buttons: [
					{
						action: 'containerOnly',
						icon: 'fas fa-box-open',
						label: game.i18n.localize('DOLMEN.Inventory.DeleteContainerOnly')
					},
					{
						action: 'containerAndContents',
						icon: 'fas fa-box-open-full',
						label: game.i18n.localize('DOLMEN.Inventory.DeleteContainerAndContents')
					}
				],
				rejectClose: false
			})
			if (action === 'containerOnly') {
				for (const ci of contained) {
					await ci.update({ 'system.containerId': '' })
				}
				await item.delete()
			} else if (action === 'containerAndContents') {
				const deleteIds = contained.map(i => i.id).concat(itemId)
				await this.actor.deleteEmbeddedDocuments('Item', deleteIds)
			}
			return
		}

		// Non-container: simple confirm
		const confirmed = await foundry.applications.api.DialogV2.confirm({
			window: { title: game.i18n.localize('DOLMEN.Inventory.DeleteConfirmTitle') },
			content: game.i18n.format('DOLMEN.Inventory.DeleteConfirmContent', { name: item.name }),
			rejectClose: false,
			modal: true
		})
		if (confirmed) {
			if (onBeforeDelete) await onBeforeDelete(this.actor, item)
			await item.delete()
		}
	}
}

/** Default delete handler without pre-delete callback */
export const onDeleteItem = createDeleteItemHandler()

export function onIncreaseQty(_event, target) {
	const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	if (item) item.update({ 'system.quantity': (item.system.quantity || 1) + 1 })
}

export function onDecreaseQty(_event, target) {
	const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	if (item && item.system.quantity > 1) item.update({ 'system.quantity': item.system.quantity - 1 })
}

export function onToggleContainer(_event, target) {
	const group = target.closest('.container-group')
	if (group) group.classList.toggle('collapsed')
}

export function onEquipItem(_event, target) {
	const itemId = target.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	if (!item) return
	if (this.actor.warnIfIncompatibleSize) this.actor.warnIfIncompatibleSize(item)
	const updates = { 'system.equipped': true }
	if (item.system.containerId) updates['system.containerId'] = ''
	item.update(updates)
}

export function onStowItem(_event, target) {
	const itemId = target.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	item?.update({ 'system.equipped': false })
}

export function onRemoveFromContainer(_event, target) {
	const itemId = target.closest('[data-item-id]')?.dataset.itemId
	if (!itemId) return
	const item = this.actor.items.get(itemId)
	item?.update({ 'system.containerId': '' })
}

// gear: carried things that move between actors (spells, kindreds, classes and the like are copied)
const GEAR_TYPES = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Consumable', 'Container']

/**
 * Gear dragged from another actor the user owns moves instead of being copied: it asks how many
 * of a stack, then takes them off the other actor. A whole container brings its contents.
 * @param {Actor} actor - The actor receiving the item
 * @param {Item} item - The dropped item
 * @param {object} [placement] - Where it goes on the sheet
 * @param {boolean} [placement.equipped] - Whether it is carried equipped
 * @param {string} [placement.containerId] - The container it goes into
 * @returns {Promise<boolean>} Whether the drop was a move (and is handled here)
 */
export async function moveFromOtherActor(actor, item, { equipped = false, containerId = '' } = {}) {
	const source = item?.parent
	if (!(source instanceof Actor) || source.uuid === actor.uuid || !source.isOwner) return false
	if (!GEAR_TYPES.includes(item.type)) return false

	const available = item.system.quantity || 1
	const quantity = available > 1 ? await promptItemQuantity(item, available) : 1
	if (!quantity) return true

	const isContainer = item.type === 'Container'
	const itemData = item.toObject()
	delete itemData._id
	itemData.system.quantity = quantity
	itemData.system.containerId = isContainer ? '' : containerId
	itemData.system.equipped = containerId && !isContainer ? false : equipped
	const [moved] = await actor.createEmbeddedDocuments('Item', [itemData])
	if (!moved) return true

	const whole = quantity >= available
	if (isContainer && whole) {
		const contents = source.items.filter(i => i.system.containerId === item.id)
		if (contents.length) {
			await actor.createEmbeddedDocuments('Item', contents.map(content => {
				const data = content.toObject()
				delete data._id
				data.system.containerId = moved.id
				data.system.equipped = false
				return data
			}))
			await source.deleteEmbeddedDocuments('Item', contents.map(content => content.id))
		}
	}
	if (whole) await item.delete()
	else await item.update({ 'system.quantity': available - quantity })
	return true
}

/**
 * Shared drop handler for simple inventory sheets (horse, vehicle).
 * Handles dropping gear-type items into containers or the general stowed list.
 * @param {ActorSheetV2} sheet - The sheet instance
 * @param {Event} event - The drop event
 * @param {object} data - The drop data
 */
export async function onDropItemSimple(sheet, event, data) {
	const item = await Item.implementation.fromDropData(data)
	if (!item) return

	// Only allow gear-type items
	if (!GEAR_TYPES.includes(item.type)) return

	// Check if dropping into a container
	const containerEl = event.target?.closest('.container-group[data-container-id]')
	const containerId = containerEl?.dataset?.containerId || ''

	// Taken out of an Item Piles pile: Item Piles moves it, asking how many of a stack
	if (await takeFromItemPile(sheet.actor, item, { containerId })) return
	// Moved from another actor
	if (await moveFromOtherActor(sheet.actor, item, { containerId })) return

	// If item belongs to this actor, just move it to the container
	if (item.parent?.id === sheet.actor.id) {
		return item.update({ 'system.containerId': containerId })
	}

	// Create a new embedded item
	const itemData = item.toObject()
	itemData.system.equipped = false
	if (containerId) itemData.system.containerId = containerId
	return sheet.actor.createEmbeddedDocuments('Item', [itemData])
}
