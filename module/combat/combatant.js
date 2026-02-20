/* global Combatant, CONST */

/**
 * DolmenCombatant
 * Extends Foundry's Combatant with group derivation from token disposition
 * and a declaration flag for pre-initiative declarations.
 */

/** Group constants */
export const GROUPS = {
	FRIENDLY: 0,
	GROUP_A: -2,
	GROUP_B: -3,
	GROUP_C: -4,
	GROUP_D: -1,
	GROUP_E: -5,
	GROUP_F: -6
}

/** Map token disposition values to group constants */
const DISPOSITION_TO_GROUP = {
	[CONST.TOKEN_DISPOSITIONS.FRIENDLY]: GROUPS.FRIENDLY,
	[CONST.TOKEN_DISPOSITIONS.NEUTRAL]: GROUPS.GROUP_D,
	[CONST.TOKEN_DISPOSITIONS.HOSTILE]: GROUPS.GROUP_A,
	[CONST.TOKEN_DISPOSITIONS.SECRET]: GROUPS.GROUP_A
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
		return DISPOSITION_TO_GROUP[disposition] ?? GROUPS.GROUP_A
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
