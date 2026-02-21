/* global game, Hooks, foundry, Roll, ChatMessage, CONFIG */

import { findRollTable } from '../utils/roll-tables.js'

const { DialogV2 } = foundry.applications.api

const SQUARE_COUNT = 8
const TURN_SECONDS = 600 // 10 minutes
const REST_THRESHOLD = 48 // 8 hours — prompt instead of auto-animate
const SLIDE_NORMAL = 400
const SLIDE_FAST = 150 // 1 hour (6 turns)
const TORCH_DURATION = 6 // 6 turns = 1 hour
const LANTERN_DURATION = 24 // 24 turns = 4 hours

let previousWorldTime = null
let widgetEl = null
let animating = false
let pendingTurns = 0
let currentSlideMs = SLIDE_NORMAL
let batchTotal = 0
let turnCounter = 1 // turn number under the frame (index 1)
let lightSources = []
let trackerPaused = true // overwritten by loadTrackerPaused() on init

/**
 * Return the icon class for a given turn number, or null.
 * Rest interval turn: rest icon (takes priority). Encounter interval turn: roll icon.
 */
function getSquareIcon(turnNum) {
	if (turnNum <= 0) return null
	const restInterval = game.settings.get('dolmenwood', 'restInterval')
	const encounterInterval = game.settings.get('dolmenwood', 'encounterInterval')
	if (restInterval > 0 && turnNum % restInterval === 0) return 'fa-solid fa-snooze'
	if (encounterInterval > 0 && turnNum % encounterInterval === 0) return 'fa-solid fa-dice'
	return null
}

/**
 * Create a square element for the given turn number.
 */
function createSquare(turnNum, faded) {
	const sq = document.createElement('div')
	sq.className = 'dungeon-square'
	sq.dataset.turn = turnNum
	if (faded) sq.classList.add('faded')
	const icon = getSquareIcon(turnNum)
	if (icon) {
		const i = document.createElement('i')
		i.className = `${icon} square-event`
		sq.appendChild(i)
	}
	return sq
}

// ── Light Source Management ──

function loadLightSources() {
	try {
		lightSources = game.settings.get('dolmenwood', 'lightSources') ?? []
	} catch {
		lightSources = []
	}
}

function saveLightSources() {
	if (!game.user.isGM) return
	game.settings.set('dolmenwood', 'lightSources', lightSources)
}

function saveTrackerPaused() {
	if (!game.user.isGM) return
	game.settings.set('dolmenwood', 'trackerPaused', trackerPaused)
}

function saveTurnCounter() {
	if (!game.user.isGM) return
	game.settings.set('dolmenwood', 'trackerTurn', turnCounter)
}

/**
 * Setting onChange handler — updates local pause state and button.
 */
export function onTrackerPausedChanged(value) {
	trackerPaused = value
	updatePauseButton()
}

/**
 * Setting onChange handler — syncs turn counter from GM to players.
 */
export function onTurnCounterChanged(value) {
	if (game.user.isGM) return
	turnCounter = value
	rebuildSquares()
}

export function isDungeonTrackerAnimating() {
	return animating
}

function addLightSource(type) {
	if (!game.user.isGM) return
	const duration = type === 'torch' ? TORCH_DURATION : LANTERN_DURATION
	lightSources.push({
		id: foundry.utils.randomID(),
		type,
		remaining: duration,
		paused: false
	})
	saveLightSources()
	renderLightBars()
	renderLightPanel()
}

function addTimer(name, duration) {
	if (!game.user.isGM) return
	lightSources.push({
		id: foundry.utils.randomID(),
		type: 'timer',
		remaining: duration,
		paused: false,
		name
	})
	saveLightSources()
	renderLightBars()
	renderLightPanel()
}

