import { CHOICE_KEYS } from './utils/choices.js'

/* global foundry */
const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields

/* -------------------------------------------- */
/*  Schema Helper Functions                     */
/* -------------------------------------------- */

/**
 * Create an ability score field with score and modifier.
 * @returns {SchemaField} Ability score schema field
 */
function createAbilityField() {
	return new SchemaField({
		score: new NumberField({ required: true, integer: true, min: 3, max: 18, initial: 10 }),
		mod: new NumberField({ required: true, integer: true, min: -3, max: 3, initial: 0 })
	})
}

/**
 * Create a save target field.
 * @returns {NumberField} Save target field
 */
function createSaveField() {
	return new NumberField({ required: true, integer: true, min: 2, max: 19, initial: 10 })
}

/**
 * Create all save target fields.
 * @returns {SchemaField} Schema field containing all saves
 */
function createSavesSchema() {
	return new SchemaField({
		doom: createSaveField(),
		ray: createSaveField(),
		hold: createSaveField(),
		blast: createSaveField(),
		spell: createSaveField()
	})
}

/**
 * Create all ability score fields.
 * @returns {SchemaField} Schema field containing all abilities
 */
function createAbilitiesSchema() {
	return new SchemaField({
		strength: createAbilityField(),
		intelligence: createAbilityField(),
		wisdom: createAbilityField(),
		dexterity: createAbilityField(),
		constitution: createAbilityField(),
		charisma: createAbilityField()
	})
}

/**
 * Create an adjustment field (defaults to 0).
 * @returns {NumberField} Adjustment field
 */
function createAdjustmentField() {
	return new NumberField({ required: true, integer: true, initial: 0 })
}

/**
 * Create ability adjustment fields (score and mod for each ability).
 * @returns {SchemaField} Schema field containing ability adjustments
 */
function createAbilityAdjustmentsSchema() {
	const abilityAdj = () => new SchemaField({
		score: createAdjustmentField(),
		mod: createAdjustmentField()
	})
	return new SchemaField({
		strength: abilityAdj(),
		intelligence: abilityAdj(),
		wisdom: abilityAdj(),
		dexterity: abilityAdj(),
		constitution: abilityAdj(),
		charisma: abilityAdj()
	})
}

/**
 * Create save adjustment fields.
 * @returns {SchemaField} Schema field containing save adjustments
 */
function createSaveAdjustmentsSchema() {
	return new SchemaField({
		doom: createAdjustmentField(),
		ray: createAdjustmentField(),
		hold: createAdjustmentField(),
		blast: createAdjustmentField(),
		spell: createAdjustmentField()
	})
}

/**
 * Create skill adjustment fields.
 * @returns {SchemaField} Schema field containing skill adjustments
 */
function createSkillAdjustmentsSchema() {
	return new SchemaField({
		// Base skills
		listen: createAdjustmentField(),
		search: createAdjustmentField(),
		survival: createAdjustmentField(),
		// Extra skills
		detectMagic: createAdjustmentField(),
		alertness: createAdjustmentField(),
		stalking: createAdjustmentField(),
		tracking: createAdjustmentField(),
		pickLock: createAdjustmentField(),
		stealth: createAdjustmentField(),
		decipherDocument: createAdjustmentField(),
		climbWall: createAdjustmentField(),
		disarmMechanism: createAdjustmentField(),
		legerdemain: createAdjustmentField(),
		monsterLore: createAdjustmentField()
	})
}

/**
 * Create movement adjustment fields.
 * @returns {SchemaField} Schema field containing movement adjustments
 */
function createMovementAdjustmentsSchema() {
	return new SchemaField({
		exploring: createAdjustmentField(),
		overland: createAdjustmentField()
	})
}

/**
 * Create magic adjustment fields for manually enabling magic types and adjusting slot counts.
 * The enable booleans are manual overrides; magic is also auto-enabled from class/kindred
 * in prepareDerivedData() (OR logic: class/kindred default OR manual override).
 * @returns {SchemaField} Schema field containing magic adjustments
 */
