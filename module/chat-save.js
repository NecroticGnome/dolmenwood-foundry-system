/* global game, canvas, ui, ChatMessage, Roll, CONST */
import { computeAdjustedValues } from './sheet/data-context.js'

/**
 * Roll a saving throw for controlled tokens.
 * @param {string} saveKey - The save type (doom, ray, hold, blast, spell)
 */
export async function rollSaveForControlled(saveKey) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Save.NoTokensSelected'))
		return
	}

	for (const token of controlled) {
		const actor = token.actor
		if (!actor) continue

		await performSaveRollForActor(actor, saveKey)
	}
}

/**
 * Perform a saving throw roll for a single actor.
 * @param {Actor} actor - The actor rolling the save
 * @param {string} saveKey - The save type
 */
async function performSaveRollForActor(actor, saveKey) {
	// Get save target - different for adventurers (with adjustments) vs creatures
	let saveTarget
	if (actor.type === 'Adventurer') {
		const adjusted = computeAdjustedValues(actor)
		saveTarget = adjusted.saves[saveKey]
	} else {
		// Creature - use saves directly
		saveTarget = actor.system.saves?.[saveKey]
	}

	if (saveTarget === undefined) return

	const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

	// Roll d20
	const roll = new Roll('1d20')
	await roll.evaluate()

	// Success if roll >= target
	const success = roll.total >= saveTarget
	const resultLabel = success
		? game.i18n.localize('DOLMEN.Roll.Success')
		: game.i18n.localize('DOLMEN.Roll.Failure')

	// Prepare chat message
	const flavor = game.i18n.format('DOLMEN.Roll.SavingThrow', { save: saveName })
	const messageData = {
		user: game.user.id,
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor,
		rolls: [roll],
		content: `
			<div class="dolmen save-roll">
				<div class="roll-header">
					<i class="fa fa-shield-halved"></i>
					<div class="roll-info">
						<h3>${actor.name}</h3>
						<span class="roll-type">${saveName}</span>
					</div>
				</div>
				<div class="roll-result">
					<div class="inline-roll">${roll.total}</div>
					<span class="roll-vs">vs</span>
					<span class="roll-target">${saveTarget}</span>
				</div>
				<div class="roll-outcome ${success ? 'success' : 'failure'}">
					${resultLabel}
				</div>
			</div>
		`,
		type: CONST.CHAT_MESSAGE_TYPES.ROLL
	}

	ChatMessage.create(messageData)
}

/**
 * Setup click listeners for inline save links in chat.
 * @param {HTMLElement} html - Chat message HTML
 */
export function setupSaveLinkListeners(html) {
	// Convert jQuery object to DOM element if needed
	const element = html[0] || html

	// Find inline save links
	const saveLinks = element.querySelectorAll('.inline-save-link')

	saveLinks.forEach(link => {
		link.addEventListener('click', async (event) => {
			event.preventDefault()
			event.stopPropagation()

			const saveKey = link.dataset.save
			if (!saveKey) {
				console.warn('Dolmenwood: No save key found on link')
				return
			}

			await rollSaveForControlled(saveKey)
		})
	})
}
