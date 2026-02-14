/* global foundry, game, FilePicker, fromUuid */
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { rewriteCSV, extractJSON } from './utils/form-helpers.js'

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
			height: 580
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
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
		context.hasCodexLink = !!this.item.system.codexUuid

		// Choices
		context.sizeChoices = buildChoices('DOLMEN.Item.Size', CHOICE_KEYS.sizes)
		context.creatureTypeChoices = buildChoices('DOLMEN.CreatureTypes', CHOICE_KEYS.creatureTypes)

		// Localization key for display
		const kindredId = this.item.system.kindredId
		context.localizationKey = kindredId ? `DOLMEN.Kindreds.${kindredId}` : ''

		// Language localization keys for display
		const langs = this.item.system.languages || []
		context.languageLocalizationKeys = langs.map(id => ({ id, key: `DOLMEN.Languages.${id}` }))

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

	_processFormData(event, form, formData) {
		const flat = formData.object
		rewriteCSV(flat, 'system.languages')
		const jsonValues = extractJSON(flat, ['traits'], 'system')
		const result = foundry.utils.expandObject(flat)
		Object.assign(result.system, jsonValues)
		return result
	}

	_onRender(context, options) {
		super._onRender(context, options)

		// Tab click listeners
		this.element.querySelectorAll('.tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

		// Portrait picker
		const portrait = this.element.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.item.img,
					callback: (path) => this.item.update({ img: path })
				}).browse()
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

		// Codex icon in navbar (only if UUID is set)
		const codexUuid = this.item.system.codexUuid
		if (codexUuid) {
			const nav = this.element.querySelector('.tabs[data-group="primary"]')
			if (nav) {
				const codexLink = document.createElement('a')
				codexLink.className = 'item codex-nav-btn'
				codexLink.title = game.i18n.localize('DOLMEN.Item.CodexOpen')
				codexLink.innerHTML = '<i class="fas fa-book-open"></i>'
				codexLink.addEventListener('click', async (event) => {
					event.preventDefault()
					const doc = await fromUuid(codexUuid)
					doc?.sheet?.render(true)
				})
				nav.appendChild(codexLink)
			}
		}
	}
}

export default DolmenKindredSheet
