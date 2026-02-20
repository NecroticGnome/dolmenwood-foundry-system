/* global game, Combat, CONFIG, foundry */

/**
 * DolmenCombat
 * Extends Foundry's Combat with group initiative, custom sorting,
 * and round-reset behavior for Dolmenwood's encounter rules.
 */

import { GROUPS } from './combatant.js'
import DolmenCombatant from './combatant.js'
import DolmenCombatTracker from './combat-tracker.js'
import { rollGroupInitiativeForCombat, rollInitiativeForGroup } from './combat-rolls.js'

export default class DolmenCombat extends Combat {

	/* -------------------------------------------- */
	/*  Group Initiative                            */
	/* -------------------------------------------- */

	/**
	 * Roll group initiative: one 1d6 per group, shared by all combatants.
	 * Overrides the default per-combatant initiative.
	 * @returns {Promise<Combat>} This combat instance
	 */
	async rollGroupInitiative() {
		await rollGroupInitiativeForCombat(this)
		return this
	}

	/**
	 * Override rollInitiative to use group initiative.
	 * Rolls only for groups that contain at least one combatant in the ids list.
	 * @param {string[]} ids - Combatant IDs to roll for
	 * @param {object} [options] - Roll options
	 * @returns {Promise<Combat>} This combat instance
	 */
	// eslint-disable-next-line no-unused-vars
	async rollInitiative(ids, _options = {}) {
		if (!ids?.length) return this
		const idSet = new Set(ids)
		const groups = new Set()
		for (const c of this.combatants) {
			if (idSet.has(c.id)) groups.add(c.dispositionGroup)
		}
		for (const groupId of groups) {
			await rollInitiativeForGroup(this, groupId)
		}
		return this
	}

	/**
	 * Override rollNPC to exclude the Party group entirely.
	 * @param {object} [options] - Roll options
	 * @returns {Promise<Combat>} This combat instance
	 */
	async rollNPC(options = {}) {
		const ids = this.combatants.reduce((acc, c) => {
			if (c.isOwner && c.isNPC && c.initiative === null && c.dispositionGroup !== GROUPS.FRIENDLY) {
				acc.push(c.id)
			}
			return acc
		}, [])
		return this.rollInitiative(ids, options)
	}

	/* -------------------------------------------- */
	/*  Group Assignments                           */
	/* -------------------------------------------- */

	/**
	 * Get the manually assigned group for a combatant, if any.
	 * @param {string} combatantId - The combatant ID
	 * @returns {number|null} Group constant or null if using auto
	 */
	getGroupFor(combatantId) {
		const map = this.getFlag('dolmenwood', 'groupAssignments') || {}
		const val = map[combatantId]
		return val !== undefined ? val : null
	}

	/**
	 * Set a manual group assignment for a combatant within this combat.
	 * @param {string} combatantId - The combatant ID
	 * @param {number|null} groupId - Group constant, or null to reset to auto
	 */
	async setGroupFor(combatantId, groupId) {
		const map = foundry.utils.deepClone(this.getFlag('dolmenwood', 'groupAssignments') || {})
		if (groupId === null) {
			delete map[combatantId]
		} else {
			map[combatantId] = groupId
		}
		return this.setFlag('dolmenwood', 'groupAssignments', map)
	}

	/* -------------------------------------------- */
	/*  Sorting                                     */
	/* -------------------------------------------- */

	/**
	 * Sort combatants: by group initiative descending, then defeated last, then name.
	 * @param {Combatant} a - First combatant
	 * @param {Combatant} b - Second combatant
	 * @returns {number} Sort order
	 */
	_sortCombatants(a, b) {
		// Sort by initiative descending (higher goes first)
		const ia = a.initiative ?? -Infinity
		const ib = b.initiative ?? -Infinity
		if (ia !== ib) return ib - ia

		// Within same initiative, sort by group order (friendly first)
		const ga = a.dispositionGroup ?? 0
		const gb = b.dispositionGroup ?? 0
		if (ga !== gb) return ga - gb

		// Defeated combatants last
		if (a.isDefeated !== b.isDefeated) return a.isDefeated ? 1 : -1

		// Alphabetical
		return (a.name || '').localeCompare(b.name || '')
	}

	/* -------------------------------------------- */
	/*  Round Management                            */
	/* -------------------------------------------- */

	/**
	 * Override nextRound to handle initiative reset and declaration clearing.
	 * @returns {Promise<Combat>} This combat instance
	 */
	async nextRound() {
		// Clear all declarations
		const updates = this.combatants.map(c => ({
			_id: c.id,
			'flags.dolmenwood.-=declaration': null
		}))

		// Handle initiative based on setting
		const mode = game.settings.get('dolmenwood', 'rerollInitiative')
		if (mode === 'reset' || mode === 'reroll') {
			for (const u of updates) {
				u.initiative = null
			}
		}

		if (updates.length) {
			await this.updateEmbeddedDocuments('Combatant', updates)
		}

		// Advance round
		const result = await super.nextRound()

		// Auto-reroll if setting is 'reroll'
		if (mode === 'reroll') {
			await this.rollGroupInitiative()
		}

		return result
	}
}

/* -------------------------------------------- */
/*  System Registration                         */
/* -------------------------------------------- */

/**
 * Register the combat system: document classes, tracker UI, and settings.
 * Call this from Hooks.once('init', ...) in dolmenwood.mjs.
 */
export function registerCombatSystem() {
	// Register document classes
	CONFIG.Combat.documentClass = DolmenCombat
	CONFIG.Combatant.documentClass = DolmenCombatant
	CONFIG.ui.combat = DolmenCombatTracker

	// Register combat settings
	game.settings.register('dolmenwood', 'rerollInitiative', {
		name: 'DOLMEN.Combat.Settings.RerollInitiative',
		hint: 'DOLMEN.Combat.Settings.RerollInitiativeHint',
		scope: 'world',
		config: true,
		type: String,
		default: 'reset',
		choices: {
			keep: 'DOLMEN.Combat.Settings.RerollKeep',
			reset: 'DOLMEN.Combat.Settings.RerollReset',
			reroll: 'DOLMEN.Combat.Settings.RerollReroll'
		}
	})

	game.settings.register('dolmenwood', 'optionalCombatRules', {
		name: 'DOLMEN.Combat.Settings.OptionalRules',
		hint: 'DOLMEN.Combat.Settings.OptionalRulesHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	})
}
