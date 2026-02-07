/* global foundry, game, FilePicker */
import { buildChoices, buildChoicesWithBlank, buildQualityOptions, CHOICE_KEYS } from './utils/choices.js'

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
		context.weaponTypeChoices = buildChoicesWithBlank('DOLMEN.Item.WeaponType', CHOICE_KEYS.weaponTypes)
		context.weaponSizeChoices = buildChoices('DOLMEN.Item.Size', CHOICE_KEYS.sizes)
		context.qualityOptions = buildQualityOptions(this.item.system.qualities)

		// Armor choices
		context.armorBulkChoices = buildChoices('DOLMEN.Item.Bulk', CHOICE_KEYS.armorBulks)
		context.armorFitChoices = buildChoices('DOLMEN.Item.Fit', CHOICE_KEYS.sizes)

		// Foraged choices
		context.foragedTypeChoices = buildChoices('DOLMEN.Item.ForagedType', CHOICE_KEYS.foragedTypes)

		// Spell choices
		context.spellTypeChoices = buildChoices('DOLMEN.Item.SpellType', CHOICE_KEYS.spellTypes)
		context.runeMagnitudeChoices = buildChoices('DOLMEN.Magic.Fairy.Magnitudes', CHOICE_KEYS.runeMagnitudes)
		context.isRuneSpell = this.item.type === 'Spell' && this.item.system.type === 'rune'
		context.isRankedSpell = this.item.type === 'Spell' && ['arcane', 'holy'].includes(this.item.system.type)

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
