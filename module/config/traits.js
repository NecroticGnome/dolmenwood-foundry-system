/**
 * Trait definitions for Dolmenwood kindreds, classes, and kindred-classes.
 * Traits are computed at render time based on character's kindred and class.
 *
 * Trait Types:
 * - 'active': Usable abilities with optional usage tracking and roll buttons
 * - 'adjustment': Modify stats (static, info-only, or roll-option)
 * - 'sizeRestriction': Warn on incompatible equipment (hidden from trait tab)
 * - 'alignmentRestriction': Filter alignment dropdown (hidden from trait tab)
 * - 'info': Descriptive/informational traits
 *
 * Adjustment Types (for traitType: 'adjustment'):
 * - 'static': Always applied automatically to the stat
 * - 'info': Manual reminder (e.g., "remember +1 vs cold iron")
 * - 'rollOption': Shows as checkbox option when rolling
 */

/**
 * Valid adjustment targets for trait adjustments.
 * Maps path strings to localization keys.
 */
export const ADJUSTMENT_TARGETS = {
	// Ability scores
	'abilities.strength.score': 'DOLMEN.Abilities.Strength',
	'abilities.strength.mod': 'DOLMEN.Abilities.StrengthMod',
	'abilities.intelligence.score': 'DOLMEN.Abilities.Intelligence',
	'abilities.intelligence.mod': 'DOLMEN.Abilities.IntelligenceMod',
	'abilities.wisdom.score': 'DOLMEN.Abilities.Wisdom',
	'abilities.wisdom.mod': 'DOLMEN.Abilities.WisdomMod',
	'abilities.dexterity.score': 'DOLMEN.Abilities.Dexterity',
	'abilities.dexterity.mod': 'DOLMEN.Abilities.DexterityMod',
	'abilities.constitution.score': 'DOLMEN.Abilities.Constitution',
	'abilities.constitution.mod': 'DOLMEN.Abilities.ConstitutionMod',
	'abilities.charisma.score': 'DOLMEN.Abilities.Charisma',
	'abilities.charisma.mod': 'DOLMEN.Abilities.CharismaMod',
	// Saves
	'saves.doom': 'DOLMEN.Saves.Doom',
	'saves.ray': 'DOLMEN.Saves.Ray',
	'saves.hold': 'DOLMEN.Saves.Hold',
	'saves.blast': 'DOLMEN.Saves.Blast',
	'saves.spell': 'DOLMEN.Saves.Spell',
	// Combat
	'ac': 'DOLMEN.Combat.AC',
	'attack': 'DOLMEN.Combat.Attack',
	'attack.melee': 'DOLMEN.Combat.AttackMelee',
	'attack.missile': 'DOLMEN.Combat.AttackMissile',
	'hp.max': 'DOLMEN.Combat.HP',
	// Other
	'magicResistance': 'DOLMEN.MagicResistance',
	'speed': 'DOLMEN.Movement.Speed',
	// Skills
	'skills.listen': 'DOLMEN.Skills.Listen',
	'skills.search': 'DOLMEN.Skills.Search',
	'skills.survival': 'DOLMEN.Skills.Survival'
}

/**
 * Kindred traits - standard racial abilities.
 * Categories: active (requires action), passive (always-on), info (descriptive)
 */
