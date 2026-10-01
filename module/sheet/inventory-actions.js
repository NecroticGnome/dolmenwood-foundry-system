/* global foundry, game, Item */
/**
 * Shared inventory action handlers for actor sheets.
 * These static action handlers are identical across adventurer, horse, and vehicle sheets.
 * Each function expects `this` to be the sheet instance (bound via Foundry's action system).
 */

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
	const allowedTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Consumable', 'Container']
	if (!allowedTypes.includes(item.type)) return

	// Check if dropping into a container
	const containerEl = event.target?.closest('.container-group[data-container-id]')
	const containerId = containerEl?.dataset?.containerId || ''

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