function createMagicAdjustmentsSchema() {
	const arcaneSlots = {}
	for (let i = 1; i <= 6; i++) {
		arcaneSlots[`rank${i}`] = createAdjustmentField()
	}
	const holySlots = {}
	for (let i = 1; i <= 5; i++) {
		holySlots[`rank${i}`] = createAdjustmentField()
	}
	return new SchemaField({
		arcane: new BooleanField({ required: true, initial: false }),
		holy: new BooleanField({ required: true, initial: false }),
		fairy: new BooleanField({ required: true, initial: false }),
		knacks: new BooleanField({ required: true, initial: false }),
		arcaneSlots: new SchemaField(arcaneSlots),
		holySlots: new SchemaField(holySlots),
		glamoursMax: createAdjustmentField()
	})
}

/**
 * Create the full adjustments schema for custom bonuses/penalties.
 * @returns {SchemaField} Schema field containing all adjustments
 */
function createAdjustmentsSchema() {
	return new SchemaField({
		abilities: createAbilityAdjustmentsSchema(),
		hp: new SchemaField({
			max: createAdjustmentField()
		}),
		ac: createAdjustmentField(),
		attack: createAdjustmentField(),
		saves: createSaveAdjustmentsSchema(),
		magicResistance: createAdjustmentField(),
		skills: createSkillAdjustmentsSchema(),
		speed: createAdjustmentField(),
		movement: createMovementAdjustmentsSchema(),
		magic: createMagicAdjustmentsSchema(),
		xpModifier: createAdjustmentField()
	})
}

/**
 * Create a spell slot field for a single rank.
 * Max is computed in prepareDerivedData() from class + level progression tables.
 * @returns {SchemaField} Spell slot schema with max, used, and memorized values
 */
function createSpellSlotField() {
	return new SchemaField({
		max: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
		used: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
		// Array of spell item IDs that are memorized in these slots
		memorized: new ArrayField(new StringField({ blank: false }), { initial: [] })
	})
}

/**
 * Create arcane magic spell slots schema (ranks 1-6).
 * @returns {SchemaField} Schema containing all arcane spell slot ranks
 */
function createArcaneSpellSlotsSchema() {
	return new SchemaField({
		rank1: createSpellSlotField(),
		rank2: createSpellSlotField(),
		rank3: createSpellSlotField(),
		rank4: createSpellSlotField(),
		rank5: createSpellSlotField(),
		rank6: createSpellSlotField()
	})
}

/**
 * Create holy magic spell slots schema (ranks 1-5).
 * @returns {SchemaField} Schema containing all holy spell slot ranks
 */
function createHolySpellSlotsSchema() {
	return new SchemaField({
		rank1: createSpellSlotField(),
		rank2: createSpellSlotField(),
		rank3: createSpellSlotField(),
		rank4: createSpellSlotField(),
		rank5: createSpellSlotField()
	})
}

/* -------------------------------------------- */
/*  Actor Models                                */
/* -------------------------------------------- */

/**
 * Base data model for all actors (Adventurers and Creatures).
 * Contains statistics common to both actor types.
 */
class ActorDataModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// Level - indicates power/danger level
			level: new NumberField({ required: true, integer: true, min: 1, initial: 1, max: 15 }),

			// Hit Points
			hp: new SchemaField({
				value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
				max: new NumberField({ required: true, integer: true, min: 1, initial: 10 })
			}),

			// Armour Class (base 10 unarmoured)
			ac: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),

			// Save Targets (lower is better)
			saves: createSavesSchema(),

			// Speed in feet per round
			speed: new NumberField({ required: true, integer: true, min: 0, initial: 40 }),

			// Size: small, medium, large
			size: new StringField({
				required: true,
				blank: false,
				initial: "medium",
				choices: CHOICE_KEYS.sizes
			}),

			// Alignment
			alignment: new StringField({
				required: true,
				blank: false,
				initial: "neutral",
				choices: CHOICE_KEYS.alignments
			}),
		}
	}
}

/**
 * Data model for Adventurer (player character) actors.
 */
export class AdventurerDataModel extends ActorDataModel {
	/**
	 * Calculate ability score modifier using Dolmenwood rules.
	 * @param {number} score - The ability score (3-18)
	 * @returns {number} The modifier (-3 to +3)
	 */
	static computeModifier(score) {
		if (score <= 3) return -3
		if (score <= 5) return -2
		if (score <= 8) return -1
		if (score <= 12) return 0
		if (score <= 15) return 1
		if (score <= 17) return 2
		return 3
	}

