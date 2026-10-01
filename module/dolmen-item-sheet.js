/* global foundry, game, FilePicker, fromUuid */
import { buildChoices, buildChoicesWithBlank, buildQualityOptions, CHOICE_KEYS } from './utils/choices.js'
import { EFFECT_FIELDS, BOOLEAN_TARGETS, getEffectTargetLabel, getEffectGroupForTarget } from './effect-fields.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
const TextEditor = foundry.applications.ux.TextEditor.implementation

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
		},
		actions: {
			addStatEffect: DolmenItemSheet._onAddStatEffect,
			removeStatEffect: DolmenItemSheet._onRemoveStatEffect,
			toggleStatEffect: DolmenItemSheet._onToggleStatEffect
		}
	}

	_getInitialHeight() {
		const heightByType = {
			Weapon: 580,
			Armor: 400,
			Treasure: 425,
			Foraged: 445,
			Consumable: 400,
			Spell: 325,
			HolySpell: 325,
			Glamour: 325,
			Rune: 325,
			Item: 325,
			Container: 365
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
		tabs: {
			template: 'systems/dolmenwood/templates/items/parts/item-tabs.html'
		},
		body: {
			template: 'systems/dolmenwood/templates/items/parts/item-body.html',
			scrollable: ['']
		},
		description: {
			template: 'systems/dolmenwood/templates/items/parts/item-description.html',
			scrollable: ['']
		},
		effects: {
			template: 'systems/dolmenwood/templates/items/parts/item-effects.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'body', icon: 'fas fa-list', label: 'DOLMEN.Item.TabStats' },
				{ id: 'description', icon: 'fas fa-scroll', label: 'DOLMEN.Item.TabDescription' },
				{ id: 'effects', icon: 'fas fa-bolt', label: 'DOLMEN.Tabs.Effects' }
			],
			initial: 'body'
		}
	}

	tabGroups = {
		primary: 'body'
	}

	_isGearType() {
		const gearTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Consumable', 'Container']
		return gearTypes.includes(this.item.type)
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, groupConfig] of Object.entries(DolmenItemSheet.TABS)) {
			const group = {}
			for (const t of groupConfig.tabs) {
				// Only show effects tab for gear items
				if (t.id === 'effects' && !this._isGearType()) continue
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
		context.isConsumable = this.item.type === 'Consumable'
		context.isSpell = this.item.type === 'Spell'
		context.isHolySpell = this.item.type === 'HolySpell'
		context.isGlamour = this.item.type === 'Glamour'
		context.isRune = this.item.type === 'Rune'
		context.isGenericItem = this.item.type === 'Item'
		context.isContainer = this.item.type === 'Container'
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
		context.enrichedDescription = context.descriptionFieldValue
			? await TextEditor.enrichHTML(context.descriptionFieldValue, { secrets: game.user.isGM })
			: ''

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
		context.availabilityChoices = Object.fromEntries(
			[1, 2, 3, 4, 5, 6].map(n => [n, game.i18n.localize(`DOLMEN.Item.Availabilities.${n}`)])
		)

		// Rune choices
		context.runeMagnitudeChoices = buildChoices('DOLMEN.Magic.Fairy.Magnitudes', CHOICE_KEYS.runeMagnitudes)

		// Cost denomination choices
		context.costDenominationChoices = buildChoices('DOLMEN.Item.Denomination', CHOICE_KEYS.costDenominations)

		// Charges max select options (0-9) — only for weapon, armor, treasure
		if (context.isWeapon || context.isArmor || context.isTreasure) {
			const currentMax = this.item.system.charges?.max || 0
			context.chargesMaxOptions = Array.from({ length: 10 }, (_, i) => ({
				value: i,
				label: i === 0 ? game.i18n.localize('DOLMEN.None') : String(i),
				selected: i === currentMax
			}))
		}

		// Prepare stat effects for gear items
		if (context.isGear) {
			const effects = this.item.system.statEffects || []
			context.statEffects = effects.map((eff, idx) => {
				const group = getEffectGroupForTarget(eff.target) || 'abilities'
				const groupData = EFFECT_FIELDS[group]
				const fieldChoices = Object.entries(groupData.fields).map(([key, labelKey]) => ({
					key,
					label: game.i18n.localize(labelKey),
					selected: key === eff.target
				}))
				return {
					idx,
					enabled: eff.enabled,
					target: eff.target,
					value: eff.value,
					effectType: eff.effectType,
					condition: eff.condition,
					targetLabel: getEffectTargetLabel(eff.target),
					groupKey: group,
					isBoolean: BOOLEAN_TARGETS.has(eff.target),
					fieldChoices
				}
			})
			// Build group choices for dropdowns
			context.effectGroupChoices = {}
			for (const [key, val] of Object.entries(EFFECT_FIELDS)) {
				context.effectGroupChoices[key] = game.i18n.localize(val.label)
			}
			context.effectConditionChoices = {
				whenEquipped: game.i18n.localize('DOLMEN.Effects.Condition.whenEquipped'),
				whenInPossession: game.i18n.localize('DOLMEN.Effects.Condition.whenInPossession')
			}
			// Build localized field choices per group for template selectOptions
			context.effectFieldsByGroup = {}
			for (const [groupKey, group] of Object.entries(EFFECT_FIELDS)) {
				context.effectFieldsByGroup[groupKey] = {}
				for (const [fieldKey, labelKey] of Object.entries(group.fields)) {
					context.effectFieldsByGroup[groupKey][fieldKey] = game.i18n.localize(labelKey)
				}
			}
		}

		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		if (['body', 'description', 'effects'].includes(partId)) {
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

		// Handle Effect item drops onto gear items
		if (this._isGearType()) {
			this.element.addEventListener('drop', async (ev) => {
				let data
				try {
					data = JSON.parse(ev.dataTransfer.getData('text/plain')) 
				} catch {
					return 
				}
				if (data.type !== 'Item') return
				const droppedItem = await fromUuid(data.uuid)
				if (!droppedItem || droppedItem.type !== 'Effect') return
				const effects = foundry.utils.deepClone(this.item.system.statEffects || [])
				effects.push({
					enabled: droppedItem.system.enabled,
					target: droppedItem.system.target,
					value: droppedItem.system.value,
					effectType: droppedItem.system.effectType,
					condition: 'whenEquipped'
				})
				await this.item.update({ 'system.statEffects': effects })
			})
		}

		// Gear effects tab: group dropdown change → update field dropdown
		const effectRows = this.element.querySelectorAll('.stat-effect-row')
		for (const row of effectRows) {
			const groupSelect = row.querySelector('.effect-group-select')
			const fieldSelect = row.querySelector('.effect-field-select')
			if (!groupSelect || !fieldSelect) continue
			groupSelect.addEventListener('change', (e) => {
				const groupKey = e.target.value
				const group = EFFECT_FIELDS[groupKey]
				if (!group) return
				fieldSelect.innerHTML = ''
				for (const [key, label] of Object.entries(group.fields)) {
					const opt = document.createElement('option')
					opt.value = key
					opt.textContent = game.i18n.localize(label)
					fieldSelect.appendChild(opt)
				}
				// Update the item with the first field of the new group
				const idx = row.dataset.effectIdx
				const firstField = Object.keys(group.fields)[0]
				const isBoolean = BOOLEAN_TARGETS.has(firstField)
				const updates = {}
				updates[`system.statEffects.${idx}.target`] = firstField
				updates[`system.statEffects.${idx}.effectType`] = isBoolean ? 'boolean' : 'numeric'
				this.item.update(updates)
			})
		}
	}

	static async _onAddStatEffect() {
		const effects = foundry.utils.deepClone(this.item.system.statEffects || [])
		effects.push({
			enabled: true,
			target: 'abilities.strength.score',
			value: 0,
			effectType: 'numeric',
			condition: 'whenEquipped'
		})
		await this.item.update({ 'system.statEffects': effects })
	}

	static async _onRemoveStatEffect(event, target) {
		const row = target.closest('[data-effect-idx]')
		const idx = parseInt(row?.dataset.effectIdx)
		if (isNaN(idx)) return
		const effects = foundry.utils.deepClone(this.item.system.statEffects || [])
		effects.splice(idx, 1)
		await this.item.update({ 'system.statEffects': effects })
	}

	static async _onToggleStatEffect(event, target) {
		const row = target.closest('[data-effect-idx]')
		const idx = parseInt(row?.dataset.effectIdx)
		if (isNaN(idx)) return
		const effects = foundry.utils.deepClone(this.item.system.statEffects || [])
		if (effects[idx]) {
			effects[idx].enabled = !effects[idx].enabled
			await this.item.update({ 'system.statEffects': effects })
		}
	}
}

export default DolmenItemSheet
