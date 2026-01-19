/* global foundry, game, FilePicker */
const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

class DolmenItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'item'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 450,
			height: 400,
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
		header: {
			template: 'systems/dolmenwood/templates/items/parts/item-header.html'
		},
		body: {
			template: 'systems/dolmenwood/templates/items/parts/item-body.html',
			scrollable: ['.item-body']
		}
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)

		context.item = this.item
		context.system = this.item.system
		context.isWeapon = this.item.type === 'Weapon'
		context.isArmor = this.item.type === 'Armor'
		context.isTreasure = this.item.type === 'Treasure'
		context.isForaged = this.item.type === 'Foraged'
		context.isSpell = this.item.type === 'Spell'
		context.isGenericItem = this.item.type === 'Item'

		// Weapon choices
		context.weaponSizeChoices = {
			small: game.i18n.localize('DOLMEN.Item.Size.small'),
			medium: game.i18n.localize('DOLMEN.Item.Size.medium'),
			large: game.i18n.localize('DOLMEN.Item.Size.large')
		}

		// Weapon qualities for checkboxes
		context.qualityOptions = [
			{ id: 'armor-piercing', label: game.i18n.localize('DOLMEN.Item.Quality.armor-piercing') },
			{ id: 'brace', label: game.i18n.localize('DOLMEN.Item.Quality.brace') },
			{ id: 'charge', label: game.i18n.localize('DOLMEN.Item.Quality.charge') },
			{ id: 'melee', label: game.i18n.localize('DOLMEN.Item.Quality.melee') },
			{ id: 'missile', label: game.i18n.localize('DOLMEN.Item.Quality.missile') },
			{ id: 'reach', label: game.i18n.localize('DOLMEN.Item.Quality.reach') },
			{ id: 'reload', label: game.i18n.localize('DOLMEN.Item.Quality.reload') },
			{ id: 'splash', label: game.i18n.localize('DOLMEN.Item.Quality.splash') },
			{ id: 'two-handed', label: game.i18n.localize('DOLMEN.Item.Quality.two-handed') },
			{ id: 'cold-iron', label: game.i18n.localize('DOLMEN.Item.Quality.cold-iron') },
			{ id: 'silver', label: game.i18n.localize('DOLMEN.Item.Quality.silver') }
		].map(q => ({
			...q,
			checked: this.item.system.qualities?.includes(q.id) || false
		}))

		// Armor choices
		context.armorBulkChoices = {
			none: game.i18n.localize('DOLMEN.Item.Bulk.none'),
			light: game.i18n.localize('DOLMEN.Item.Bulk.light'),
			medium: game.i18n.localize('DOLMEN.Item.Bulk.medium'),
			heavy: game.i18n.localize('DOLMEN.Item.Bulk.heavy')
		}

		context.armorFitChoices = {
			small: game.i18n.localize('DOLMEN.Item.Fit.small'),
			medium: game.i18n.localize('DOLMEN.Item.Fit.medium'),
			large: game.i18n.localize('DOLMEN.Item.Fit.large')
		}

		// Foraged choices
		context.foragedTypeChoices = {
			plant: game.i18n.localize('DOLMEN.Item.ForagedType.plant'),
			fungus: game.i18n.localize('DOLMEN.Item.ForagedType.fungus'),
			pipeleaf: game.i18n.localize('DOLMEN.Item.ForagedType.pipeleaf')
		}

		// Spell choices
		context.spellTypeChoices = {
			arcane: game.i18n.localize('DOLMEN.Item.SpellType.arcane'),
			glamour: game.i18n.localize('DOLMEN.Item.SpellType.glamour'),
			rune: game.i18n.localize('DOLMEN.Item.SpellType.rune'),
			holy: game.i18n.localize('DOLMEN.Item.SpellType.holy'),
			knack: game.i18n.localize('DOLMEN.Item.SpellType.knack')
		}

		return context
	}

	_onRender(context, options) {
		super._onRender(context, options)

		// Handle image click for file picker
		const itemImage = this.element.querySelector('.item-image img')
		if (itemImage) {
			itemImage.addEventListener('click', () => {
				const fp = new FilePicker({
					type: 'image',
					current: this.item.img,
					callback: (path) => {
						this.item.update({ img: path })
					}
				})
				fp.browse()
			})
		}

		// Handle quality checkbox changes
		const qualityCheckboxes = this.element.querySelectorAll('.quality-checkbox')
		qualityCheckboxes.forEach(checkbox => {
			checkbox.addEventListener('change', (event) => {
				const quality = event.currentTarget.dataset.quality
				const checked = event.currentTarget.checked
				const currentQualities = [...(this.item.system.qualities || [])]

				if (checked && !currentQualities.includes(quality)) {
					currentQualities.push(quality)
				} else if (!checked && currentQualities.includes(quality)) {
					const index = currentQualities.indexOf(quality)
					currentQualities.splice(index, 1)
				}

				this.item.update({ 'system.qualities': currentQualities })
			})
		})
	}
}

export default DolmenItemSheet
