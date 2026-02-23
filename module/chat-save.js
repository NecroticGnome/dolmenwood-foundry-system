/* global game, canvas, ui, ChatMessage, Roll, CONST */
import { computeAdjustedValues } from './sheet/data-context.js'

/**
 * Parse markdown-style save links into clickable HTML anchors.
 * Syntax: [visible text](save:saveKey)
 * Example: [Save vs. Hold](save:hold) → <a class="inline-save-link" data-save="hold">Save vs. Hold</a>
 * @param {string} text - Text containing save link markdown
 * @returns {string} Text with save links replaced by HTML anchors
 */
export function parseSaveLinks(text) {
	if (!text) return text
	return text.replace(/\[([^\]]+)\]\(save:(\w+)\)/g, '<a class="inline-save-link" data-save="$2">$1</a>')
}

/**
 * TextEditor enricher callback for save links.
 * Used by CONFIG.TextEditor.enrichers to process [text](save:key) in
 * enriched text fields (journal entries, item descriptions, etc.).
 * @param {RegExpMatchArray} match - Regex match with [1]=label, [2]=saveKey
 * @returns {HTMLElement} Anchor element with inline-save-link class
 */
export function createSaveLinkEnricher(match) {
	const label = match[1]
	const saveKey = match[2]
	const a = document.createElement('a')
	a.classList.add('inline-save-link')
	a.dataset.save = saveKey
	a.textContent = label
	return a
}

/**
 * Roll a saving throw for controlled tokens.
 * @param {string} saveKey - The save type (doom, ray, hold, blast, spell)
 */
export async function rollSaveForControlled(saveKey) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.SaveRoll.NoTokensSelected'))
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

	const roll = new Roll('1d20')
	await roll.evaluate()

	const d20Result = roll.dice[0].results[0].result
	const isSuccess = d20Result >= saveTarget

	const resultClass = isSuccess ? 'success' : 'failure'
	const resultLabel = isSuccess
		? game.i18n.localize('DOLMEN.Roll.Success')
		: game.i18n.localize('DOLMEN.Roll.Failure')

	const anchor = await roll.toAnchor({ classes: ['save-inline-roll'] })

	const chatContent = `
		<div class="dolmen save-roll">
			<div class="roll-header save">
				<i class="fa-solid fa-shield-halved"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Roll.SaveVs')} ${saveName}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SavingThrow')}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${saveTarget}+</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: chatContent,
		rolls: [roll],
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
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