async function showAddTimerDialog() {
	if (!game.user.isGM) return
	const nameLabel = game.i18n.localize('DOLMEN.DungeonTracker.TimerName')
	const durationLabel = game.i18n.localize('DOLMEN.DungeonTracker.TimerDuration')

	const result = await DialogV2.prompt({
		window: { title: game.i18n.localize('DOLMEN.DungeonTracker.AddTimer') },
		content: `
			<div class="form-group">
				<label>${nameLabel}</label>
				<input type="text" name="timerName" autofocus>
			</div>
			<div class="form-group">
				<label>${durationLabel}</label>
				<input type="number" name="timerDuration" value="6" min="1">
			</div>`,
		ok: {
			label: game.i18n.localize('DOLMEN.DungeonTracker.AddTimer'),
			icon: 'fa-solid fa-hourglass',
			callback: (event, button) => {
				const name = button.form.elements.timerName.value.trim() || game.i18n.localize('DOLMEN.DungeonTracker.Timer')
				const duration = parseInt(button.form.elements.timerDuration.value) || 6
				return { name, duration }
			}
		},
		rejectClose: false
	})

	if (result) {
		addTimer(result.name, result.duration)
	}
}

async function showSettingsDialog() {
	if (!game.user.isGM) return

	const encounterChance = game.settings.get('dolmenwood', 'encounterChance')
	const encounterInterval = game.settings.get('dolmenwood', 'encounterInterval')
	const restInterval = game.settings.get('dolmenwood', 'restInterval')
	const encounterTable = game.settings.get('dolmenwood', 'encounterTable')
	const encounterGmOnly = game.settings.get('dolmenwood', 'encounterGmOnly')

	const chanceLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterSettingName')
	const intervalLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterIntervalLabel')
	const restLbl = game.i18n.localize('DOLMEN.DungeonTracker.RestIntervalLabel')
	const tableLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterTableLabel')
	const gmOnlyLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterGmOnly')
	const offLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterOff')
	const noneLbl = game.i18n.localize('DOLMEN.DungeonTracker.EncounterTableNone')

	const chanceOptions = [`<option value="0"${encounterChance === 0 ? ' selected' : ''}>${offLbl}</option>`]
	for (let i = 1; i <= 6; i++) {
		chanceOptions.push(`<option value="${i}"${encounterChance === i ? ' selected' : ''}>${i}-in-6</option>`)
	}

	const tableOptions = [`<option value=""${!encounterTable ? ' selected' : ''}>${noneLbl}</option>`]
	for (const table of game.tables) {
		if (table.name.startsWith('Encounter Table:')) {
			const sel = encounterTable === table.name ? ' selected' : ''
			tableOptions.push(`<option value="${table.name}"${sel}>${table.name}</option>`)
		}
	}

	const result = await DialogV2.prompt({
		window: { title: game.i18n.localize('DOLMEN.DungeonTracker.Settings') },
		content: `
			<div class="form-group">
				<label>${chanceLbl}</label>
				<select name="encounterChance">${chanceOptions.join('')}</select>
			</div>
			<div class="form-group">
				<label>${intervalLbl}</label>
				<input type="number" name="encounterInterval" value="${encounterInterval}" min="1">
			</div>
			<div class="form-group">
				<label>${tableLbl}</label>
				<select name="encounterTable">${tableOptions.join('')}</select>
			</div>
			<div class="form-group">
				<label>${gmOnlyLbl}</label>
				<input type="checkbox" name="encounterGmOnly"${encounterGmOnly ? ' checked' : ''}>
			</div>
			<div class="form-group">
				<label>${restLbl}</label>
				<input type="number" name="restInterval" value="${restInterval}" min="0">
			</div>`,
		ok: {
			label: game.i18n.localize('DOLMEN.DungeonTracker.SettingsSave'),
			icon: 'fa-solid fa-check',
			callback: (event, button) => {
				const rest = parseInt(button.form.elements.restInterval.value)
				return {
					chance: parseInt(button.form.elements.encounterChance.value) || 0,
					interval: parseInt(button.form.elements.encounterInterval.value) || 2,
					rest: isNaN(rest) ? 6 : rest,
					table: button.form.elements.encounterTable.value,
					gmOnly: button.form.elements.encounterGmOnly.checked
				}
			}
		},
		rejectClose: false
	})

	if (result) {
		await game.settings.set('dolmenwood', 'encounterChance', result.chance)
		await game.settings.set('dolmenwood', 'encounterInterval', result.interval)
		await game.settings.set('dolmenwood', 'restInterval', result.rest)
		await game.settings.set('dolmenwood', 'encounterTable', result.table)
		await game.settings.set('dolmenwood', 'encounterGmOnly', result.gmOnly)
		rebuildSquares()
	}
}

