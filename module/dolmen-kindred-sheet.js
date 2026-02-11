/* global foundry, game, FilePicker */
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

class DolmenKindredSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'kindred'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 500,
			height: 550
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
		header: {
			template: 'systems/dolmenwood/templates/items/parts/kindred-header.html'
		},
		tabs: {
			template: 'systems/dolmenwood/templates/items/parts/kindred-tabs.html'
		},
		details: {
			template: 'systems/dolmenwood/templates/items/parts/kindred-details.html',
			scrollable: ['.kindred-details']
		},
		traits: {
			template: 'systems/dolmenwood/templates/items/parts/kindred-traits.html',
			scrollable: ['.kindred-traits']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'details', icon: 'fas fa-list', label: 'DOLMEN.Kindred.TabDetails' },
				{ id: 'traits', icon: 'fas fa-star', label: 'DOLMEN.Kindred.TabTraits' }
			],
			initial: 'details'
		}
	}

	tabGroups = {
		primary: 'details'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, groupConfig] of Object.entries(DolmenKindredSheet.TABS)) {
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

		context.item = this.item
		context.system = this.item.system
		context.tabs = this._getTabs()

		// Choices
		context.sizeChoices = buildChoices('DOLMEN.Item.Size', CHOICE_KEYS.sizes)
		context.creatureTypeChoices = buildChoices('DOLMEN.CreatureType', CHOICE_KEYS.creatureTypes)

		// Format traits as JSON for editing
		context.traitsJSON = JSON.stringify(this.item.system.traits, null, 2)

		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		if (['details', 'traits'].includes(partId)) {
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

	_prepareSubmitData(event, form, formData) {
		// Process special fields BEFORE calling super (which validates)
		const fd = new FormData()

		// Copy all form data, processing special fields
		for (const [key, value] of formData.entries()) {
			if (key === 'system.languages' && typeof value === 'string') {
				// Parse comma-separated string to array
				const languages = value.split(',').map(s => s.trim()).filter(s => s.length > 0)
				languages.forEach((lang, i) => {
					fd.append(`system.languages.${i}`, lang)
				})
			} else if (key === 'system.traits' && typeof value === 'string') {
				// Keep traits as string for now, let Foundry handle it
				fd.append(key, value)
			} else {
				fd.append(key, value)
			}
		}

		return super._prepareSubmitData(event, form, fd)
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
	}
}

export default DolmenKindredSheet
