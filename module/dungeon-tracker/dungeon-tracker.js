/* global game, Hooks, foundry, Roll, ChatMessage, CONFIG */

const { DialogV2 } = foundry.applications.api

const SQUARE_COUNT = 8
const TURN_SECONDS = 600 // 10 minutes
const REST_THRESHOLD = 48 // 8 hours — prompt instead of auto-animate
const SLIDE_NORMAL = 400
const SLIDE_FAST = 150 // 1 hour (6 turns)

let previousWorldTime = null
let widgetEl = null
let animating = false
let pendingTurns = 0
let currentSlideMs = SLIDE_NORMAL
let batchTotal = 0
let turnCounter = 1 // turn number under the frame (index 1)

/**
 * Return the icon class for a given turn number, or null.
 * Every 6th turn: rest icon (takes priority). Every 2nd turn: roll icon.
 */
function getSquareIcon(turnNum) {
	if (turnNum <= 0) return null
	if (turnNum % 6 === 0) return 'fa-solid fa-campground'
	if (turnNum % 2 === 0) return 'fa-solid fa-dice'
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
		i.className = icon
		sq.appendChild(i)
	}
	return sq
}

/**
 * Roll a random encounter check (d6) and post to chat.
 * Only runs for the GM when the setting is enabled and it's an even turn.
 */
async function rollEncounterCheck(turnNum) {
	if (!game.user.isGM) return
	const chance = game.settings.get('dolmenwood', 'encounterChance')
	if (!chance) return
	if (turnNum <= 0 || turnNum % 2 !== 0) return

	const roll = new Roll('1d6')
	await roll.evaluate()

	const encountered = roll.total <= chance
	const resultKey = encountered
		? 'DOLMEN.DungeonTracker.EncounterYes'
		: 'DOLMEN.DungeonTracker.EncounterNo'
	const resultClass = encountered ? 'encounter-yes' : 'encounter-no'

	await ChatMessage.create({
		content: `<div class="dolmen dolmen-combat-roll">
			<h3><i class="fa-solid fa-dice"></i> ${game.i18n.localize('DOLMEN.DungeonTracker.EncounterCheck')}</h3>
			<div class="dolmen-roll-details">
				<div>${game.i18n.localize('DOLMEN.DungeonTracker.Turn')} ${turnNum}</div>
				<div>${game.i18n.localize('DOLMEN.Roll.Result')}: ${roll.total} / ${chance}</div>
				<div class="dolmen-roll-result ${resultClass}">${game.i18n.localize(resultKey)}</div>
			</div>
		</div>`,
		sound: CONFIG.sounds.dice,
		speaker: { alias: game.i18n.localize('DOLMEN.DungeonTracker.EncounterCheck') }
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

	widgetEl.appendChild(strip)
	widgetEl.appendChild(frame)
	document.body.appendChild(widgetEl)
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
		// Advance the turn counter and check for encounters
		turnCounter++
		rollEncounterCheck(turnCounter)

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

		animating = false

		// Drain the queue or reset speed
		if (pendingTurns > 0) {
			pendingTurns--
			requestAnimationFrame(() => animateOneTurn())
		} else {
			currentSlideMs = SLIDE_NORMAL
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
		pendingTurns += count
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
function resetWidget() {
	if (!widgetEl) return
	pendingTurns = 0
	animating = false
	currentSlideMs = SLIDE_NORMAL
	turnCounter = 1
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
		advanceTurn(turns)
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

	if (delta <= 0) return

	const turns = Math.floor(delta / TURN_SECONDS)
	if (turns <= 0) return

	if (turns >= REST_THRESHOLD && game.user.isGM && widgetEl) {
		showRestDialog(turns)
	} else {
		advanceTurn(turns)
	}
}

/**
 * Toggle widget visibility. Called by setting onChange and on init.
 */
export function toggleDungeonTracker(visible) {
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
	const show = game.settings.get('dolmenwood', 'showDungeonTracker')
	if (show) injectWidget()

	previousWorldTime = game.time.worldTime

	Hooks.on('updateWorldTime', onUpdateWorldTime)
}
