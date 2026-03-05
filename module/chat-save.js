/* global game, canvas, ui, ChatMessage, Roll, CONST, CONFIG */

/**
 * Get an actor's magic resistance value.
 * Adventurers: computed from WIS mod + adjustments + traits (stored in system.final).
 * Creatures: +2 if they have a "Magic Resistance" special ability, otherwise 0.
 * @param {Actor} actor
 * @returns {number}
 */
function getActorMagicResistance(actor) {
	if (actor.type === 'Adventurer') return actor.system.final?.magicResistance || 0
	const hasAbility = actor.system.specialAbilities?.some(
		a => a.name.toLowerCase() === 'magic resistance'
	)
	return hasAbility ? 2 : 0
}

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
 * @param {number} [bonus=0] - Numeric bonus added to roll
 * @param {string[]} [modifierNames=[]] - Names of applied modifiers for display
 * @param {boolean} [useMR=false] - Whether to add each actor's magic resistance to the roll
 */
export async function rollSaveForControlled(saveKey, bonus = 0, modifierNames = [], useMR = false) {
	const controlled = canvas.tokens.controlled
	if (controlled.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.SaveRoll.NoTokensSelected'))
		return
	}

	for (const token of controlled) {
		const actor = token.actor
		if (!actor) continue

		let actorBonus = bonus
		const actorModNames = [...modifierNames]

		if (useMR) {
			const mr = getActorMagicResistance(actor)
			if (mr > 0) {
				actorBonus += mr
				actorModNames.push(game.i18n.localize('DOLMEN.Traits.MagicResistance'))
			}
		}

		await performSaveRollForActor(actor, saveKey, actorBonus, actorModNames)
	}
}

/**
 * Perform a saving throw roll for a single actor.
 * @param {Actor} actor - The actor rolling the save
 * @param {string} saveKey - The save type
 * @param {number} [bonus=0] - Total bonus that lowers save target
 * @param {string[]} [modifierNames=[]] - Names of applied modifiers for display
 */
async function performSaveRollForActor(actor, saveKey, bonus = 0, modifierNames = []) {
	// Get save target - different for adventurers (with adjustments) vs creatures
	let baseSaveTarget
	if (actor.type === 'Adventurer') {
		baseSaveTarget = actor.system.final?.saves[saveKey]
	} else {
		// Creature - use saves directly
		baseSaveTarget = actor.system.saves?.[saveKey]
	}

	if (baseSaveTarget === undefined) return

	const saveName = game.i18n.localize(`DOLMEN.Saves.${saveKey.charAt(0).toUpperCase() + saveKey.slice(1)}`)

	const formula = bonus !== 0 ? `1d20 + ${bonus}` : '1d20'
	const roll = new Roll(formula)
	await roll.evaluate()

	const total = roll.total
	const isSuccess = total >= baseSaveTarget

	const resultClass = isSuccess ? 'success' : 'failure'
	const resultLabel = isSuccess
		? game.i18n.localize('DOLMEN.Roll.Success')
		: game.i18n.localize('DOLMEN.Roll.Failure')

	const anchor = await roll.toAnchor({ classes: ['save-inline-roll'] })

	const traitBadges = modifierNames.map(n => `<span class="trait-badge">${n}</span>`).join(' ')
	const targetDisplay = `${baseSaveTarget}+`

	const chatContent = `
		<div class="dolmen save-roll">
			<div class="roll-header save">
				<i class="fa-solid fa-shield-halved"></i>
				<div class="roll-info">
					<h3>${game.i18n.localize('DOLMEN.Roll.SaveVs')} ${saveName} ${traitBadges}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.Roll.SavingThrow')}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section ${resultClass}">
					<div class="roll-result">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${targetDisplay}</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>
			</div>
		</div>
	`

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: chatContent,
		sound: CONFIG.sounds.dice,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Open a modifier panel for inline save links (numeric grid -4 to +4).
 * @param {string} saveKey - The save type
 * @param {object} position - Screen position {top, left}
 */
export function openInlineSaveModifierPanel(saveKey, position) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	// Dismiss any active Foundry tooltip
	if (typeof game !== 'undefined') game.tooltip?.deactivate()

	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Check if any controlled token has magic resistance
	const controlled = canvas.tokens.controlled
	const anyHasMR = controlled.some(t => t.actor && getActorMagicResistance(t.actor) > 0)

	// Build HTML - ROLL button + optional MR toggle + numeric modifier grid
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	if (anyHasMR) {
		html += '<div class="menu-separator"></div>'
		html += `
			<div class="modifier-item" data-mod-id="magicResistance">
				<span class="mod-check"></span>
				<span class="mod-name">${game.i18n.localize('DOLMEN.Traits.MagicResistance')}</span>
			</div>
		`
	}

	html += '<div class="menu-separator"></div>'
	html += '<div class="numeric-grid">'
	for (const val of [-4, -3, -2, -1]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
	}
	for (const val of [1, 2, 3, 4]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
	}
	html += '</div>'

	// Create panel element
	const panel = document.createElement('div')
	panel.className = 'dolmen dolmen-weapon-context-menu modifier-panel'
	panel.innerHTML = html
	panel.style.position = 'fixed'
	panel.style.top = `${position.top}px`
	panel.style.left = `${position.left}px`
	document.body.appendChild(panel)

	// Adjust position (appear to left of click)
	const panelRect = panel.getBoundingClientRect()
	panel.style.left = `${position.left - panelRect.width - 5}px`

	// Modifier toggle behavior (multi-select)
	panel.querySelectorAll('.modifier-item').forEach(item => {
		item.addEventListener('click', () => {
			item.classList.toggle('selected')
			const check = item.querySelector('.mod-check')
			check.textContent = item.classList.contains('selected') ? '\u2713' : ''
		})
	})

	// Numeric button behavior (single-select toggle)
	panel.querySelectorAll('.numeric-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const wasSelected = btn.classList.contains('selected')
			panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
			if (!wasSelected) btn.classList.add('selected')
		})
	})

	// Close panel when clicking outside
	const closePanel = (e) => {
		if (!panel.contains(e.target)) {
			panel.remove()
			document.removeEventListener('click', closePanel)
		}
	}

	// ROLL button
	panel.querySelector('.roll-btn').addEventListener('click', () => {
		const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
		const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0
		const modifierNames = numericMod !== 0
			? [numericMod > 0 ? `+${numericMod}` : `${numericMod}`]
			: []

		const mrItem = panel.querySelector('.modifier-item[data-mod-id="magicResistance"]')
		const useMR = mrItem ? mrItem.classList.contains('selected') : false

		panel.remove()
		document.removeEventListener('click', closePanel)
		rollSaveForControlled(saveKey, numericMod, modifierNames, useMR)
	})

	setTimeout(() => document.addEventListener('click', closePanel), 0)
}