	/**
	 * Get creature type based on kindred.
	 * @param {string} kindred - The kindred (race)
	 * @returns {string} The creature type (fairy, demi-fey, or mortal)
	 */
	static getCreatureTypeForKindred(kindred) {
		const fairyKindreds = ['grimalkin', 'elf']
		const demiFeyKindreds = ['woodgrue']
		if (fairyKindreds.includes(kindred)) return 'fairy'
		if (demiFeyKindreds.includes(kindred)) return 'demi-fey'
		return 'mortal'
	}

	/** @override */
	prepareDerivedData() {
		// Calculate ability modifiers from scores
		for (const ability of Object.values(this.abilities)) {
			ability.mod = AdventurerDataModel.computeModifier(ability.score)
		}

		// Get kindred and class from embedded items (with fallback to old string fields for backward compatibility)
		const kindredItem = this.parent?.items?.find(i => i.type === 'Kindred')
		const classItem = this.parent?.items?.find(i => i.type === 'Class')

		const kindredId = kindredItem?.system?.kindredId || this.kindred
		const classId = classItem?.system?.classId || this.class

		// Derive creature type from kindred
		if (kindredItem?.system?.creatureType) {
			this.creatureType = kindredItem.system.creatureType
		} else {
			this.creatureType = AdventurerDataModel.getCreatureTypeForKindred(kindredId)
		}

		// Enable magic types: auto-detect from class/kindred OR manual override
		const magicAdj = this.adjustments.magic
		const arcaneCasters = ['magician', 'breggle']
		const holyCasters = ['cleric', 'friar']
		const fairyCasters = ['enchanter', 'grimalkin']
		const fairyKindreds = ['elf', 'grimalkin']

		this.arcaneMagic.enabled = arcaneCasters.includes(classId) || magicAdj.arcane
		this.holyMagic.enabled = holyCasters.includes(classId) || magicAdj.holy
		this.fairyMagic.enabled = fairyCasters.includes(classId) || fairyKindreds.includes(kindredId) || magicAdj.fairy
		this.knacks.enabled = kindredId === 'mossling' || magicAdj.knacks

		// Compute spell slot max values from class item progression table
		const spellTable = classItem?.system?.spellProgression?.length > 0
			? classItem.system.spellProgression
			: null

		if (spellTable) {
			const level = Math.min(this.level, 15)
			const slots = spellTable[level - 1]
			if (this.arcaneMagic.enabled && slots?.length === 6) {
				for (let i = 0; i < 6; i++) {
					this.arcaneMagic.spellSlots[`rank${i + 1}`].max = slots[i]
				}
			}
			if (this.holyMagic.enabled && slots?.length === 5) {
				for (let i = 0; i < 5; i++) {
					this.holyMagic.spellSlots[`rank${i + 1}`].max = slots[i]
				}
			}
		}

		// Compute XP next-level threshold from class progression
		const xpTable = classItem?.system?.xpThresholds
		if (xpTable?.length > 0) {
			const level = Math.min(this.level, 15)
			this.xp.nextLevel = level < 15 ? (xpTable[level] || 0) : 0
		}

		// Auto-size selection arrays for traits with requiresSelection (multi-select only)
		if (classItem?.system?.traits) {
			const allTraits = []
			for (const cat of ['active', 'passive', 'info', 'restrictions']) {
				if (Array.isArray(classItem.system.traits[cat])) allTraits.push(...classItem.system.traits[cat])
			}
			for (const trait of allTraits) {
				if (!trait.requiresSelection || !trait.unlockLevels || trait.selectionType !== 'multi') continue
				const field = trait.requiresSelection
				if (!Array.isArray(this[field])) continue
				const count = trait.unlockLevels.filter(lvl => this.level >= lvl).length
				while (this[field].length < count) this[field].push('')
				if (this[field].length > count) this[field].length = count
			}
		}

		// Apply magic slot adjustments
		if (this.arcaneMagic.enabled) {
			for (let i = 1; i <= 6; i++) {
				const key = `rank${i}`
				this.arcaneMagic.spellSlots[key].max = Math.max(0,
					this.arcaneMagic.spellSlots[key].max + (magicAdj.arcaneSlots[key] || 0))
			}
		}
		if (this.holyMagic.enabled) {
			for (let i = 1; i <= 5; i++) {
				const key = `rank${i}`
				this.holyMagic.spellSlots[key].max = Math.max(0,
					this.holyMagic.spellSlots[key].max + (magicAdj.holySlots[key] || 0))
			}
		}
		if (this.fairyMagic.enabled) {
			this.fairyMagic.glamoursMax = Math.max(0,
				this.fairyMagic.glamoursMax + (magicAdj.glamoursMax || 0))
		}

		// Derive knack level from character level (abilities unlock at 1, 3, 5, 7)
		if (this.knacks.enabled) {
			if (this.level >= 7) this.knacks.level = 7
			else if (this.level >= 5) this.knacks.level = 5
			else if (this.level >= 3) this.knacks.level = 3
			else this.knacks.level = 1
		}
	}

