/* global foundry, game, Dialog, CONFIG, ui, Item */
import { buildChoices, buildChoicesWithBlank, CHOICE_KEYS } from './utils/choices.js'

// Sheet module imports
import {
	computeXPModifier, computeMoonSign, computeAdjustedValues,
	prepareSpellSlots, prepareKnackAbilities, prepareSpellData,
	groupSpellsByRank, prepareMemorizedSlots, groupRunesByMagnitude,
	groupItemsByType, prepareItemData
} from './sheet/data-context.js'
import {
	isKindredClass, getAlignmentRestrictions,
	prepareKindredTraits, prepareClassTraits, prepareKindredClassTraits
} from './sheet/trait-helpers.js'
import {
	setupTabListeners, setupXPListener,
	setupPortraitPicker, setupSkillListeners, setupAttackListeners,
	setupAbilityRollListeners, setupSaveRollListeners,
	setupSkillRollListeners, setupUnitConversionListeners,
	setupDetailsRollListeners, setupTraitListeners,
	setupAdjustableInputListeners
} from './sheet/listeners.js'
import { openAddSkillDialog, removeSkill } from './sheet/dialogs.js'

const TextEditor = foundry.applications.ux.TextEditor
const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'actor'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 900,
			height: 650,
		},
		window: {
			resizable: true,
			controls: [
				{
					action: 'configureActor',
					icon: 'fas fa-trees',
					label: 'DOLMEN.ConfigureSheet',
					ownership: 'OWNER'
				}
			]
		},
		actions: {
			addSkill: DolmenSheet._onAddSkill,
			removeSkill: DolmenSheet._onRemoveSkill,
			openItem: DolmenSheet._onOpenItem,
			equipItem: DolmenSheet._onEquipItem,
			stowItem: DolmenSheet._onStowItem,
			deleteItem: DolmenSheet._onDeleteItem,
			increaseQty: DolmenSheet._onIncreaseQty,
			decreaseQty: DolmenSheet._onDecreaseQty,
			memorizeSpell: DolmenSheet._onMemorizeSpell,
			forgetSpell: DolmenSheet._onForgetSpell,
			memorizeToSlot: DolmenSheet._onMemorizeToSlot
		},
		dragDrop: [{ dropSelector: '.item-list' }]
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-stats.html',
			scrollable: ['.tab-stats']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-inventory.html',
			scrollable: ['.tab-inventory']
		},
		magic: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-magic.html',
			scrollable: ['.tab-magic']
		},
		traits: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-traits.html',
			scrollable: ['.tab-traits']
		},
		details: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-details.html',
			scrollable: ['.tab-details']
		},
		notes: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-notes.html',
			scrollable: ['.tab-notes']
		},
		adjustments: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-adjustments.html',
			scrollable: ['.tab-adjustments']
		},
		settings: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-settings.html',
			scrollable: ['.tab-settings']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-user', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'inventory', icon: 'fas fa-backpack', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'magic', icon: 'fas fa-hand-holding-magic', label: 'DOLMEN.Tabs.Magic' },
				{ id: 'traits', icon: 'fas fa-person-rays', label: 'DOLMEN.Tabs.Traits' },
				{ id: 'details', icon: 'fas fa-eye', label: 'DOLMEN.Tabs.Details' },
				{ id: 'notes', icon: 'fas fa-note-sticky', label: 'DOLMEN.Tabs.Notes' },
				{ id: 'adjustments', icon: 'fas fa-sliders', label: 'DOLMEN.Tabs.Adjustments' },
				{ id: 'settings', icon: 'fas fa-cog', label: '' }
			],
			initial: 'stats'
		}
	}

	tabGroups = {
		primary: 'stats',
		magic: 'arcane'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
			const group = {}
			for (const t of config.tabs) {
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
		const actor = this.actor

		// Add actor and system data
		context.actor = actor
		context.system = actor.system

		// Prepare tabs for the tabs part
		context.tabs = this._getTabs()

		// Prepare dropdown choices with localized labels
		context.kindredChoices = buildChoices('DOLMEN.Kindreds', CHOICE_KEYS.kindreds)
		context.classChoices = {
			...buildChoices('DOLMEN.Classes', CHOICE_KEYS.classes),
			...buildChoices('DOLMEN.Kindreds', CHOICE_KEYS.kindredClasses)
		}
		// Apply alignment restrictions from traits
		const alignRestrictions = getAlignmentRestrictions(actor)
		if (alignRestrictions && alignRestrictions.length > 0) {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', alignRestrictions)
		} else {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', CHOICE_KEYS.alignments)
		}
		context.encumbranceChoices = buildChoices('DOLMEN.Encumbrance', CHOICE_KEYS.encumbranceMethods)
		context.monthNameChoices = buildChoicesWithBlank('DOLMEN.Months', CHOICE_KEYS.months)
		// Build day choices (1-31) for birthday selector
		const dayChoices = { 0: ' ' }
		const selectedMonth = actor.system.birthMonth
		const monthData = CONFIG.DOLMENWOOD.months[selectedMonth]
		const maxDays = monthData ? monthData.days : 31
		for (let d = 1; d <= maxDays; d++) dayChoices[d] = String(d)
		context.dayChoices = dayChoices
		// Fairy kindred flag
		context.isFairy = actor.system.creatureType === 'fairy'

		// Compute moon sign from birthday (fairies have no moon sign)
		if (context.isFairy) {
			context.moonSignLabel = `${game.i18n.localize('DOLMEN.None')} (${game.i18n.localize('DOLMEN.CreatureTypes.fairy')})`
		} else {
			const moonSign = computeMoonSign(actor.system.birthMonth, actor.system.birthDay)
			if (moonSign) {
				const moonLabel = game.i18n.localize(`DOLMEN.MoonNames.${moonSign.moon}`)
				const phaseLabel = game.i18n.localize(`DOLMEN.MoonPhases.${moonSign.phase}`)
				context.moonSignLabel = `${moonLabel} ${game.i18n.localize('DOLMEN.Moon')} (${phaseLabel})`
			} else {
				context.moonSignLabel = '—'
			}
		}
		context.creatureTypeChoices = buildChoices('DOLMEN.CreatureTypes', CHOICE_KEYS.creatureTypes)
		context.creatureTypeLabel = game.i18n.localize(`DOLMEN.CreatureTypes.${actor.system.creatureType}`)

		// Max extra skills for template conditional
		context.maxExtraSkills = CONFIG.DOLMENWOOD.maxExtraSkills

		// Determine body/fur label based on kindred
		const furKindreds = ['breggle', 'grimalkin']
		const kindred = actor.system.kindred
		context.bodyLabel = furKindreds.includes(kindred)
			? game.i18n.localize('DOLMEN.ExtraDetails.Fur')
			: game.i18n.localize('DOLMEN.ExtraDetails.Body')

		// Compute class detail strings from class
		const cls = actor.system.class
		const classKeys = ['Weapons', 'Armor', 'PrimeAbilities', 'HitPoints', 'CombatAptitude']
		const classFields = ['weaponsProficiency', 'armorProficiency', 'primeAbilities', 'hitPointsClass', 'combatAptitude']
		for (let i = 0; i < classKeys.length; i++) {
			const key = `DOLMEN.ClassDetails.Proficiency.${classKeys[i]}.${cls}`
			context[classFields[i]] = cls && game.i18n.has(key)
				? game.i18n.localize(key)
				: '—'
		}

		// Compute kindred lifespan string
		const lifespanKey = `DOLMEN.KindredLifespan.${kindred}`
		context.lifespanTitle = kindred && game.i18n.has(lifespanKey)
			? game.i18n.localize(lifespanKey)
			: '—'

		// Compute kindred age string
		const ageKey = `DOLMEN.KindredAge.${kindred}`
		context.ageTitle = kindred && game.i18n.has(ageKey)
			? game.i18n.localize(ageKey)
			: '—'

		// Compute kindred height/weight strings
		const heightKey = `DOLMEN.KindredHeight.${kindred}`
		context.heightTitle = kindred && game.i18n.has(heightKey)
			? game.i18n.localize(heightKey)
			: '—'
		const weightKey = `DOLMEN.KindredWeight.${kindred}`
		context.weightTitle = kindred && game.i18n.has(weightKey)
			? game.i18n.localize(weightKey)
			: '—'

		// Prepare inventory items grouped by type
		const items = actor.items.contents.filter(i => i.type !== 'Spell')
		const equippedItems = items.filter(i => i.system.equipped).map(i => prepareItemData(i))
		const stowedItems = items.filter(i => !i.system.equipped).map(i => prepareItemData(i))

		// Group items by type
		context.equippedByType = groupItemsByType(equippedItems)
		context.stowedByType = groupItemsByType(stowedItems)
		context.hasEquippedItems = equippedItems.length > 0
		context.hasStowedItems = stowedItems.length > 0

		// Prepare magic tab data
		context.knackTypeChoices = buildChoices('DOLMEN.Magic.Knacks.Types', CHOICE_KEYS.knackTypes)

		// Prepare arcane spell slots
		context.arcaneSpellSlots = prepareSpellSlots(actor.system.arcaneMagic.spellSlots, 6)

		// Prepare holy spell slots
		context.holySpellSlots = prepareSpellSlots(actor.system.holyMagic.spellSlots, 5)

		// Prepare spells by type, grouped by rank
		const spells = actor.items.contents.filter(i => i.type === 'Spell')
		const arcaneSpells = spells.filter(s => s.system.type === 'arcane')
		const holySpells = spells.filter(s => s.system.type === 'holy')
		const glamourSpells = spells.filter(s => s.system.type === 'glamour')
		const runeSpells = spells.filter(s => s.system.type === 'rune')

		// Arcane magic: known spells and memorized slots
		context.knownArcaneSpellsByRank = groupSpellsByRank(arcaneSpells, 6)
		context.memorizedArcaneSlots = prepareMemorizedSlots(
			actor.system.arcaneMagic.spellSlots,
			arcaneSpells,
			6
		)
		context.hasKnownArcaneSpells = arcaneSpells.length > 0
		context.hasMemorizedSlots = context.memorizedArcaneSlots.some(r => r.slots.length > 0)

		// Holy magic
		context.holySpellsByRank = groupSpellsByRank(holySpells, 5)
		context.hasHolySpells = holySpells.length > 0

		// Fairy magic
		context.glamourSpells = glamourSpells.map(s => prepareSpellData(s))
		context.runeSpellsByMagnitude = groupRunesByMagnitude(runeSpells)
		context.hasGlamourSpells = glamourSpells.length > 0
		context.hasRuneSpells = runeSpells.length > 0

		// Prepare knack abilities
		context.knackTypeLabel = actor.system.knacks.type
			? game.i18n.localize(`DOLMEN.Magic.Knacks.Types.${actor.system.knacks.type}`)
			: ''
		context.knackAbilities = prepareKnackAbilities(
			actor.system.knacks.type,
			actor.system.level
		)

		// Prepare traits
		context.isKindredClass = isKindredClass(actor)
		if (context.isKindredClass) {
			context.kindredClassTraits = prepareKindredClassTraits(actor)
			context.kindredClassName = game.i18n.localize(`DOLMEN.Kindreds.${actor.system.class}`)
		} else {
			context.kindredTraits = prepareKindredTraits(actor)
			context.classTraits = prepareClassTraits(actor)
			context.kindredName = game.i18n.localize(`DOLMEN.Kindreds.${actor.system.kindred}`)
			context.className = game.i18n.localize(`DOLMEN.Classes.${actor.system.class}`)
		}

		// Prepare combat talents and holy order choices
		context.combatTalentChoices = buildChoicesWithBlank('DOLMEN.Traits.Talents', CHOICE_KEYS.combatTalents)
		context.holyOrderChoices = buildChoicesWithBlank('DOLMEN.Traits.Orders', CHOICE_KEYS.holyOrders)

		// Compute adjusted values (base + adjustment)
		context.adjusted = computeAdjustedValues(actor)

		// Compute XP modifier from prime abilities + custom adjustment
		const baseXPMod = computeXPModifier(actor, context.adjusted.abilities)
		const xpModAdj = actor.system.adjustments.xpModifier || 0
		context.xpModifier = baseXPMod + xpModAdj
		context.xpModifierLabel = context.xpModifier >= 0
			? `+${context.xpModifier}%`
			: `${context.xpModifier}%`
		context.xpModifierLabel+= ` ${game.i18n.localize('DOLMEN.Modifier')}`
		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)

		// For tab content parts, add the tab object
		const tabIds = ['stats', 'inventory', 'magic', 'traits', 'details', 'notes', 'adjustments', 'settings']
		if (tabIds.includes(partId)) {
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

	/* -------------------------------------------- */
	/*  Event Listener Setup                        */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

		setupTabListeners(this)
		setupXPListener(this)
		setupPortraitPicker(this)
		setupSkillListeners(this)
		setupAttackListeners(this)
		setupAbilityRollListeners(this)
		setupSaveRollListeners(this)
		setupSkillRollListeners(this)
		setupUnitConversionListeners(this)
		setupDetailsRollListeners(this)
		setupTraitListeners(this)
		setupAdjustableInputListeners(this)
	}

	/* -------------------------------------------- */
	/*  Static Action Handlers                      */
	/* -------------------------------------------- */

	static _onAddSkill(_event, _target) {
		openAddSkillDialog(this)
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		removeSkill(this, index)
	}

	static _onOpenItem(_event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			item?.sheet.render(true)
		}
	}

	static async _onEquipItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			if (item) {
				this.actor.warnIfIncompatibleSize(item)
				await item.update({ 'system.equipped': true })
			}
		}
	}

	static async _onStowItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			await item?.update({ 'system.equipped': false })
		}
	}

	static async _onDeleteItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			if (item) {
				const confirmed = await Dialog.confirm({
					title: game.i18n.localize('DOLMEN.Inventory.DeleteConfirmTitle'),
					content: game.i18n.format('DOLMEN.Inventory.DeleteConfirmContent', { name: item.name })
				})
				if (confirmed) {
					await item.delete()
				}
			}
		}
	}

	static async _onIncreaseQty(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			if (item) {
				const currentQty = item.system.quantity || 1
				await item.update({ 'system.quantity': currentQty + 1 })
			}
		}
	}

	static async _onDecreaseQty(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			if (item) {
				const currentQty = item.system.quantity || 1
				if (currentQty > 1) {
					await item.update({ 'system.quantity': currentQty - 1 })
				}
			}
		}
	}

	static async _onMemorizeSpell(_event, target) {
		const itemId = target.dataset.itemId
		const spellType = target.dataset.spellType || 'arcane'
		if (!itemId) return

		const spell = this.actor.items.get(itemId)
		if (!spell) return

		const rank = spell.system.rank
		const slotKey = `rank${rank}`
		const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
		const slotData = this.actor.system[magicPath].spellSlots[slotKey]

		if (!slotData || slotData.max === 0) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.NoSlotsForRank'))
			return
		}

		const memorized = [...(slotData.memorized || [])]

		let emptyIndex = -1
		for (let i = 0; i < slotData.max; i++) {
			if (!memorized[i]) {
				emptyIndex = i
				break
			}
		}

		if (emptyIndex === -1) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.AllSlotsFull'))
			return
		}

		memorized[emptyIndex] = itemId
		await this.actor.update({
			[`system.${magicPath}.spellSlots.${slotKey}.memorized`]: memorized
		})
	}

	static async _onForgetSpell(_event, target) {
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey
		const spellType = target.dataset.spellType || 'arcane'

		if (isNaN(slotIndex) || !rankKey) return

		const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
		const slotData = this.actor.system[magicPath].spellSlots[rankKey]
		const memorized = [...(slotData.memorized || [])]

		memorized[slotIndex] = null
		await this.actor.update({
			[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized
		})
	}

	static async _onMemorizeToSlot(_event, target) {
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey
		const rank = parseInt(target.dataset.rank)
		const spellType = target.dataset.spellType || 'arcane'

		if (isNaN(slotIndex) || !rankKey || isNaN(rank)) return

		const knownSpells = this.actor.items.filter(
			i => i.type === 'Spell' && i.system.type === spellType && i.system.rank === rank
		)

		if (knownSpells.length === 0) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.NoKnownSpellsForRank'))
			return
		}

		const options = knownSpells.map(s =>
			`<option value="${s.id}">${s.name}</option>`
		).join('')

		const content = `
			<div class="memorize-spell-modal">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Magic.SelectSpellToMemorize')}</label>
					<select id="spell-select">${options}</select>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.Magic.MemorizeSpell'),
			content: content,
			buttons: {
				memorize: {
					icon: '<i class="fas fa-book-sparkles"></i>',
					label: game.i18n.localize('DOLMEN.Magic.Memorize'),
					callback: async (html) => {
						const spellId = html.find('#spell-select').val()
						const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
						const slotData = this.actor.system[magicPath].spellSlots[rankKey]
						const memorized = [...(slotData.memorized || [])]
						memorized[slotIndex] = spellId
						await this.actor.update({
							[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized
						})
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'memorize'
		})

		dialog.render(true)
	}

	async _onDrop(event) {
		const data = TextEditor.getDragEventData(event)

		// Handle item drops
		if (data.type === 'Item') {
			const targetList = event.target.closest('[data-item-list]')?.dataset.itemList
			const item = await Item.fromDropData(data)

			// If dropped from another actor or compendium, create a copy
			if (item.parent !== this.actor) {
				const itemData = item.toObject()
				itemData.system.equipped = targetList === 'equipped'
				await this.actor.createEmbeddedDocuments('Item', [itemData])
			} else {
				// If dropped within the same actor, toggle equipped state
				const equipped = targetList === 'equipped'
				if (item.system.equipped !== equipped) {
					await item.update({ 'system.equipped': equipped })
				}
			}
		}
	}
}

export default DolmenSheet
