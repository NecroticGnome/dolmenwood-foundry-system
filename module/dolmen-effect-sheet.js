/* global foundry, game, FilePicker */
import { BOOLEAN_TARGETS, WEAPON_TYPE_TARGETS, getEffectGroupForTarget, getEffectFieldsForActor, getEffectEntries } from './effect-fields.js'
import { CHOICE_KEYS } from './utils/choices.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

class DolmenEffectSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'item', 'effect'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 420,
			height: 'auto'
		},
		window: {
			resizable: true
		},
		actions: {
			addEntry: DolmenEffectSheet._onAddEntry,
			removeEntry: DolmenEffectSheet._onRemoveEntry,
			prevEntry: DolmenEffectSheet._onPrevEntry,
			nextEntry: DolmenEffectSheet._onNextEntry
		}
	}

	/**
	 * Index of the effect detail entry being edited: 0 is the item's original
	 * target/value fields, 1+ are entries in system.additionalEffects.
	 */
	_entryIndex = 0

	static PARTS = {
		body: {
			template: 'systems/dolmenwood/templates/items/parts/effect-body.html'
		}
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const system = this.item.system
		const actorType = this.item.parent?.type || 'Adventurer'
		const effectFields = getEffectFieldsForActor(actorType)

		// The effect detail entry currently shown
		const entries = getEffectEntries(system)
		this._entryIndex = Math.min(this._entryIndex, entries.length - 1)
		const entry = entries[this._entryIndex]
		context.entry = entry
		context.entryNumber = this._entryIndex + 1
		context.entryCount = entries.length
		context.hasPrev = this._entryIndex > 0
		context.hasNext = this._entryIndex < entries.length - 1

		context.currentGroup = getEffectGroupForTarget(entry.target) || Object.keys(effectFields)[0]
		// Fall back to first available group if current group is excluded
		if (!effectFields[context.currentGroup]) {
			context.currentGroup = Object.keys(effectFields)[0]
		}

		// Build group choices
		context.groupChoices = {}
		for (const [key, val] of Object.entries(effectFields)) {
			context.groupChoices[key] = game.i18n.localize(val.label)
		}

		// Build field choices for current group
		const activeGroup = effectFields[context.currentGroup]
		context.fieldChoices = {}
		if (activeGroup) {
			for (const [key, label] of Object.entries(activeGroup.fields)) {
				context.fieldChoices[key] = game.i18n.localize(label)
			}
		}

		context.currentField = entry.target
		context.isBoolean = BOOLEAN_TARGETS.has(entry.target)
		context.showWeaponType = WEAPON_TYPE_TARGETS.has(entry.target)
		context.weaponTypeChoices = {}
		for (const wt of CHOICE_KEYS.weaponTypes) {
			context.weaponTypeChoices[wt] = game.i18n.localize(`DOLMEN.Item.WeaponType.${wt}`)
		}
		context.currentWeaponType = entry.subTarget || CHOICE_KEYS.weaponTypes[0]
		context.system = system
		context.item = this.item

		// Duration choices
		context.durationChoices = {
			permanent: game.i18n.localize('DOLMEN.Effects.DurationPermanent'),
			rounds: game.i18n.localize('DOLMEN.Effects.DurationRounds'),
			turns: game.i18n.localize('DOLMEN.Effects.DurationTurns'),
			hours: game.i18n.localize('DOLMEN.Effects.DurationHours'),
			days: game.i18n.localize('DOLMEN.Effects.DurationDays'),
			untilRest: game.i18n.localize('DOLMEN.Effects.DurationUntilRest'),
			untilNextDay: game.i18n.localize('DOLMEN.Effects.DurationUntilNextDay')
		}
		context.hideDurationAmount = ['permanent', 'untilRest', 'untilNextDay'].includes(system.duration)

		return context
	}

	/**
	 * Route the edited entry's fields (submitted as entry.*) to the item's
	 * original fields for the first entry, or to its additionalEffects slot.
	 */
	_processFormData(event, form, formData) {
		const data = super._processFormData(event, form, formData)
		const entry = data.entry
		delete data.entry
		if (!entry) return data

		data.system ??= {}
		if (this._entryIndex === 0) {
			Object.assign(data.system, entry)
		} else {
			const additional = foundry.utils.deepClone(this.item.system.additionalEffects)
			const i = this._entryIndex - 1
			additional[i] = { ...additional[i], ...entry }
			data.system.additionalEffects = additional
		}
		return data
	}

	static async _onAddEntry() {
		const additional = foundry.utils.deepClone(this.item.system.additionalEffects)
		additional.push({ target: 'abilities.strength.score', value: 0, effectType: 'numeric', subTarget: '' })
		this._entryIndex = additional.length
		await this.item.update({ 'system.additionalEffects': additional })
	}

	/**
	 * Remove the shown entry. Removing the first entry promotes the next one
	 * into the item's original fields, so those always hold an entry.
	 */
	static async _onRemoveEntry() {
		const additional = foundry.utils.deepClone(this.item.system.additionalEffects)
		if (!additional.length) return
		if (this._entryIndex === 0) {
			const { target, value, effectType, subTarget } = additional.shift()
			await this.item.update({
				'system.target': target,
				'system.value': value,
				'system.effectType': effectType,
				'system.subTarget': subTarget,
				'system.additionalEffects': additional
			})
		} else {
			additional.splice(this._entryIndex - 1, 1)
			this._entryIndex = Math.min(this._entryIndex, additional.length)
			await this.item.update({ 'system.additionalEffects': additional })
		}
	}

	static _onPrevEntry() {
		if (this._entryIndex > 0) {
			this._entryIndex--
			this.render()
		}
	}

	static _onNextEntry() {
		if (this._entryIndex < this.item.system.additionalEffects.length) {
			this._entryIndex++
			this.render()
		}
	}

	_onRender(context, options) {
		super._onRender(context, options)
		const html = this.element

		const portrait = html.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.item.img,
					callback: (path) => this.item.update({ img: path })
				}).browse()
			})
		}

		const fieldSelect = html.querySelector('.effect-field-select')
		const groupSelect = html.querySelector('.effect-group-select')

		// Group dropdown change → update field dropdown
		const actorType = this.item.parent?.type || 'Adventurer'
		const effectFields = getEffectFieldsForActor(actorType)
		groupSelect?.addEventListener('change', (e) => {
			e.stopPropagation()
			const groupKey = e.target.value
			const group = effectFields[groupKey]
			if (!group || !fieldSelect) return

			fieldSelect.innerHTML = ''
			for (const [key, label] of Object.entries(group.fields)) {
				const opt = document.createElement('option')
				opt.value = key
				opt.textContent = game.i18n.localize(label)
				fieldSelect.appendChild(opt)
			}

			const firstField = Object.keys(group.fields)[0]
			this._updateBooleanState(html, firstField)
			this._updateWeaponTypeState(html, firstField)

			fieldSelect.dispatchEvent(new Event('change', { bubbles: true }))
		})

		// Field dropdown change → auto-detect boolean + weapon type visibility
		fieldSelect?.addEventListener('change', () => {
			this._updateBooleanState(html, fieldSelect.value)
			this._updateWeaponTypeState(html, fieldSelect.value)
		})

		// Duration dropdown change → show/hide amount field
		const durationSelect = html.querySelector('.effect-duration-select')
		durationSelect?.addEventListener('change', (e) => {
			const valueRow = html.querySelector('.effect-duration-value-row')
			const noAmount = ['permanent', 'untilRest', 'untilNextDay'].includes(e.target.value)
			if (valueRow) valueRow.style.display = noAmount ? 'none' : ''
		})
	}

	_updateWeaponTypeState(html, target) {
		const row = html.querySelector('.effect-weapon-type-row')
		if (row) row.style.display = WEAPON_TYPE_TARGETS.has(target) ? '' : 'none'
	}

	_updateBooleanState(html, target) {
		const isBoolean = BOOLEAN_TARGETS.has(target)
		const valueRow = html.querySelector('.effect-value-row')
		if (valueRow) valueRow.style.display = isBoolean ? 'none' : ''
		const typeInput = html.querySelector('input[name="entry.effectType"]')
		if (typeInput) typeInput.value = isBoolean ? 'boolean' : 'numeric'
	}
}

export default DolmenEffectSheet
