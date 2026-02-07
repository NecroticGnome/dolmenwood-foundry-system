/* global foundry, game, Dialog, FilePicker, CONFIG, ui, Item, Roll, ChatMessage, CONST */
import { buildChoices, buildChoicesWithBlank, CHOICE_KEYS } from './utils/choices.js'
import { AdventurerDataModel } from './data-models.mjs'

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

		// Add actor and system data
		context.actor = this.actor
		context.system = this.actor.system

		// Prepare tabs for the tabs part
		context.tabs = this._getTabs()

		// Prepare dropdown choices with localized labels
		context.kindredChoices = buildChoices('DOLMEN.Kindreds', CHOICE_KEYS.kindreds)
		context.classChoices = {
			...buildChoices('DOLMEN.Classes', CHOICE_KEYS.classes),
			...buildChoices('DOLMEN.Kindreds', CHOICE_KEYS.kindredClasses)
		}
		// Apply alignment restrictions from traits (e.g., Knight must be Lawful)
		const alignmentRestrictions = this._getAlignmentRestrictions()
		if (alignmentRestrictions && alignmentRestrictions.length > 0) {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', alignmentRestrictions)
		} else {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', CHOICE_KEYS.alignments)
		}
		context.encumbranceChoices = buildChoices('DOLMEN.Encumbrance', CHOICE_KEYS.encumbranceMethods)
		context.monthNameChoices = buildChoicesWithBlank('DOLMEN.Months', CHOICE_KEYS.months)
		// Build day choices (1-31) for birthday selector
		const dayChoices = { 0: ' ' }
		const selectedMonth = this.actor.system.birthMonth
		const monthData = CONFIG.DOLMENWOOD.months[selectedMonth]
		const maxDays = monthData ? monthData.days : 31
		for (let d = 1; d <= maxDays; d++) dayChoices[d] = String(d)
		context.dayChoices = dayChoices
		// Fairy kindred flag
		context.isFairy = this.actor.system.creatureType === 'fairy'

		// Compute moon sign from birthday (fairies have no moon sign)
		if (context.isFairy) {
			context.moonSignLabel = `${game.i18n.localize('DOLMEN.None')} (${game.i18n.localize('DOLMEN.CreatureTypes.fairy')})`
		} else {
			const moonSign = this._computeMoonSign(this.actor.system.birthMonth, this.actor.system.birthDay)
			if (moonSign) {
				const moonLabel = game.i18n.localize(`DOLMEN.MoonNames.${moonSign.moon}`)
				const phaseLabel = game.i18n.localize(`DOLMEN.MoonPhases.${moonSign.phase}`)
				context.moonSignLabel = `${moonLabel} ${game.i18n.localize('DOLMEN.Moon')} (${phaseLabel})`
			} else {
				context.moonSignLabel = '—'
			}
		}
		context.creatureTypeChoices = buildChoices('DOLMEN.CreatureTypes', CHOICE_KEYS.creatureTypes)
		context.creatureTypeLabel = game.i18n.localize(`DOLMEN.CreatureTypes.${this.actor.system.creatureType}`)

		// Max extra skills for template conditional
		context.maxExtraSkills = CONFIG.DOLMENWOOD.maxExtraSkills

		// Determine body/fur label based on kindred
		const furKindreds = ['breggle', 'grimalkin']
		const kindred = this.actor.system.kindred
		context.bodyLabel = furKindreds.includes(kindred)
			? game.i18n.localize('DOLMEN.ExtraDetails.Fur')
			: game.i18n.localize('DOLMEN.ExtraDetails.Body')

		// Compute class detail strings from class
		const cls = this.actor.system.class
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
		const items = this.actor.items.contents.filter(i => i.type !== 'Spell')
		const equippedItems = items.filter(i => i.system.equipped).map(i => this._prepareItemData(i))
		const stowedItems = items.filter(i => !i.system.equipped).map(i => this._prepareItemData(i))

		// Group items by type
		context.equippedByType = this._groupItemsByType(equippedItems)
		context.stowedByType = this._groupItemsByType(stowedItems)
		context.hasEquippedItems = equippedItems.length > 0
		context.hasStowedItems = stowedItems.length > 0

		// Prepare magic tab data
		context.knackTypeChoices = buildChoices('DOLMEN.Magic.Knacks.Types', CHOICE_KEYS.knackTypes)

		// Prepare arcane spell slots
		context.arcaneSpellSlots = this._prepareSpellSlots(this.actor.system.arcaneMagic.spellSlots, 6)

		// Prepare holy spell slots
		context.holySpellSlots = this._prepareSpellSlots(this.actor.system.holyMagic.spellSlots, 5)

		// Prepare spells by type, grouped by rank
		const spells = this.actor.items.contents.filter(i => i.type === 'Spell')
		const arcaneSpells = spells.filter(s => s.system.type === 'arcane')
		const holySpells = spells.filter(s => s.system.type === 'holy')
		const glamourSpells = spells.filter(s => s.system.type === 'glamour')
		const runeSpells = spells.filter(s => s.system.type === 'rune')

		// Arcane magic: known spells and memorized slots
		context.knownArcaneSpellsByRank = this._groupSpellsByRank(arcaneSpells, 6)
		context.memorizedArcaneSlots = this._prepareMemorizedSlots(
			this.actor.system.arcaneMagic.spellSlots,
			arcaneSpells,
			6
		)
		context.hasKnownArcaneSpells = arcaneSpells.length > 0
		context.hasMemorizedSlots = context.memorizedArcaneSlots.some(r => r.slots.length > 0)

		// Holy magic
		context.holySpellsByRank = this._groupSpellsByRank(holySpells, 5)
		context.hasHolySpells = holySpells.length > 0

		// Fairy magic
		context.glamourSpells = glamourSpells.map(s => this._prepareSpellData(s))
		context.runeSpellsByMagnitude = this._groupRunesByMagnitude(runeSpells)
		context.hasGlamourSpells = glamourSpells.length > 0
		context.hasRuneSpells = runeSpells.length > 0

		// Prepare knack abilities
		context.knackTypeLabel = this.actor.system.knacks.type
			? game.i18n.localize(`DOLMEN.Magic.Knacks.Types.${this.actor.system.knacks.type}`)
			: ''
		context.knackAbilities = this._prepareKnackAbilities(
			this.actor.system.knacks.type,
			this.actor.system.level
		)

		// Prepare traits
		context.isKindredClass = this._isKindredClass()
		if (context.isKindredClass) {
			context.kindredClassTraits = this._prepareKindredClassTraits()
			context.kindredClassName = game.i18n.localize(`DOLMEN.Kindreds.${this.actor.system.class}`)
		} else {
			context.kindredTraits = this._prepareKindredTraits()
			context.classTraits = this._prepareClassTraits()
			context.kindredName = game.i18n.localize(`DOLMEN.Kindreds.${this.actor.system.kindred}`)
			context.className = game.i18n.localize(`DOLMEN.Classes.${this.actor.system.class}`)
		}

		// Prepare combat talents and holy order choices
		context.combatTalentChoices = buildChoicesWithBlank('DOLMEN.Traits.Talents', CHOICE_KEYS.combatTalents)
		context.holyOrderChoices = buildChoicesWithBlank('DOLMEN.Traits.Orders', CHOICE_KEYS.holyOrders)

		// Compute adjusted values (base + adjustment)
		context.adjusted = this._computeAdjustedValues()

		// Compute XP modifier from prime abilities + custom adjustment
		const baseXPMod = this._computeXPModifier(context.adjusted.abilities)
		const xpModAdj = this.actor.system.adjustments.xpModifier || 0
		context.xpModifier = baseXPMod + xpModAdj
		context.xpModifierLabel = context.xpModifier >= 0
			? `+${context.xpModifier}%`
			: `${context.xpModifier}%`
		context.xpModifierLabel+= ` ${game.i18n.localize('DOLMEN.Modifier')}`
		return context
	}

	/**
	 * Compute XP modifier from prime abilities.
	 * Uses the lowest adjusted score among the class's prime abilities.
	 * @param {object} adjustedAbilities - The adjusted abilities object
	 * @returns {number} The XP modifier percentage (-20, -10, 0, 5, or 10)
	 */
	_computeXPModifier(adjustedAbilities) {
		const cls = this.actor.system.class
		const primes = CONFIG.DOLMENWOOD.primeAbilities[cls]
		if (!primes || primes.length === 0) return 0

		const lowestScore = Math.min(...primes.map(a => adjustedAbilities[a].score))

		if (lowestScore <= 5) return -20
		if (lowestScore <= 8) return -10
		if (lowestScore <= 12) return 0
		if (lowestScore <= 15) return 5
		return 10
	}

	/**
	 * Compute moon sign and phase from birth month and day.
	 * @param {string} month - The birth month key (e.g., 'grimvold')
	 * @param {number} day - The birth day (1-31)
	 * @returns {object|null} { moon, phase } or null if birthday not set
	 */
	_computeMoonSign(month, day) {
		const offset = CONFIG.DOLMENWOOD.monthOffsets[month]
		if (offset === undefined || !day || day <= 0) return null

		const doy = offset + day
		for (const [start, end, moon, phase] of CONFIG.DOLMENWOOD.moonSignTable) {
			if (doy >= start && doy <= end) return { moon, phase }
		}
		return null
	}

	/**
	 * Compute adjusted values by adding manual adjustments and trait adjustments to base values.
	 * @returns {object} Object containing all adjusted values
	 */
	_computeAdjustedValues() {
		const system = this.actor.system
		const adj = system.adjustments
		const traitAdj = this._computeTraitAdjustments()
		const skillOverrides = traitAdj._skillOverrides || {}

		// Helper to get trait adjustment for a path
		const getTraitAdj = (path) => traitAdj[path] || 0

		// Helper to compute skill value with override support
		const skillAdjusted = (name) => {
			const overridePath = `skills.${name}`
			if (skillOverrides[overridePath] !== undefined) {
				// Override sets the base value, then add manual adjustments
				return skillOverrides[overridePath] + (adj.skills[name] || 0)
			}
			return system.skills[name] + (adj.skills[name] || 0) + getTraitAdj(overridePath)
		}

		// Merge trait adjustments into ability adjustments
		const abilityAdjusted = (name) => {
			const base = system.abilities[name]
			const manualAdj = adj.abilities[name]
			const traitScoreAdj = getTraitAdj(`abilities.${name}.score`)
			const traitModAdj = getTraitAdj(`abilities.${name}.mod`)

			const adjustedScore = base.score + (manualAdj.score || 0) + traitScoreAdj
			const baseMod = AdventurerDataModel.computeModifier(adjustedScore)
			const adjustedMod = baseMod + (manualAdj.mod || 0) + traitModAdj

			return { score: adjustedScore, mod: adjustedMod }
		}

		return {
			abilities: {
				strength: abilityAdjusted('strength'),
				intelligence: abilityAdjusted('intelligence'),
				wisdom: abilityAdjusted('wisdom'),
				dexterity: abilityAdjusted('dexterity'),
				constitution: abilityAdjusted('constitution'),
				charisma: abilityAdjusted('charisma')
			},
			hp: {
				max: system.hp.max + (adj.hp.max || 0) + getTraitAdj('hp.max')
			},
			ac: system.ac + (adj.ac || 0) + getTraitAdj('ac'),
			attack: system.attack + (adj.attack || 0) + getTraitAdj('attack'),
			attackMelee: getTraitAdj('attack.melee'),
			attackMissile: getTraitAdj('attack.missile'),
			saves: {
				doom: system.saves.doom + (adj.saves.doom || 0) + getTraitAdj('saves.doom'),
				ray: system.saves.ray + (adj.saves.ray || 0) + getTraitAdj('saves.ray'),
				hold: system.saves.hold + (adj.saves.hold || 0) + getTraitAdj('saves.hold'),
				blast: system.saves.blast + (adj.saves.blast || 0) + getTraitAdj('saves.blast'),
				spell: system.saves.spell + (adj.saves.spell || 0) + getTraitAdj('saves.spell')
			},
			magicResistance: system.magicResistance + (adj.magicResistance || 0) + getTraitAdj('magicResistance'),
			skills: {
				listen: skillAdjusted('listen'),
				search: skillAdjusted('search'),
				survival: skillAdjusted('survival')
			},
			speed: system.speed + (adj.speed || 0) + getTraitAdj('speed'),
			movement: {
				exploring: system.movement.exploring + (adj.movement.exploring || 0),
				overland: system.movement.overland + (adj.movement.overland || 0)
			}
		}
	}

	/**
	 * Prepare spell slot data for display.
	 * @param {object} slots - The spell slots object from actor system data
	 * @param {number} maxRanks - Maximum number of ranks (6 for arcane, 5 for holy)
	 * @returns {object[]} Array of slot data with labels
	 */
	_prepareSpellSlots(slots, maxRanks) {
		const result = []
		for (let i = 1; i <= maxRanks; i++) {
			const key = `rank${i}`
			result.push({
				key,
				label: game.i18n.localize(`DOLMEN.Magic.SpellRank`)+` ${i}`,
				max: slots[key]?.max || 0,
				used: slots[key]?.used || 0
			})
		}
		return result
	}

	/**
	 * Prepare knack abilities based on knack type and character level.
	 * @param {string} knackType - The selected knack type
	 * @param {number} level - Character level
	 * @returns {object[]} Array of knack abilities with unlock status
	 */
	_prepareKnackAbilities(knackType, level) {
		if (!knackType) return []

		const knackLevels = [1, 3, 5, 7]
		return knackLevels.map(knackLevel => ({
			level: knackLevel,
			description: game.i18n.localize(`DOLMEN.Magic.Knacks.Abilities.${knackType}.level${knackLevel}`),
			unlocked: level >= knackLevel
		}))
	}

	/* -------------------------------------------- */
	/*  Trait Preparation Methods                   */
	/* -------------------------------------------- */

	/**
	 * Check if the character is using a kindred-class (kindred as class).
	 * @returns {boolean} True if using a kindred-class
	 */
	_isKindredClass() {
		return CONFIG.DOLMENWOOD.traits.kindredClassNames.includes(this.actor.system.class)
	}

	/**
	 * Get all active traits for the character (kindred + class or kindred-class).
	 * @returns {object[]} Array of raw trait definitions
	 */
	_getAllActiveTraits() {
		const traits = []
		const isKindredClass = this._isKindredClass()

		if (isKindredClass) {
			const traitDef = CONFIG.DOLMENWOOD.traits.kindredClass[this.actor.system.class]
			if (traitDef) {
				for (const category of ['active', 'passive', 'info', 'restrictions']) {
					if (traitDef[category]) traits.push(...traitDef[category])
				}
			}
		} else {
			// Kindred traits
			const kindredDef = CONFIG.DOLMENWOOD.traits.kindred[this.actor.system.kindred]
			if (kindredDef) {
				for (const category of ['active', 'passive', 'info', 'restrictions']) {
					if (kindredDef[category]) traits.push(...kindredDef[category])
				}
			}
			// Class traits
			const classDef = CONFIG.DOLMENWOOD.traits.class[this.actor.system.class]
			if (classDef) {
				for (const category of ['active', 'passive', 'info', 'restrictions']) {
					if (classDef[category]) traits.push(...classDef[category])
				}
			}
		}

		return traits
	}

	/**
	 * Check if the actor is wearing heavy armor (bulk >= 2).
	 * @returns {boolean} True if wearing medium or heavy armor
	 */
	_isWearingHeavyArmor() {
		const equippedArmor = this.actor.items.find(item =>
			item.type === 'Armor' && item.system.equipped
		)
		if (!equippedArmor) return false
		// Bulk 1 = light, 2 = medium, 3 = heavy
		return (equippedArmor.system.bulk || 0) >= 2
	}

	/**
	 * Compute static trait adjustments that should be auto-applied.
	 * @returns {object} Object with adjustment paths and their values, plus skillOverrides
	 */
	_computeTraitAdjustments() {
		const traits = this._getAllActiveTraits()
		const adjustments = {}
		const skillOverrides = {}
		const level = this.actor.system.level

		for (const trait of traits) {
			if (trait.traitType !== 'adjustment') continue

			// Check minimum level requirement
			if (trait.minLevel && level < trait.minLevel) continue

			// Check armor condition (e.g., Fur Defense only when not wearing heavy armor)
			if (trait.requiresNoHeavyArmor && this._isWearingHeavyArmor()) continue

			// Get adjustment value (may be a function of level)
			const value = typeof trait.adjustmentValue === 'function'
				? trait.adjustmentValue(level)
				: trait.adjustmentValue

			// Handle skill overrides (set value instead of add)
			if (trait.adjustmentType === 'skillOverride' && trait.adjustmentTargets) {
				for (const target of trait.adjustmentTargets) {
					// Use the lowest override value if multiple exist
					if (skillOverrides[target] === undefined || value < skillOverrides[target]) {
						skillOverrides[target] = value
					}
				}
				continue
			}

			// Only process static adjustments for additive bonuses
			if (trait.adjustmentType !== 'static') continue

			const path = trait.adjustmentTarget
			if (path) {
				adjustments[path] = (adjustments[path] || 0) + value
			}
		}

		// Attach skill overrides to the result
		adjustments._skillOverrides = skillOverrides
		return adjustments
	}

	/**
	 * Get alignment restrictions from traits.
	 * @returns {string[]|null} Array of allowed alignments, or null if no restrictions
	 */
	_getAlignmentRestrictions() {
		const traits = this._getAllActiveTraits()
		let allowedAlignments = null

		for (const trait of traits) {
			if (trait.traitType === 'alignmentRestriction' && trait.allowedAlignments) {
				if (allowedAlignments === null) {
					allowedAlignments = [...trait.allowedAlignments]
				} else {
					// Intersect with existing restrictions
					allowedAlignments = allowedAlignments.filter(a => trait.allowedAlignments.includes(a))
				}
			}
		}

		return allowedAlignments
	}

	/**
	 * Get trait roll options for a given roll type.
	 * These are situational bonuses that can be toggled during rolls.
	 * @param {string} rollType - The type of roll being made (e.g., 'ac', 'attack', 'abilities.charisma', 'saves.doom')
	 * @returns {object[]} Array of applicable roll options
	 */
	_getTraitRollOptions(rollType) {
		const traits = this._getAllActiveTraits()
		const level = this.actor.system.level
		const options = []

		for (const trait of traits) {
			if (trait.traitType !== 'adjustment' || trait.adjustmentType !== 'rollOption') continue

			// Check if the target matches
			let targetMatches = trait.adjustmentTarget === rollType ||
				rollType.startsWith(trait.adjustmentTarget + '.')

			// Special handling for 'saves.all' - matches any save roll
			if (!targetMatches && trait.adjustmentTarget === 'saves.all' && rollType.startsWith('saves.')) {
				targetMatches = true
			}

			// Special handling for 'attack' - matches both melee and missile
			if (!targetMatches && trait.adjustmentTarget === 'attack' && (rollType === 'attack.melee' || rollType === 'attack.missile')) {
				targetMatches = true
			}

			if (!targetMatches) continue
			if (trait.minLevel && level < trait.minLevel) continue

			const bonus = typeof trait.adjustmentValue === 'function'
				? trait.adjustmentValue(level)
				: trait.adjustmentValue

			options.push({
				id: trait.id,
				name: game.i18n.localize(trait.nameKey),
				bonus,
				condition: trait.adjustmentCondition ? game.i18n.localize(trait.adjustmentCondition) : null
			})
		}

		return options
	}

	/**
	 * Prepare trait data for display, computing level-based values.
	 * @param {object} trait - Raw trait definition
	 * @param {number} level - Character level
	 * @returns {object} Prepared trait with computed values
	 */
	_prepareTrait(trait, level) {
		const prepared = {
			id: trait.id,
			name: game.i18n.localize(trait.nameKey),
			description: game.i18n.localize(trait.descKey),
			rollable: trait.rollable || false,
			rollFormula: trait.rollFormula || null,
			rollTarget: trait.rollTarget || null,
			traitType: trait.traitType || 'info',
			hideFromTraitTab: trait.hideFromTraitTab || false
		}

		// Compute level-based value if function provided
		if (trait.getValue && typeof trait.getValue === 'function') {
			prepared.value = trait.getValue(level)
			if (trait.valueLabel) {
				prepared.valueLabel = game.i18n.localize(trait.valueLabel)
			}
		} else if (trait.value) {
			prepared.value = trait.value
		}

		// Compute level-based damage for rollable traits
		if (trait.getDamage && typeof trait.getDamage === 'function') {
			prepared.rollFormula = trait.getDamage(level)
		}

		// Check minimum level requirement
		if (trait.minLevel && level < trait.minLevel) {
			prepared.locked = true
			prepared.minLevel = trait.minLevel
		}

		// Handle active traits with usage tracking
		if (trait.traitType === 'active' && (trait.maxUses || trait.getMaxUses)) {
			const maxUses = trait.getMaxUses ? trait.getMaxUses(level) : trait.maxUses
			const usageData = this.actor.system.traitUsage?.[trait.id] || { used: 0 }

			prepared.hasUsageTracking = true
			prepared.maxUses = maxUses
			prepared.usedCount = usageData.used || 0
			prepared.usesRemaining = maxUses - prepared.usedCount
			prepared.usageFrequency = trait.usageFrequency ? game.i18n.localize(trait.usageFrequency) : null

			// Create array for checkbox rendering
			prepared.usageCheckboxes = []
			for (let i = 0; i < maxUses; i++) {
				prepared.usageCheckboxes.push({
					index: i,
					checked: i < prepared.usedCount
				})
			}
		}

		// Handle info-type adjustments that need manual reminder
		if (trait.traitType === 'adjustment' && trait.adjustmentType === 'info') {
			prepared.isInfoReminder = true
			prepared.adjustmentCondition = trait.adjustmentCondition
				? game.i18n.localize(trait.adjustmentCondition)
				: null
		}

		// Handle roll-option adjustments
		if (trait.traitType === 'adjustment' && trait.adjustmentType === 'rollOption') {
			prepared.isRollOption = true
			prepared.adjustmentCondition = trait.adjustmentCondition
				? game.i18n.localize(trait.adjustmentCondition)
				: null
		}

		return prepared
	}

	/**
	 * Flatten trait categories into a single array.
	 * Filters out traits marked as hidden from the trait tab.
	 * @param {object} traitDef - Trait definition with categories (active, passive, info, restrictions)
	 * @param {number} level - Character level
	 * @returns {object[]} Array of prepared traits
	 */
	_flattenTraits(traitDef, level) {
		const traits = []
		const categories = ['active', 'passive', 'info', 'restrictions']

		for (const category of categories) {
			if (traitDef[category]) {
				for (const trait of traitDef[category]) {
					// Skip traits marked as hidden from the trait tab
					if (trait.hideFromTraitTab === true) continue

					const prepared = this._prepareTrait(trait, level)
					prepared.category = category
					traits.push(prepared)
				}
			}
		}

		return traits
	}

	/**
	 * Prepare kindred traits for display.
	 * @returns {object[]} Array of prepared kindred traits
	 */
	_prepareKindredTraits() {
		const kindred = this.actor.system.kindred
		const level = this.actor.system.level
		const traitDef = CONFIG.DOLMENWOOD.traits.kindred[kindred]

		if (!traitDef) return []
		return this._flattenTraits(traitDef, level)
	}

	/**
	 * Prepare class traits for display.
	 * @returns {object[]} Array of prepared class traits
	 */
	_prepareClassTraits() {
		const charClass = this.actor.system.class
		const level = this.actor.system.level
		const traitDef = CONFIG.DOLMENWOOD.traits.class[charClass]

		if (!traitDef) return []
		return this._flattenTraits(traitDef, level)
	}

	/**
	 * Prepare kindred-class traits for display.
	 * @returns {object[]} Array of prepared kindred-class traits
	 */
	_prepareKindredClassTraits() {
		const charClass = this.actor.system.class
		const level = this.actor.system.level
		const traitDef = CONFIG.DOLMENWOOD.traits.kindredClass[charClass]

		if (!traitDef) return []
		return this._flattenTraits(traitDef, level)
	}

	/**
	 * Prepare spell data for display.
	 * @param {Item} spell - The spell item
	 * @returns {object} Prepared spell data
	 */
	_prepareSpellData(spell) {
		return {
			id: spell.id,
			name: spell.name,
			img: spell.img,
			system: spell.system
		}
	}

	/**
	 * Group spells by rank for display.
	 * @param {Item[]} spells - Array of spell items
	 * @param {number} maxRank - Maximum rank (6 for arcane, 5 for holy)
	 * @returns {object[]} Array of rank groups with spells
	 */
	_groupSpellsByRank(spells, maxRank) {
		const groups = []

		for (let rank = 1; rank <= maxRank; rank++) {
			const rankSpells = spells
				.filter(s => s.system.rank === rank)
				.map(s => this._prepareSpellData(s))
				.sort((a, b) => a.name.localeCompare(b.name))

			if (rankSpells.length > 0) {
				groups.push({
					rank,
					icon: 'fa-'+rank,
					spells: rankSpells
				})
			}
		}

		return groups
	}

	/**
	 * Prepare memorized spell slots for display.
	 * @param {object} slotsData - The spell slots data from actor system
	 * @param {Item[]} knownSpells - Array of known spell items
	 * @param {number} maxRank - Maximum rank (6 for arcane, 5 for holy)
	 * @returns {object[]} Array of rank objects with slots array
	 */
	_prepareMemorizedSlots(slotsData, knownSpells, maxRank) {
		const result = []

		for (let rank = 1; rank <= maxRank; rank++) {
			const key = `rank${rank}`
			const slotData = slotsData[key] || { max: 0, memorized: [] }
			const maxSlots = slotData.max || 0
			const memorizedIds = slotData.memorized || []

			if (maxSlots === 0) continue

			const slots = []
			for (let i = 0; i < maxSlots; i++) {
				const spellId = memorizedIds[i]
				if (spellId) {
					// Find the spell in known spells
					const spell = knownSpells.find(s => s.id === spellId)
					if (spell) {
						slots.push({
							index: i,
							filled: true,
							spell: this._prepareSpellData(spell)
						})
					} else {
						// Spell no longer exists, show empty slot
						slots.push({
							index: i,
							filled: false,
							spell: null
						})
					}
				} else {
					// Empty slot
					slots.push({
						index: i,
						filled: false,
						spell: null
					})
				}
			}

			result.push({
				rank,
				key,
				icon: 'fa-' + rank,
				slots
			})
		}

		return result
	}

	/**
	 * Group runes by magnitude for display.
	 * @param {Item[]} runes - Array of rune items
	 * @returns {object[]} Array of magnitude groups with runes
	 */
	_groupRunesByMagnitude(runes) {
		const magnitudeOrder = ['lesser', 'greater', 'mighty']
		const groups = []

		for (const magnitude of magnitudeOrder) {
			// Include runes with matching magnitude, or unset magnitude defaults to 'lesser'
			const magnitudeRunes = runes
				.filter(r => r.system.magnitude === magnitude || (magnitude === 'lesser' && !r.system.magnitude))
				.map(r => this._prepareSpellData(r))
				.sort((a, b) => a.name.localeCompare(b.name))

			if (magnitudeRunes.length > 0) {
				groups.push({
					magnitude,
					label: game.i18n.localize(`DOLMEN.Magic.Fairy.Runes${magnitude.charAt(0).toUpperCase() + magnitude.slice(1)}`),
					icon: magnitude === 'lesser' ? 'fa-brightness-low' : (magnitude === 'greater' ? 'fa-sun-bright' : 'fa-sun'),
					runes: magnitudeRunes
				})
			}
		}

		return groups
	}

	/**
	 * Group items by their type for display.
	 * @param {object[]} items - Array of prepared item data
	 * @returns {object[]} Array of type groups with items
	 */
	_groupItemsByType(items) {
		const typeOrder = ['Weapon', 'Armor', 'Item', 'Treasure', 'Foraged']
		const groups = {}

		for (const item of items) {
			if (!groups[item.type]) {
				groups[item.type] = {
					type: item.type,
					typeLower: item.type.toLowerCase(),
					label: game.i18n.localize(`TYPES.Item.${item.type}`),
					items: [],
					isWeapon: item.type === 'Weapon',
					isArmor: item.type === 'Armor',
					isItem: item.type === 'Item',
					isTreasure: item.type === 'Treasure',
					isForaged: item.type === 'Foraged'
				}
			}
			groups[item.type].items.push(item)
		}

		// Sort groups by type order
		return typeOrder
			.filter(type => groups[type])
			.map(type => groups[type])
	}

	_getFaSymbol(quality, item){
		const ranges = `${item.system.rangeShort}/${item.system.rangeMedium}/${item.system.rangeLong}`
		const title = game.i18n.localize(`DOLMEN.Item.Quality.${quality}`)
		if (quality === "melee") return '<i class="fas fa-sword tooltip"><span class="tooltiptext">' + title + '</span></i>'
		if (quality === "missile") return '<i class="fas fa-bow-arrow tooltip"><span class="tooltiptext">'+title+' ('+ranges+')'+'</span></i>'
		if (quality === "armor-piercing") return '<i class="fas fa-bore-hole tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "brace") return '<i class="fas fa-shield-halved tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "reach") return '<i class="fas fa-arrows-left-right tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "reload") return '<i class="fas fa-arrows-rotate tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if(quality === "two-handed") return '<i class="fas fa-handshake-angle tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "charge") return '<i class="fas fa-horse-saddle tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "splash") return '<i class="fas fa-droplet tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "cold-iron") return '<i class="fas fa-snowflake tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "silver") return '<i class="fas fa-star-christmas tooltip"><span class="tooltiptext">'+title+'</span></i>'
		return quality
	}

	/**
	 * Prepare item data for display in the inventory.
	 * @param {Item} item - The item to prepare
	 * @returns {object} Prepared item data
	 */
	_prepareItemData(item) {
		const data = {
			id: item.id,
			name: item.name,
			img: item.img,
			type: item.type,
			system: item.system,
			isWeapon: item.type === 'Weapon',
			isArmor: item.type === 'Armor',
			cssClass: item.type.toLowerCase(),
			hasNotes: (item.system?.notes || "") === "" ? false : true
		}

		// Add weapon qualities display
		if (data.isWeapon && item.system.qualities?.length) {
			data.qualitiesDisplay = item.system.qualities
				//.map(q => game.i18n.localize(`DOLMEN.Item.Quality.${q}`))
				.map(q => this._getFaSymbol(q, item))
				.join(', ')
		}
		// Add armor bulk display
		if (data.isArmor) {
			data.bulkDisplay = game.i18n.localize(`DOLMEN.Item.Bulk.${item.system.bulk}`)
			//data.faBulk = (item.system.bulk === 'light' ? 'fa-circle-quarter-stroke' : (item.system.bulk === 'medium' ? 'fa-circle-half-stroke' : 'fa-circle'))
		}

		return data
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

		this._setupTabListeners()
		this._setupXPListener()
		this._setupPortraitPicker()
		this._setupSkillListeners()
		this._setupAttackListeners()
		this._setupAbilityRollListeners()
		this._setupSaveRollListeners()
		this._setupSkillRollListeners()
		this._setupUnitConversionListeners()
		this._setupDetailsRollListeners()
		this._setupTraitListeners()
		this._setupAdjustableInputListeners()
	}

	/**
	 * Setup listeners for adjustable inputs.
	 * Syncs changes to hidden input and highlights adjusted values.
	 */
	_setupAdjustableInputListeners() {
		this.element.querySelectorAll('input.adjustable').forEach(input => {
			const baseValue = input.dataset.base
			const adjustedValue = input.dataset.adjusted
			const targetName = input.dataset.target

			// Add visual indicator if value is modified by adjustment
			if (baseValue !== adjustedValue) {
				input.classList.add('has-adjustment')
			}

			// Find the corresponding hidden input
			const hiddenInput = this.element.querySelector(`input[type="hidden"][name="${targetName}"]`)

			// On focus, show the base value for editing
			input.addEventListener('focus', () => {
				input.value = baseValue
			})

			// On blur, sync to hidden input if changed, then show adjusted value
			input.addEventListener('blur', () => {
				const newValue = input.value
				if (newValue !== baseValue && hiddenInput) {
					// User changed the value - update hidden input to trigger save
					hiddenInput.value = newValue
					hiddenInput.dispatchEvent(new Event('change', { bubbles: true }))
				}
				// Always show adjusted value (will be recalculated on next render)
				input.value = adjustedValue
			})
		})
	}

	/**
	 * Setup tab navigation click listeners.
	 */
	_setupTabListeners() {
		// Primary tabs
		this.element.querySelectorAll('.tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

		// Magic sub-tabs
		this.element.querySelectorAll('.sub-tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				if (event.currentTarget.classList.contains('disabled')) return
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

		// Set initial active state for magic sub-tabs
		this._updateMagicSubTabs()
	}

	/**
	 * Update magic sub-tab active states.
	 * If the current active tab is disabled, switch to the first enabled tab.
	 */
	_updateMagicSubTabs() {
		let activeSubTab = this.tabGroups.magic || 'arcane'

		// Check if the current active tab is disabled
		const subTabs = this.element.querySelectorAll('.sub-tabs .item')
		const activeTabElement = this.element.querySelector(`.sub-tabs .item[data-tab="${activeSubTab}"]`)

		if (activeTabElement?.classList.contains('disabled')) {
			// Find the first enabled tab
			for (const tab of subTabs) {
				if (!tab.classList.contains('disabled')) {
					activeSubTab = tab.dataset.tab
					this.tabGroups.magic = activeSubTab
					break
				}
			}
		}

		// Update sub-tab navigation
		subTabs.forEach(tab => {
			const isActive = tab.dataset.tab === activeSubTab
			tab.classList.toggle('active', isActive)
		})

		// Update sub-tab content visibility
		this.element.querySelectorAll('.sub-tab-content').forEach(content => {
			const isActive = content.dataset.tab === activeSubTab
			content.classList.toggle('active', isActive)
		})
	}

	/**
	 * Setup XP button click listener.
	 */
	_setupXPListener() {
		const xpBtn = this.element.querySelector('.xp-add-btn')
		if (xpBtn) {
			xpBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._openXPDialog()
			})
		}
		const xpEditBtn = this.element.querySelector('.xp-edit-btn')
		if (xpEditBtn) {
			xpEditBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._openXPEditDialog()
			})
		}
	}

	/**
	 * Setup portrait image click for file picker.
	 */
	_setupPortraitPicker() {
		const portrait = this.element.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.actor.img,
					callback: (path) => this.actor.update({ img: path })
				}).browse()
			})
		}
	}

	/**
	 * Setup add/remove skill button listeners.
	 */
	_setupSkillListeners() {
		const addSkillBtn = this.element.querySelector('.add-skill-btn')
		if (addSkillBtn) {
			addSkillBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._openAddSkillDialog()
			})
		}

		this.element.querySelectorAll('.remove-skill-btn').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const index = parseInt(event.currentTarget.dataset.skillIndex)
				this._removeSkill(index)
			})
		})
	}

	/**
	 * Setup melee and missile attack icon listeners.
	 */
	_setupAttackListeners() {
		// Melee attack - uses new 3-step flow (attack type → weapon → modifiers)
		const meleeBtn = this.element.querySelector('.fa-swords.rollable')
		if (meleeBtn) {
			meleeBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._onMeleeAttackRoll(event)
			})
			meleeBtn.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				this._onAttackRollContextMenu('melee', event)
			})
		}

		// Missile attack - weapon select → modifier panel
		const missileBtn = this.element.querySelector('.combat .fa-bow-arrow.rollable')
		if (missileBtn) {
			missileBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._onMissileAttackRoll(event)
			})
			missileBtn.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				this._onAttackRollContextMenu('missile', event)
			})
		}
	}

	/**
	 * Setup ability check roll listeners.
	 */
	_setupAbilityRollListeners() {
		this.element.querySelectorAll('.ability-roll').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const abilityKey = event.currentTarget.dataset.ability
				if (abilityKey) {
					this._onAbilityRoll(abilityKey, event)
				}
			})
		})
	}

	/**
	 * Setup saving throw roll listeners.
	 */
	_setupSaveRollListeners() {
		this.element.querySelectorAll('.save-roll').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const saveKey = event.currentTarget.dataset.save
				if (saveKey) {
					this._onSaveRoll(saveKey, event)
				}
			})
		})
	}

	/**
	 * Setup skill check roll listeners.
	 */
	_setupSkillRollListeners() {
		this.element.querySelectorAll('.skill-roll').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const skillKey = event.currentTarget.dataset.skill
				// For extra skills, use the target from data attribute
				const targetOverride = event.currentTarget.dataset.skillTarget
					? parseInt(event.currentTarget.dataset.skillTarget)
					: null
				if (skillKey) {
					this._onSkillRoll(skillKey, targetOverride, event)
				}
			})
		})
	}

	/**
	 * Setup height/weight unit conversion listeners.
	 */
	_setupUnitConversionListeners() {
		const heightFeetInput = this.element.querySelector('[data-convert="height-feet"]')
		const heightCmInput = this.element.querySelector('[data-convert="height-cm"]')
		const weightLbsInput = this.element.querySelector('[data-convert="weight-lbs"]')
		const weightKgInput = this.element.querySelector('[data-convert="weight-kg"]')

		// Height conversion: feet/inches <-> cm
		if (heightFeetInput && heightCmInput) {
			const updateCmFromFeetInches = () => {
				const fIndex = heightFeetInput.value.indexOf("'")
				const iIndex = heightFeetInput.value.indexOf('"')
				let feet = 0
				let inches = 0
				if(fIndex === -1 && iIndex === -1){
					feet = parseInt(heightFeetInput.value) || 0
				}
				if(fIndex > 0)
					feet = parseInt(heightFeetInput.value.substring(0, fIndex)) || 0
				if(iIndex > fIndex)
					inches = parseInt(heightFeetInput.value.substring(fIndex + 1, iIndex)) || 0
				const totalInches = feet * 12 + inches
				heightCmInput.value = Math.round(totalInches * 2.54)
			}

			const updateFeetInchesFromCm = () => {
				const cm = parseInt(heightCmInput.value) || 0
				const totalInches = Math.round(cm / 2.54)
				heightFeetInput.value = Math.floor(totalInches / 12) + "'" + (totalInches % 12) + '"'
			}

			heightFeetInput.addEventListener('change', updateCmFromFeetInches)
			heightCmInput.addEventListener('change', updateFeetInchesFromCm)
		}

		// Weight conversion: lbs <-> kg
		if (weightLbsInput && weightKgInput) {
			weightLbsInput.addEventListener('change', (event) => {
				const lbs = parseInt(event.target.value) || 0
				weightKgInput.value = Math.round(lbs * 0.453592)
			})
			weightKgInput.addEventListener('change', (event) => {
				const kg = parseInt(event.target.value) || 0
				weightLbsInput.value = Math.round(kg / 0.453592)
			})
		}
	}

	/**
	 * Setup rollable icon listeners for age, lifespan, and birthday on the details tab.
	 */
	_setupDetailsRollListeners() {
		const kindred = this.actor.system.kindred

		// Roll age
		this.element.querySelector('.roll-age')?.addEventListener('click', async (event) => {
			event.preventDefault()
			const formula = CONFIG.DOLMENWOOD.kindredAgeFormulas[kindred]
			if (!formula) return
			const roll = await new Roll(formula).evaluate()
			this.actor.update({ 'system.physical.age': roll.total })
			const label = game.i18n.localize('DOLMEN.KindredDetails.CurrentAge')
			const rollAnchor = (await roll.toAnchor()).outerHTML
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<strong>${label}:</strong> ${rollAnchor}`,
				rolls: [roll],
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})

		// Roll lifespan
		this.element.querySelector('.roll-lifespan')?.addEventListener('click', async (event) => {
			event.preventDefault()
			const formula = CONFIG.DOLMENWOOD.kindredLifespanFormulas[kindred]
			if (!formula || formula === '0') return
			const roll = await new Roll(formula).evaluate()
			this.actor.update({ 'system.physical.lifespan': roll.total })
			const label = game.i18n.localize('DOLMEN.KindredDetails.Lifespan')
			const rollAnchor = (await roll.toAnchor()).outerHTML
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<strong>${label}:</strong> ${rollAnchor}`,
				rolls: [roll],
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})

		// Roll birthday
		this.element.querySelector('.roll-birthday')?.addEventListener('click', async (event) => {
			event.preventDefault()
			const totalDays = 352
			const roll = await new Roll(`1d${totalDays}`).evaluate()
			const doy = roll.total
			const monthKeys = Object.keys(CONFIG.DOLMENWOOD.monthOffsets)
			let birthMonth = monthKeys[0]
			let birthDay = doy
			for (let i = monthKeys.length - 1; i >= 0; i--) {
				const offset = CONFIG.DOLMENWOOD.monthOffsets[monthKeys[i]]
				if (doy > offset) {
					birthMonth = monthKeys[i]
					birthDay = doy - offset
					break
				}
			}
			this.actor.update({
				'system.birthMonth': birthMonth,
				'system.birthDay': birthDay
			})
			const label = game.i18n.localize('DOLMEN.Birthday')
			const monthLabel = game.i18n.localize(`DOLMEN.Months.${birthMonth}`)
			const rollAnchor = (await roll.toAnchor()).outerHTML
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<strong>${label}:</strong> ${rollAnchor} — ${birthDay} ${monthLabel}`,
				rolls: [roll],
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})

		// Roll height
		this.element.querySelector('.roll-height')?.addEventListener('click', async (event) => {
			event.preventDefault()
			const formula = CONFIG.DOLMENWOOD.kindredHeightFormulas[kindred]
			if (!formula) return
			const roll = await new Roll(formula).evaluate()
			const totalInches = roll.total
			const feet = Math.floor(totalInches / 12)
			const inches = totalInches % 12
			const heightFeet = `${feet}'${inches}"`
			const heightCm = Math.round(totalInches * 2.54)
			this.actor.update({
				'system.physical.heightFeet': heightFeet,
				'system.physical.heightCm': heightCm
			})
			const label = game.i18n.localize('DOLMEN.KindredDetails.Height')
			const rollAnchor = (await roll.toAnchor()).outerHTML
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<strong>${label}:</strong> ${rollAnchor} — ${heightFeet} / ${heightCm} cm`,
				rolls: [roll],
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})

		// Roll weight
		this.element.querySelector('.roll-weight')?.addEventListener('click', async (event) => {
			event.preventDefault()
			const formula = CONFIG.DOLMENWOOD.kindredWeightFormulas[kindred]
			if (!formula) return
			const roll = await new Roll(formula).evaluate()
			const weightLbs = roll.total
			const weightKg = Math.round(weightLbs * 0.453592)
			this.actor.update({
				'system.physical.weightLbs': weightLbs,
				'system.physical.weightKg': weightKg
			})
			const label = game.i18n.localize('DOLMEN.KindredDetails.Weight')
			const rollAnchor = (await roll.toAnchor()).outerHTML
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<strong>${label}:</strong> ${rollAnchor} — ${weightLbs} lbs / ${weightKg} kg`,
				rolls: [roll],
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})
	}

	/**
	 * Setup trait rollable icon and usage checkbox listeners.
	 */
	_setupTraitListeners() {
		// Rollable trait clicks
		this.element.querySelectorAll('.trait .rollable').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const traitId = event.currentTarget.dataset.traitId
				const formula = event.currentTarget.dataset.rollFormula
				const traitName = event.currentTarget.dataset.traitName
				const rollTarget = event.currentTarget.dataset.rollTarget
					? parseInt(event.currentTarget.dataset.rollTarget)
					: null
				if (formula) {
					this._rollTrait(traitId, traitName, formula, rollTarget)
				}
			})
		})

		// Usage checkbox clicks
		this.element.querySelectorAll('.trait-usage-checkbox').forEach(checkbox => {
			checkbox.addEventListener('change', async (event) => {
				const traitId = event.currentTarget.dataset.traitId
				const index = parseInt(event.currentTarget.dataset.usageIndex)
				const maxUses = parseInt(event.currentTarget.dataset.maxUses)

				const usage = foundry.utils.deepClone(this.actor.system.traitUsage || {})
				const traitData = usage[traitId] || { used: 0, max: maxUses }

				// Set used count based on which checkbox was clicked
				traitData.used = event.currentTarget.checked ? index + 1 : index
				traitData.max = maxUses
				usage[traitId] = traitData

				await this.actor.update({ 'system.traitUsage': usage })
			})
		})

		// Long rest button
		const longRestBtn = this.element.querySelector('.long-rest-btn')
		if (longRestBtn) {
			longRestBtn.addEventListener('click', async (event) => {
				event.preventDefault()
				await this.actor.resetTraitUsage()
			})
		}
	}

	/**
	 * Roll a trait ability and send result to chat.
	 * @param {string} traitId - The trait identifier
	 * @param {string} traitName - Display name of the trait
	 * @param {string} formula - Dice formula to roll
	 * @param {number|null} rollTarget - Success target for chance rolls (success if roll <= target)
	 */
	async _rollTrait(traitId, traitName, formula, rollTarget = null) {
		const roll = new Roll(formula)
		await roll.evaluate()

		// Determine success/failure for chance rolls (X-in-6)
		let resultSection = ''
		if (rollTarget !== null && !isNaN(rollTarget)) {
			const isSuccess = roll.total <= rollTarget
			const resultClass = isSuccess ? 'success' : 'failure'
			const resultLabel = isSuccess
				? game.i18n.localize('DOLMEN.Roll.Success')
				: game.i18n.localize('DOLMEN.Roll.Failure')
			resultSection = `<span class="roll-label ${resultClass}">${resultLabel}</span>`
		}

		const chatContent = `
			<div class="dolmen trait-roll">
				<div class="trait-header">
					<h3>${traitName}</h3>
				</div>
				<div class="roll-result">
					${(await roll.toAnchor({ classes: ['trait-inline-roll'] })).outerHTML}
					${resultSection}
				</div>
				<span class="roll-breakdown">${formula}${rollTarget !== null ? ` (${rollTarget} ${game.i18n.localize('DOLMEN.Roll.OrLess')})` : ''}</span>
			</div>
		`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	_openXPDialog() {
		const currentXP = this.actor.system.xp.value || 0
		const adjusted = this._computeAdjustedValues()
		const baseXPMod = this._computeXPModifier(adjusted.abilities)
		const xpModAdj = this.actor.system.adjustments.xpModifier || 0
		const modifier = baseXPMod + xpModAdj

		const content = `
			<div class="xp-modal-content">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.XPGained')}</label>
					<input type="number" id="xp-gained" value="0" min="0" autofocus>
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.XPModifier')}</label>
					<input type="number" id="xp-bonus" value="${modifier}" disabled>
					<span class="unit">%</span>
				</div>
				<div class="xp-calculation">
					<div>${game.i18n.localize('DOLMEN.XPCurrent')}: <strong>${currentXP}</strong></div>
					<div class="xp-total">${game.i18n.localize('DOLMEN.XPTotal')}: <span id="xp-total">${currentXP}</span></div>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.XPAddTitle'),
			content: content,
			buttons: {
				add: {
					icon: '<i class="fas fa-plus"></i>',
					label: game.i18n.localize('DOLMEN.XPAddButton'),
					callback: (html) => {
						const gained = parseInt(html.find('#xp-gained').val()) || 0
						const adjustedXP = Math.floor(gained * (1 + modifier / 100))
						const newXP = currentXP + adjustedXP
						this.actor.update({
							'system.xp.value': newXP
						})
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'add',
			render: (html) => {
				const gainedInput = html.find('#xp-gained')
				const totalSpan = html.find('#xp-total')

				const updateTotal = () => {
					const gained = parseInt(gainedInput.val()) || 0
					const adjustedXP = Math.floor(gained * (1 + modifier / 100))
					totalSpan.text(currentXP + adjustedXP)
				}

				gainedInput.on('input', updateTotal)
			}
		})

		dialog.render(true)
	}

	_openXPEditDialog() {
		const currentXP = this.actor.system.xp.value || 0
		const content = `
			<div class="xp-modal-content">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.XPCurrent')}</label>
					<input type="number" id="xp-edit-value" value="${currentXP}" min="0" autofocus>
				</div>
			</div>
		`
		new Dialog({
			title: game.i18n.localize('DOLMEN.XPCurrent'),
			content: content,
			buttons: {
				save: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize('DOLMEN.Save'),
					callback: (html) => {
						const newXP = parseInt(html.find('#xp-edit-value').val()) || 0
						this.actor.update({ 'system.xp.value': newXP })
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'save'
		}).render(true)
	}

	_openAddSkillDialog() {
		const currentSkills = this.actor.system.extraSkills || []
		const currentSkillIds = currentSkills.map(s => s.id)
		const availableSkills = CONFIG.DOLMENWOOD.extraSkills.filter(id => !currentSkillIds.includes(id))

		if (availableSkills.length === 0 || currentSkills.length >= CONFIG.DOLMENWOOD.maxExtraSkills) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.NoSkillsAvailable') || 'No more skills available to add.')
			return
		}

		const options = availableSkills.map(id => {
			const label = game.i18n.localize(`DOLMEN.Skills.${id}`)
			return `<option value="${id}">${label}</option>`
		}).join('')

		const content = `
			<div class="add-skill-modal">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.SelectSkill')}</label>
					<select id="skill-select">${options}</select>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.AddSkillTitle'),
			content: content,
			buttons: {
				add: {
					icon: '<i class="fas fa-plus"></i>',
					label: game.i18n.localize('DOLMEN.AddSkill'),
					callback: (html) => {
						const selectedSkill = html.find('#skill-select').val()
						this._addSkill(selectedSkill)
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'add'
		})

		dialog.render(true)
	}

	_addSkill(skillId) {
		const currentSkills = foundry.utils.deepClone(this.actor.system.extraSkills || [])
		currentSkills.push({ id: skillId, target: 6 })
		this.actor.update({ 'system.extraSkills': currentSkills })
	}

	_removeSkill(index) {
		const currentSkills = foundry.utils.deepClone(this.actor.system.extraSkills || [])
		currentSkills.splice(index, 1)
		this.actor.update({ 'system.extraSkills': currentSkills })
	}

	/* -------------------------------------------- */
	/*  Context Menu Utilities                      */
	/* -------------------------------------------- */

	/**
	 * Create and display a context menu.
	 * @param {object} config - Menu configuration
	 * @param {string} config.html - HTML content for the menu
	 * @param {object} config.position - Position {top, left}
	 * @param {Function} config.onItemClick - Callback when menu item clicked, receives (menuItem, menu)
	 * @param {Element} [config.excludeFromClose] - Element to exclude from close detection
	 * @returns {HTMLElement} The menu element
	 */
	_createContextMenu({ html, position, onItemClick, excludeFromClose = null }) {
		// Remove any existing context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		// Create the menu element
		const menu = document.createElement('div')
		menu.className = 'dolmen-weapon-context-menu'
		menu.innerHTML = html

		// Position the menu
		menu.style.position = 'fixed'
		menu.style.top = `${position.top}px`
		menu.style.left = `${position.left}px`

		// Add to sheet
		this.element.appendChild(menu)

		// Adjust position after rendering (menu appears to left of click point)
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${position.left - menuRect.width - 5}px`

		// Add click handlers to menu items
		menu.querySelectorAll('.weapon-menu-item').forEach(item => {
			item.addEventListener('click', () => onItemClick(item, menu))
		})

		// Close menu when clicking outside
		const closeMenu = (e) => {
			const clickedOutside = !menu.contains(e.target)
			const clickedExcluded = excludeFromClose && e.target === excludeFromClose
			if (clickedOutside && !clickedExcluded) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)

		return menu
	}

	/**
	 * Build HTML for weapon selection menu items.
	 * @param {Item[]} weapons - Array of weapons
	 * @returns {string} HTML string
	 */
	_buildWeaponMenuHtml(weapons) {
		return weapons.map(w => {
			const proficient = this._isWeaponProficient(w)
			const penaltyLabel = proficient ? '' : ' <span class="weapon-penalty">(-4)</span>'
			const nonprofClass = proficient ? '' : ' nonproficient'
			return `
			<div class="weapon-menu-item${nonprofClass}" data-weapon-id="${w.id}" data-proficient="${proficient}">
				<img src="${w.img}" alt="${w.name}" class="weapon-icon">
				<span class="weapon-name">${w.name}${penaltyLabel}</span>
				<span class="weapon-damage">${w.system.damage}</span>
			</div>
		`
		}).join('')
	}

	/* -------------------------------------------- */
	/*  Weapon Proficiency                          */
	/* -------------------------------------------- */

	/**
	 * Check if the current character is proficient with a weapon.
	 * Non-proficient weapons incur a -4 attack penalty.
	 * @param {object} weapon - The weapon item
	 * @returns {boolean} True if proficient
	 */
	_isWeaponProficient(weapon) {
		const cls = this.actor.system.class
		if (!cls) return true

		// Knight: no missile weapons
		if (cls === 'knight' && weapon.system.qualities?.includes('missile')) {
			return false
		}

		// Classes restricted to specific weapon types (by weaponType field)
		const restrictedTypes = {
			magician: ['dagger', 'staff', 'holyWater', 'oil', 'torch'],
			friar: ['club', 'dagger', 'holyWater', 'oil', 'sling', 'staff', 'torch']
		}
		if (restrictedTypes[cls]) {
			const wType = weapon.system.weaponType
			if (wType && !restrictedTypes[cls].includes(wType)) return false
			// If weaponType is not set, we can't determine proficiency, so allow it
		}

		// Classes restricted to small/medium weapons (no large)
		const sizeRestrictedClasses = new Set([
			'bard', 'enchanter', 'thief', 'grimalkin', 'mossling', 'woodgrue'
		])
		if (sizeRestrictedClasses.has(cls) && weapon.system.size === 'large') {
			return false
		}

		return true
	}

	/* -------------------------------------------- */
	/*  Melee Attack Flow                           */
	/* -------------------------------------------- */

	/**
	 * Handle click on melee attack icon. Opens the 3-step attack flow:
	 * 1. Attack type (normal/charge/push)
	 * 2. Weapon selection (+ unarmed)
	 * 3. Modifier panel with ROLL button
	 * @param {Event} event - The click event
	 */
	_onMeleeAttackRoll(event) {
		const weapons = this._getEquippedWeaponsByQuality('melee')
		const position = {
			top: event.currentTarget.getBoundingClientRect().top,
			left: event.currentTarget.getBoundingClientRect().left
		}
		this._openAttackTypeMenu(weapons, position)
	}

	/**
	 * Step 1: Open attack type selection menu (Normal / Charge / Push).
	 * @param {Item[]} weapons - Equipped melee weapons
	 * @param {object} position - Position {top, left}
	 */
	_openAttackTypeMenu(weapons, position) {
		const types = [
			{ id: 'normal', icon: 'fa-swords', nameKey: 'DOLMEN.Attack.Type.Normal' },
			{ id: 'charge', icon: 'fa-horse-head', nameKey: 'DOLMEN.Attack.Type.Charge' },
			{ id: 'push', icon: 'fa-hand-fist', nameKey: 'DOLMEN.Attack.Type.Push' }
		]

		const html = types.map(t => `
			<div class="weapon-menu-item" data-attack-mode="${t.id}">
				<i class="fas ${t.icon}"></i>
				<span class="weapon-name">${game.i18n.localize(t.nameKey)}</span>
			</div>
		`).join('')

		this._createContextMenu({
			html,
			position,
			onItemClick: (item, menu) => {
				const attackMode = item.dataset.attackMode
				menu.remove()

				if (attackMode === 'push') {
					// Push uses unarmed - skip weapon selection
					const unarmed = this._createUnarmedWeapon()
					setTimeout(() => this._openModifierPanel(unarmed, attackMode, position), 0)
				} else {
					setTimeout(() => this._openMeleeWeaponMenu(weapons, attackMode, position), 0)
				}
			}
		})
	}

	/**
	 * Step 2: Open weapon selection menu for melee attacks, including Unarmed option.
	 * @param {Item[]} weapons - Equipped melee weapons
	 * @param {string} attackMode - 'normal', 'charge', or 'push'
	 * @param {object} position - Position {top, left}
	 */
	_openMeleeWeaponMenu(weapons, attackMode, position) {
		let html = this._buildWeaponMenuHtml(weapons)

		// Add unarmed option (always proficient)
		const unarmedName = game.i18n.localize('DOLMEN.Attack.Unarmed')
		html += `
			<div class="weapon-menu-item" data-weapon-id="unarmed" data-proficient="true">
				<i class="fas fa-hand-fist"></i>
				<span class="weapon-name">${unarmedName}</span>
				<span class="weapon-damage">1d2</span>
			</div>
		`

		this._createContextMenu({
			html,
			position,
			onItemClick: (item, menu) => {
				const weaponId = item.dataset.weaponId
				const proficient = item.dataset.proficient !== 'false'
				menu.remove()

				let weapon
				if (weaponId === 'unarmed') {
					weapon = this._createUnarmedWeapon()
				} else {
					weapon = this.actor.items.get(weaponId)
				}
				if (weapon) {
					setTimeout(() => this._openModifierPanel(weapon, attackMode, position, proficient), 0)
				}
			}
		})
	}

	/**
	 * Create a pseudo-weapon object for unarmed attacks.
	 * @returns {object} Unarmed weapon-like object
	 */
	_createUnarmedWeapon() {
		const strMod = this._computeAdjustedValues().abilities.strength.mod
		const modStr = strMod >= 0 ? ` + ${strMod}` : ` - ${Math.abs(strMod)}`
		return {
			id: 'unarmed',
			name: game.i18n.localize('DOLMEN.Attack.Unarmed'),
			img: 'icons/skills/melee/unarmed-punch-fist.webp',
			system: {
				damage: `1d2${modStr}`,
				size: 'small',
				qualities: ['melee']
			}
		}
	}

	/**
	 * Get applicable melee attack modifiers based on character traits, talents, and weapon.
	 * @param {object} weapon - The selected weapon
	 * @returns {object[]} Array of modifier definitions
	 */
	_getApplicableMeleeModifiers(weapon) {
		const modifiers = []
		const actor = this.actor
		const traits = this._getAllActiveTraits()
		const hasTrait = (id) => traits.some(t => t.id === id)
		const level = actor.system.level
		const talents = actor.system.combatTalents || []
		const meleeWeaponCount = this._getEquippedWeaponsByQuality('melee').length

		// Backstab - thief class only
		if (actor.system.class === 'thief') {
			const strMod = this._computeAdjustedValues().abilities.strength.mod
			const modStr = strMod >= 0 ? ` + ${strMod}` : ` - ${Math.abs(strMod)}`
			modifiers.push({
				id: 'backstab',
				name: game.i18n.localize('DOLMEN.Attack.Mod.Backstab'),
				attackBonus: 4,
				damageOverride: `3d4${modStr}`
			})
		}

		// Trophy - hunter has trophies trait
		if (hasTrait('trophies')) {
			modifiers.push({
				id: 'trophy',
				name: game.i18n.localize('DOLMEN.Attack.Mod.Trophy'),
				attackBonus: 1
			})
		}

		// Mounted Combat - knight trait
		if (hasTrait('mountedCombat')) {
			modifiers.push({
				id: 'mountedCombat',
				name: game.i18n.localize('DOLMEN.Traits.MountedCombat'),
				attackBonus: 1
			})
		}

		// Monster Slayer - knight trait, level 5+
		if (hasTrait('monsterSlayer') && level >= 5) {
			modifiers.push({
				id: 'monsterSlayer',
				name: game.i18n.localize('DOLMEN.Traits.MonsterSlayer'),
				attackBonus: 2,
				damageBonus: 2
			})
		}

		// St. Signis - cleric holy order
		if (actor.system.class === 'cleric' && actor.system.holyOrder === 'stSignis') {
			modifiers.push({
				id: 'stSignis',
				name: game.i18n.localize('DOLMEN.Attack.Mod.StSignis'),
				attackBonus: 1
			})
		}

		// Fighter combat talents
		if (talents.includes('battleRage')) {
			modifiers.push({
				id: 'battleRage',
				name: game.i18n.localize('DOLMEN.Traits.Talents.BattleRage'),
				attackBonus: 2,
				damageBonus: 2
			})
		}
		if (talents.includes('cleave')) {
			modifiers.push({
				id: 'cleave',
				name: game.i18n.localize('DOLMEN.Traits.Talents.Cleave'),
				attackBonus: -2
			})
		}
		if (talents.includes('mainGauche')) {
			modifiers.push({
				id: 'mainGauche',
				name: game.i18n.localize('DOLMEN.Traits.Talents.MainGauche'),
				attackBonus: 1
			})
		}
		if (talents.includes('slayer')) {
			modifiers.push({
				id: 'slayer',
				name: game.i18n.localize('DOLMEN.Traits.Talents.Slayer'),
				attackBonus: 1,
				damageBonus: 1
			})
		}
		if (talents.includes('weaponSpecialist')) {
			modifiers.push({
				id: 'weaponSpecialist',
				name: game.i18n.localize('DOLMEN.Traits.Talents.WeaponSpecialist'),
				attackBonus: 1,
				damageBonus: 1
			})
		}

		// Armor Piercing - weapon quality
		if (weapon.system.qualities?.includes('armor-piercing')) {
			modifiers.push({
				id: 'armorPiercing',
				name: game.i18n.localize('DOLMEN.Attack.Mod.ArmorPiercing'),
				attackBonus: 2
			})
		}

		// Two Weapons - requires 2+ equipped melee weapons AND STR or DEX as prime ability
		// Classes with STR/DEX prime: fighter, hunter, knight, thief, breggle, elf, grimalkin, woodgrue
		const twoWeaponClasses = new Set(['fighter', 'hunter', 'knight', 'thief', 'breggle', 'elf', 'grimalkin', 'woodgrue'])
		if (meleeWeaponCount >= 2 && twoWeaponClasses.has(actor.system.class)) {
			modifiers.push({
				id: 'twoWeaponsPrimary',
				name: game.i18n.localize('DOLMEN.Attack.Mod.TwoWeaponsPrimary'),
				attackBonus: -2
			})
			if (weapon.system.size === 'small') {
				modifiers.push({
					id: 'twoWeaponsSecondary',
					name: game.i18n.localize('DOLMEN.Attack.Mod.TwoWeaponsSecondary'),
					attackBonus: -4
				})
			}
		}

		return modifiers
	}

	/**
	 * Step 3: Open modifier panel with ROLL button, trait toggles, and numeric modifiers.
	 * @param {object} weapon - Selected weapon (real or unarmed)
	 * @param {string} attackMode - 'normal', 'charge', or 'push'
	 * @param {object} position - Position {top, left}
	 * @param {boolean} [proficient=true] - Whether the character is proficient with this weapon
	 */
	_openModifierPanel(weapon, attackMode, position, proficient = true) {
		// Remove any existing context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		const modifiers = this._getApplicableMeleeModifiers(weapon)
		const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

		// Build HTML
		let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

		// Modifier toggles (if any exist)
		if (modifiers.length > 0) {
			html += '<div class="menu-separator"></div>'
			for (const mod of modifiers) {
				const bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
				html += `
					<div class="modifier-item" data-mod-id="${mod.id}">
						<span class="mod-check"></span>
						<span class="mod-name">${mod.name}</span>
						<span class="mod-bonus">${bonusStr}</span>
					</div>
				`
			}
		}

		// Numeric modifier grid
		html += '<div class="menu-separator"></div>'
		html += '<div class="numeric-grid">'
		for (const val of [-4, -3, -2, -1]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
		}
		for (const val of [1, 2, 3, 4]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
		}
		html += '</div>'

		// Create panel element
		const panel = document.createElement('div')
		panel.className = 'dolmen-weapon-context-menu modifier-panel'
		panel.innerHTML = html
		panel.style.position = 'fixed'
		panel.style.top = `${position.top}px`
		panel.style.left = `${position.left}px`
		this.element.appendChild(panel)

		// Adjust position (appear to left of click)
		const panelRect = panel.getBoundingClientRect()
		panel.style.left = `${position.left - panelRect.width - 5}px`

		// Modifier toggle behavior (multi-select)
		panel.querySelectorAll('.modifier-item').forEach(item => {
			item.addEventListener('click', () => {
				item.classList.toggle('selected')
				const check = item.querySelector('.mod-check')
				check.textContent = item.classList.contains('selected') ? '\u2713' : ''
			})
		})

		// Numeric button behavior (single-select toggle)
		panel.querySelectorAll('.numeric-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const wasSelected = btn.classList.contains('selected')
				panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
				if (!wasSelected) btn.classList.add('selected')
			})
		})

		// ROLL button
		panel.querySelector('.roll-btn').addEventListener('click', () => {
			// Gather selected modifiers
			const selectedModifiers = []
			panel.querySelectorAll('.modifier-item.selected').forEach(item => {
				const mod = modifiers.find(m => m.id === item.dataset.modId)
				if (mod) selectedModifiers.push(mod)
			})

			// Gather numeric modifier
			const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
			const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0

			panel.remove()
			document.removeEventListener('click', closePanel)
			this._executeMeleeAttack(weapon, attackMode, selectedModifiers, numericMod, proficient)
		})

		// Close panel when clicking outside
		const closePanel = (e) => {
			if (!panel.contains(e.target)) {
				panel.remove()
				document.removeEventListener('click', closePanel)
			}
		}
		setTimeout(() => document.addEventListener('click', closePanel), 0)
	}

	/**
	 * Execute a melee attack with all selected options.
	 * @param {object} weapon - The weapon (real or unarmed pseudo-weapon)
	 * @param {string} attackMode - 'normal', 'charge', or 'push'
	 * @param {object[]} selectedModifiers - Array of selected modifier definitions
	 * @param {number} numericMod - Manual numeric modifier (-4 to +4)
	 * @param {boolean} [proficient=true] - Whether the character is proficient with this weapon
	 */
	async _executeMeleeAttack(weapon, attackMode, selectedModifiers, numericMod, proficient = true) {
		// Attack type bonuses
		const attackModeBonus = attackMode === 'charge' ? 2 : attackMode === 'push' ? -4 : 0
		const proficiencyPenalty = proficient ? 0 : -4
		const isPush = attackMode === 'push'

		// Sum modifier bonuses
		let modAttackBonus = 0
		let modDamageBonus = 0
		let damageOverride = null
		const modifierNames = []

		for (const mod of selectedModifiers) {
			modAttackBonus += mod.attackBonus || 0
			modDamageBonus += mod.damageBonus || 0
			if (mod.damageOverride) damageOverride = mod.damageOverride
			modifierNames.push(mod.name)
		}

		// Add numeric modifier as its own badge label
		if (numericMod !== 0) {
			modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
		}

		// Attack type name for chat
		const attackModeName = attackMode !== 'normal'
			? game.i18n.localize(`DOLMEN.Attack.Type.${attackMode.charAt(0).toUpperCase() + attackMode.slice(1)}`)
			: null

		// Compute total attack modifier
		const { totalMod } = this._getAttackModifiers('melee')
		const finalAttackMod = totalMod + attackModeBonus + modAttackBonus + numericMod + proficiencyPenalty

		// Determine damage formula
		let damageFormula
		if (damageOverride) {
			damageFormula = damageOverride
		} else {
			damageFormula = weapon.system.damage
			if (modDamageBonus !== 0) {
				damageFormula = modDamageBonus > 0
					? `${damageFormula} + ${modDamageBonus}`
					: `${damageFormula} - ${Math.abs(modDamageBonus)}`
			}
		}

		// Special text for push
		const specialText = isPush ? game.i18n.localize('DOLMEN.Attack.PushEffect') : null

		await this._performAttackRoll(weapon, 'melee', {
			attackOnly: isPush,
			totalAttackMod: finalAttackMod,
			damageFormula,
			modifierNames,
			attackModeName,
			specialText
		})
	}

	/* -------------------------------------------- */
	/*  Missile Attack Flow                         */
	/* -------------------------------------------- */

	/**
	 * Handle click on missile attack icon. Opens weapon select → modifier panel.
	 * @param {Event} event - The click event
	 */
	_onMissileAttackRoll(event) {
		const weapons = this._getEquippedWeaponsByQuality('missile')

		if (weapons.length === 0) {
			const typeName = game.i18n.localize('DOLMEN.Item.Quality.missile')
			ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
			return
		}

		const position = {
			top: event.currentTarget.getBoundingClientRect().top,
			left: event.currentTarget.getBoundingClientRect().left
		}

		if (weapons.length === 1 && this._isWeaponProficient(weapons[0])) {
			this._openMissileModifierPanel(weapons[0], position, true)
		} else {
			this._openMissileWeaponMenu(weapons, position)
		}
	}

	/**
	 * Open weapon selection menu for missile attacks, then modifier panel.
	 * @param {Item[]} weapons - Equipped missile weapons
	 * @param {object} position - Position {top, left}
	 */
	_openMissileWeaponMenu(weapons, position) {
		this._createContextMenu({
			html: this._buildWeaponMenuHtml(weapons),
			position,
			onItemClick: (item, menu) => {
				const weapon = this.actor.items.get(item.dataset.weaponId)
				const proficient = item.dataset.proficient !== 'false'
				menu.remove()
				if (weapon) {
					setTimeout(() => this._openMissileModifierPanel(weapon, position, proficient), 0)
				}
			}
		})
	}

	/**
	 * Get applicable missile attack modifiers based on character traits, talents, and weapon.
	 * Excludes Two Weapons (melee only).
	 * @param {object} weapon - The selected weapon
	 * @returns {object[]} Array of modifier definitions
	 */
	_getApplicableMissileModifiers(weapon) {
		const modifiers = []
		const actor = this.actor
		const traits = this._getAllActiveTraits()
		const hasTrait = (id) => traits.some(t => t.id === id)
		const level = actor.system.level
		const talents = actor.system.combatTalents || []

		// Trophy - hunter has trophies trait
		if (hasTrait('trophies')) {
			modifiers.push({
				id: 'trophy',
				name: game.i18n.localize('DOLMEN.Attack.Mod.Trophy'),
				attackBonus: 1
			})
		}

		// Monster Slayer - knight trait, level 5+
		if (hasTrait('monsterSlayer') && level >= 5) {
			modifiers.push({
				id: 'monsterSlayer',
				name: game.i18n.localize('DOLMEN.Traits.MonsterSlayer'),
				attackBonus: 2,
				damageBonus: 2
			})
		}

		// Fighter combat talents (applicable to missile)
		if (talents.includes('weaponSpecialist')) {
			modifiers.push({
				id: 'weaponSpecialist',
				name: game.i18n.localize('DOLMEN.Traits.Talents.WeaponSpecialist'),
				attackBonus: 1,
				damageBonus: 1
			})
		}
		if (talents.includes('slayer')) {
			modifiers.push({
				id: 'slayer',
				name: game.i18n.localize('DOLMEN.Traits.Talents.Slayer'),
				attackBonus: 1,
				damageBonus: 1
			})
		}

		// Armor Piercing - weapon quality
		if (weapon.system.qualities?.includes('armor-piercing')) {
			modifiers.push({
				id: 'armorPiercing',
				name: game.i18n.localize('DOLMEN.Attack.Mod.ArmorPiercing'),
				attackBonus: 2
			})
		}

		return modifiers
	}

	/**
	 * Open modifier panel for missile attacks (ROLL + trait toggles + numeric grid).
	 * @param {object} weapon - Selected missile weapon
	 * @param {object} position - Position {top, left}
	 * @param {boolean} proficient - Whether the character is proficient with this weapon
	 */
	_openMissileModifierPanel(weapon, position, proficient = true) {
		// Remove any existing context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		const modifiers = this._getApplicableMissileModifiers(weapon)
		const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

		// Build HTML
		let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

		// Modifier toggles
		if (modifiers.length > 0) {
			html += '<div class="menu-separator"></div>'
			for (const mod of modifiers) {
				const bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
				html += `
					<div class="modifier-item" data-mod-id="${mod.id}">
						<span class="mod-check"></span>
						<span class="mod-name">${mod.name}</span>
						<span class="mod-bonus">${bonusStr}</span>
					</div>
				`
			}
		}

		// Numeric modifier grid
		html += '<div class="menu-separator"></div>'
		html += '<div class="numeric-grid">'
		for (const val of [-4, -3, -2, -1]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
		}
		for (const val of [1, 2, 3, 4]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
		}
		html += '</div>'

		// Create panel element
		const panel = document.createElement('div')
		panel.className = 'dolmen-weapon-context-menu modifier-panel'
		panel.innerHTML = html
		panel.style.position = 'fixed'
		panel.style.top = `${position.top}px`
		panel.style.left = `${position.left}px`
		this.element.appendChild(panel)

		// Adjust position (appear to left of click)
		const panelRect = panel.getBoundingClientRect()
		panel.style.left = `${position.left - panelRect.width - 5}px`

		// Modifier toggle behavior (multi-select)
		panel.querySelectorAll('.modifier-item').forEach(item => {
			item.addEventListener('click', () => {
				item.classList.toggle('selected')
				const check = item.querySelector('.mod-check')
				check.textContent = item.classList.contains('selected') ? '\u2713' : ''
			})
		})

		// Numeric button behavior (single-select toggle)
		panel.querySelectorAll('.numeric-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const wasSelected = btn.classList.contains('selected')
				panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
				if (!wasSelected) btn.classList.add('selected')
			})
		})

		// ROLL button
		panel.querySelector('.roll-btn').addEventListener('click', () => {
			const selectedModifiers = []
			panel.querySelectorAll('.modifier-item.selected').forEach(item => {
				const mod = modifiers.find(m => m.id === item.dataset.modId)
				if (mod) selectedModifiers.push(mod)
			})

			const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
			const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0

			panel.remove()
			document.removeEventListener('click', closePanel)
			this._executeMissileAttack(weapon, selectedModifiers, numericMod, proficient)
		})

		// Close panel when clicking outside
		const closePanel = (e) => {
			if (!panel.contains(e.target)) {
				panel.remove()
				document.removeEventListener('click', closePanel)
			}
		}
		setTimeout(() => document.addEventListener('click', closePanel), 0)
	}

	/**
	 * Execute a missile attack with all selected options.
	 * @param {object} weapon - The missile weapon
	 * @param {object[]} selectedModifiers - Array of selected modifier definitions
	 * @param {number} numericMod - Manual numeric modifier (-4 to +4)
	 * @param {boolean} proficient - Whether the character is proficient with this weapon
	 */
	async _executeMissileAttack(weapon, selectedModifiers, numericMod, proficient = true) {
		let modAttackBonus = 0
		let modDamageBonus = 0
		const modifierNames = []

		// Apply proficiency penalty
		const proficiencyPenalty = proficient ? 0 : -4
		modAttackBonus += proficiencyPenalty

		for (const mod of selectedModifiers) {
			modAttackBonus += mod.attackBonus || 0
			modDamageBonus += mod.damageBonus || 0
			modifierNames.push(mod.name)
		}

		// Add numeric modifier as its own badge label
		if (numericMod !== 0) {
			modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
		}

		// Compute total attack modifier
		const { totalMod } = this._getAttackModifiers('missile')
		const finalAttackMod = totalMod + modAttackBonus + numericMod

		// Determine damage formula
		let damageFormula = weapon.system.damage
		if (modDamageBonus !== 0) {
			damageFormula = modDamageBonus > 0
				? `${damageFormula} + ${modDamageBonus}`
				: `${damageFormula} - ${Math.abs(modDamageBonus)}`
		}

		await this._performAttackRoll(weapon, 'missile', {
			totalAttackMod: finalAttackMod,
			damageFormula,
			modifierNames
		})
	}

	/* -------------------------------------------- */
	/*  Attack Roll Methods                         */
	/* -------------------------------------------- */

	/**
	 * Get equipped weapons that have a specific quality.
	 * @param {string} quality - The weapon quality to filter by ('melee' or 'missile')
	 * @returns {Item[]} Array of equipped weapons with the specified quality
	 */
	_getEquippedWeaponsByQuality(quality) {
		return this.actor.items.filter(item =>
			item.type === 'Weapon' &&
			item.system.equipped &&
			item.system.qualities?.includes(quality)
		)
	}

	/**
	 * Handle right-click on melee or missile attack icons.
	 * Opens a context menu to choose between attack-only or damage-only rolls.
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {Event} event - The contextmenu event
	 */
	_onAttackRollContextMenu(attackType, event) {
		const weapons = this._getEquippedWeaponsByQuality(attackType)

		if (weapons.length === 0) {
			const typeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
			ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
			return
		}

		// Store position from event before it becomes stale
		const iconRect = event.currentTarget.getBoundingClientRect()
		const position = { top: iconRect.top, left: iconRect.left }

		// Always show roll type menu first
		this._openRollTypeContextMenu(weapons, attackType, position)
	}

	/**
	 * Open a context menu to choose roll type (attack only or damage only).
	 * @param {Item[]} weapons - Array of weapons to potentially roll with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {object} position - Position object with top and left properties
	 */
	_openRollTypeContextMenu(weapons, attackType, position) {
		const attackOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollAttackOnly')
		const damageOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollDamageOnly')

		const html = `
			<div class="weapon-menu-item" data-roll-type="attack">
				<i class="fas fa-dice-d20"></i>
				<span class="weapon-name">${attackOnlyLabel}</span>
			</div>
			<div class="weapon-menu-item" data-roll-type="damage">
				<i class="fas fa-burst"></i>
				<span class="weapon-name">${damageOnlyLabel}</span>
			</div>
		`

		this._createContextMenu({
			html,
			position,
			onItemClick: (item, menu) => {
				const rollType = item.dataset.rollType
				menu.remove()

				if (weapons.length === 1) {
					if (rollType === 'attack') {
						this._rollAttackOnly(weapons[0], attackType)
					} else if (rollType === 'damage') {
						this._rollDamageOnly(weapons[0], attackType)
					}
				} else {
					setTimeout(() => this._openWeaponSelectionMenu(weapons, attackType, rollType, position), 0)
				}
			}
		})
	}

	/**
	 * Open weapon selection menu after roll type has been chosen.
	 * @param {Item[]} weapons - Array of available weapons
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {string} rollType - Either 'attack' or 'damage'
	 * @param {object} position - Position object with top and left properties
	 */
	_openWeaponSelectionMenu(weapons, attackType, rollType, position) {
		this._createContextMenu({
			html: this._buildWeaponMenuHtml(weapons),
			position,
			onItemClick: (item, menu) => {
				const weapon = this.actor.items.get(item.dataset.weaponId)
				if (weapon) {
					if (rollType === 'attack') {
						this._rollAttackOnly(weapon, attackType)
					} else if (rollType === 'damage') {
						this._rollDamageOnly(weapon, attackType)
					}
				}
				menu.remove()
			}
		})
	}

	/**
	 * Get attack modifiers for a given attack type.
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @returns {object} Object containing attackMod, abilityMod, traitMod, and totalMod
	 */
	_getAttackModifiers(attackType) {
		const adjusted = this._computeAdjustedValues()
		const attackMod = adjusted.attack || 0
		const abilityMod = attackType === 'melee'
			? adjusted.abilities.strength.mod
			: adjusted.abilities.dexterity.mod
		// Include type-specific trait bonuses (e.g., Hunter's missile bonus)
		const traitMod = attackType === 'melee'
			? (adjusted.attackMelee || 0)
			: (adjusted.attackMissile || 0)
		return {
			attackMod,
			abilityMod,
			traitMod,
			totalMod: attackMod + abilityMod + traitMod
		}
	}

	/**
	 * Build the attack roll formula string.
	 * @param {number} totalMod - Total modifier to apply
	 * @returns {string} Roll formula like "1d20 + 3" or "1d20 - 1"
	 */
	_buildAttackFormula(totalMod) {
		return totalMod >= 0 ? `1d20 + ${totalMod}` : `1d20 - ${Math.abs(totalMod)}`
	}

	/**
	 * Get critical/fumble state from an attack roll.
	 * @param {Roll} attackRoll - The evaluated attack roll
	 * @returns {object} Object with resultClass and resultLabel
	 */
	_getAttackResultState(attackRoll) {
		const d20Result = attackRoll.dice[0].results[0].result
		if (d20Result === 20) {
			return {
				resultClass: 'critical',
				resultLabel: `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Critical')}</span>`
			}
		} else if (d20Result === 1) {
			return {
				resultClass: 'fumble',
				resultLabel: `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Fumble')}</span>`
			}
		}
		return { resultClass: '', resultLabel: '' }
	}

	/**
	 * Build chat message HTML for attack rolls.
	 * @param {object} config - Configuration object
	 * @param {Item} config.weapon - The weapon used
	 * @param {string} config.attackType - 'melee' or 'missile'
	 * @param {object} [config.attack] - Attack roll data (anchor, formula, resultClass, resultLabel, traitName, modifierNames, attackModeName, specialText)
	 * @param {object} [config.damage] - Damage roll data (anchor, formula)
	 * @returns {string} HTML content for the chat message
	 */
	_buildAttackChatHtml({ weapon, attackType, attack, damage }) {
		const attackTypeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)

		// Build badges: single trait name (legacy) or multiple modifier names (new melee flow)
		let badges = ''
		if (attack?.modifierNames?.length > 0) {
			badges = attack.modifierNames.map(n => `<span class="trait-badge">${n}</span>`).join('')
		} else if (attack?.traitName) {
			badges = `<span class="trait-badge">${attack.traitName}</span>`
		}

		// Attack mode name badge (Charge, Push)
		const attackModeBadge = attack?.attackModeName
			? `<span class="trait-badge">${attack.attackModeName}</span>`
			: ''

		let rollSections = ''
		if (attack) {
			rollSections += `
				<div class="roll-section attack-section ${attack.resultClass}">
					<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
					<div class="roll-result">
						${attack.anchor.outerHTML}
						${attack.resultLabel}
					</div>
					<span class="roll-breakdown">${attack.formula}</span>
				</div>`
		}
		if (damage) {
			rollSections += `
				<div class="roll-section damage-section">
					<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
					<div class="roll-result">
						${damage.anchor.outerHTML}
					</div>
					<span class="roll-breakdown">${damage.formula}</span>
				</div>`
		}

		// Special text (e.g., Push save info)
		const specialSection = attack?.specialText
			? `<div class="roll-section special-section"><span class="roll-breakdown">${attack.specialText}</span></div>`
			: ''

		return `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<img src="${weapon.img}" alt="${weapon.name}" class="weapon-icon">
					<div class="attack-info">
						<h3>${weapon.name}${attackModeBadge}${badges}</h3>
						<span class="attack-type">${attackTypeName}</span>
					</div>
				</div>
				<div class="roll-results">${rollSections}${specialSection}</div>
			</div>
		`
	}

	/**
	 * Unified attack roll method supporting attack-only, damage-only, or both.
	 * @param {Item} weapon - The weapon to use
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {object} [options] - Roll options
	 * @param {boolean} [options.attackOnly=false] - Only roll attack (no damage)
	 * @param {boolean} [options.damageOnly=false] - Only roll damage (no attack)
	 * @param {number} [options.traitBonus=0] - Bonus from selected trait (legacy missile flow)
	 * @param {string} [options.traitName=null] - Name of trait providing bonus (legacy missile flow)
	 * @param {number} [options.totalAttackMod=null] - Pre-computed total attack modifier (melee flow)
	 * @param {string} [options.damageFormula=null] - Override damage formula (melee flow)
	 * @param {string[]} [options.modifierNames=null] - Array of modifier names for badges (melee flow)
	 * @param {string} [options.attackModeName=null] - Attack mode name for badge (melee flow)
	 * @param {string} [options.specialText=null] - Special info text for chat (melee flow)
	 */
	async _performAttackRoll(weapon, attackType, {
		attackOnly = false, damageOnly = false,
		traitBonus = 0, traitName = null,
		totalAttackMod = null, damageFormula = null,
		modifierNames = null, attackModeName = null, specialText = null
	} = {}) {
		const rolls = []
		let attackData = null
		let damageData = null

		// Handle attack roll
		if (!damageOnly) {
			let finalMod
			if (totalAttackMod !== null) {
				// New melee flow: use pre-computed total
				finalMod = totalAttackMod
			} else {
				// Legacy flow: compute internally
				const { totalMod } = this._getAttackModifiers(attackType)
				finalMod = totalMod + traitBonus
			}
			const formula = this._buildAttackFormula(finalMod)
			const roll = new Roll(formula)
			await roll.evaluate()
			rolls.push(roll)

			const { resultClass, resultLabel } = this._getAttackResultState(roll)
			attackData = {
				anchor: await roll.toAnchor({ classes: ['attack-inline-roll'] }),
				formula,
				resultClass,
				resultLabel,
				traitName,
				modifierNames,
				attackModeName,
				specialText
			}
		}

		// Handle damage roll
		if (!attackOnly) {
			const formula = damageFormula || weapon.system.damage
			const roll = new Roll(formula)
			await roll.evaluate()
			rolls.push(roll)

			damageData = {
				anchor: await roll.toAnchor({ classes: ['damage-inline-roll'] }),
				formula
			}
		}

		// Build and send chat message
		const chatContent = this._buildAttackChatHtml({
			weapon,
			attackType,
			attack: attackData,
			damage: damageData
		})

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls,
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/**
	 * Perform a full attack roll with a weapon (attack + damage).
	 * @param {Item} weapon - The weapon to attack with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {number} [traitBonus=0] - Bonus from selected trait
	 * @param {string} [traitName=null] - Name of trait providing bonus
	 */
	async _rollAttack(weapon, attackType, traitBonus = 0, traitName = null) {
		return this._performAttackRoll(weapon, attackType, { traitBonus, traitName })
	}

	/**
	 * Perform an attack roll only (no damage).
	 * @param {Item} weapon - The weapon to attack with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 */
	async _rollAttackOnly(weapon, attackType) {
		return this._performAttackRoll(weapon, attackType, { attackOnly: true })
	}

	/**
	 * Perform a damage roll only (no attack).
	 * @param {Item} weapon - The weapon to roll damage for
	 * @param {string} attackType - Either 'melee' or 'missile'
	 */
	async _rollDamageOnly(weapon, attackType) {
		return this._performAttackRoll(weapon, attackType, { damageOnly: true })
	}

	/* -------------------------------------------- */
	/*  Ability Check Roll Methods                  */
	/* -------------------------------------------- */

	/**
	 * Handle ability check roll - checks for trait options and shows context menu if needed.
	 * @param {string} abilityKey - The ability key (e.g., 'strength', 'dexterity')
	 * @param {Event} event - The click event for positioning
	 */
	_onAbilityRoll(abilityKey, event) {
		// Check for applicable trait roll options
		const rollOptions = this._getTraitRollOptions(`abilities.${abilityKey}`)

		if (rollOptions.length === 0) {
			// No trait options, roll directly
			this._performAbilityCheck(abilityKey, 0)
		} else {
			// Show context menu to choose traits
			const position = event ? {
				top: event.currentTarget.getBoundingClientRect().top,
				left: event.currentTarget.getBoundingClientRect().left
			} : { top: 100, left: 100 }

			this._openTraitRollContextMenu(abilityKey, 'ability', rollOptions, position)
		}
	}

	/**
	 * Open context menu to select trait bonuses for a roll.
	 * @param {string} key - The ability/save/skill key
	 * @param {string} rollType - 'ability', 'save', or 'skill'
	 * @param {object[]} options - Available trait options
	 * @param {object} position - Position {top, left}
	 * @param {number} [skillTargetOverride] - For skill rolls, the target override value
	 */
	_openTraitRollContextMenu(key, rollType, options, position, skillTargetOverride = null) {
		const normalLabel = game.i18n.localize('DOLMEN.Roll.NormalRoll')

		let html = `
			<div class="weapon-menu-item" data-bonus="0" data-trait-id="">
				<i class="fas fa-dice"></i>
				<span class="weapon-name">${normalLabel}</span>
			</div>
		`

		for (const opt of options) {
			const bonusStr = opt.bonus >= 0 ? `+${opt.bonus}` : `${opt.bonus}`
			html += `
				<div class="weapon-menu-item" data-bonus="${opt.bonus}" data-trait-id="${opt.id}">
					<i class="fas fa-sparkles"></i>
					<span class="weapon-name">${opt.name}</span>
					<span class="weapon-damage">${bonusStr}</span>
				</div>
			`
		}

		this._createContextMenu({
			html,
			position,
			onItemClick: (item, menu) => {
				const bonus = parseInt(item.dataset.bonus) || 0
				const traitName = item.dataset.traitId ? options.find(o => o.id === item.dataset.traitId)?.name : null
				menu.remove()

				if (rollType === 'ability') {
					this._performAbilityCheck(key, bonus, traitName)
				} else if (rollType === 'save') {
					this._performSavingThrow(key, bonus, traitName)
				} else if (rollType === 'skill') {
					this._performSkillCheck(key, skillTargetOverride, bonus, traitName)
				}
			}
		})
	}

	/**
	 * Perform an ability check roll. Roll 1d6 + ability modifier vs DC 4.
	 * Trait bonus is added to the ability SCORE, then modifier is recalculated.
	 * @param {string} abilityKey - The ability key (e.g., 'strength', 'dexterity')
	 * @param {number} traitScoreBonus - Bonus to ability score from selected trait
	 * @param {string} [traitName] - Name of the trait providing bonus (for display)
	 */
	async _performAbilityCheck(abilityKey, traitScoreBonus = 0, traitName = null) {
		const adjusted = this._computeAdjustedValues()
		const baseScore = adjusted.abilities[abilityKey]?.score
		const baseMod = adjusted.abilities[abilityKey]?.mod
		if (baseScore === undefined) return

		const abilityName = game.i18n.localize(`DOLMEN.Abilities.${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)}`)
		const dc = 4

		// If trait bonus is applied, recalculate modifier from adjusted score
		let effectiveScore = baseScore
		let effectiveMod = baseMod
		if (traitScoreBonus !== 0) {
			effectiveScore = Math.min(18, baseScore + traitScoreBonus) // Cap at 18
			effectiveMod = AdventurerDataModel.computeModifier(effectiveScore)
		}

		// Build formula with effective modifier
		const formula = effectiveMod >= 0 ? `1d6 + ${effectiveMod}` : `1d6 - ${Math.abs(effectiveMod)}`
		const roll = new Roll(formula)
		await roll.evaluate()

		const total = roll.total
		const isSuccess = total >= dc

		let resultClass = isSuccess ? 'success' : 'failure'
		let resultLabel = ''

		if (isSuccess) {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
		} else {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
		}

		const anchor = await roll.toAnchor({ classes: ['ability-inline-roll'] })

		// Build breakdown string showing components
		let breakdownParts = [`1d6`]
		if (traitScoreBonus !== 0 && traitName) {
			// Show score calculation: base + bonus = effective, then mod
			breakdownParts.push(`+ ${effectiveMod} (${baseScore}+${traitScoreBonus}=${effectiveScore})`)
		} else if (effectiveMod !== 0) {
			breakdownParts.push(effectiveMod >= 0 ? `+ ${effectiveMod}` : `- ${Math.abs(effectiveMod)}`)
		}
		const breakdown = breakdownParts.join(' ')

		const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''

		const chatContent = `
			<div class="dolmen ability-roll">
				<div class="roll-header ability">
					<i class="fa-solid fa-dice-d6"></i>
					<div class="roll-info">
						<h3>${abilityName} ${traitBadge}</h3>
						<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.AbilityCheck')}</span>
					</div>
				</div>
				<div class="roll-body">
					<div class="roll-section ${resultClass}">
						<div class="roll-result">
							${anchor.outerHTML}
						</div>
						<span class="roll-breakdown">${breakdown}</span>
						<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.DC')}: ${dc}</span>
						<span class="roll-label ${resultClass}">${resultLabel}</span>
					</div>
				</div>
			</div>
		`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/* -------------------------------------------- */
	/*  Saving Throw Roll Methods                   */
	/* -------------------------------------------- */

	/**
	 * Handle saving throw roll - checks for trait options and shows context menu if needed.
	 * @param {string} saveKey - The save key (e.g., 'doom', 'ray', 'hold', 'blast', 'spell')
	 * @param {Event} event - The click event for positioning
	 */
	_onSaveRoll(saveKey, event) {
		// Check for applicable trait roll options
		const rollOptions = this._getTraitRollOptions(`saves.${saveKey}`)

		if (rollOptions.length === 0) {
			// No trait options, roll directly
			this._performSavingThrow(saveKey, 0)
		} else {
			// Show context menu to choose traits
			const position = event ? {
				top: event.currentTarget.getBoundingClientRect().top,
				left: event.currentTarget.getBoundingClientRect().left
			} : { top: 100, left: 100 }

			this._openTraitRollContextMenu(saveKey, 'save', rollOptions, position)
		}
	}

	/**
	 * Perform a saving throw roll. Success if d20 ≥ save target.
	 * @param {string} saveKey - The save key (e.g., 'doom', 'ray', 'hold', 'blast', 'spell')
	 * @param {number} traitBonus - Additional bonus from selected trait (lowers target)
	 * @param {string} [traitName] - Name of the trait providing bonus (for display)
	 */
	async _performSavingThrow(saveKey, traitBonus = 0, traitName = null) {
		const adjusted = this._computeAdjustedValues()
		const baseSaveTarget = adjusted.saves[saveKey]
		if (baseSaveTarget === undefined) return

		// Trait bonus lowers the save target (making it easier)
		const saveTarget = baseSaveTarget - traitBonus

		const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

		const roll = new Roll('1d20')
		await roll.evaluate()

		const d20Result = roll.dice[0].results[0].result
		const isSuccess = d20Result >= saveTarget
		const isCriticalSuccess = d20Result === 20
		const isCriticalFailure = d20Result === 1

		let resultClass = isSuccess ? 'success' : 'failure'
		let resultLabel = ''

		if (isCriticalSuccess) {
			resultClass = 'critical'
			resultLabel = game.i18n.localize('DOLMEN.Roll.CriticalSuccess')
		} else if (isCriticalFailure) {
			resultClass = 'fumble'
			resultLabel = game.i18n.localize('DOLMEN.Roll.CriticalFailure')
		} else if (isSuccess) {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
		} else {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
		}

		const anchor = await roll.toAnchor({ classes: ['save-inline-roll'] })

		const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''
		const targetDisplay = traitBonus !== 0
			? `${baseSaveTarget} - ${traitBonus} = ${saveTarget}+`
			: `${saveTarget}+`

		const chatContent = `
			<div class="dolmen save-roll">
				<div class="roll-header save">
					<i class="fa-solid fa-shield-halved"></i>
					<div class="roll-info">
						<h3>${game.i18n.localize('DOLMEN.Roll.SaveVs')} ${saveName} ${traitBadge}</h3>
						<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SavingThrow')}</span>
					</div>
				</div>
				<div class="roll-body">
					<div class="roll-section ${resultClass}">
						<div class="roll-result">
							${anchor.outerHTML}
						</div>
						<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${targetDisplay}</span>
						<span class="roll-label ${resultClass}">${resultLabel}</span>
					</div>
				</div>
			</div>
		`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/* -------------------------------------------- */
	/*  Skill Check Roll Methods                    */
	/* -------------------------------------------- */

	/**
	 * Handle skill check roll - checks for trait options and shows context menu if needed.
	 * @param {string} skillKey - The skill key (e.g., 'listen', 'search', 'survival')
	 * @param {number} [targetOverride] - Override the target value (for extra skills)
	 * @param {Event} event - The click event for positioning
	 */
	_onSkillRoll(skillKey, targetOverride, event) {
		// Check for applicable trait roll options
		const rollOptions = this._getTraitRollOptions(`skills.${skillKey}`)

		if (rollOptions.length === 0) {
			// No trait options, roll directly
			this._performSkillCheck(skillKey, targetOverride, 0)
		} else {
			// Show context menu to choose traits
			const position = event ? {
				top: event.currentTarget.getBoundingClientRect().top,
				left: event.currentTarget.getBoundingClientRect().left
			} : { top: 100, left: 100 }

			this._openTraitRollContextMenu(skillKey, 'skill', rollOptions, position, targetOverride)
		}
	}

	/**
	 * Perform a skill check roll. Success if d6 ≤ skill target.
	 * @param {string} skillKey - The skill key (e.g., 'listen', 'search', 'survival')
	 * @param {number} [targetOverride] - Override the target value (for extra skills)
	 * @param {number} traitBonus - Additional bonus from selected trait (increases target)
	 * @param {string} [traitName] - Name of the trait providing bonus (for display)
	 */
	async _performSkillCheck(skillKey, targetOverride = null, traitBonus = 0, traitName = null) {
		const adjusted = this._computeAdjustedValues()
		let baseSkillTarget = targetOverride

		// If no override, get from adjusted values (for core skills)
		if (baseSkillTarget === null) {
			baseSkillTarget = adjusted.skills[skillKey]
		}

		if (baseSkillTarget === undefined || baseSkillTarget === null) return

		// Trait bonus increases the skill target (making it easier)
		const skillTarget = baseSkillTarget + traitBonus

		// Localize the skill name
		const localeKey = `DOLMEN.Skills.${skillKey}`
		const skillName = game.i18n.localize(localeKey)

		const roll = new Roll('1d6')
		await roll.evaluate()

		const d6Result = roll.dice[0].results[0].result
		const isSuccess = d6Result >= skillTarget

		let resultClass = isSuccess ? 'success' : 'failure'
		let resultLabel = ''

		if (isSuccess) {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Success')
		} else {
			resultLabel = game.i18n.localize('DOLMEN.Roll.Failure')
		}

		const anchor = await roll.toAnchor({ classes: ['skill-inline-roll'] })

		const traitBadge = traitName ? `<span class="trait-badge">${traitName}</span>` : ''
		const targetDisplay = traitBonus !== 0
			? `${baseSkillTarget} + ${traitBonus} = ${skillTarget}`
			: `${skillTarget}`

		const chatContent = `
			<div class="dolmen skill-roll">
				<div class="roll-header skill">
					<i class="fa-solid fa-magnifying-glass"></i>
					<div class="roll-info">
						<h3>${skillName} ${traitBadge}</h3>
						<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SkillCheck')}</span>
					</div>
				</div>
				<div class="roll-body">
					<div class="roll-section ${resultClass}">
						<div class="roll-result">
							${anchor.outerHTML}
						</div>
						<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${targetDisplay}+</span>
						<span class="roll-label ${resultClass}">${resultLabel}</span>
					</div>
				</div>
			</div>
		`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	static _onAddSkill(_event, _target) {
		this._openAddSkillDialog()
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		this._removeSkill(index)
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
				// Warn if item size is incompatible with actor size
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

	/**
	 * Handle memorizing a spell from the known spells list.
	 * Finds the first empty slot of the appropriate rank and memorizes the spell there.
	 * @param {Event} _event - The click event
	 * @param {HTMLElement} target - The clicked element
	 */
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

		// Find first empty slot
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

	/**
	 * Handle forgetting a memorized spell (removing from slot).
	 * @param {Event} _event - The click event
	 * @param {HTMLElement} target - The clicked element
	 */
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

	/**
	 * Handle clicking on an empty spell slot to open memorization dialog.
	 * @param {Event} _event - The click event
	 * @param {HTMLElement} target - The clicked element
	 */
	static async _onMemorizeToSlot(_event, target) {
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey
		const rank = parseInt(target.dataset.rank)
		const spellType = target.dataset.spellType || 'arcane'

		if (isNaN(slotIndex) || !rankKey || isNaN(rank)) return

		// Get known spells of this rank
		const knownSpells = this.actor.items.filter(
			i => i.type === 'Spell' && i.system.type === spellType && i.system.rank === rank
		)

		if (knownSpells.length === 0) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.NoKnownSpellsForRank'))
			return
		}

		// Build options for dialog
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