function removeLightSource(id) {
	if (!game.user.isGM) return
	lightSources = lightSources.filter(s => s.id !== id)
	saveLightSources()
	renderLightBars()
	renderLightPanel()
}

function togglePauseLight(id) {
	if (!game.user.isGM) return
	const source = lightSources.find(s => s.id === id)
	if (source) {
		source.paused = !source.paused
		saveLightSources()
		renderLightBars()
		renderLightPanel()
	}
}

/**
 * Update the pause button icon/state to match trackerPaused.
 */
function updatePauseButton() {
	if (!widgetEl) return
	const btn = widgetEl.querySelector('.tracker-pause-btn')
	if (!btn) return
	const icon = trackerPaused ? 'fa-play' : 'fa-pause'
	btn.innerHTML = `<i class="fa-solid ${icon}"></i>`
	btn.title = game.i18n.localize(trackerPaused
		? 'DOLMEN.DungeonTracker.Resume'
		: 'DOLMEN.DungeonTracker.Pause')
	btn.classList.toggle('active', trackerPaused)
}

/**
 * Render light bars inside each visible dungeon square.
 * Each source covers squares from the current turn (offset 0) through
 * remaining-1 turns ahead, clamped to the 6 visible squares.
 */
function renderLightBars() {
	if (!widgetEl) return
	const squares = widgetEl.querySelectorAll('.dungeon-square')
	for (const sq of squares) {
		const oldBars = sq.querySelector('.light-bars')
		if (oldBars) oldBars.remove()
		const oldTimers = sq.querySelector('.timer-end-row')
		if (oldTimers) oldTimers.remove()

		const turn = parseInt(sq.dataset.turn)
		const offset = turn - turnCounter // 0 = current, 1 = next, etc.

		// Light source bars (torch/lantern only)
		const barsForSquare = lightSources.filter(s =>
			s.type !== 'timer' && offset >= 0 && offset < Math.min(s.remaining, 6)
		)
		if (barsForSquare.length > 0) {
			const barsEl = document.createElement('div')
			barsEl.className = 'light-bars'
			for (const source of barsForSquare) {
				const bar = document.createElement('div')
				bar.className = `light-bar ${source.type}`
				if (source.paused) bar.classList.add('paused')
				if (source.remaining <= 2 && !source.paused) bar.classList.add('warning')
				barsEl.appendChild(bar)
			}
			sq.appendChild(barsEl)
		}

		// Timer expiry icons (max 3 per square)
		const timersHere = lightSources.filter(s =>
			s.type === 'timer' && !s.paused && offset >= 0 && offset === s.remaining - 1
		)
		if (timersHere.length > 0) {
			const row = document.createElement('div')
			row.className = 'timer-end-row'
			for (const timer of timersHere.slice(0, 3)) {
				const icon = document.createElement('i')
				icon.className = 'fa-solid fa-hourglass-end timer-end'
				if (timer.remaining <= 2) icon.classList.add('warning')
				icon.title = timer.name
				row.appendChild(icon)
			}
			sq.appendChild(row)
		}
	}
}

/**
 * Build/update the light control panel content.
 */