	static defineSchema() {
		return {
			...super.defineSchema(),
			
			// Attack bonus
			attack: new NumberField({ required: true, integer: true, initial: 0 }),

			// Ability Scores (3-18, with modifiers)
			abilities: createAbilitiesSchema(),

			// Kindred (race)
			kindred: new StringField({
				required: true,
				blank: false,
				initial: "human"
			}),

			// Class
			class: new StringField({
				required: true,
				blank: false,
				initial: "fighter"
			}),

			// Experience Points
			xp: new SchemaField({
				value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				nextLevel: new NumberField({ required: true, integer: true, min: 0, initial: 2000 })
			}),

			// Magic Resistance (from Wisdom and Kindred)
			magicResistance: new NumberField({ required: true, integer: true, initial: 0 }),

			// Movement speeds
			movement: new SchemaField({
				exploring: new NumberField({ required: true, integer: true, min: 0, initial: 120 }), // feet per turn
				overland: new NumberField({ required: true, integer: true, min: 0, initial: 24 }) // travel points per day
			}),

			// Skill Targets (roll d6, meet or exceed target)
			skills: new SchemaField({
				listen: new NumberField({ required: true, integer: true, min: 2, max: 6, initial: 6 }),
				search: new NumberField({ required: true, integer: true, min: 2, max: 6, initial: 6 }),
				survival: new NumberField({ required: true, integer: true, min: 2, max: 6, initial: 6 })
			}),

			// Extra skills (class-specific or acquired)
			extraSkills: new ArrayField(new SchemaField({
				id: new StringField({ required: true, blank: false }),
				target: new NumberField({ required: true, integer: true, min: 2, max: 6, initial: 6 })
			}), { initial: [] }),

			// Customize Skills optional rule (prevents auto-updating skill targets)
			customizeSkills: new BooleanField({ required: true, initial: false }),

			// Background (narrative, no mechanical effect)
			background: new SchemaField({
				profession: new StringField({ required: true, blank: true }),
				notes: new HTMLField({ required: true, blank: true })
			}),

			// Affiliation
			affiliation: new StringField({ required: true, blank: true }),

			// Birthday
			birthMonth: new StringField({
				required: true,
				blank: false,
				initial: "none",
				choices: ["none"].concat(CHOICE_KEYS.months)
			}),
			birthDay: new NumberField({ required: true, integer: true, min: 0, max: 31, initial: 0 }),

			// Moon Sign
			moonName: new StringField({
				required: true,
				blank: false,
				initial: "none",
				choices: ["none"].concat(CHOICE_KEYS.moonNames)
			}),
			moonPhase: new StringField({
				required: true,
				blank: false,
				initial: "none",
				choices: ["none"].concat(CHOICE_KEYS.moonPhases)
			}),

			// Languages
			languages: new ArrayField(new StringField({ blank: false }), { initial: ["woldish"] }),

			// Encumbrance
			encumbrance: new SchemaField({
				method: new StringField({
					required: true,
					blank: false,
					initial: "weight",
					choices: CHOICE_KEYS.encumbranceMethods
				}),
				current: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				max: new NumberField({ required: true, integer: true, min: 0, initial: 40 })
			}),

			// Coins
			coins: new SchemaField({
				copper: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				silver: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				gold: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				pellucidium: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
			}),

			// Creature type (relevant for spells/effects/etc.)
			creatureType: new StringField({
				required: true,
				blank: false,
				initial: "mortal",
				choices: CHOICE_KEYS.creatureTypes
			}),

			// Character details (appearance and personality)
			details: new SchemaField({
				head: new StringField({ required: true, blank: true }),
				demeanour: new StringField({ required: true, blank: true }),
				desires: new StringField({ required: true, blank: true }),
				face: new StringField({ required: true, blank: true }),
				dress: new StringField({ required: true, blank: true }),
				beliefs: new StringField({ required: true, blank: true }),
				body: new StringField({ required: true, blank: true }),
				speech: new StringField({ required: true, blank: true })
			}),

			// Physical characteristics
			physical: new SchemaField({
				unitSystem: new StringField({
					required: true,
					blank: false,
					initial: "imperial",
					choices: ["imperial", "metric"]
				}),
				age: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				lifespan: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				heightFeet: new StringField({ required: true, blank: true, initial: "0'0\"" }),
				heightCm: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				weightLbs: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				weightKg: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
			}),

			// Arcane Magic (Magician, Enchanter)
			arcaneMagic: new SchemaField({
				enabled: new BooleanField({ required: true, initial: false }),
				spellSlots: createArcaneSpellSlotsSchema(),
			}),

			// Holy Magic (Cleric, Friar)
			holyMagic: new SchemaField({
				enabled: new BooleanField({ required: true, initial: false }),
				spellSlots: createHolySpellSlotsSchema()
			}),

			// Fairy Magic (Enchanter, Elf, Grimalkin)
			fairyMagic: new SchemaField({
				enabled: new BooleanField({ required: true, initial: false }),
				glamoursMax: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
			}),

			// Mossling Knacks
			knacks: new SchemaField({
				enabled: new BooleanField({ required: true, initial: false }),
				type: new StringField({
					required: true,
					blank: false,
					initial: "birdFriend",
					choices: CHOICE_KEYS.knackTypes
				}),
				level: new NumberField({ required: true, integer: true, min: 0, max: 7, initial: 0 })
			}),

			// Fighter Combat Talents (selected at levels 2, 6, 10, 14)
			combatTalents: new ArrayField(new StringField({
				blank: false
			}), { initial: [] }),

			// Retainer loyalty score (2-12, default 7)
			loyalty: new NumberField({ required: true, initial: 7, min: 1, max: 12, integer: true }),

			// Cleric Holy Order (chosen at level 2)
			holyOrder: new StringField({
				required: true,
				blank: true,
				initial: ""
			}),

			// Custom adjustments for bonuses/penalties from equipment, traits, etc.
			adjustments: createAdjustmentsSchema(),

			// HP rolled per level (stores dice results for level up/down tracking)
			// Stored as: { '2': 5, '3': 3, '4': 6 } — key is level string, value is HP gained
			hpPerLevel: new foundry.data.fields.ObjectField({ initial: {} }),

			// Trait usage tracking for active traits with limited uses
			// Stored as: { 'longhornGaze': { used: 2, max: 3 }, 'shapeShiftWilder': { used: 1, max: 1 }, ... }
			traitUsage: new foundry.data.fields.ObjectField({
				initial: {}
			}),

			// Rune usage tracking keyed by item ID
			// Stored as: { 'itemId123': { used: 1, max: 2 }, ... }
			runeUsage: new foundry.data.fields.ObjectField({
				initial: {}
			}),

			// Knack ability usage tracking keyed by 'knackType_levelN'
			// Stored as: { 'birdFriend_level5': { used: 1 }, ... }
			knackUsage: new foundry.data.fields.ObjectField({
				initial: {}
			})
		}
	}
}

