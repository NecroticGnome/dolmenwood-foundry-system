/* global foundry, game, FilePicker */
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'

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
			height: 600
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
		header: {
			template: 'systems/dolmenwood/templates/items/parts/class-header.html'
		},
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
			if (key === 'system.primeAbilities' && typeof value === 'string') {
				// Parse comma-separated string to array
				const abilities = value.split(',').map(s => s.trim()).filter(s => s.length > 0)
				abilities.forEach((ability, i) => {
					fd.append(`system.primeAbilities.${i}`, ability)
				})
			} else if (key === 'system.xpThresholds' && typeof value === 'string') {
				// Parse JSON array
				try {
					const thresholds = JSON.parse(value)
					thresholds.forEach((threshold, i) => {
						fd.append(`system.xpThresholds.${i}`, threshold)
					})
				} catch (e) {
					console.error('Failed to parse xpThresholds JSON:', e)
					fd.append(key, value)
				}
			} else if (key === 'system.spellProgression' && typeof value === 'string') {
				// Parse nested JSON array
				try {
					const progression = JSON.parse(value)
					progression.forEach((level, i) => {
						level.forEach((slots, j) => {
							fd.append(`system.spellProgression.${i}.${j}`, slots)
						})
					})
				} catch (e) {
					console.error('Failed to parse spellProgression JSON:', e)
					fd.append(key, value)
				}
			} else if (key === 'system.traits' && typeof value === 'string') {
				// Parse traits JSON to object - keep as string for now and let Foundry handle it
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

export default DolmenClassSheet