function renderLightPanel() {
	if (!widgetEl) return
	const panel = widgetEl.querySelector('.dungeon-light-panel')
	if (!panel) return

	panel.innerHTML = ''

	// Hide panel for non-GM users when there are no light sources
	if (!game.user.isGM && lightSources.length === 0) {
		panel.classList.add('empty')
		return
	}
	panel.classList.remove('empty')

	// Add buttons (GM only)
	if (game.user.isGM) {
		const controls = document.createElement('div')
		controls.className = 'dungeon-light-controls'

		const torchBtn = document.createElement('button')
		torchBtn.type = 'button'
		torchBtn.innerHTML = `<i class="fa-solid fa-fire-flame-curved"></i> ${game.i18n.localize('DOLMEN.DungeonTracker.Torch')}`
		torchBtn.addEventListener('click', () => addLightSource('torch'))

		const lanternBtn = document.createElement('button')
		lanternBtn.type = 'button'
		lanternBtn.innerHTML = `<i class="fa-solid fa-lightbulb"></i> ${game.i18n.localize('DOLMEN.DungeonTracker.Lantern')}`
		lanternBtn.addEventListener('click', () => addLightSource('lantern'))

		const timerBtn = document.createElement('button')
		timerBtn.type = 'button'
		timerBtn.innerHTML = `<i class="fa-solid fa-hourglass"></i> ${game.i18n.localize('DOLMEN.DungeonTracker.Timer')}`
		timerBtn.addEventListener('click', () => showAddTimerDialog())

		const settingsBtn = document.createElement('button')
		settingsBtn.type = 'button'
		settingsBtn.className = 'tracker-settings-btn'
		settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>'
		settingsBtn.title = game.i18n.localize('DOLMEN.DungeonTracker.Settings')
		settingsBtn.addEventListener('click', () => showSettingsDialog())

		controls.appendChild(torchBtn)
		controls.appendChild(lanternBtn)
		controls.appendChild(timerBtn)
		controls.appendChild(settingsBtn)
		panel.appendChild(controls)

	}

	// Active light list
	if (lightSources.length === 0) return

	const list = document.createElement('div')
	list.className = 'dungeon-light-list'

	for (const source of lightSources) {
		const item = document.createElement('div')
		item.className = 'dungeon-light-item'
		if (source.paused) item.classList.add('is-paused')
		if (source.remaining <= 2 && !source.paused) item.classList.add('is-warning')

		let iconClass, label
		if (source.type === 'timer') {
			iconClass = 'fa-hourglass'
			label = source.name
		} else {
			iconClass = source.type === 'torch' ? 'fa-fire-flame-curved' : 'fa-lightbulb'
			label = game.i18n.localize(source.type === 'torch'
				? 'DOLMEN.DungeonTracker.Torch'
				: 'DOLMEN.DungeonTracker.Lantern')
		}

		item.innerHTML = `
			<i class="fa-solid ${iconClass} light-icon ${source.type}"></i>
			<span class="light-label">${label}</span>
			<span class="light-remaining">${source.remaining}</span>`

		// GM controls: pause toggle + delete button
		if (game.user.isGM) {
			const pauseIcon = source.paused ? 'fa-play' : 'fa-pause'
			const pauseBtn = document.createElement('i')
			pauseBtn.className = `fa-solid ${pauseIcon} light-pause`
			pauseBtn.addEventListener('click', () => togglePauseLight(source.id))
			item.appendChild(pauseBtn)

			const deleteBtn = document.createElement('i')
			deleteBtn.className = 'fa-solid fa-square-xmark light-delete'
			deleteBtn.addEventListener('click', () => removeLightSource(source.id))
			item.appendChild(deleteBtn)
		}

		list.appendChild(item)
	}

	panel.appendChild(list)
}

/**
 * Create and inject the light panel container into the widget.
 */
function injectLightPanel() {
	if (!widgetEl) return
	const panel = document.createElement('div')
	panel.className = 'dungeon-light-panel'
	widgetEl.appendChild(panel)
}

/**
 * Decrement remaining turns on non-paused light sources.
 * Expired sources post a chat message and are removed.
 */
function decrementLightSources() {
	if (!game.user.isGM) return
	if (lightSources.length === 0) return

	const expired = []
	for (const source of lightSources) {
		if (source.paused) continue
		source.remaining--
		if (source.remaining <= 0) {
			expired.push(source)
		}
	}

	if (expired.length > 0) {
		lightSources = lightSources.filter(s => s.remaining > 0)
		for (const source of expired) {
			postLightExpiryMessage(source)
		}
	}

	saveLightSources()
}

/**
 * Post a chat message when a light source burns out.
 */
