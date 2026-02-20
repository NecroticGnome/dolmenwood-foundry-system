/* global game, Roll, ChatMessage, CONFIG */

/**
 * Combat Roll Functions
 * All encounter-related dice rolls with chat output.
 * Each function posts results to chat with dice sound.
 */

import { GROUPS } from './combatant.js'
import { GROUP_CONFIG, getReactionCategory } from './combat-data.js'

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Check if all disposition groups in a combat have rolled initiative.
 * @param {Combat} combat - The active combat encounter
 * @returns {boolean} True if every group has at least one combatant with initiative
 */
export function allGroupsRolled(combat) {
	if (!combat || !combat.combatants.size) return false
	const groups = new Map()
	for (const c of combat.combatants) {
		const g = c.dispositionGroup
		if (!groups.has(g)) groups.set(g, false)
		if (c.initiative !== null) groups.set(g, true)
	}
	return [...groups.values()].every(v => v)
}

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
		const label = game.i18n.localize(config?.labelKey || 'DOLMEN.Combat.Group.GroupA')
		chatParts.push(`<div class="group-row" style="border-left: 3px solid ${config?.color || '#999'};"><strong>${label}:</strong> ${roll.total}</div>`)

		for (const c of combatants) {
			updates.push({ _id: c.id, initiative: roll.total })
		}
	}

	if (updates.length) {
		await combat.updateEmbeddedDocuments('Combatant', updates)
	}

	// Reset turn to 0 so highest-initiative combatant becomes active
	if (combat.round >= 1) {
		await combat.update({ turn: 0 })
	}

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-solid fa-dice-d6"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Combat.GroupInitiative')}</h3>
				</div>
			</div>
			<div class="roll-body">
				${chatParts.join('')}
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return results
}

/**
 * Roll 1d6 initiative for a single group in the combat.
 * @param {Combat} combat - The active combat encounter
 * @param {number} groupId - The group constant to roll for
 * @returns {Promise<number>} The roll result
 */
export async function rollInitiativeForGroup(combat, groupId) {
	const combatants = combat.combatants.filter(c => c.dispositionGroup === groupId)
	if (!combatants.length) return null

	const roll = new Roll('1d6')
	await roll.evaluate()

	const updates = combatants.map(c => ({ _id: c.id, initiative: roll.total }))
	await combat.updateEmbeddedDocuments('Combatant', updates)

	// If all groups now have initiative, reset turn to 0
	if (combat.round >= 1 && allGroupsRolled(combat)) {
		await combat.update({ turn: 0 })
	}

	const config = GROUP_CONFIG[groupId]
	const label = game.i18n.localize(config?.labelKey || 'DOLMEN.Combat.Group.GroupA')

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-solid fa-dice-d6"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Combat.GroupInitiative')}</h3>
				</div>
			</div>
			<div class="roll-body">
				<div class="group-row" style="border-left: 3px solid ${config?.color || '#999'};"><strong>${label}:</strong> ${roll.total}</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: label }
	})

	return roll.total
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
	const resultClass = passed ? 'success' : 'failure'
	const resultLabel = game.i18n.localize(passed ? 'DOLMEN.Creature.MoraleHolds' : 'DOLMEN.Creature.MoraleFlees')

	const anchor = await roll.toAnchor({ classes: ['morale-inline-roll'] })

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-solid fa-flag"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Creature.MoraleCheck')}</h3>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Creature.Morale')}: ${morale}</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
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
	const anchor = await roll.toAnchor({ classes: ['reaction-inline-roll'] })
	const breakdown = chaMod !== 0 ? `2d6 ${chaMod >= 0 ? '+' : ''}${chaMod}` : '2d6'

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-duotone fa-solid fa-masks-theater"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Combat.ReactionRoll')}</h3>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section reaction-${category.key}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-breakdown">${breakdown}</span>
					<span class="roll-label reaction-${category.key}">${game.i18n.localize(category.labelKey)}</span>
				</div>
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
	const hostileLabel = game.i18n.localize(GROUP_CONFIG[GROUPS.GROUP_A].labelKey)
	const surprisedText = game.i18n.localize('DOLMEN.Combat.Surprised')
	const notSurprisedText = game.i18n.localize('DOLMEN.Combat.NotSurprised')

	const friendlyAnchor = await friendlyRoll.toAnchor({ classes: ['surprise-inline-roll'] })
	const hostileAnchor = await hostileRoll.toAnchor({ classes: ['surprise-inline-roll'] })

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-sharp fa-solid fa-seal-exclamation"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Combat.SurpriseRoll')}</h3>
				</div>
			</div>
			<div class="roll-body">
				<div class="group-row" style="border-left: 3px solid ${GROUP_CONFIG[GROUPS.FRIENDLY].color};">
					<strong>${friendlyLabel}:</strong> <span class="force-d6-icon">${friendlyAnchor.outerHTML}</span>
					— <span class="roll-label ${friendlySurprised ? 'failure' : 'success'}">${friendlySurprised ? surprisedText : notSurprisedText}</span>
				</div>
				<div class="group-row" style="border-left: 3px solid ${GROUP_CONFIG[GROUPS.GROUP_A].color};">
					<strong>${hostileLabel}:</strong> <span class="force-d6-icon">${hostileAnchor.outerHTML}</span>
					— <span class="roll-label ${hostileSurprised ? 'failure' : 'success'}">${hostileSurprised ? surprisedText : notSurprisedText}</span>
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

	const anchor = await roll.toAnchor({ classes: ['distance-inline-roll'] })

	await ChatMessage.create({
		content: `
		<div class="dolmen combat-roll">
			<div class="roll-header">
				<i class="fa-duotone fa-solid fa-people-arrows"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Combat.EncounterDistance')}</h3>
					<span class="roll-type">${envLabel}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-breakdown">${roll.total} × ${multiplier}'</span>
					<span class="roll-value">${distance} ${game.i18n.localize('DOLMEN.Combat.Distance.Feet')}</span>
				</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.Combat.Encounter') }
	})

	return { roll, multiplier, distance }
}
