/* global Combatant, CONST */

/**
 * DolmenCombatant
 * Extends Foundry's Combatant with group derivation from token disposition
 * and a declaration flag for pre-initiative declarations.
 */

/** Group constants */
export const GROUPS = {
	FRIENDLY: 0,
	NEUTRAL: -1,
	HOSTILE: -2
}

/** Map token disposition values to group constants */
const DISPOSITION_TO_GROUP = {
	[CONST.TOKEN_DISPOSITIONS.FRIENDLY]: GROUPS.FRIENDLY,
	[CONST.TOKEN_DISPOSITIONS.NEUTRAL]: GROUPS.NEUTRAL,
	[CONST.TOKEN_DISPOSITIONS.HOSTILE]: GROUPS.HOSTILE,
	[CONST.TOKEN_DISPOSITIONS.SECRET]: GROUPS.HOSTILE
}

export default class DolmenCombatant extends Combatant {

	/**
	 * Get the effective group for this combatant.
	 * Checks combat-level manual assignment first, then derives from token disposition.
	 * Note: 'group' is a reserved Foundry Combatant field, so we use 'dispositionGroup'.
	 * @returns {number} Group constant
	 */
	get dispositionGroup() {
		const manual = this.combat?.getGroupFor?.(this.id)
		if (manual !== null && manual !== undefined) return manual
		const disposition = this.token?.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE
		return DISPOSITION_TO_GROUP[disposition] ?? GROUPS.HOSTILE
	}

	/**
	 * Get the current declaration for this combatant.
	 * @returns {string|null} 'magic' | 'flee' | 'charge' | 'parry' | null
	 */
	get declaration() {
		return this.getFlag('dolmenwood', 'declaration') ?? null
	}

	/**
	 * Set the declaration for this combatant.
	 * @param {string|null} value - Declaration type or null to clear
	 */
	async setDeclaration(value) {
		if (value === null) {
			return this.unsetFlag('dolmenwood', 'declaration')
		}
		return this.setFlag('dolmenwood', 'declaration', value)
	}

	/** @returns {boolean} True if declaring spellcasting */
	get isCasting() {
		return this.declaration === 'magic'
	}

	/** @returns {boolean} True if declaring flee */
	get isFleeing() {
		return this.declaration === 'flee'
	}

	/** @returns {boolean} True if declaring charge */
	get isCharging() {
		return this.declaration === 'charge'
	}

	/** @returns {boolean} True if declaring parry */
	get isParrying() {
		return this.declaration === 'parry'
	}
}