async function postLightExpiryMessage(source) {
	if (!game.user.isGM) return

	let message, title, icon
	if (source.type === 'timer') {
		message = game.i18n.format('DOLMEN.DungeonTracker.TimerExpired', { name: source.name })
		title = game.i18n.localize('DOLMEN.DungeonTracker.Timer')
		icon = 'fa-solid fa-hourglass'
	} else {
		message = game.i18n.localize(source.type === 'torch'
			? 'DOLMEN.DungeonTracker.TorchExpired'
			: 'DOLMEN.DungeonTracker.LanternExpired')
		title = game.i18n.localize('DOLMEN.DungeonTracker.LightExpiryTitle')
		icon = source.type === 'torch' ? 'fa-solid fa-fire-flame-curved' : 'fa-solid fa-lightbulb'
	}

	await ChatMessage.create({
		content: `
		<div class="dolmen encounter-roll">
			<div class="roll-header">
				<i class="${icon}"></i>
				<div class="roll-info">
					<h3>${title}</h3>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section failure">
					<span class="roll-label failure">${message}</span>
				</div>
			</div>
		</div>`,
		speaker: { alias: title }
	})
}

/**
 * Setting onChange handler — updates local state and re-renders.
 */
export function onLightSourcesChanged(value) {
	lightSources = value ?? []
	renderLightBars()
	renderLightPanel()
}

/**
 * Post a dungeon turn chat message. Handles encounter checks and
 * rest reminders at configurable intervals.
 */
async function postTurnMessage(turnNum) {
	if (!game.user.isGM) return

	const restInterval = game.settings.get('dolmenwood', 'restInterval')
	const encounterInterval = game.settings.get('dolmenwood', 'encounterInterval')
	const isRestTurn = restInterval > 0 && turnNum > 0 && turnNum % restInterval === 0
	const isEncounterTurn = encounterInterval > 0 && turnNum > 0 && turnNum % encounterInterval === 0
	const chance = game.settings.get('dolmenwood', 'encounterChance')
	const doEncounter = isEncounterTurn && chance > 0

	if (!doEncounter && !isRestTurn) return

	let encounterHtml = ''
	let sound = undefined
	if (doEncounter) {
		const roll = new Roll('1d6')
		await roll.evaluate()
		const encountered = roll.total <= chance
		const resultClass = encountered ? 'failure' : 'success'
		const resultLabel = encountered
			? game.i18n.localize('DOLMEN.DungeonTracker.EncounterYes')
			: game.i18n.localize('DOLMEN.DungeonTracker.EncounterNo')
		const anchor = await roll.toAnchor({ classes: ['encounter-inline-roll'] })
		sound = CONFIG.sounds.dice
		encounterHtml = `
				<div class="roll-section ${resultClass}">
					<div class="roll-result force-d6-icon">
						${anchor.outerHTML}
					</div>
					<span class="roll-target">${chance}-in-6</span>
					<span class="roll-label ${resultClass}">${resultLabel}</span>
				</div>`

		// Draw from encounter table if configured and encounter triggered
		if (encountered) {
			const tableName = game.settings.get('dolmenwood', 'encounterTable')
			if (tableName) {
				const table = await findRollTable(tableName)
				if (table) {
					const draw = await table.draw({ displayChat: false })
					if (draw.results.length) {
						const gmOnly = game.settings.get('dolmenwood', 'encounterGmOnly')
						const msgOpts = gmOnly ? { rollMode: 'gmroll' } : {}
						table.toMessage(draw.results, { roll: draw.roll, messageData: { sound: '' }, messageOptions: msgOpts })
					}
				}
			}
		}
	}

	let restHtml = ''
	if (isRestTurn) {
		restHtml = `
				<div class="roll-section rest-reminder">
					<i class="fa-solid fa-snooze"></i>
					<span class="roll-label">${game.i18n.localize('DOLMEN.DungeonTracker.RestReminder')}</span>
				</div>`
	}

	const icon = isRestTurn && !doEncounter ? 'fa-solid fa-snooze' : 'fa-solid fa-dice'
	const title = doEncounter
		? game.i18n.localize('DOLMEN.DungeonTracker.EncounterCheck')
		: game.i18n.localize('DOLMEN.DungeonTracker.RestTitle')

	await ChatMessage.create({
		content: `
		<div class="dolmen encounter-roll">
			<div class="roll-header">
				<i class="${icon}"></i>
				<div class="roll-info">
					<h3>${title}</h3>
					<span class="roll-type">${game.i18n.localize('DOLMEN.DungeonTracker.Turn')} ${turnNum}</span>
				</div>
			</div>
			<div class="roll-body">
				${encounterHtml}
				${restHtml}
			</div>
		</div>`,
		sound,
		speaker: { alias: title }
	})
}