/**
 * Data model for Creature (monster/NPC) actors.
 */
export class CreatureDataModel extends ActorDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),

			// Monster type descriptor (Animal, Undead, Fairy, etc.)
			monsterType: new StringField({
				required: true,
				blank: false,
				initial: "mortal",
				choices: CHOICE_KEYS.monsterTypes
			}),

			// Intelligence level
			intelligence: new StringField({
				required: true,
				blank: false,
				initial: "animal",
				choices: CHOICE_KEYS.intelligenceTypes
			}),

			// HP dice (e.g., "2d8")
			hpDice: new StringField({ required: true, blank: false, initial: "1d8" }),

			// Structured attacks array
			attacks: new ArrayField(new SchemaField({
				numAttacks: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
				attackName: new StringField({ required: true, blank: false, initial: "Attack" }),
				attackBonus: new NumberField({ required: true, integer: true, initial: 0 }),
				attackDamage: new StringField({ required: true, blank: false, initial: "1d6" }),
				attackEffect: new StringField({ required: true, blank: true, initial: "" }),
				attackType: new StringField({
					required: true,
					blank: false,
					initial: "attack",
					choices: ["attack", "save"]
				}),
				rangeShort: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				rangeMedium: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				rangeLong: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
			}), { initial: [] }),

			// Morale (2-12, checked with 2d6)
			morale: new NumberField({ required: true, integer: true, min: 2, max: 12, initial: 7 }),

			// XP Award for defeating
			xpAward: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),

			// Number encountered (dice string, e.g., "1d6")
			encounters: new StringField({ required: true, blank: true, initial: "1d6" }),

			// Additional movement types
			movement: new SchemaField({
				swim: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				fly: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				climb: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				burrow: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
			}),
			// Lair percentage (chance creature is in lair)
			lairChance: new NumberField({ required: true, integer: true, min: 0, max: 100, initial: 0 }),

			// Treasure/Hoard type
			treasureType: new StringField({ required: true, blank: true }),

			// Notes tab fields
			behaviour: new StringField({ required: true, blank: true }),
			speech: new StringField({ required: true, blank: true }),
			possessions: new StringField({ required: true, blank: true }),

			// Special abilities (structured list)
			specialAbilities: new ArrayField(new SchemaField({
				name: new StringField({ required: true, blank: false, initial: "Ability" }),
				description: new StringField({ required: true, blank: true, initial: "" })
			}), { initial: [] }),

			// Codex link UUID
			codexUuid: new StringField({ required: false, blank: true, initial: "" }),

			// Retainer loyalty score (2-12, default 7)
			loyalty: new NumberField({ required: false, integer: true, min: 1, max: 12 }),

		}
	}
}