export const KINDRED_TRAITS = {
	breggle: {
		active: [
			{
				id: 'longhornGaze',
				nameKey: 'DOLMEN.Traits.LonghornGaze',
				descKey: 'DOLMEN.Traits.LonghornGazeDesc',
				traitType: 'active',
				minLevel: 4,
				getMaxUses: (level) => level >= 10 ? 4 : level >= 8 ? 3 : level >= 6 ? 2 : 1,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			},
			{
				id: 'hornAttack',
				nameKey: 'DOLMEN.Traits.HornAttack',
				descKey: 'DOLMEN.Traits.HornAttackDesc',
				traitType: 'active',
				rollable: true,
				getDamage: (level) => level >= 10 ? '1d6+2' : level >= 9 ? '1d6+1' : level >= 6 ? '1d6' : level >= 3 ? '1d4+1' : '1d4'
			}
		],
		passive: [
			{
				id: 'furDefense',
				nameKey: 'DOLMEN.Traits.FurDefense',
				descKey: 'DOLMEN.Traits.FurDefenseDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: 1,
				// Only applies when not wearing medium/heavy armor (bulk >= 2)
				requiresNoHeavyArmor: true,
				hideFromTraitTab: false
			}
		],
		info: [
			{
				id: 'hornLength',
				nameKey: 'DOLMEN.Traits.HornLength',
				descKey: 'DOLMEN.Traits.HornLengthDesc',
				traitType: 'info',
				getValue: (actor, level) => {
					const hornLengths = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16]
					const index = Math.min(level - 1, 9)
					const inches = hornLengths[index]
					const isMetric = actor.system?.physical?.unitSystem === 'metric'
					if (isMetric) {
						const cm = inches * 2.5
						return cm + ' cm'
					}
					return inches + '"'
				}
			}
		]
	},

	elf: {
		passive: [
			{
				id: 'unearthlyBeauty',
				nameKey: 'DOLMEN.Traits.UnearthlyBeauty',
				descKey: 'DOLMEN.Traits.UnearthlyBeautyDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'abilities.charisma',
				adjustmentValue: 2
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSenses',
				descKey: 'DOLMEN.Traits.KeenSensesDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen', 'skills.search'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'magicResistance',
				nameKey: 'DOLMEN.Traits.MagicResistance',
				descKey: 'DOLMEN.Traits.MagicResistanceDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'magicResistance',
				adjustmentValue: 2
			}
		]
	},

	grimalkin: {
		active: [
			{
				id: 'shapeShiftChester',
				nameKey: 'DOLMEN.Traits.ShapeShiftChester',
				descKey: 'DOLMEN.Traits.ShapeShiftChesterDesc',
				traitType: 'active'
			},
			{
				id: 'shapeShiftWilder',
				nameKey: 'DOLMEN.Traits.ShapeShiftWilder',
				descKey: 'DOLMEN.Traits.ShapeShiftWilderDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			},
			{
				id: 'healRodent',
				nameKey: 'DOLMEN.Traits.HealRodent',
				descKey: 'DOLMEN.Traits.HealRodentDesc',
				traitType: 'active'
			}
		],
		passive: [
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'magicResistance',
				nameKey: 'DOLMEN.Traits.MagicResistance',
				descKey: 'DOLMEN.Traits.MagicResistanceDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'magicResistance',
				adjustmentValue: 2
			}
		]
	},

	human: {
		passive: [
			{
				id: 'decisiveness',
				nameKey: 'DOLMEN.Traits.Decisiveness',
				descKey: 'DOLMEN.Traits.DecisivenessDesc',
				traitType: 'info'
			},
			{
				id: 'leadership',
				nameKey: 'DOLMEN.Traits.Leadership',
				descKey: 'DOLMEN.Traits.LeadershipDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'spirited',
				nameKey: 'DOLMEN.Traits.Spirited',
				descKey: 'DOLMEN.Traits.SpiritedDesc',
				traitType: 'info'
			}
		]
	},

	mossling: {
		passive: [
			{
				id: 'resilience',
				nameKey: 'DOLMEN.Traits.Resilience',
				descKey: 'DOLMEN.Traits.ResilienceDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 1
			},
			{
				id: 'keenSurvival',
				nameKey: 'DOLMEN.Traits.KeenSurvival',
				descKey: 'DOLMEN.Traits.KeenSurvivalDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.survival'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'symbioticFlesh',
				nameKey: 'DOLMEN.Traits.SymbioticFlesh',
				descKey: 'DOLMEN.Traits.SymbioticFleshDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	},

	woodgrue: {
		active: [
			{
				id: 'enchantedMelody',
				nameKey: 'DOLMEN.Traits.EnchantedMelody',
				descKey: 'DOLMEN.Traits.EnchantedMelodyDesc',
				traitType: 'active',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'fairyResistance',
				nameKey: 'DOLMEN.Traits.FairyResistance',
				descKey: 'DOLMEN.Traits.FairyResistanceDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'moonSight',
				nameKey: 'DOLMEN.Traits.MoonSight',
				descKey: 'DOLMEN.Traits.MoonSightDesc',
				traitType: 'info'
			},
			{
				id: 'instrumentsAsWeapons',
				nameKey: 'DOLMEN.Traits.InstrumentsAsWeapons',
				descKey: 'DOLMEN.Traits.InstrumentsAsWeaponsDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	}
}

/**
 * Class traits - abilities from character class.
 * Categories: active (requires action), passive (always-on), info (descriptive), restrictions (limitations)
 */
export const CLASS_TRAITS = {
	bard: {
		active: [
			{
				id: 'counterCharm',
				nameKey: 'DOLMEN.Traits.CounterCharm',
				descKey: 'DOLMEN.Traits.CounterCharmDesc',
				traitType: 'active'
			},
			{
				id: 'enchantment',
				nameKey: 'DOLMEN.Traits.Enchantment',
				descKey: 'DOLMEN.Traits.EnchantmentDesc',
				traitType: 'active',
				getMaxUses: (level) => level,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			}
		],
		info: [
			{
				id: 'bardSkills',
				nameKey: 'DOLMEN.Traits.BardSkills',
				descKey: 'DOLMEN.Traits.BardSkillsDesc',
				traitType: 'info'
			}
		]
	},

	cleric: {
		active: [
			{
				id: 'turnUndead',
				nameKey: 'DOLMEN.Traits.TurnUndead',
				descKey: 'DOLMEN.Traits.TurnUndeadDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6'
			},
			{
				id: 'detectHolyMagic',
				nameKey: 'DOLMEN.Traits.DetectHolyMagic',
				descKey: 'DOLMEN.Traits.DetectHolyMagicDesc',
				traitType: 'active'
			},
			{
				id: 'orderPower',
				nameKey: 'DOLMEN.Traits.OrderPower',
				descKey: '',
				traitType: 'active',
				requiresSelection: 'holyOrder',
				minLevel: 2
			}
		],
		restrictions: [
			{
				id: 'clericTenets',
				nameKey: 'DOLMEN.Traits.ClericTenets',
				descKey: 'DOLMEN.Traits.ClericTenetsDesc',
				traitType: 'info'
			},
			{
				id: 'noMagicEquipment',
				nameKey: 'DOLMEN.Traits.NoMagicEquipment',
				descKey: 'DOLMEN.Traits.NoMagicEquipmentDesc',
				traitType: 'info'
			}
		]
	},

	enchanter: {
		passive: [
			{
				id: 'holySpellFailure',
				nameKey: 'DOLMEN.Traits.HolySpellFailure',
				descKey: 'DOLMEN.Traits.HolySpellFailureDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 2
			}
		]
	},

	fighter: {
		active: [
			{
				id: 'combatTalents',
				nameKey: 'DOLMEN.Traits.CombatTalents',
				descKey: 'DOLMEN.Traits.CombatTalentsDesc',
				traitType: 'active',
				requiresSelection: 'combatTalents'
			}
		]
	},

	friar: {
		active: [
			{
				id: 'turnUndead',
				nameKey: 'DOLMEN.Traits.TurnUndead',
				descKey: 'DOLMEN.Traits.TurnUndeadDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6'
			}
		],
		passive: [
			{
				id: 'armorOfFaith',
				nameKey: 'DOLMEN.Traits.ArmorOfFaith',
				descKey: 'DOLMEN.Traits.ArmorOfFaithDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: (level) => level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2,
				getValue: (actor, level) => level >= 13 ? "+5" : level >= 9 ? "+4" : level >= 5 ? "+3" : "+2"
			},
			{
				id: 'herbalism',
				nameKey: 'DOLMEN.Traits.Herbalism',
				descKey: 'DOLMEN.Traits.HerbalismDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'culinaryImplements',
				nameKey: 'DOLMEN.Traits.CulinaryImplements',
				descKey: 'DOLMEN.Traits.CulinaryImplementsDesc',
				traitType: 'info'
			},
			{
				id: 'forageSkill',
				nameKey: 'DOLMEN.Traits.ForageSkill',
				descKey: 'DOLMEN.Traits.ForageSkillDesc',
				traitType: 'info'
			}
		],
		restrictions: [
			{
				id: 'friarTenets',
				nameKey: 'DOLMEN.Traits.FriarTenets',
				descKey: 'DOLMEN.Traits.FriarTenetsDesc',
				traitType: 'info'
			},
			{
				id: 'povertyVows',
				nameKey: 'DOLMEN.Traits.PovertyVows',
				descKey: 'DOLMEN.Traits.PovertyVowsDesc',
				traitType: 'info'
			}
		]
	},

	hunter: {
		active: [
			{
				id: 'bindCompanion',
				nameKey: 'DOLMEN.Traits.BindCompanion',
				descKey: 'DOLMEN.Traits.BindCompanionDesc',
				traitType: 'active'
			},
			{
				id: 'trophies',
				nameKey: 'DOLMEN.Traits.Trophies',
				descKey: 'DOLMEN.Traits.TrophiesDesc',
				traitType: 'active'
			}
		],
		passive: [
			{
				id: 'wayfinding',
				nameKey: 'DOLMEN.Traits.Wayfinding',
				descKey: 'DOLMEN.Traits.WayfindingDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 3
			},
			{
				id: 'missileBonus',
				nameKey: 'DOLMEN.Traits.MissileBonus',
				descKey: 'DOLMEN.Traits.MissileBonusDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'attack.missile',
				adjustmentValue: 1
			}
		],
		info: [
			{
				id: 'hunterSkills',
				nameKey: 'DOLMEN.Traits.HunterSkills',
				descKey: 'DOLMEN.Traits.HunterSkillsDesc',
				traitType: 'info'
			}
		]
	},

	knight: {
		active: [
			{
				id: 'assessSteed',
				nameKey: 'DOLMEN.Traits.AssessSteed',
				descKey: 'DOLMEN.Traits.AssessSteedDesc',
				traitType: 'active'
			},
			{
				id: 'urgeSteed',
				nameKey: 'DOLMEN.Traits.UrgeSteed',
				descKey: 'DOLMEN.Traits.UrgeSteedDesc',
				traitType: 'active',
				minLevel: 5,
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'monsterSlayer',
				nameKey: 'DOLMEN.Traits.MonsterSlayer',
				descKey: 'DOLMEN.Traits.MonsterSlayerDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'attack',
				adjustmentValue: 2,
				minLevel: 5
			},
			{
				id: 'mountedCombat',
				nameKey: 'DOLMEN.Traits.MountedCombat',
				descKey: 'DOLMEN.Traits.MountedCombatDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'attack',
				adjustmentValue: 1
			},
			{
				id: 'strengthOfWill',
				nameKey: 'DOLMEN.Traits.StrengthOfWill',
				descKey: 'DOLMEN.Traits.StrengthOfWillDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 2
			}
		],
		info: [
			{
				id: 'hospitality',
				nameKey: 'DOLMEN.Traits.Hospitality',
				descKey: 'DOLMEN.Traits.HospitalityDesc',
				traitType: 'info',
				minLevel: 3
			}
		],
		restrictions: [
			{
				id: 'knightAlignment',
				nameKey: 'DOLMEN.Traits.KnightAlignment',
				descKey: 'DOLMEN.Traits.KnightAlignmentDesc',
				traitType: 'alignmentRestriction',
				allowedAlignments: ['lawful'],
				hideFromTraitTab: true
			},
			{
				id: 'liegeAlignment',
				nameKey: 'DOLMEN.Traits.LiegeAlignment',
				descKey: 'DOLMEN.Traits.LiegeAlignmentDesc',
				traitType: 'info'
			},
			{
				id: 'noMissile',
				nameKey: 'DOLMEN.Traits.NoMissile',
				descKey: 'DOLMEN.Traits.NoMissileDesc',
				traitType: 'info'
			},
			{
				id: 'noLightArmor',
				nameKey: 'DOLMEN.Traits.NoLightArmor',
				descKey: 'DOLMEN.Traits.NoLightArmorDesc',
				traitType: 'info'
			},
			{
				id: 'codeOfChivalry',
				nameKey: 'DOLMEN.Traits.CodeOfChivalry',
				descKey: 'DOLMEN.Traits.CodeOfChivalryDesc',
				traitType: 'info'
			}
		]
	},

	magician: {},

	thief: {
		active: [
			{
				id: 'backstab',
				nameKey: 'DOLMEN.Traits.Backstab',
				descKey: 'DOLMEN.Traits.BackstabDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '3d4'
			}
		],
		info: [
			{
				id: 'thiefSkills',
				nameKey: 'DOLMEN.Traits.ThiefSkills',
				descKey: 'DOLMEN.Traits.ThiefSkillsDesc',
				traitType: 'info'
			}
		]
	}
}

/**
 * Kindred-Class traits - for characters using a kindred as their class.
 * These replace both standard kindred traits AND class traits.
 */
export const KINDRED_CLASS_TRAITS = {
	breggle: {
		active: [
			{
				id: 'longhornGaze',
				nameKey: 'DOLMEN.Traits.LonghornGaze',
				descKey: 'DOLMEN.Traits.LonghornGazeDesc',
				traitType: 'active',
				minLevel: 4,
				getMaxUses: (level) => level >= 10 ? 4 : level >= 8 ? 3 : level >= 6 ? 2 : 1,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			},
			{
				id: 'hornAttack',
				nameKey: 'DOLMEN.Traits.HornAttack',
				descKey: 'DOLMEN.Traits.HornAttackDesc',
				traitType: 'active',
				rollable: true,
				getDamage: (level) => level >= 10 ? '1d6+2' : level >= 9 ? '1d6+1' : level >= 6 ? '1d6' : level >= 3 ? '1d4+1' : '1d4'
			}
		],
		passive: [
			{
				id: 'furDefense',
				nameKey: 'DOLMEN.Traits.FurDefense',
				descKey: 'DOLMEN.Traits.FurDefenseDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: 1,
				// Only applies when not wearing medium/heavy armor (bulk >= 2)
				requiresNoHeavyArmor: true,
				hideFromTraitTab: false
			}
		],
		info: [
			{
				id: 'hornLength',
				nameKey: 'DOLMEN.Traits.HornLength',
				descKey: 'DOLMEN.Traits.HornLengthDesc',
				traitType: 'info',
				getValue: (actor, level) => {
					const hornLengths = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16]
					const index = Math.min(level - 1, 9)
					const inches = hornLengths[index]
					const isMetric = actor.system?.physical?.unitSystem === 'metric'
					if (isMetric) {
						const cm = Math.round(inches * 2.54)
						return cm + ' cm'
					}
					return inches + '"'
				}
			}
		]
	},

	elf: {
		passive: [
			{
				id: 'unearthlyBeauty',
				nameKey: 'DOLMEN.Traits.UnearthlyBeauty',
				descKey: 'DOLMEN.Traits.UnearthlyBeautyDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'abilities.charisma',
				adjustmentValue: 2
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'holySpellFailure',
				nameKey: 'DOLMEN.Traits.HolySpellFailure',
				descKey: 'DOLMEN.Traits.HolySpellFailureDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 2
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSenses',
				descKey: 'DOLMEN.Traits.KeenSensesDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen', 'skills.search'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			}
		]
	},

	grimalkin: {
		active: [
			{
				id: 'shapeShiftChester',
				nameKey: 'DOLMEN.Traits.ShapeShiftChester',
				descKey: 'DOLMEN.Traits.ShapeShiftChesterDesc',
				traitType: 'active'
			},
			{
				id: 'shapeShiftWilder',
				nameKey: 'DOLMEN.Traits.ShapeShiftWilder',
				descKey: 'DOLMEN.Traits.ShapeShiftWilderDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			},
			{
				id: 'furBall',
				nameKey: 'DOLMEN.Traits.FurBall',
				descKey: 'DOLMEN.Traits.FurBallDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				maxUses: 3,
				usageFrequency: 'DOLMEN.Traits.ThreePerDay'
			}
		],
		passive: [
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			},
			{
				id: 'lockPickingSkill',
				nameKey: 'DOLMEN.Traits.LockPickingSkill',
				descKey: 'DOLMEN.Traits.LockPickingSkillDesc',
				traitType: 'info'
			}
		]
	},

	mossling: {
		passive: [
			{
				id: 'resilience',
				nameKey: 'DOLMEN.Traits.Resilience',
				descKey: 'DOLMEN.Traits.ResilienceDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 1
			},
			{
				id: 'keenSurvival',
				nameKey: 'DOLMEN.Traits.KeenSurvival',
				descKey: 'DOLMEN.Traits.KeenSurvivalDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.survival'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'symbioticFlesh',
				nameKey: 'DOLMEN.Traits.SymbioticFlesh',
				descKey: 'DOLMEN.Traits.SymbioticFleshDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	},

	woodgrue: {
		active: [
			{
				id: 'enchantedMelody',
				nameKey: 'DOLMEN.Traits.EnchantedMelody',
				descKey: 'DOLMEN.Traits.EnchantedMelodyDesc',
				traitType: 'active',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'fairyResistance',
				nameKey: 'DOLMEN.Traits.FairyResistance',
				descKey: 'DOLMEN.Traits.FairyResistanceDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'moonSight',
				nameKey: 'DOLMEN.Traits.MoonSight',
				descKey: 'DOLMEN.Traits.MoonSightDesc',
				traitType: 'info'
			},
			{
				id: 'instrumentsAsWeapons',
				nameKey: 'DOLMEN.Traits.InstrumentsAsWeapons',
				descKey: 'DOLMEN.Traits.InstrumentsAsWeaponsDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	}
}

/**
 * Combat talent definitions for Fighter class.
 */
export const COMBAT_TALENTS = {
	battleRage: {
		nameKey: 'DOLMEN.Traits.Talents.BattleRage',
		descKey: 'DOLMEN.Traits.Talents.BattleRageDesc'
	},
	cleave: {
		nameKey: 'DOLMEN.Traits.Talents.Cleave',
		descKey: 'DOLMEN.Traits.Talents.CleaveDesc'
	},
	defender: {
		nameKey: 'DOLMEN.Traits.Talents.Defender',
		descKey: 'DOLMEN.Traits.Talents.DefenderDesc'
	},
	lastStand: {
		nameKey: 'DOLMEN.Traits.Talents.LastStand',
		descKey: 'DOLMEN.Traits.Talents.LastStandDesc'
	},
	leader: {
		nameKey: 'DOLMEN.Traits.Talents.Leader',
		descKey: 'DOLMEN.Traits.Talents.LeaderDesc'
	},
	mainGauche: {
		nameKey: 'DOLMEN.Traits.Talents.MainGauche',
		descKey: 'DOLMEN.Traits.Talents.MainGaucheDesc'
	},
	slayer: {
		nameKey: 'DOLMEN.Traits.Talents.Slayer',
		descKey: 'DOLMEN.Traits.Talents.SlayerDesc'
	},
	weaponSpecialist: {
		nameKey: 'DOLMEN.Traits.Talents.WeaponSpecialist',
		descKey: 'DOLMEN.Traits.Talents.WeaponSpecialistDesc'
	}
}

/**
 * Holy order definitions for Cleric class.
 */
export const HOLY_ORDERS = {
	stFaxis: {
		nameKey: 'DOLMEN.Traits.Orders.stFaxis',
		descKey: 'DOLMEN.Traits.Orders.stFaxisDesc'
	},
	stSedge: {
		nameKey: 'DOLMEN.Traits.Orders.stSedge',
		descKey: 'DOLMEN.Traits.Orders.stSedgeDesc'
	},
	stSignis: {
		nameKey: 'DOLMEN.Traits.Orders.stSignis',
		descKey: 'DOLMEN.Traits.Orders.stSignisDesc'
	}
}

/**
 * List of kindred names that can also be used as classes.
 */
export const KINDRED_CLASS_NAMES = ['breggle', 'elf', 'grimalkin', 'mossling', 'woodgrue']
