/*global Actor, ui, game, Roll, ChatMessage, CONST */
class DolmenActor extends Actor {

	/** @override */
	async _preCreate(data, options, user) {
		await super._preCreate(data, options, user)
		if (data.type === 'Adventurer') {
			this.updateSource({
				'prototypeToken.actorLink': true
			})
		}
	}

	/**
	 * Perform a rest, healing HP, resetting trait uses, and clearing spell slots.
	 * @param {'overnight'|'fullDay'} type - Rest type
	 * @returns {object} Summary of what was restored
	 */
	async rest(type) {
		const system = this.system
		const updateData = {}

		// Reset trait usage - null out each key
		const traitUsage = system.traitUsage || {}
		for (const key of Object.keys(traitUsage)) {
			updateData[`system.traitUsage.-=${key}`] = null
		}

		// Reset knack usage - null out each key
		const knackUsage = system.knackUsage || {}
		for (const key of Object.keys(knackUsage)) {
			updateData[`system.knackUsage.-=${key}`] = null
		}

		// Reset daily rune usage (only runes with resetsOnRest)
		if (system.fairyMagic?.enabled) {
			const runeUsage = system.runeUsage || {}
			const level = system.level
			for (const [runeId, data] of Object.entries(runeUsage)) {
				const rune = this.items.get(runeId)
				if (!rune || rune.type !== 'Rune') continue
				const magnitude = rune.system.magnitude || 'lesser'
				const isDaily = (magnitude === 'lesser') ||
					(magnitude === 'greater' && level >= 10)
				if (isDaily && data.used > 0) {
					updateData[`system.runeUsage.-=${runeId}`] = null
				}
			}
		}

		// Heal HP
		let hpHealed = 0
		let healRoll = null
		if (type === 'overnight') {
			hpHealed = 1
		} else {
			healRoll = await new Roll('1d3').evaluate()
			hpHealed = healRoll.total
		}
		if (system.hp.value < system.hp.max) {
			updateData['system.hp.value'] = Math.min(system.hp.max, system.hp.value + hpHealed)
		}

		await this.update(updateData)

		// Build and send chat message
		const restLabel = type === 'overnight'
			? game.i18n.localize('DOLMEN.Rest.Overnight')
			: game.i18n.localize('DOLMEN.Rest.FullDay')
		let hpLine
		if (healRoll) {
			const anchor = await healRoll.toAnchor({ classes: ['rest-inline-roll'] })
			hpLine = `${anchor.outerHTML} ${game.i18n.format('DOLMEN.Rest.HPRestored', { hp: '' })}`
		} else {
			hpLine = game.i18n.format('DOLMEN.Rest.HPRestored', { hp: 1 })
		}

		let details = `<li>${hpLine}</li>`
		details += `<li>${game.i18n.localize('DOLMEN.Rest.TraitsReset')}</li>`

		const hasSpells = system.arcaneMagic?.enabled || system.holyMagic?.enabled
		if (hasSpells) {
			details += `<li>${game.i18n.localize('DOLMEN.Rest.SpellsReminder')}</li>`
		}

		const content = `
			<div class="dolmen rest-card">
				<div class="rest-header">
					<i class="fa-duotone fa-bed-front"></i>
					<h3>${restLabel}</h3>
				</div>
				<ul class="rest-details">${details}</ul>
			</div>`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this }),
			content,
			rolls: healRoll ? [healRoll] : [],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
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