/**
 * Data model for Trait actors.
 * Represents kindred, class, or kindred-class abilities that can be dragged to character sheets.
 */
export class TraitDataModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// Trait category: active, passive, info, or restrictions
			category: new StringField({
				required: true,
				blank: false,
				initial: "active",
				choices: ["active", "passive", "info", "restrictions"]
			}),

			// Source type: kindred, class, or kindredClass
			sourceType: new StringField({
				required: true,
				blank: false,
				initial: "kindred",
				choices: ["kindred", "class", "kindredClass"]
			}),

			// Source identifier (e.g., "grimalkin", "fighter", "elf")
			sourceId: new StringField({
				required: true,
				blank: false,
				initial: ""
			}),

			// Whether this trait can be rolled (has dice mechanics)
			rollable: new BooleanField({ required: true, initial: false }),

			// Roll formula (e.g., "2d6", "3d4")
			rollFormula: new StringField({ required: true, blank: true, initial: "" }),

			// Static value to display (e.g., "+2", "+1")
			value: new StringField({ required: true, blank: true, initial: "" }),
			
			// Minimum level required to use this trait (0 = no requirement)
			minLevel: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

			// Whether this trait has level-scaling values
			levelScaling: new BooleanField({ required: true, initial: false }),

			// Level scaling table (JSON string for complex scaling)
			scalingTable: new StringField({ required: true, blank: true, initial: "" }),

			// Full description of the trait
			description: new HTMLField({ required: true, blank: true })
		}
	}
}

/* -------------------------------------------- */
/*  Item Models                                 */
/* -------------------------------------------- */

export class ItemDataModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			codexUuid: new StringField({
				required: false,
				blank: true,
				initial: ""
			})
		}
	}
}

export class GearDataModel extends ItemDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			cost: new NumberField({
				required: true,
				integer: true,
				min: 0,
				initial: 0 }),
			costDenomination: new StringField({
				required: true,
				initial: 'gp',
				choices: CHOICE_KEYS.costDenominations
			}),
			stackSize: new NumberField({
				required: true,
				integer: true,
				min: 1,
				initial: 1 }),
			weightSlots: new NumberField({
				required: true,
				min: 0,
				initial: 0 }),
			weightCoins: new NumberField({
				required: true,
				min: 0,
				initial: 0 }),
			equipped: new foundry.data.fields.BooleanField({
				required: true,
				initial: false
			}),
			quantity: new NumberField({
				required: true,
				integer: true,
				min: 1,
				initial: 1 }),
			notes: new StringField({
				required: true,
				blank: true,
				initial: ""
			})
		}
	}
}

export class TreasureDataModel extends GearDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			effects: new StringField({
				required: true,
				blank: true,
				initial: ""
			})
		}
	}
}

