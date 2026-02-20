/* global game */

/**
 * Combat Data Helpers
 * Pure functions for grouping, sorting, and preparing tracker display data.
 * No side effects — all functions take data in, return data out.
 */

import { GROUPS } from './combatant.js'

/* -------------------------------------------- */
/*  Group Configuration                         */
/* -------------------------------------------- */

/** Group display configuration: labels, colors, sort order */
export const GROUP_CONFIG = {
	[GROUPS.FRIENDLY]: {
		labelKey: 'DOLMEN.Combat.Group.Friendly',
		color: 'var(--dolmen-group-friendly, #44cc00)',
		sortOrder: 0
	},
	[GROUPS.GROUP_A]: {
		labelKey: 'DOLMEN.Combat.Group.GroupA',
		color: 'var(--dolmen-group-a, #cc4422)',
		sortOrder: 1
	},
	[GROUPS.GROUP_B]: {
		labelKey: 'DOLMEN.Combat.Group.GroupB',
		color: 'var(--dolmen-group-b, #cc8822)',
		sortOrder: 2
	},
	[GROUPS.GROUP_C]: {
		labelKey: 'DOLMEN.Combat.Group.GroupC',
		color: 'var(--dolmen-group-c, #ddbb00)',
		sortOrder: 3
	},
	[GROUPS.GROUP_D]: {
		labelKey: 'DOLMEN.Combat.Group.GroupD',
		color: 'var(--dolmen-group-d, #2288cc)',
		sortOrder: 4
	},
	[GROUPS.GROUP_E]: {
		labelKey: 'DOLMEN.Combat.Group.GroupE',
		color: 'var(--dolmen-group-e, #8822cc)',
		sortOrder: 5
	},
	[GROUPS.GROUP_F]: {
		labelKey: 'DOLMEN.Combat.Group.GroupF',
		color: 'var(--dolmen-group-f, #cc44cc)',
		sortOrder: 6
	}
}

/* -------------------------------------------- */
/*  Declaration Configuration                   */
/* -------------------------------------------- */

/** Declaration types with FontAwesome icons and localization keys */
export const DECLARATION_CONFIG = {
	magic: {
		icon: 'fa-solid fa-sparkles',
		labelKey: 'DOLMEN.Combat.Declaration.Magic',
		tooltipKey: 'DOLMEN.Combat.Declaration.MagicTooltip'
	},
	flee: {
		icon: 'fa-solid fa-rabbit-running',
		labelKey: 'DOLMEN.Combat.Declaration.Flee',
		tooltipKey: 'DOLMEN.Combat.Declaration.FleeTooltip'
	},
	charge: {
		icon: 'fa-solid fa-person-running-fast',
		labelKey: 'DOLMEN.Combat.Declaration.Charge',
		tooltipKey: 'DOLMEN.Combat.Declaration.ChargeTooltip'
	},
	parry: {
		icon: 'fa-solid fa-shield-halved',
		labelKey: 'DOLMEN.Combat.Declaration.Parry',
		tooltipKey: 'DOLMEN.Combat.Declaration.ParryTooltip'
	}
}

/* -------------------------------------------- */
/*  Reaction Table                              */
/* -------------------------------------------- */

/** Reaction roll result categories (2d6 + CHA mod) */
export const REACTION_TABLE = [
	{ min: -Infinity, max: 2, key: 'attacks', labelKey: 'DOLMEN.Combat.Reaction.Attacks' },
	{ min: 3, max: 5, key: 'hostile', labelKey: 'DOLMEN.Combat.Reaction.Hostile' },
	{ min: 6, max: 8, key: 'uncertain', labelKey: 'DOLMEN.Combat.Reaction.Uncertain' },
	{ min: 9, max: 11, key: 'indifferent', labelKey: 'DOLMEN.Combat.Reaction.Indifferent' },
	{ min: 12, max: Infinity, key: 'friendly', labelKey: 'DOLMEN.Combat.Reaction.Friendly' }
]

/**
 * Look up reaction category from a total roll value.
 * @param {number} total - The 2d6 + CHA mod total
 * @returns {object} Matching reaction table entry
 */
