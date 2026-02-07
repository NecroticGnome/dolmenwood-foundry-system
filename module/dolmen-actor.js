/*global Actor, ui, game */
class DolmenActor extends Actor {

	/**
	 * Reset trait usage counters (called on long rest).
	 * Clears all trait usage tracking data.
	 */
	async resetTraitUsage() {
		await this.update({ 'system.traitUsage': {} })
		ui.notifications.info(game.i18n.localize('DOLMEN.Traits.UsageReset'))
	}

	/**
	 * Check if item size is compatible with actor size.
	 * @param {Item} item - The item to check
	 * @returns {boolean} True if compatible
	 */
	isItemSizeCompatible(item) {
		if (!['Armor', 'Weapon'].includes(item.type)) return true

		const actorSize = this.system.size
		const itemSize = item.type === 'Armor' ? item.system.fit : item.system.size

		// Small actors can only use small items
		if (actorSize === 'small') return itemSize === 'small'
		// Medium actors can use small or medium items
		if (actorSize === 'medium') return ['small', 'medium'].includes(itemSize)
		// Large actors can use any size
		return true
	}

	/**
	 * Warn if an item is size-incompatible when equipped.
	 * @param {Item} item - The item being equipped
	 */
	warnIfIncompatibleSize(item) {
		if (!this.isItemSizeCompatible(item)) {
			const itemSize = item.type === 'Armor' ? item.system.fit : item.system.size
			ui.notifications.warn(game.i18n.format('DOLMEN.Traits.SizeIncompatible', {
				itemName: item.name,
				itemSize: game.i18n.localize(`DOLMEN.Item.Size.${itemSize}`),
				actorSize: game.i18n.localize(`DOLMEN.Item.Size.${this.system.size}`)
			}))
		}
	}
}
export default DolmenActor