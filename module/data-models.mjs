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
		xpModifier: createAdjustmentField()
	})
}

/**
 * Create a spell slot field for a single rank.
 * @returns {SchemaField} Spell slot schema with max, used, and memorized values
 */
function createSpellSlotField(rank) {
	return new SchemaField({
		max: new NumberField({ required: true, integer: true, min: 0, initial: rank }),
		used: new NumberField({ required: true, integer: true, min: 0, initial: rank }),
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
		rank1: createSpellSlotField(5),
		rank2: createSpellSlotField(4),
		rank3: createSpellSlotField(4),
		rank4: createSpellSlotField(3),
		rank5: createSpellSlotField(3),
		rank6: createSpellSlotField(3)
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

			// Attack bonus
			attack: new NumberField({ required: true, integer: true, initial: 0 }),

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

		// Derive creature type from kindred
		this.creatureType = AdventurerDataModel.getCreatureTypeForKindred(this.kindred)

		// Enable/disable magic types based on class and kindred
		const arcaneCasters = ['magician', 'enchanter']
		const holyCasters = ['cleric', 'friar']
		const fairyCasters = ['enchanter']
		const fairyKindreds = ['elf', 'grimalkin']

		this.arcaneMagic.enabled = arcaneCasters.includes(this.class)
		this.holyMagic.enabled = holyCasters.includes(this.class)
		this.fairyMagic.enabled = fairyCasters.includes(this.class) || fairyKindreds.includes(this.kindred)
		this.knacks.enabled = this.kindred === 'mossling'

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
			
			// Ability Scores (3-18, with modifiers)
			abilities: createAbilitiesSchema(),

			// Kindred (race)
			kindred: new StringField({
				required: true,
				blank: false,
				initial: "human",
				choices: CHOICE_KEYS.kindreds
			}),

			// Class
			class: new StringField({
				required: true,
				blank: false,
				initial: "fighter",
				choices: CHOICE_KEYS.classes.concat(CHOICE_KEYS.kindredClasses)
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
				blank: false,
				choices: CHOICE_KEYS.combatTalents
			}), { initial: [] }),

			// Cleric Holy Order (chosen at level 2)
			holyOrder: new StringField({
				required: true,
				blank: true,
				initial: "",
				choices: [""].concat(CHOICE_KEYS.holyOrders)
			}),

			// Custom adjustments for bonuses/penalties from equipment, traits, etc.
			adjustments: createAdjustmentsSchema(),

			// Trait usage tracking for active traits with limited uses
			// Stored as: { 'longhornGaze': { used: 2, max: 3 }, 'shapeShiftWilder': { used: 1, max: 1 }, ... }
			traitUsage: new foundry.data.fields.ObjectField({
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

			// Intelligence level
			intelligence: new StringField({
				required: true,
				blank: false,
				initial: "animal",
				choices: CHOICE_KEYS.intelligenceTypes
			}),

			// HP dice (e.g., "2d8")
			hpDice: new StringField({ required: true, blank: false, initial: "1d8" }),

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

			// Description / lore
			description: new HTMLField({ required: true, blank: true }),

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
			cost: new NumberField({
				required: true,
				integer: true,
				min: 0,
				initial: 0 }),
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

export class TreasureDataModel extends ItemDataModel {}

export class WeaponDataModel extends ItemDataModel {
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

export class ArmorDataModel extends ItemDataModel {
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
		}
	}
}

export class ForagedDataModel extends ItemDataModel {
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
			})
		}
	}
}

export class SpellDataModel extends ItemDataModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			type: new StringField({
				required: true,
				blank: false,
				initial: "glamour",
				choices: CHOICE_KEYS.spellTypes
			}),
			// Spell rank (1-6 for arcane, 1-5 for holy)
			rank: new NumberField({
				required: true,
				integer: true,
				min: 1,
				max: 6,
				initial: 1
			}),
			// Rune magnitude (for fairy runes)
			magnitude: new StringField({
				required: true,
				blank: false,
				initial: "lesser",
				choices: CHOICE_KEYS.runeMagnitudes
			}),
			// Spell description/effect
			description: new HTMLField({ required: true, blank: true })
		}
	}
}
