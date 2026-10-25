/* global game */

/**
 * Effect field mapping configuration.
 * Maps group keys to their available fields for the effects system.
 * Each group+field resolves to a path under system.adjustments.*
 */

const EFFECT_FIELDS = {
	abilities: {
		label: 'DOLMEN.Effects.Groups.Abilities',
		fields: {
			'abilities.strength.score': 'DOLMEN.Effects.Fields.StrengthScore',
			'abilities.strength.mod': 'DOLMEN.Effects.Fields.StrengthMod',
			'abilities.intelligence.score': 'DOLMEN.Effects.Fields.IntelligenceScore',
			'abilities.intelligence.mod': 'DOLMEN.Effects.Fields.IntelligenceMod',
			'abilities.wisdom.score': 'DOLMEN.Effects.Fields.WisdomScore',
			'abilities.wisdom.mod': 'DOLMEN.Effects.Fields.WisdomMod',
			'abilities.dexterity.score': 'DOLMEN.Effects.Fields.DexterityScore',
			'abilities.dexterity.mod': 'DOLMEN.Effects.Fields.DexterityMod',
			'abilities.constitution.score': 'DOLMEN.Effects.Fields.ConstitutionScore',
			'abilities.constitution.mod': 'DOLMEN.Effects.Fields.ConstitutionMod',
			'abilities.charisma.score': 'DOLMEN.Effects.Fields.CharismaScore',
			'abilities.charisma.mod': 'DOLMEN.Effects.Fields.CharismaMod'
		}
	},
	saves: {
		label: 'DOLMEN.Effects.Groups.Saves',
		fields: {
			'saves.all': 'DOLMEN.Effects.Fields.SaveAll',
			'saves.doom': 'DOLMEN.Effects.Fields.SaveDoom',
			'saves.ray': 'DOLMEN.Effects.Fields.SaveRay',
			'saves.hold': 'DOLMEN.Effects.Fields.SaveHold',
			'saves.blast': 'DOLMEN.Effects.Fields.SaveBlast',
			'saves.spell': 'DOLMEN.Effects.Fields.SaveSpell',
			'magicResistance': 'DOLMEN.Effects.Fields.MagicResistance'
		}
	},
	combat: {
		label: 'DOLMEN.Effects.Groups.Combat',
		fields: {
			'hp.max': 'DOLMEN.Effects.Fields.HPMax',
			'ac': 'DOLMEN.Effects.Fields.AC',
			'attack': 'DOLMEN.Effects.Fields.Attack',
			'attackMelee': 'DOLMEN.Effects.Fields.AttackMelee',
			'attackMissile': 'DOLMEN.Effects.Fields.AttackMissile',
			'attackType': 'DOLMEN.Effects.Fields.AttackType',
			'damage': 'DOLMEN.Effects.Fields.Damage',
			'damageMelee': 'DOLMEN.Effects.Fields.DamageMelee',
			'damageMissile': 'DOLMEN.Effects.Fields.DamageMissile',
			'damageType': 'DOLMEN.Effects.Fields.DamageType'
		}
	},
	movement: {
		label: 'DOLMEN.Effects.Groups.Movement',
		fields: {
			'speed': 'DOLMEN.Effects.Fields.Speed',
			'movement.exploring': 'DOLMEN.Effects.Fields.MovementExploring',
			'movement.overland': 'DOLMEN.Effects.Fields.MovementOverland'
		}
	},
	skills: {
		label: 'DOLMEN.Effects.Groups.Skills',
		fields: {
			'skills.all': 'DOLMEN.Effects.Fields.SkillAll',
			'skills.listen': 'DOLMEN.Effects.Fields.SkillListen',
			'skills.search': 'DOLMEN.Effects.Fields.SkillSearch',
			'skills.survival': 'DOLMEN.Effects.Fields.SkillSurvival',
			'skills.detectMagic': 'DOLMEN.Effects.Fields.SkillDetectMagic',
			'skills.alertness': 'DOLMEN.Effects.Fields.SkillAlertness',
			'skills.stalking': 'DOLMEN.Effects.Fields.SkillStalking',
			'skills.tracking': 'DOLMEN.Effects.Fields.SkillTracking',
			'skills.pickLock': 'DOLMEN.Effects.Fields.SkillPickLock',
			'skills.stealth': 'DOLMEN.Effects.Fields.SkillStealth',
			'skills.decipherDocument': 'DOLMEN.Effects.Fields.SkillDecipherDocument',
			'skills.climbWall': 'DOLMEN.Effects.Fields.SkillClimbWall',
			'skills.disarmMechanism': 'DOLMEN.Effects.Fields.SkillDisarmMechanism',
			'skills.legerdemain': 'DOLMEN.Effects.Fields.SkillLegerdemain',
			'skills.monsterLore': 'DOLMEN.Effects.Fields.SkillMonsterLore'
		}
	},
	magic: {
		label: 'DOLMEN.Effects.Groups.Magic',
		fields: {
			'magic.arcane': 'DOLMEN.Effects.Fields.MagicArcane',
			'magic.holy': 'DOLMEN.Effects.Fields.MagicHoly',
			'magic.fairy': 'DOLMEN.Effects.Fields.MagicFairy',
			'magic.knacks': 'DOLMEN.Effects.Fields.MagicKnacks',
			'magic.arcaneSlots.rank1': 'DOLMEN.Effects.Fields.ArcaneSlotRank1',
			'magic.arcaneSlots.rank2': 'DOLMEN.Effects.Fields.ArcaneSlotRank2',
			'magic.arcaneSlots.rank3': 'DOLMEN.Effects.Fields.ArcaneSlotRank3',
			'magic.arcaneSlots.rank4': 'DOLMEN.Effects.Fields.ArcaneSlotRank4',
			'magic.arcaneSlots.rank5': 'DOLMEN.Effects.Fields.ArcaneSlotRank5',
			'magic.arcaneSlots.rank6': 'DOLMEN.Effects.Fields.ArcaneSlotRank6',
			'magic.holySlots.rank1': 'DOLMEN.Effects.Fields.HolySlotRank1',
			'magic.holySlots.rank2': 'DOLMEN.Effects.Fields.HolySlotRank2',
			'magic.holySlots.rank3': 'DOLMEN.Effects.Fields.HolySlotRank3',
			'magic.holySlots.rank4': 'DOLMEN.Effects.Fields.HolySlotRank4',
			'magic.holySlots.rank5': 'DOLMEN.Effects.Fields.HolySlotRank5',
			'magic.glamoursMax': 'DOLMEN.Effects.Fields.GlamoursMax'
		}
	},
	encumbrance: {
		label: 'DOLMEN.Effects.Groups.Encumbrance',
		fields: {
			'coinCapacity': 'DOLMEN.Effects.Fields.CoinCapacity',
			'slotCapacity.equipped': 'DOLMEN.Effects.Fields.SlotCapacityEquipped',
			'slotCapacity.stowed': 'DOLMEN.Effects.Fields.SlotCapacityStowed'
		}
	},
	xp: {
		label: 'DOLMEN.Effects.Groups.XP',
		fields: {
			'xpModifier': 'DOLMEN.Effects.Fields.XPModifier'
		}
	}
}

