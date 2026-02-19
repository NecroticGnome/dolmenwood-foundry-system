/* global game, Roll, ChatMessage, CONFIG */

/**
 * Combat Roll Functions
 * All encounter-related dice rolls with chat output.
 * Each function posts results to chat with dice sound.
 */

import { GROUPS } from './combatant.js'
import { GROUP_CONFIG, getReactionCategory } from './combat-data.js'

/* -------------------------------------------- */
/*  Group Initiative                            */
/* -------------------------------------------- */

/**
 * Roll 1d6 group initiative for each group in the combat.
 * All combatants in a group share the same initiative value.
 * @param {Combat} combat - The active combat encounter
 * @returns {Promise<object>} Map of groupId → roll result
 */
export async function rollGroupInitiativeForCombat(combat) {
	const groups = new Map()
	for (const c of combat.combatants) {
		if (!groups.has(c.dispositionGroup)) groups.set(c.dispositionGroup, [])
		groups.get(c.dispositionGroup).push(c)
	}

	const results = {}
	const updates = []
	const chatParts = []

	for (const [groupId, combatants] of groups) {
		const roll = new Roll('1d6')
		await roll.evaluate()
		results[groupId] = roll.total

		const config = GROUP_CONFIG[groupId]
		const label = game.i18n.localize(config?.labelKey || 'DOLMEN.Combat.Group.Hostile')
		chatParts.push(`<div class="dolmen-initiative-group" style="border-left: 3px solid ${config?.color || '#999'}; padding-left: 6px; margin: 4px 0;"><strong>${label}:</strong> ${roll.total}</div>`)

		for (const c of combatants) {
			updates.push({ _id: c.id, initiative: roll.total })
		}
	}

	if (updates.length) {
		await combat.updateEmbeddedDocuments('Combatant', updates)
	}

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-solid fa-dice-d6"></i> ${game.i18n.localize('DOLMEN.Combat.GroupInitiative')}</h3>
			${chatParts.join('')}
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return results
}

/* -------------------------------------------- */
/*  Morale Check                                */
/* -------------------------------------------- */

/**
 * Roll a morale check (2d6) against a morale score.
 * Morale breaks if roll exceeds the morale score.
 * @param {number} morale - The morale score to check against
 * @returns {Promise<object>} { roll, morale, passed }
 */
export async function rollMoraleCheck(morale) {
	const roll = new Roll('2d6')
	await roll.evaluate()

	const passed = roll.total <= morale
	const resultKey = passed ? 'DOLMEN.Creature.MoraleHolds' : 'DOLMEN.Creature.MoraleFlees'
	const resultClass = passed ? 'morale-holds' : 'morale-breaks'

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-solid fa-flag"></i> ${game.i18n.localize('DOLMEN.Creature.MoraleCheck')}</h3>
			<div class="dolmen-roll-details">
				<div>${game.i18n.localize('DOLMEN.Creature.Morale')}: ${morale}</div>
				<div>${game.i18n.localize('DOLMEN.Roll.Result')}: ${roll.total}</div>
				<div class="dolmen-roll-result ${resultClass}">${game.i18n.localize(resultKey)}</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return { roll, morale, passed }
}

/* -------------------------------------------- */
/*  Reaction Roll                               */
/* -------------------------------------------- */

/**
 * Roll a reaction check (2d6 + CHA modifier).
 * @param {number} [chaMod=0] - CHA modifier to apply
 * @returns {Promise<object>} { roll, total, category }
 */
export async function rollReaction(chaMod = 0) {
	const formula = chaMod !== 0 ? `2d6 + ${chaMod}` : '2d6'
	const roll = new Roll(formula)
	await roll.evaluate()

	const category = getReactionCategory(roll.total)

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-duotone fa-solid fa-masks-theater"></i> ${game.i18n.localize('DOLMEN.Combat.ReactionRoll')}</h3>
			<div class="dolmen-roll-details">
				<div>${game.i18n.localize('DOLMEN.Roll.Result')}: ${roll.total}${chaMod !== 0 ? ` (2d6 ${chaMod >= 0 ? '+' : ''}${chaMod})` : ''}</div>
				<div class="dolmen-roll-result reaction-${category.key}">${game.i18n.localize(category.labelKey)}</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return { roll, total: roll.total, category }
}