export class WeaponDataModel extends GearDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			damage: new StringField({
				required: true,
				blank: false,
				initial: "1d6"
			}),
			weaponType: new StringField({
				required: false,
				blank: true,
				initial: "",
				choices: CHOICE_KEYS.weaponTypes
			}),
			size: new StringField({
				required: true,
				blank: false,
				initial: "medium",
				choices: CHOICE_KEYS.sizes
			}),
			qualities: new ArrayField(
				new StringField({ 
					blank: false, 
					choices: CHOICE_KEYS.weaponQualities
				}), 
				{ initial: ["melee"] }),
			rangeShort: new NumberField({ 
				required: false, 
				integer: true,
				min: 0,
				initial: 0
			}),
			rangeMedium: new NumberField({ 
				required: false, 
				integer: true,
				min: 0,
				initial: 0
			}),
			rangeLong: new NumberField({ 
				required: false, 
				integer: true,
				min: 0,
				initial: 0
			})
		}
	}
}

export class ArmorDataModel extends GearDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			bulk: new StringField({
				required: true,
				blank: false,
				initial: "light",
				choices: CHOICE_KEYS.armorBulks
			}),
			ac: new NumberField({ 
				required: true, 
				integer: true,
				initial: 10
			}),
			fit: new StringField({
				required: true,
				blank: false,
				initial: "medium",
				choices: CHOICE_KEYS.sizes
			}),
			armorType: new StringField({
				required: true,
				blank: false,
				initial: "armor",
				choices: CHOICE_KEYS.armorTypes
			}),
		}
	}
}

export class ForagedDataModel extends GearDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			type: new StringField({
				required: true,
				blank: false,
				initial: "plant",
				choices: CHOICE_KEYS.foragedTypes
			}),
			availability: new NumberField({
				required: true,
				integer: true,
				initial: 6,
				min: 1,
				max: 6
			}),
			effects: new StringField({
				required: true,
				blank: true,
				initial: ""
			})
		}
	}
}

export class SpellDataModel extends ItemDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			// Spell rank (1-6 for arcane spells)
			rank: new NumberField({
				required: true,
				integer: true,
				min: 1,
				max: 6,
				initial: 1
			}),
			range: new StringField({ required: true, blank: true, initial: "" }),
			duration: new StringField({ required: true, blank: true, initial: "" }),
			description: new StringField({ required: true, blank: true, initial: "" })
		}
	}
}

export class HolySpellDataModel extends SpellDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			// Holy spell rank (1-5)
			rank: new NumberField({
				required: true,
				integer: true,
				min: 1,
				max: 5,
				initial: 1
			}),
			prayerName: new StringField({ required: true, blank: true, initial: "" })
		}
	}
}

export class GlamourDataModel extends ItemDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			range: new StringField({ required: true, blank: true, initial: "" }),
			duration: new StringField({ required: true, blank: true, initial: "" }),
			usageFrequency: new StringField({ required: true, blank: true, initial: "" }),
			description: new StringField({ required: true, blank: true, initial: "" })
		}
	}
}

export class RuneDataModel extends ItemDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			magnitude: new StringField({
				required: true,
				blank: false,
				initial: "lesser",
				choices: CHOICE_KEYS.runeMagnitudes
			}),
			description: new StringField({ required: true, blank: true, initial: "" })
		}
	}
}

/**
 * Data model for Kindred items.
 * Stores racial data (size, creature type, formulas, languages, traits).
 */
export class KindredDataModel extends ItemDataModel {
	static defineSchema() {
		const { ObjectField } = foundry.data.fields
		return {
			...super.defineSchema(),
			// Unique identifier for this kindred (e.g., "grimalkin", "human")
			kindredId: new StringField({ required: true, blank: true, initial: "" }),
			// Size category
			size: new StringField({
				required: true,
				blank: false,
				initial: "medium",
				choices: CHOICE_KEYS.sizes
			}),
			// Creature type (mortal, demi-fey, fairy)
			creatureType: new StringField({
				required: true,
				blank: false,
				initial: "mortal",
				choices: CHOICE_KEYS.creatureTypes
			}),
			// Roll formulas for character generation
			ageFormula: new StringField({ required: true, blank: false, initial: "15 + 2d10" }),
			lifespanFormula: new StringField({ required: true, blank: false, initial: "50 + 2d20" }),
			heightFormula: new StringField({ required: true, blank: false, initial: "64 + 2d6" }),
			weightFormula: new StringField({ required: true, blank: false, initial: "120 + 6d10" }),
			// Whether this kindred has fur (affects body/fur label in details)
			hasFur: new BooleanField({ required: true, initial: false }),
			// Native languages
			languages: new ArrayField(new StringField({ blank: false }), { initial: ["woldish"] }),
			// Name roll groups for data-driven name generation
			nameRollGroups: new ArrayField(new ObjectField(), { initial: [] }),
			// Trait definitions stored as JSON object
			traits: new ObjectField({ initial: {} })
		}
	}
}

