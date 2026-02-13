/* global foundry, game, FilePicker, fromUuid */
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { rewriteCSV, rewriteJSON } from './utils/form-helpers.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

class DolmenClassSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'class'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 550,
			height: 640
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/items/parts/class-tabs.html'
		},
		details: {
			template: 'systems/dolmenwood/templates/items/parts/class-details.html',
			scrollable: ['.class-details']
		},
		traits: {
			template: 'systems/dolmenwood/templates/items/parts/class-traits.html',
			scrollable: ['.class-traits']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'details', icon: 'fas fa-list', label: 'DOLMEN.Class.TabDetails' },
				{ id: 'traits', icon: 'fas fa-star', label: 'DOLMEN.Class.TabTraits' }
			],
			initial: 'details'
		}
	}

	tabGroups = {
		primary: 'details'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, groupConfig] of Object.entries(DolmenClassSheet.TABS)) {
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
		context.spellTypeChoices = buildChoices('DOLMEN.Class.SpellTypeChoices', ['none', 'arcane', 'holy'])
		context.combatAptitudeChoices = buildChoices('DOLMEN.Class.CombatAptitudeChoices', ['martial', 'semi-martial', 'non-martial'])
		context.abilityChoices = buildChoices('DOLMEN.Abilities', ['strength', 'intelligence', 'wisdom', 'dexterity', 'constitution', 'charisma'])
		context.kindredChoices = buildChoices('DOLMEN.Kindreds', CHOICE_KEYS.kindreds)

		// Format traits as JSON for editing
		context.traitsJSON = JSON.stringify(this.item.system.traits, null, 2)

		// Format spell progression
		context.spellProgressionJSON = JSON.stringify(this.item.system.spellProgression, null, 2)

		// Format XP thresholds
		context.xpThresholdsJSON = JSON.stringify(this.item.system.xpThresholds, null, 2)

		// Format attack progression
		context.attackProgressionJSON = JSON.stringify(this.item.system.attackProgression, null, 2)

		// Format save progressions
		context.saveProgressionsJSON = JSON.stringify(this.item.system.saveProgressions, null, 2)

		// Format skill progressions
		context.skillProgressionsJSON = JSON.stringify(this.item.system.skillProgressions, null, 2)

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
		rewriteCSV(flat, 'system.primeAbilities')
		const jsonFields = ['xpThresholds', 'spellProgression', 'attackProgression', 'saveProgressions', 'skillProgressions', 'traits']
		for (const field of jsonFields) {
			rewriteJSON(flat, `system.${field}`)
		}
		return foundry.utils.expandObject(flat)
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

export default DolmenClassSheet
