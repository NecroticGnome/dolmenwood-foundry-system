/* global foundry, game, FilePicker, fromUuid */
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
			height: 400
		},
		window: {
			resizable: true
		}
	}

	_getInitialHeight() {
		const heightByType = {
			Weapon: 525,
			Armor: 345,
			Treasure: 370,
			Foraged: 425,
			Spell: 325,
			HolySpell: 325,
			Glamour: 325,
			Rune: 325,
			Item: 325
		}
		const type = this.item?.type
		return heightByType[type] ?? this.constructor.DEFAULT_OPTIONS.position.height
	}

	get options() {
		const options = foundry.utils.deepClone(super.options)
		options.position.height = this._getInitialHeight()
		return options
	}

	static PARTS = {
		header: {
			template: 'systems/dolmenwood/templates/items/parts/item-header.html'
		},
		tabs: {
			template: 'systems/dolmenwood/templates/items/parts/item-tabs.html'
		},
		body: {
			template: 'systems/dolmenwood/templates/items/parts/item-body.html',
			scrollable: ['.item-body']
		},
		description: {
			template: 'systems/dolmenwood/templates/items/parts/item-description.html',
			scrollable: ['.item-description']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'body', icon: 'fas fa-list', label: 'DOLMEN.Item.TabStats' },
				{ id: 'description', icon: 'fas fa-scroll', label: 'DOLMEN.Item.TabDescription' }
			],
			initial: 'body'
		}
	}

	tabGroups = {
		primary: 'body'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, groupConfig] of Object.entries(DolmenItemSheet.TABS)) {
			const group = {}
			for (const t of groupConfig.tabs) {
				group[t.id] = {
					id: t.id,
					group: groupId,
					icon: t.icon,
					label: game.i18n.localize(t.label),
					active: this.tabGroups[groupId] === t.id,
					cssClass: this.tabGroups[groupId] === t.id ? 'active' : ''
				}
			}
			tabs[groupId] = group
		}
		return tabs
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		this.position.height = this._getInitialHeight()

		context.item = this.item
		context.system = this.item.system
		context.isWeapon = this.item.type === 'Weapon'
		context.isArmor = this.item.type === 'Armor'
		context.isTreasure = this.item.type === 'Treasure'
		context.isForaged = this.item.type === 'Foraged'
		context.isSpell = this.item.type === 'Spell'
		context.isHolySpell = this.item.type === 'HolySpell'
		context.isGlamour = this.item.type === 'Glamour'
		context.isRune = this.item.type === 'Rune'
		context.isGenericItem = this.item.type === 'Item'
		context.isGear = !context.isSpell && !context.isHolySpell && !context.isGlamour && !context.isRune
		context.isRankedSpell = context.isSpell || context.isHolySpell
		context.hasCodexLink = !!this.item.system.codexUuid
		context.tabs = this._getTabs()

		// Description field: gear uses system.notes, spells use system.description
		if (context.isGear) {
			context.descriptionFieldName = 'system.notes'
			context.descriptionFieldValue = this.item.system.notes
		} else {
			context.descriptionFieldName = 'system.description'
			context.descriptionFieldValue = this.item.system.description
		}

		// Weapon choices
		context.weaponTypeChoices = buildChoicesWithBlank('DOLMEN.Item.WeaponType', CHOICE_KEYS.weaponTypes)
		context.weaponSizeChoices = buildChoices('DOLMEN.Item.Size', CHOICE_KEYS.sizes)
		context.qualityOptions = buildQualityOptions(this.item.system.qualities)
		context.hasMissile = (this.item.system.qualities || []).includes('missile')

		// Armor choices
		context.armorBulkChoices = buildChoices('DOLMEN.Item.Bulk', CHOICE_KEYS.armorBulks)
		context.armorFitChoices = buildChoices('DOLMEN.Item.Fit', CHOICE_KEYS.sizes)
		context.armorTypeChoices = buildChoices('DOLMEN.Item.ArmorType', CHOICE_KEYS.armorTypes)

		// Foraged choices
		context.foragedTypeChoices = buildChoices('DOLMEN.Item.ForagedType', CHOICE_KEYS.foragedTypes)

		// Rune choices
		context.runeMagnitudeChoices = buildChoices('DOLMEN.Magic.Fairy.Magnitudes', CHOICE_KEYS.runeMagnitudes)

		// Cost denomination choices
		context.costDenominationChoices = buildChoices('DOLMEN.Item.Denomination', CHOICE_KEYS.costDenominations)

		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		if (['body', 'description'].includes(partId)) {
			context.tab = context.tabs?.primary?.[partId] || {
				id: partId,
				cssClass: this.tabGroups.primary === partId ? 'active' : ''
			}
		}
		return context
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	_onRender(context, options) {
		super._onRender(context, options)

		// Tab click listeners
		this.element.querySelectorAll('.item-tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

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

		// Handle codex link button click
		const codexBtn = this.element.querySelector('.codex-link-btn')
		if (codexBtn) {
			codexBtn.addEventListener('click', async () => {
				const uuid = this.item.system.codexUuid
				if (uuid) {
					const doc = await fromUuid(uuid)
					doc?.sheet?.render(true)
				}
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

		// Auto-set AC to 1 when armor type changes to shield
		const armorTypeSelect = this.element.querySelector('select[name="system.armorType"]')
		if (armorTypeSelect) {
			armorTypeSelect.addEventListener('change', (event) => {
				if (event.currentTarget.value === 'shield') {
					this.item.update({ 'system.ac': 1 })
				}
			})
		}
	}
}

export default DolmenItemSheet