/**
 * Data model for Class items.
 * Stores class data (XP, HD, spells, traits).
 */
export class ClassDataModel extends ItemDataModel {
	static defineSchema() {
		const { ObjectField } = foundry.data.fields
		return {
			...super.defineSchema(),
			// Unique identifier for this class (e.g., "fighter", "magician")
			classId: new StringField({ required: true, blank: true, initial: "" }),
			// If this is a kindred-class (elf, grimalkin, etc.), store the required kindred ID
			requiredKindred: new StringField({ required: true, blank: true, initial: "" }),
			// Prime abilities for XP modifier
			primeAbilities: new ArrayField(new StringField({
				blank: false,
				choices: ['strength', 'intelligence', 'wisdom', 'dexterity', 'constitution', 'charisma']
			}), { initial: [] }),
			// Hit dice configuration
			hitDice: new SchemaField({
				die: new StringField({ required: true, blank: false, initial: "1d6" }),
				flat: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
			}),
			// Weapons proficiency (array of special tags and/or individual weapon type IDs)
			weaponsProficiency: new ArrayField(new StringField(), { initial: [] }),
			// Armor proficiency (array of bulk types and/or 'shields')
			armorProficiency: new ArrayField(new StringField(), { initial: [] }),
			// Class skills (automatically granted extra skills)
			classSkills: new ArrayField(new StringField(), { initial: [] }),
			// XP thresholds per level (index 0-15, where 0 and 1 are unused)
			xpThresholds: new ArrayField(new NumberField({ integer: true, min: 0 }), {
				initial: [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000]
			}),
			// Attack bonus progression by level (indices 1-15)
			attackProgression: new ArrayField(new NumberField({ integer: true, min: 0 }), {
				initial: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]
			}),
			// Saving throw progressions by level (indices 1-15)
			saveProgressions: new SchemaField({
				doom: new ArrayField(new NumberField({ integer: true, min: 2, max: 19 }), {
					initial: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6]
				}),
				ray: new ArrayField(new NumberField({ integer: true, min: 2, max: 19 }), {
					initial: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
				}),
				hold: new ArrayField(new NumberField({ integer: true, min: 2, max: 19 }), {
					initial: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6]
				}),
				blast: new ArrayField(new NumberField({ integer: true, min: 2, max: 19 }), {
					initial: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
				}),
				spell: new ArrayField(new NumberField({ integer: true, min: 2, max: 19 }), {
					initial: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
				})
			}),
			// Spell slot progression (array of arrays: [[rank1, rank2, ...], ...])
			spellProgression: new ArrayField(
				new ArrayField(new NumberField({ integer: true, min: 0 })),
				{ initial: [] }
			),
			// Skill target progressions by level (indices 0-15, where 0 is unused)
			// Each skill array contains target values that improve (decrease) with level
			skillProgressions: new SchemaField({
				// Base skills
				listen: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				search: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				survival: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				// Extra skills
				detectMagic: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				alertness: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				stalking: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				tracking: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				pickLock: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				stealth: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				decipherDocument: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				climbWall: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				disarmMechanism: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				legerdemain: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				}),
				monsterLore: new ArrayField(new NumberField({ integer: true, min: 2, max: 6 }), {
					initial: []
				})
			}),
			// Spell type (none, arcane, holy)
			spellType: new StringField({
				required: true,
				blank: false,
				initial: "none",
				choices: ['none', 'arcane', 'holy']
			}),
			// Combat aptitude
			combatAptitude: new StringField({
				required: true,
				blank: false,
				initial: "non-martial",
				choices: ['martial', 'semi-martial', 'non-martial']
			}),
			// Class features flags
			canTwoWeaponFight: new BooleanField({ required: true, initial: false }),
			hasBackstab: new BooleanField({ required: true, initial: false }),
			// Expertise points for skill customization
			skillPointsBase: new NumberField({ required: true, initial: 0, integer: true, min: 0 }),
			skillPointsPerLevel: new NumberField({ required: true, initial: 0, integer: true, min: 0 }),
			// Trait definitions stored as JSON object
			traits: new ObjectField({ initial: {} })
		}
	}
}
