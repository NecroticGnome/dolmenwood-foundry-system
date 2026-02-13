/* global foundry, game, FilePicker, fromUuid */
import { buildChoices, buildWeaponProfOptions, buildArmorProfOptions, CHOICE_KEYS, WEAPON_PROF_GROUPS, getWeaponTypesForGroup } from './utils/choices.js'
import { rewriteCSV, extractJSON } from './utils/form-helpers.js'

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

		// Weapon proficiency multi-select
		context.weaponProfOptions = buildWeaponProfOptions(this.item.system.weaponsProficiency)

		// Armor proficiency multi-select
		context.armorProfOptions = buildArmorProfOptions(this.item.system.armorProficiency)

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
		const jsonValues = extractJSON(flat, jsonFields, 'system')
		const result = foundry.utils.expandObject(flat)
		Object.assign(result.system, jsonValues)
		return result
	}

	_onRender(context, options) {
		super._onRender(context, options)

		// Restore scroll position after re-render
		const scrollEl = this.element.querySelector('.class-details')
		if (scrollEl && this._savedScrollTop !== undefined) {
			scrollEl.scrollTop = this._savedScrollTop
			this._savedScrollTop = undefined
		}

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

		// Weapon proficiency checkbox handling
		const wpCheckboxes = this.element.querySelectorAll('.weapon-prof-checkbox')
		wpCheckboxes.forEach(checkbox => {
			checkbox.addEventListener('change', (event) => {
				event.stopPropagation()
				this._savedScrollTop = this.element.querySelector('.class-details')?.scrollTop
				const profId = event.currentTarget.dataset.prof
				const isGroup = event.currentTarget.dataset.group === 'true'
				const checked = event.currentTarget.checked
				let currentProf = [...(this.item.system.weaponsProficiency || [])]

				if (checked) {
					if (!currentProf.includes(profId)) {
						currentProf.push(profId)
					}
					// If "any" is checked, remove all other entries
					if (profId === 'any') {
						currentProf = ['any']
					}
					// If a group tag is checked, remove individual types covered by it
					if (isGroup && profId !== 'any') {
						const coveredTypes = getWeaponTypesForGroup(profId)
						currentProf = currentProf.filter(id =>
							WEAPON_PROF_GROUPS.includes(id) || !coveredTypes.includes(id)
						)
					}
				} else {
					const index = currentProf.indexOf(profId)
					if (index !== -1) currentProf.splice(index, 1)
				}

				this.item.update({ 'system.weaponsProficiency': currentProf })
			})
		})

		// Armor proficiency checkbox handling
		const apCheckboxes = this.element.querySelectorAll('.armor-prof-checkbox')
		apCheckboxes.forEach(checkbox => {
			checkbox.addEventListener('change', (event) => {
				event.stopPropagation()
				this._savedScrollTop = this.element.querySelector('.class-details')?.scrollTop
				const profId = event.currentTarget.dataset.prof
				const checked = event.currentTarget.checked
				let currentProf = [...(this.item.system.armorProficiency || [])]

				if (checked) {
					if (profId === 'any') {
						const hasShields = currentProf.includes('shields')
						currentProf = hasShields ? ['any', 'shields'] : ['any']
					} else if (!currentProf.includes(profId)) {
						currentProf.push(profId)
					}
					// Collapse light+medium+heavy to 'any'
					if (['light', 'medium', 'heavy'].every(t => currentProf.includes(t))) {
						const hasShields = currentProf.includes('shields')
						currentProf = hasShields ? ['any', 'shields'] : ['any']
					}
				} else {
					const index = currentProf.indexOf(profId)
					if (index !== -1) currentProf.splice(index, 1)
				}

				this.item.update({ 'system.armorProficiency': currentProf })
			})
		})
	}
}

export default DolmenClassSheet