export function getReactionCategory(total) {
	return REACTION_TABLE.find(r => total >= r.min && total <= r.max) || REACTION_TABLE[2]
}

/* -------------------------------------------- */
/*  Grouping & Sorting                          */
/* -------------------------------------------- */

/**
 * Group combatants by their group (disposition).
 * @param {Combatant[]} combatants - Array of combatants
 * @returns {Map<number, Combatant[]>} Map of group → combatants
 */
export function groupCombatants(combatants) {
	const groups = new Map()
	for (const c of combatants) {
		const group = c.dispositionGroup
		if (!groups.has(group)) groups.set(group, [])
		groups.get(group).push(c)
	}
	return groups
}

/**
 * Sort combatants within a group: defeated last, then alphabetically.
 * @param {Combatant[]} combatants - Combatants in one group
 * @returns {Combatant[]} Sorted array
 */
export function sortWithinGroup(combatants) {
	return [...combatants].sort((a, b) => {
		if (a.isDefeated !== b.isDefeated) return a.isDefeated ? 1 : -1
		return (a.name || '').localeCompare(b.name || '')
	})
}

/**
 * Prepare grouped tracker data for the template.
 * @param {Combat} combat - The active combat
 * @param {boolean} optionalRules - Whether charge/parry are enabled
 * @returns {object[]} Array of group objects for template rendering
 */
export function prepareTrackerGroups(combat, optionalRules) {
	if (!combat) return []

	const grouped = groupCombatants(combat.combatants)
	const result = []

	for (const [groupId, combatants] of grouped) {
		const config = GROUP_CONFIG[groupId] || GROUP_CONFIG[GROUPS.GROUP_A]
		const sorted = sortWithinGroup(combatants)

		// Get group initiative (all combatants in a group share one roll)
		const initiative = sorted.find(c => c.initiative !== null)?.initiative ?? null

		result.push({
			groupId,
			label: game.i18n.localize(config.labelKey),
			color: config.color,
			sortOrder: config.sortOrder,
			initiative,
			hasInitiative: initiative !== null,
			combatants: sorted.map(c => prepareCombatantData(c, optionalRules))
		})
	}

	// Sort groups by sortOrder (initiative shown via dice icons)
	result.sort((a, b) => a.sortOrder - b.sortOrder)
	return result
}

/**
 * Prepare a single combatant's display data.
 * @param {Combatant} combatant - The combatant
 * @param {boolean} optionalRules - Whether charge/parry are enabled
 * @returns {object} Template-ready combatant data
 */
function prepareCombatantData(combatant, optionalRules) {
	const declaration = combatant.declaration
	const declConfig = declaration ? DECLARATION_CONFIG[declaration] : null

	// Build available declarations for this combatant
	const declarations = ['magic', 'flee']
	if (optionalRules) declarations.push('charge', 'parry')

	return {
		id: combatant.id,
		name: combatant.token?.name || combatant.actor?.name || combatant.name,
		img: combatant.img || combatant.token?.texture?.src,
		initiative: combatant.initiative,
		isDefeated: combatant.isDefeated,
		isOwner: combatant.isOwner,
		isVisible: combatant.visible ?? true,
		isNPC: combatant.actor?.type === 'Creature',
		hasMorale: combatant.actor?.type === 'Creature' && combatant.actor?.system?.morale != null,
		morale: combatant.actor?.system?.morale,
		declaration,
		declarationIcon: declConfig?.icon,
		declarationLabel: declConfig ? game.i18n.localize(declConfig.labelKey) : null,
		declarationTooltip: declConfig ? game.i18n.localize(declConfig.tooltipKey) : null,
		availableDeclarations: declarations.map(d => ({
			type: d,
			icon: DECLARATION_CONFIG[d].icon,
			label: game.i18n.localize(DECLARATION_CONFIG[d].labelKey),
			active: declaration === d
		})),
		tokenId: combatant.tokenId,
		actorId: combatant.actorId,
		hidden: combatant.hidden
	}
}