/**
 * Create the widget DOM and append to document body.
 */
function injectWidget() {
	if (widgetEl) return
	widgetEl = document.createElement('div')
	widgetEl.id = 'dolmen-dungeon-tracker'

	const strip = document.createElement('div')
	strip.className = 'dungeon-tracker-squares'

	// Squares represent turns: [turnCounter-1, turnCounter, ..., turnCounter+6]
	// Index 0 and 7 are faded edge squares
	for (let i = 0; i < SQUARE_COUNT; i++) {
		const turnNum = turnCounter - 1 + i
		const faded = i === 0 || i === SQUARE_COUNT - 1
		strip.appendChild(createSquare(turnNum, faded))
	}

	const frame = document.createElement('div')
	frame.className = 'dungeon-tracker-frame'

	const topRow = document.createElement('div')
	topRow.className = 'dungeon-tracker-row'
	topRow.appendChild(strip)
	topRow.appendChild(frame)

	// GM-only pause/reset buttons beside the strip
	if (game.user.isGM) {
		const controls = document.createElement('div')
		controls.className = 'dungeon-tracker-controls'

		const pauseBtn = document.createElement('button')
		pauseBtn.type = 'button'
		pauseBtn.className = `tracker-pause-btn${trackerPaused ? ' active' : ''}`
		pauseBtn.innerHTML = `<i class="fa-solid ${trackerPaused ? 'fa-play' : 'fa-pause'}"></i>`
		pauseBtn.title = game.i18n.localize(trackerPaused ? 'DOLMEN.DungeonTracker.Resume' : 'DOLMEN.DungeonTracker.Pause')
		pauseBtn.addEventListener('click', () => {
			trackerPaused = !trackerPaused
			saveTrackerPaused()
			updatePauseButton()
			renderLightPanel()
		})

		const resetBtn = document.createElement('button')
		resetBtn.type = 'button'
		resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>'
		resetBtn.title = game.i18n.localize('DOLMEN.DungeonTracker.Reset')
		resetBtn.addEventListener('click', () => resetWidget())

		const advanceBtn = document.createElement('button')
		advanceBtn.type = 'button'
		advanceBtn.className = 'tracker-advance-btn'
		advanceBtn.innerHTML = '<i class="fa-solid fa-forward-step"></i>'
		advanceBtn.title = game.i18n.localize('DOLMEN.DungeonTracker.AdvanceTurn')
		advanceBtn.addEventListener('click', () => {
			if (animating) {
				// Force-stop a runaway animation
				pendingTurns = 0
				return
			}
			const calendarOn = game.settings.get('dolmenwood', 'showCalendar')
			if (calendarOn) {
				// Advance world time by 10 minutes; if not paused the time hook
				// will also advance the turn, so only directly advance when paused
				game.time.advance(TURN_SECONDS)
				if (trackerPaused) advanceTurn(1)
			} else {
				advanceTurn(1)
			}
		})

		controls.appendChild(pauseBtn)
		controls.appendChild(resetBtn)
		topRow.appendChild(controls)
		topRow.appendChild(advanceBtn)
	}

	widgetEl.appendChild(topRow)
	injectLightPanel()
	document.body.appendChild(widgetEl)
	renderLightBars()
	renderLightPanel()
}

/**
 * Remove the widget from the DOM.
 */
function removeWidget() {
	if (widgetEl) {
		widgetEl.remove()
		widgetEl = null
	}
}

/**
 * Animate a single dungeon-turn step, then recurse for queued turns.
 *
 * Uses setTimeout instead of transitionend to avoid child opacity
 * transitions bubbling up and firing the callback prematurely.
 */
