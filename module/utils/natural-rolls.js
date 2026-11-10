/* global game */
/**
 * Natural-roll rules from the Dolmenwood Core Rules: on Skill and Ability Checks a
 * natural 1 always fails and a natural 6 always succeeds; on Saving Throws and Attack
 * Rolls a natural 1 always fails and a natural 20 always succeeds; both irrespective
 * of modifiers. Otherwise the total must meet the target.
 */

/**
 * @param {number} natural - The face rolled on the die
 * @param {number} total - The roll total including modifiers
 * @param {number} target - The total needed to succeed
 * @param {number} faces - Die size (6 or 20)
 * @returns {{isSuccess: boolean, naturalNote: string}} naturalNote is set only when the natural roll changed the outcome
 */
function resolveNaturalRoll(natural, total, target, faces) {
	const byTotal = total >= target
	if (natural === 1 && byTotal) return { isSuccess: false, naturalNote: game.i18n.localize('DOLMEN.Roll.Natural1') }
	if (natural === faces && !byTotal) return { isSuccess: true, naturalNote: game.i18n.localize(`DOLMEN.Roll.Natural${faces}`) }
	return { isSuccess: byTotal, naturalNote: '' }
}

/**
 * Resolve a d6 Skill or Ability Check.
 * @param {number} natural
 * @param {number} total
 * @param {number} target
 * @returns {{isSuccess: boolean, naturalNote: string}}
 */
export function resolveD6Check(natural, total, target) {
	return resolveNaturalRoll(natural, total, target, 6)
}

/**
 * Resolve a d20 Saving Throw or Attack Roll.
 * @param {number} natural
 * @param {number} total
 * @param {number} target - Save target or Armour Class
 * @returns {{isSuccess: boolean, naturalNote: string}}
 */
export function resolveD20Roll(natural, total, target) {
	return resolveNaturalRoll(natural, total, target, 20)
}

/**
 * Append a natural-roll note to a result label, e.g. "Success (natural 20)".
 * @param {string} label
 * @param {string} naturalNote
 * @returns {string}
 */
export function withNaturalNote(label, naturalNote) {
	return naturalNote ? `${label} (${naturalNote})` : label
}