/* -------------------------------------------- */
/*  Surprise                                    */
/* -------------------------------------------- */

/**
 * Roll surprise for each side (1d6, surprised on 1-2).
 * @returns {Promise<object>} { friendly: {roll, surprised}, hostile: {roll, surprised} }
 */
export async function rollSurprise() {
	const friendlyRoll = new Roll('1d6')
	const hostileRoll = new Roll('1d6')
	await friendlyRoll.evaluate()
	await hostileRoll.evaluate()

	const friendlySurprised = friendlyRoll.total <= 2
	const hostileSurprised = hostileRoll.total <= 2

	const friendlyLabel = game.i18n.localize(GROUP_CONFIG[GROUPS.FRIENDLY].labelKey)
	const hostileLabel = game.i18n.localize(GROUP_CONFIG[GROUPS.HOSTILE].labelKey)
	const surprisedText = game.i18n.localize('DOLMEN.Combat.Surprised')
	const notSurprisedText = game.i18n.localize('DOLMEN.Combat.NotSurprised')

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-sharp fa-solid fa-seal-exclamation"></i> ${game.i18n.localize('DOLMEN.Combat.SurpriseRoll')}</h3>
			<div class="dolmen-roll-details">
				<div class="dolmen-surprise-row" style="border-left: 3px solid ${GROUP_CONFIG[GROUPS.FRIENDLY].color}; padding-left: 6px; margin: 4px 0;">
					<strong>${friendlyLabel}:</strong> ${friendlyRoll.total}
					— <span class="${friendlySurprised ? 'surprise-yes' : 'surprise-no'}">${friendlySurprised ? surprisedText : notSurprisedText}</span>
				</div>
				<div class="dolmen-surprise-row" style="border-left: 3px solid ${GROUP_CONFIG[GROUPS.HOSTILE].color}; padding-left: 6px; margin: 4px 0;">
					<strong>${hostileLabel}:</strong> ${hostileRoll.total}
					— <span class="${hostileSurprised ? 'surprise-yes' : 'surprise-no'}">${hostileSurprised ? surprisedText : notSurprisedText}</span>
				</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return {
		friendly: { roll: friendlyRoll, surprised: friendlySurprised },
		hostile: { roll: hostileRoll, surprised: hostileSurprised }
	}
}

/* -------------------------------------------- */
/*  Encounter Distance                          */
/* -------------------------------------------- */

/**
 * Roll encounter distance (2d6 × multiplier).
 * Dungeon = 2d6×10 feet, Outdoors = 2d6×30 feet.
 * @param {string} [environment='dungeon'] - 'dungeon' or 'outdoors'
 * @returns {Promise<object>} { roll, multiplier, distance }
 */
export async function rollEncounterDistance(environment = 'dungeon') {
	const roll = new Roll('2d6')
	await roll.evaluate()
	const multiplier = environment === 'outdoors' ? 30 : 10
	const distance = roll.total * multiplier

	const envLabel = game.i18n.localize(
		environment === 'outdoors'
			? 'DOLMEN.Combat.Distance.Outdoors'
			: 'DOLMEN.Combat.Distance.Dungeon'
	)

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-duotone fa-solid fa-people-arrows"></i> ${game.i18n.localize('DOLMEN.Combat.EncounterDistance')}</h3>
			<div class="dolmen-roll-details">
				<div>${envLabel}: ${roll.total} × ${multiplier}'</div>
				<div class="dolmen-roll-result">${distance} ${game.i18n.localize('DOLMEN.Combat.Distance.Feet')}</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return { roll, multiplier, distance }
}