function animateOneTurn() {
	if (!widgetEl) return
	animating = true

	// Tab is backgrounded — browsers throttle timers, skip animation
	if (document.hidden) {
		const total = pendingTurns + 1
		for (let i = 0; i < total; i++) {
			turnCounter++
			postTurnMessage(turnCounter)
			decrementLightSources()
		}
		pendingTurns = 0
		animating = false
		currentSlideMs = SLIDE_NORMAL
		saveTurnCounter()
		rebuildSquares()
		return
	}

	const strip = widgetEl.querySelector('.dungeon-tracker-squares')
	const squares = Array.from(strip.querySelectorAll('.dungeon-square'))
	if (squares.length < 2) {
		animating = false
		return
	}

	// 1. Set speed/easing and kick off CSS transitions
	const isFirst = pendingTurns === batchTotal - 1
	const isLast = pendingTurns === 0
	let easing = 'linear'
	if (batchTotal <= 1) easing = 'ease'
	else if (isFirst) easing = 'ease-in'
	else if (isLast) easing = 'ease-out'
	strip.style.setProperty('--slide-speed', `${currentSlideMs}ms`)
	strip.style.setProperty('--slide-ease', easing)
	strip.classList.add('sliding')
	if (squares[1]) squares[1].classList.add('fade-out')
	const last = squares[squares.length - 1]
	if (last) last.classList.add('fade-in')

	// 2. After the transition duration, restructure the DOM
	setTimeout(() => {
		// Advance the turn counter and check for encounters / rest
		turnCounter++
		postTurnMessage(turnCounter)
		decrementLightSources()

		// Suppress the CSS transition so the reset is instant (no snap-back)
		strip.classList.add('no-transition')
		strip.classList.remove('sliding')

		// Remove the square that slid off the left edge
		squares[0].remove()

		// Force the browser to apply the no-transition state
		strip.offsetHeight

		// Re-enable transitions for the next animation
		strip.classList.remove('no-transition')

		// The square that was at [1] is now [0] — mark it faded
		const remaining = Array.from(strip.querySelectorAll('.dungeon-square'))
		if (remaining[0]) {
			remaining[0].classList.remove('fade-out')
			remaining[0].classList.add('faded')
		}

		// Clean fade-in class from what is now the last visible square
		const nowLast = remaining[remaining.length - 1]
		if (nowLast) {
			nowLast.classList.remove('fade-in')
			nowLast.classList.remove('faded')
		}

		// Append a new invisible square at the tail (6 turns ahead of current)
		strip.appendChild(createSquare(turnCounter + 6, true))

		// Sanity check — if square count is wrong, abort and rebuild
		const count = strip.querySelectorAll('.dungeon-square').length
		if (count !== SQUARE_COUNT) {
			pendingTurns = 0
			animating = false
			currentSlideMs = SLIDE_NORMAL
			saveTurnCounter()
			rebuildSquares()
			return
		}

		renderLightBars()
		renderLightPanel()

		animating = false

		// Drain the queue or reset speed
		if (pendingTurns > 0) {
			pendingTurns--
			requestAnimationFrame(() => animateOneTurn())
		} else {
			currentSlideMs = SLIDE_NORMAL
			saveTurnCounter()
		}
	}, currentSlideMs)
}

/**
 * Pick animation speed based on total turns to animate.
 */
function pickSpeed(totalTurns) {
	if (totalTurns >= 6) return SLIDE_FAST // 1 hour
	return SLIDE_NORMAL
}

/**
 * Queue one or more dungeon turns for sequential animation.
 */
function advanceTurn(count) {
	if (count <= 0) return
	if (animating) {
		pendingTurns = Math.min(pendingTurns + count, REST_THRESHOLD)
		return
	}
	pendingTurns += count - 1
	batchTotal = count
	currentSlideMs = pickSpeed(count)
	animateOneTurn()
}

/**
 * Reset the widget to its initial 8-square state.
 */
/**
 * Rebuild the square strip from the current turnCounter.
 */