/**
 * Set of all valid effect target paths.
 */
const VALID_EFFECT_TARGETS = new Set()
for (const group of Object.values(EFFECT_FIELDS)) {
	for (const fieldPath of Object.keys(group.fields)) {
		VALID_EFFECT_TARGETS.add(fieldPath)
	}
}

/**
 * Set of effect targets that require a weapon type sub-target.
 */
const WEAPON_TYPE_TARGETS = new Set(['attackType', 'damageType'])

/**
 * Set of boolean effect targets (magic enable flags).
 */
const BOOLEAN_TARGETS = new Set([
	'magic.arcane',
	'magic.holy',
	'magic.fairy',
	'magic.knacks'
])

/**
 * Get the localized label for an effect target path.
 * @param {string} target - The target path
 * @returns {string} Localized label or the raw path if not found
 */
function getEffectTargetLabel(target) {
	for (const group of Object.values(EFFECT_FIELDS)) {
		if (target in group.fields) {
			return game.i18n.localize(group.fields[target])
		}
	}
	return target
}

/**
 * Get the group key for a given target path.
 * @param {string} target - The target path
 * @returns {string|null} The group key or null if not found
 */
function getEffectGroupForTarget(target) {
	for (const [groupKey, group] of Object.entries(EFFECT_FIELDS)) {
		if (target in group.fields) return groupKey
	}
	return null
}

/**
 * Groups and fields excluded for Creature actors.
 */
const CREATURE_EXCLUDED_GROUPS = new Set(['abilities', 'skills', 'magic', 'encumbrance', 'xp'])
const CREATURE_EXCLUDED_FIELDS = new Set([
	'magicResistance',
	'attackMelee', 'attackMissile', 'damageMelee', 'damageMissile',
	'movement.exploring', 'movement.overland'
])

/**
 * Get effect fields filtered for a specific actor type.
 * @param {string} actorType - The actor type (e.g. 'Adventurer', 'Creature')
 * @returns {object} Filtered EFFECT_FIELDS structure
 */
function getEffectFieldsForActor(actorType) {
	if (actorType !== 'Creature') return EFFECT_FIELDS
	const filtered = {}
	for (const [groupKey, group] of Object.entries(EFFECT_FIELDS)) {
		if (CREATURE_EXCLUDED_GROUPS.has(groupKey)) continue
		const fields = {}
		for (const [fieldKey, label] of Object.entries(group.fields)) {
			if (CREATURE_EXCLUDED_FIELDS.has(fieldKey)) continue
			fields[fieldKey] = label
		}
		if (Object.keys(fields).length > 0) {
			filtered[groupKey] = { label: group.label, fields }
		}
	}
	return filtered
}

/**
 * List all effect detail entries of an Effect item: the original single-entry
 * fields first, followed by any additional entries.
 * @param {object} system - The Effect item's system data
 * @returns {{target: string, value: number, effectType: string, subTarget: string}[]}
 */
function getEffectEntries(system) {
	const { target, value, effectType, subTarget } = system
	return [{ target, value, effectType, subTarget }, ...(system.additionalEffects || [])]
}

/**
 * Build display data for an Effect item in an effects list: the first entry's
 * target and value (target shown as "Multiple" when there are several entries),
 * plus a tooltip summary of all entries.
 * @param {object} system - The Effect item's system data
 * @returns {object} { target, value, effectType, targetLabel, extraCount, summary }
 */
function getEffectListData(system) {
	const entries = getEffectEntries(system)
	const formatValue = e => e.effectType === 'boolean' ? '✓' : `${e.value > 0 ? '+' : ''}${e.value}`
	return {
		target: system.target,
		value: system.value,
		effectType: system.effectType,
		targetLabel: entries.length > 1
			? game.i18n.localize('DOLMEN.Effects.Multiple')
			: getEffectTargetLabel(system.target),
		extraCount: entries.length - 1,
		summary: entries.map(e => `${getEffectTargetLabel(e.target)} ${formatValue(e)}`).join('; ')
	}
}

export { EFFECT_FIELDS, VALID_EFFECT_TARGETS, BOOLEAN_TARGETS, WEAPON_TYPE_TARGETS, getEffectTargetLabel, getEffectGroupForTarget, getEffectFieldsForActor, getEffectEntries, getEffectListData }
