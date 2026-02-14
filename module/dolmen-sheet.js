/* global foundry, game, Dialog, CONFIG, ui, Item, ChatMessage, CONST */
import { buildChoices, buildChoicesWithBlank, formatWeaponProficiency, formatArmorProficiency, CHOICE_KEYS } from './utils/choices.js'
import { parseSaveLinks } from './chat-save.js'

// Sheet module imports
import {
	computeXPModifier, computeMoonSign, computeEncumbrance, computeAdjustedValues,
	prepareSpellSlots, prepareKnackAbilities, prepareSpellData,
	groupSpellsByRank, prepareMemorizedSlots, groupRunesByMagnitude,
	groupItemsByType, prepareItemData, getRuneUsage, computeSkillPoints
} from './sheet/data-context.js'
import {
	isKindredClass, getAlignmentRestrictions,
	prepareKindredTraits, prepareClassTraits, prepareKindredClassTraits
} from './sheet/trait-helpers.js'
import {
	setupTabListeners, setupXPListener, setupLevelListeners, setupCoinListener,
	setupPortraitPicker, setupSkillListeners, setupAttackListeners,
	setupAbilityRollListeners, setupSaveRollListeners,
	setupSkillRollListeners, setupUnitConversionListeners,
	setupDetailsRollListeners, setupExtraDetailsRollListeners,
	setupBackgroundRollListener, setupNameRollListener,
	setupTraitListeners, setupAdjustableInputListeners,
	setupRuneUsageListeners, setupKnackUsageListeners
} from './sheet/listeners.js'
import { openAddSkillDialog, removeSkill } from './sheet/dialogs.js'

const TextEditor = foundry.applications.ux.TextEditor
const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

/**
 * Convert a height formula (in inches) to a display string with feet/inches notation.
 * e.g. "64 + 2d6" → "5'4\" + 2d6\""
 * @param {string} formula - Height formula where the base number is total inches
 * @returns {string} Formatted height string
 */
function formatHeightFormula(formula) {
	const match = formula.match(/^(\d+)\s*(.*)$/)
	if (!match) return formula
	const baseInches = parseInt(match[1])
	const rest = match[2].trim()
	const feet = Math.floor(baseInches / 12)
	const inches = baseInches % 12
	const base = inches > 0 ? `${feet}'${inches}"` : `${feet}'`
	return rest ? `${base} ${rest}"` : base
}

class DolmenSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	constructor(options = {}) {
		super(options)
		this._updatingKindredClass = false
	}

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
			setKindred: DolmenSheet._onSetKindred,
			setClass: DolmenSheet._onSetClass,
			openItem: DolmenSheet._onOpenItem,
			equipItem: DolmenSheet._onEquipItem,
			stowItem: DolmenSheet._onStowItem,
			deleteItem: DolmenSheet._onDeleteItem,
			increaseQty: DolmenSheet._onIncreaseQty,
			decreaseQty: DolmenSheet._onDecreaseQty,
			memorizeSpell: DolmenSheet._onMemorizeSpell,
			forgetSpell: DolmenSheet._onForgetSpell,
			memorizeToSlot: DolmenSheet._onMemorizeToSlot,
			castSpell: DolmenSheet._onCastSpell
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
				{ id: 'magic', icon: 'fas fa-sparkles', label: 'DOLMEN.Tabs.Magic' },
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

		// Kindred and Class items
		const kindredItem = actor.getKindredItem()
		const classItem = actor.getClassItem()
		context.kindredItem = kindredItem
		context.classItem = classItem
		// Extract IDs as plain strings for template dropdown matching
		context.kindredName = kindredItem?.system?.kindredId || null
		context.className = classItem?.system?.classId || null

		// Build dropdown choices from compendia (kindredId/classId → localized name)
		const kindredPack = game.packs.get('dolmenwood.kindreds')
		if (kindredPack) {
			const kindredIndex = await kindredPack.getIndex({ fields: ['system.kindredId'] })
			context.kindredChoices = Object.fromEntries(
				kindredIndex
					.filter(e => e.system?.kindredId)
					.map(e => [e.system.kindredId, game.i18n.localize(`DOLMEN.Kindreds.${e.system.kindredId}`)])
					.sort((a, b) => a[1].localeCompare(b[1]))
			)
		} else {
			context.kindredChoices = {}
		}

		const classPack = game.packs.get('dolmenwood.classes')
		if (classPack) {
			const classIndex = await classPack.getIndex({ fields: ['system.classId', 'system.requiredKindred'] })
			const classEntries = classIndex
				.filter(e => e.system?.classId)
				.map(e => ({ id: e.system.classId, label: game.i18n.localize(`DOLMEN.Classes.${e.system.classId}`), isKindredClass: !!e.system.requiredKindred }))
				.sort((a, b) => a.isKindredClass === b.isKindredClass ? a.label.localeCompare(b.label) : a.isKindredClass ? 1 : -1)
			context.classChoices = Object.fromEntries(classEntries.map(e => [e.id, e.label]))
		} else {
			context.classChoices = {}
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

		// Localize language names for display
		const langIds = actor.system.languages || []
		context.localizedLanguages = (Array.isArray(langIds) ? langIds : [])
			.map(id => {
				const key = `DOLMEN.Languages.${id}`
				return game.i18n.has(key) ? game.i18n.localize(key) : id
			})
			.join(', ')

		// Max extra skills for template conditional
		context.maxExtraSkills = CONFIG.DOLMENWOOD.maxExtraSkills

		// Determine body/fur label based on kindred
		const furKindreds = ['breggle', 'grimalkin']
		const kindred = kindredItem?.system?.kindredId
		context.bodyLabel = furKindreds.includes(kindred)
			? game.i18n.localize('DOLMEN.ExtraDetails.Fur')
			: game.i18n.localize('DOLMEN.ExtraDetails.Body')

		// Compute class detail strings from class item data
		if (classItem?.system) {
			const sys = classItem.system
			// Prime abilities: localize each ability name
			context.primeAbilities = sys.primeAbilities?.length > 0
				? sys.primeAbilities.map(a => game.i18n.localize(`DOLMEN.Abilities.${a.charAt(0).toUpperCase() + a.slice(1)}`)).join(', ')
				: '—'
			// Hit points: localized format with die + flat bonus
			context.hitPointsClass = sys.hitDice?.die
				? game.i18n.format('DOLMEN.ClassDetails.HitPointsFormat', {
					hitDie: sys.hitDice.die,
					flatBonus: sys.hitDice.flat || 0
				})
				: '—'
			// Combat aptitude: localize
			const aptKey = `DOLMEN.Class.CombatAptitudeChoices.${sys.combatAptitude}`
			context.combatAptitude = sys.combatAptitude && game.i18n.has(aptKey)
				? game.i18n.localize(aptKey)
				: '—'
		} else {
			context.primeAbilities = '—'
			context.hitPointsClass = '—'
			context.combatAptitude = '—'
		}
		// Weapons and armor proficiency from class item data
		if (classItem?.system) {
			context.weaponsProficiency = formatWeaponProficiency(classItem.system.weaponsProficiency)
			context.armorProficiency = formatArmorProficiency(classItem.system.armorProficiency)
		} else {
			context.weaponsProficiency = '—'
			context.armorProficiency = '—'
		}

		// Compute kindred physical characteristic display strings from item data
		if (kindredItem?.system) {
			const ks = kindredItem.system
			const fmt = f => f.replace(/\*/g, '×')
			context.ageTitle = ks.ageFormula ? `${fmt(ks.ageFormula)} years` : '—'
			context.lifespanTitle = ks.lifespanFormula && ks.lifespanFormula !== '0'
				? `${fmt(ks.lifespanFormula)} years`
				: game.i18n.localize('DOLMEN.Immortal')
			context.heightTitle = ks.heightFormula ? formatHeightFormula(ks.heightFormula) : '—'
			context.weightTitle = ks.weightFormula ? `${fmt(ks.weightFormula)} lbs` : '—'
		} else {
			context.ageTitle = '—'
			context.lifespanTitle = '—'
			context.heightTitle = '—'
			context.weightTitle = '—'
		}

		// Prepare inventory items grouped by type (exclude spells, Kindred, and Class items)
		const excludedTypes = ['Spell', 'HolySpell', 'Glamour', 'Rune', 'Kindred', 'Class']
		const items = actor.items.contents.filter(i => !excludedTypes.includes(i.type))
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
		const arcaneSpells = actor.items.contents.filter(i => i.type === 'Spell')
		const holySpells = actor.items.contents.filter(i => i.type === 'HolySpell')
		const glamourSpells = actor.items.contents.filter(i => i.type === 'Glamour')
		const runeSpells = actor.items.contents.filter(i => i.type === 'Rune')

		// Arcane magic: known spells and memorized slots
		context.knownArcaneSpellsByRank = groupSpellsByRank(arcaneSpells, 6)
		context.memorizedArcaneSlots = prepareMemorizedSlots(
			actor.system.arcaneMagic.spellSlots,
			arcaneSpells,
			6
		)
		context.hasKnownArcaneSpells = arcaneSpells.length > 0
		context.hasMemorizedSlots = context.memorizedArcaneSlots.some(r => r.slots.length > 0)

		// Holy magic: known spells and memorized slots
		context.knownHolySpellsByRank = groupSpellsByRank(holySpells, 5)
		context.memorizedHolySlots = prepareMemorizedSlots(
			actor.system.holyMagic.spellSlots,
			holySpells,
			5
		)
		context.hasKnownHolySpells = holySpells.length > 0
		context.hasMemorizedHolySlots = context.memorizedHolySlots.some(r => r.slots.length > 0)

		// Fairy magic
		context.glamourSpells = glamourSpells.map(s => prepareSpellData(s))
		context.runeSpellsByMagnitude = groupRunesByMagnitude(runeSpells, actor)
		context.hasGlamourSpells = glamourSpells.length > 0
		context.hasRuneSpells = runeSpells.length > 0

		// Prepare knack abilities
		context.knackTypeLabel = actor.system.knacks.type
			? game.i18n.localize(`DOLMEN.Magic.Knacks.Types.${actor.system.knacks.type}`)
			: ''
		context.knackAbilities = prepareKnackAbilities(
			actor.system.knacks.type,
			actor.system.level,
			actor.system.knackUsage
		)

		// Prepare traits
		context.isKindredClass = isKindredClass(actor)
		if (context.isKindredClass) {
			context.kindredClassTraits = prepareKindredClassTraits(actor)
			// For kindred-classes, use the localized class name (e.g., "Elf", "Grimalkin")
			const kcClassItem = actor.getClassItem()
			const kcClassId = kcClassItem?.system?.classId
			context.kindredClassName = kcClassId ? game.i18n.localize(`DOLMEN.Classes.${kcClassId}`) : ''
		} else {
			context.kindredTraits = prepareKindredTraits(actor)
			context.classTraits = prepareClassTraits(actor)
			// kindredName and className are already set earlier from embedded items
		}

		// Prepare combat talents and holy order choices
		context.combatTalentChoices = buildChoicesWithBlank('DOLMEN.Traits.Talents', CHOICE_KEYS.combatTalents)
		context.holyOrderChoices = buildChoicesWithBlank('DOLMEN.Traits.Orders', CHOICE_KEYS.holyOrders)

		// Check if class has combat talents feature (for combat talents display)
		context.hasCombatTalents = classItem?.system?.hasCombatTalents ?? false
		// Check if class has holy order feature (for holy order display)
		context.hasHolyOrder = classItem?.system?.hasHolyOrder ?? false

		// Compute encumbrance and adjusted values (base + adjustment)
		context.encumbrance = computeEncumbrance(actor)
		context.adjusted = computeAdjustedValues(actor, context.encumbrance.speed)

		// Compute XP modifier from prime abilities + custom adjustment
		const baseXPMod = computeXPModifier(actor, context.adjusted.abilities)
		const xpModAdj = actor.system.adjustments.xpModifier || 0
		context.xpModifier = baseXPMod + xpModAdj
		context.xpModifierLabel = context.xpModifier >= 0
			? `+${context.xpModifier}%`
			: `${context.xpModifier}%`
		context.xpModifierLabel+= ` ${game.i18n.localize('DOLMEN.Modifier')}`

		// Check if ready to level up
		context.canLevelUp = actor.system.xp.value >= actor.system.xp.nextLevel

		// Compute available skill points for customize skills option
		context.skillPoints = actor.system.customizeSkills ? computeSkillPoints(actor) : 0

		// Enrich notes HTML for editor
		context.enrichedNotes = await TextEditor.enrichHTML(actor.system.background.notes || '', {
			relativeTo: actor,
			async: true
		})

		// Prepare detail roll tooltips (show RollTable name)
		const kindredLabel = kindred ? kindred.charAt(0).toUpperCase() + kindred.slice(1) : ''
		const detailFields = ['head', 'face', 'dress', 'body', 'demeanour', 'desires', 'beliefs', 'speech']
		context.detailTitles = {}
		for (const field of detailFields) {
			let fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
			if (field === 'body' && furKindreds.includes(kindred)) fieldLabel = 'Fur'
			context.detailTitles[field] = kindredLabel ? `${kindredLabel} ${fieldLabel}` : ''
		}

		// Prepare background and name roll tooltips
		context.backgroundTitle = kindredLabel ? `${kindredLabel} Backgrounds` : ''
		context.nameTitle = kindredLabel ? `${kindredLabel} Names` : ''

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

		// Ensure kindredName and className are available in all parts
		if (partId === 'stats') {
			const kindredItem = this.actor.getKindredItem()
			const classItem = this.actor.getClassItem()
			context.kindredName = kindredItem?.system?.kindredId || null
			context.className = classItem?.system?.classId || null
		}

		return context
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	async render(options = {}) {
		// Prevent renders during kindred/class update
		if (this._updatingKindredClass && !options.force) {
			return this
		}
		return super.render(options)
	}

	_prepareSubmitData(event, form, formData) {
		const submitData = super._prepareSubmitData(event, form, formData)
		// Remove kindred/class selects from submission (they're handled separately)
		delete submitData._kindred
		delete submitData._class
		return submitData
	}

	/* -------------------------------------------- */
	/*  Event Listener Setup                        */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

		setupTabListeners(this)
		setupXPListener(this)
		setupLevelListeners(this)
		setupCoinListener(this)
		setupPortraitPicker(this)
		setupSkillListeners(this)
		setupAttackListeners(this)
		setupAbilityRollListeners(this)
		setupSaveRollListeners(this)
		setupSkillRollListeners(this)
		setupUnitConversionListeners(this)
		setupDetailsRollListeners(this)
		setupExtraDetailsRollListeners(this)
		setupBackgroundRollListener(this)
		setupNameRollListener(this)
		setupTraitListeners(this)
		setupRuneUsageListeners(this)
		setupKnackUsageListeners(this)
		setupAdjustableInputListeners(this)

		// Setup kindred and class select listeners
		// These are handled separately to prevent form submission interference
		const kindredSelect = this.element.querySelector('.kindred-select')
		if (kindredSelect) {
			// Remove any existing listeners by cloning the element
			const newKindredSelect = kindredSelect.cloneNode(true)
			kindredSelect.parentNode.replaceChild(newKindredSelect, kindredSelect)

			newKindredSelect.addEventListener('change', async (event) => {
				event.preventDefault()
				event.stopPropagation()
				const kindredId = event.target.value
				if (kindredId) {
					this._updatingKindredClass = true
					await this.actor.setKindred(kindredId)
					this._updatingKindredClass = false
					this.render()
				}
			})
		}

		const classSelect = this.element.querySelector('.class-select')
		if (classSelect) {
			// Remove any existing listeners by cloning the element
			const newClassSelect = classSelect.cloneNode(true)
			classSelect.parentNode.replaceChild(newClassSelect, classSelect)

			newClassSelect.addEventListener('change', async (event) => {
				event.preventDefault()
				event.stopPropagation()
				const classId = event.target.value
				if (classId) {
					this._updatingKindredClass = true
					await this.actor.setClass(classId)
					this._updatingKindredClass = false
					this.render()
				}
			})
		}
	}

	/* -------------------------------------------- */
	/*  Static Action Handlers                      */
	/* -------------------------------------------- */

	static _onAddSkill() {
		openAddSkillDialog(this)
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		removeSkill(this, index)
	}

	static async _onSetKindred(_event, target) {
		const kindredId = target.value
		if (kindredId) {
			await this.actor.setKindred(kindredId)
			// Foundry auto-renders on actor updates
		}
	}

	static async _onSetClass(_event, target) {
		const classId = target.value
		if (classId) {
			await this.actor.setClass(classId)
			// Foundry auto-renders on actor updates
		}
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
				const confirmed = await foundry.applications.api.DialogV2.confirm({
					window: { title: game.i18n.localize('DOLMEN.Inventory.DeleteConfirmTitle') },
					content: game.i18n.format('DOLMEN.Inventory.DeleteConfirmContent', { name: item.name }),
					rejectClose: false,
					modal: true
				})
				if (confirmed) {
					// Clean up memorized spell slots before deleting
					if (['Spell', 'HolySpell'].includes(item.type)) {
						const magicPath = item.type === 'HolySpell' ? 'holyMagic' : 'arcaneMagic'
						const slotsData = this.actor.system[magicPath]?.spellSlots
						if (slotsData) {
							const updates = {}
							for (const [key, slot] of Object.entries(slotsData)) {
								const memorized = slot.memorized
								if (memorized?.includes(itemId)) {
									updates[`system.${magicPath}.spellSlots.${key}.memorized`] =
										memorized.map(id => id === itemId ? null : id)
								}
							}
							if (Object.keys(updates).length) {
								await this.actor.update(updates)
							}
						}
					}
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

		const itemType = spellType === 'holy' ? 'HolySpell' : 'Spell'
		const knownSpells = this.actor.items.filter(
			i => i.type === itemType && i.system.rank === rank
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

	static async _onCastSpell(_event, target) {
		const itemId = target.dataset.itemId
		const item = this.actor.items.get(itemId)
		if (!item) return

		const spellType = target.dataset.spellType
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey

		// For arcane/holy memorized spells: remove from slot and increment used
		if (spellType && !isNaN(slotIndex) && rankKey) {
			const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
			const slotData = this.actor.system[magicPath].spellSlots[rankKey]
			const memorized = [...(slotData.memorized || [])]
			memorized[slotIndex] = null
			await this.actor.update({
				[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized,
				[`system.${magicPath}.spellSlots.${rankKey}.used`]: slotData.used + 1
			})
		}

		// For runes: increment usage and delete "once ever" runes
		if (item.type === 'Rune') {
			const magnitude = item.system.magnitude || 'lesser'
			const usage = getRuneUsage(magnitude, this.actor.system.level)
			const runeUsage = foundry.utils.deepClone(this.actor.system.runeUsage || {})
			const runeData = runeUsage[itemId] || { used: 0, max: usage.max }
			runeData.used = Math.min(runeData.used + 1, usage.max)
			runeData.max = usage.max
			runeUsage[itemId] = runeData
			await this.actor.update({ 'system.runeUsage': runeUsage })

			if (usage.deleteOnUse && runeData.used >= usage.max) {
				await item.delete()
			}
		}

		// Build chat message
		const sys = item.system
		const typeLabels = {
			Spell: 'DOLMEN.Magic.Arcane.Title',
			HolySpell: 'DOLMEN.Magic.Holy.Title',
			Glamour: 'DOLMEN.Magic.Fairy.Glamours',
			Rune: 'DOLMEN.Magic.Fairy.Runes'
		}
		const typeLabel = game.i18n.localize(typeLabels[item.type] || typeLabels.Spell)

		let fields = ''
		if (sys.rank !== undefined) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.SpellRank')}:</strong> ${sys.rank}</div>`
		}
		if (sys.prayerName) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Prayer')}:</strong> ${sys.prayerName}</div>`
		}
		if (sys.magnitude) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Fairy.Magnitude')}:</strong> ${game.i18n.localize(`DOLMEN.Magic.Fairy.Magnitudes.${sys.magnitude}`)}</div>`
		}
		if (sys.range) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Range')}:</strong> ${sys.range}</div>`
		}
		if (sys.duration) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Duration')}:</strong> ${sys.duration}</div>`
		}
		if (sys.description) {
			fields += `<div class="spell-description">${parseSaveLinks(sys.description)}</div>`
		}
		if (sys.codexUuid) {
			fields += `<div class="spell-codex-link">@UUID[${sys.codexUuid}]{${game.i18n.localize('DOLMEN.Magic.CodexLink')}}</div>`
		}

		const content = `
			<div class="dolmen spell-card">
				<div class="spell-header">
					<div style="mask-image:url('${item.img}'); -webkit-mask-image: url('${item.img}');" class="spell-card-image"></div>
					<div class="spell-info">
						<h3>${item.name}</h3>
						<span class="spell-type-label">${typeLabel}</span>
					</div>
				</div>
				<div class="spell-body">${fields}</div>
			</div>`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
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