function rebuildSquares() {
	if (!widgetEl) return
	pendingTurns = 0
	animating = false
	currentSlideMs = SLIDE_NORMAL

	const strip = widgetEl.querySelector('.dungeon-tracker-squares')
	strip.innerHTML = ''
	strip.classList.remove('sliding', 'no-transition')
	strip.style.removeProperty('--slide-speed')
	strip.style.removeProperty('--slide-ease')
	for (let i = 0; i < SQUARE_COUNT; i++) {
		const turnNum = turnCounter - 1 + i
		const faded = i === 0 || i === SQUARE_COUNT - 1
		strip.appendChild(createSquare(turnNum, faded))
	}
	renderLightBars()
	renderLightPanel()
}

function resetWidget() {
	if (!widgetEl) return
	turnCounter = 1
	lightSources = []
	if (game.user.isGM) {
		saveLightSources()
		saveTurnCounter()
	}
	rebuildSquares()
}

/**
 * Show a dialog for large time advances (8h rest).
 * GM-only — players just ignore the big jump.
 */
async function showRestDialog(turns) {
	if (!widgetEl) return

	const action = await DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.DungeonTracker.RestTitle') },
		content: `<p>${game.i18n.localize('DOLMEN.DungeonTracker.RestMessage')}</p>`,
		buttons: [
			{
				action: 'clear',
				icon: 'fas fa-rotate-left',
				label: game.i18n.localize('DOLMEN.DungeonTracker.RestClear')
			},
			{
				action: 'pause',
				icon: 'fas fa-pause',
				label: game.i18n.localize('DOLMEN.DungeonTracker.RestPause')
			},
			{
				action: 'process',
				icon: 'fas fa-forward',
				label: game.i18n.localize('DOLMEN.DungeonTracker.RestProcess')
			}
		],
		rejectClose: false
	})

	if (action === 'clear') {
		resetWidget()
	} else if (action === 'process') {
		// Silently process turns without animation
		for (let i = 0; i < turns; i++) {
			turnCounter++
			decrementLightSources()
		}
		saveTurnCounter()
		rebuildSquares()
	}
	// 'pause' and close-without-choice both do nothing
}

/**
 * Hook handler for updateWorldTime — detects 10-minute increments.
 * Large jumps (8h+) prompt the GM instead of auto-animating.
 */
function onUpdateWorldTime(worldTime) {
	if (previousWorldTime === null) {
		previousWorldTime = worldTime
		return
	}

	const delta = worldTime - previousWorldTime
	previousWorldTime = worldTime

	if (trackerPaused) return

	if (delta <= 0) return

	const turns = Math.floor(delta / TURN_SECONDS)
	if (turns <= 0) return

	if (turns >= REST_THRESHOLD) {
		// Large jump — GM gets a dialog, players wait for the GM's choice
		// to propagate via the trackerTurn setting onChange
		if (game.user.isGM && widgetEl) showRestDialog(turns)
	} else {
		advanceTurn(turns)
	}
}

/**
 * Toggle widget visibility. Called by setting onChange and on init.
 */
export function toggleDungeonTracker(visible) {
	document.body.classList.toggle('dungeon-tracker-active', visible)
	if (visible) {
		injectWidget()
	} else {
		removeWidget()
	}
}

/**
 * Initialize the dungeon tracker. Called from the ready hook.
 */
export function initDungeonTracker() {
	trackerPaused = game.settings.get('dolmenwood', 'trackerPaused')
	turnCounter = game.settings.get('dolmenwood', 'trackerTurn') || 1
	const show = game.settings.get('dolmenwood', 'showDungeonTracker')
	if (show) {
		document.body.classList.add('dungeon-tracker-active')
		loadLightSources()
		injectWidget()
	}

	previousWorldTime = game.time.worldTime

	Hooks.on('updateWorldTime', onUpdateWorldTime)

	// Rebuild squares when returning from a minimized/background tab
	// to fix any state corrupted by throttled timers during animation
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && widgetEl) {
			if (!game.user.isGM) {
				turnCounter = game.settings.get('dolmenwood', 'trackerTurn') || 1
				loadLightSources()
			}
			rebuildSquares()
		}
	})
}
