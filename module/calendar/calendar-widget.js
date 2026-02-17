/* global game, Hooks, CONFIG, foundry, ChatMessage */

import {
	worldTimeToCalendar, calendarToWorldTime,
	getSeason, getDaylightHours, getMoonForDay,
	getCelestialPosition, ordinalDay, getDayName, getHoliday
} from './calendar-time.js'
import { drawFromTableRaw } from '../utils/roll-tables.js'

const { DialogV2 } = foundry.applications.api

const ARC_WIDTH = 120
const ARC_HEIGHT = 62
const ARC_RADIUS = 42
const ARC_CX = ARC_WIDTH / 2
const ARC_CY = ARC_HEIGHT - 2

/**
 * Build the SVG arc with sun/moon positioned along it.
 */
function renderArc(position, isDay, phaseIcon) {
	const angle = position * Math.PI
	const cx = ARC_CX - ARC_RADIUS * Math.cos(angle)
	const cy = ARC_CY - ARC_RADIUS * Math.sin(angle)

	const arcStart = `${ARC_CX - ARC_RADIUS},${ARC_CY}`
	const arcEnd = `${ARC_CX + ARC_RADIUS},${ARC_CY}`

	const BODY_SIZE = 12
	let celestialBody
	if (isDay) {
		celestialBody = `
			<defs>
				<filter id="sun-glow">
					<feGaussianBlur stdDeviation="2" result="blur"/>
					<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
				</filter>
			</defs>
			<circle cx="${cx}" cy="${cy}" r="6" fill="#FFD700" filter="url(#sun-glow)"/>
		`
	} else {
		celestialBody = `
			<image href="systems/dolmenwood/assets/calendar/${phaseIcon}.webp"
				x="${cx - BODY_SIZE / 2}" y="${cy - BODY_SIZE / 2}"
				width="${BODY_SIZE}" height="${BODY_SIZE}"/>
		`
	}

	return `
		<svg class="calendar-arc-svg" width="${ARC_WIDTH}" height="${ARC_HEIGHT}" viewBox="0 0 ${ARC_WIDTH} ${ARC_HEIGHT}">
			<path d="M ${arcStart} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${arcEnd}"
				fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-dasharray="3,3"/>
			${celestialBody}
		</svg>
	`
}

/**
 * Compute opacities for the 4 sky background layers.
 * Crossfades: night → sunrise → midday → evening → night
 * The "from" layer stays at 1 while the "to" layer fades in on top.
 */
function computeSkyOpacities(hour, sunrise, sunset) {
	const dayLen = sunset - sunrise
	const nightLen = 24 - dayLen

	// Daylight split 25/50/25: sunrise→midday fade | midday hold | midday→evening fade
	// Nighttime split 25/50/25: evening→night fade | night hold | night→sunrise fade
	const nightEnd = sunrise - 0.25 * nightLen
	const morningEnd = sunrise + 0.25 * dayLen
	const afternoonStart = sunset - 0.25 * dayLen
	const eveningEnd = sunset + 0.25 * nightLen

	const o = { night: 0, sunrise: 0, midday: 0, evening: 0 }

	if (hour < nightEnd) {
		// Night hold
		o.night = 1
	} else if (hour < sunrise) {
		// Night → Sunrise crossfade (night stays at 1, sunrise fades in on top)
		const p = (hour - nightEnd) / (sunrise - nightEnd)
		o.night = 1
		o.sunrise = p
	} else if (hour < morningEnd) {
		// Sunrise → Midday crossfade (sunrise stays at 1, midday fades in on top)
		const p = (hour - sunrise) / (morningEnd - sunrise)
		o.sunrise = 1
		o.midday = p
	} else if (hour < afternoonStart) {
		// Midday hold
		o.midday = 1
	} else if (hour < sunset) {
		// Midday → Evening crossfade (midday stays at 1, evening fades in on top)
		const p = (hour - afternoonStart) / (sunset - afternoonStart)
		o.midday = 1
		o.evening = p
	} else if (hour < eveningEnd) {
		// Evening → Night crossfade (night at 1 underneath, evening fades out)
		const p = (hour - sunset) / (eveningEnd - sunset)
		o.night = 1
		o.evening = 1 - p
	} else {
		// Night hold
		o.night = 1
	}

	return o
}

/**
 * Parse a weather table result description into text and effect flags.
 * Descriptions may contain: "weather text<br><b>Effect:</b> description"
 */
function parseWeatherDescription(desc) {
	if (!desc) return { text: '', effects: '' }
	// Split on the first <br> to separate weather text from effects
	const parts = desc.split(/<br\s*\/?>/i)
	const text = parts[0].replace(/<[^>]+>/g, '').trim()
	let effects = ''
	const rest = parts.slice(1).join(' ')
	if (/travel\s+impeded/i.test(rest)) effects += 'I'
	if (/poor\s+visibility/i.test(rest)) effects += 'V'
	if (/wet\s+conditions/i.test(rest)) effects += 'W'
	return { text, effects }
}

/**
 * Return a Font Awesome icon class based on weather description keywords.
 */
function getWeatherIcon(text) {
	const t = text.toLowerCase()
	if (/blizzard|snow/.test(t)) return 'fa-snowflake'
	if (/storm|thunder/.test(t)) return 'fa-cloud-bolt'
	if (/rain|drizzle|downpour|torrential/.test(t)) return 'fa-cloud-rain'
	if (/fog|mist/.test(t)) return 'fa-smog'
	if (/wind|blustery|bracing/.test(t)) return 'fa-wind'
	if (/sun|sunny|clear|bright/.test(t)) return 'fa-sun'
	if (/cloud|overcast|gloomy|brooding/.test(t)) return 'fa-cloud'
	if (/hot|humid|sweltering|baking|balmy/.test(t)) return 'fa-temperature-high'
	if (/cold|frigid|freezing|icy|frost|chill|bitter/.test(t)) return 'fa-temperature-low'
	if (/dew|damp/.test(t)) return 'fa-droplet'
	return 'fa-cloud-sun'
}

/**
 * Roll weather from the appropriate season/unseason table (GM only).
 * Saves result to world setting and posts a chat message.
 */
async function rollWeather() {
	if (!game.user.isGM) return

	const cal = worldTimeToCalendar(game.time.worldTime)
	const season = getSeason(cal.monthKey)
	const activeUnseason = game.settings.get('dolmenwood', 'activeUnseason')

	// Determine which table to use
	let tableKey = season
	if (activeUnseason && CONFIG.DOLMENWOOD.unseasonWeatherTable[activeUnseason]) {
		tableKey = CONFIG.DOLMENWOOD.unseasonWeatherTable[activeUnseason]
	}
	const tableName = CONFIG.DOLMENWOOD.weatherTableNames[tableKey]
	if (!tableName) return

	const draw = await drawFromTableRaw(tableName)
	if (!draw) return

	const desc = draw.result.description || draw.result.text || ''
	const { text, effects } = parseWeatherDescription(desc)
	const roll = draw.roll.total

	// Save to world setting
	await game.settings.set('dolmenwood', 'currentWeather', { text, effects, roll })

	// Build effect badges for chat
	const effectLabels = {
		I: game.i18n.localize('DOLMEN.Calendar.Weather.Impeded'),
		V: game.i18n.localize('DOLMEN.Calendar.Weather.Visibility'),
		W: game.i18n.localize('DOLMEN.Calendar.Weather.Wet')
	}
	let effectsHtml = ''
	for (const flag of effects) {
		if (effectLabels[flag]) {
			effectsHtml += `<div style="margin-top: 4px; font-size: 11px; opacity: 0.85;">\u26a0 ${effectLabels[flag]}</div>`
		}
	}

	const icon = getWeatherIcon(text)
	const chatTitle = game.i18n.localize('DOLMEN.Calendar.Weather.ChatTitle')
	const content = `
		<div style="padding: 4px 0;">
			<div style="font-weight: 700; margin-bottom: 4px;">
				<i class="fa-solid ${icon}"></i> ${chatTitle}
			</div>
			<div>
				<strong>${roll}</strong> &mdash; ${text}
			</div>
			${effectsHtml}
		</div>
	`

	ChatMessage.create({
		content,
		speaker: { alias: chatTitle },
		sound: CONFIG.sounds.dice
	})
}

/**
 * Build the full widget HTML.
 */
function renderWidget() {
	const worldTime = game.time.worldTime
	const cal = worldTimeToCalendar(worldTime)
	const season = getSeason(cal.monthKey)
	const { sunrise, sunset } = getDaylightHours(cal.monthKey)
	const { moon, phase, phaseIcon } = getMoonForDay(cal.dayOfYear)
	const { position, isDay } = getCelestialPosition(cal.hour + cal.minute / 60, sunrise, sunset)

	const monthName = game.i18n.localize(`DOLMEN.Months.${cal.monthKey}`)
	const seasonName = game.i18n.localize(`DOLMEN.Calendar.Seasons.${season}`)
	const moonName = game.i18n.localize(`DOLMEN.MoonNames.${moon}`)
	const phaseName = game.i18n.localize(`DOLMEN.MoonPhases.${phase}`)
	const seasonData = CONFIG.DOLMENWOOD.seasons[season]
	const activeUnseason = game.settings.get('dolmenwood', 'activeUnseason')
	const timeStr = `${String(cal.hour).padStart(2, '0')}:${String(cal.minute).padStart(2, '0')}`
	const dateStr = `${ordinalDay(cal.day)} of ${monthName}, ${game.i18n.localize('DOLMEN.Calendar.Year')} ${cal.year}`

	// Day name (weekday or wysenday)
	const { name: dayNameKey, isWysenday } = getDayName(cal.monthKey, cal.day)
	const dayDisplayName = isWysenday
		? dayNameKey
		: game.i18n.localize(`DOLMEN.Calendar.WeekDays.${dayNameKey}`)

	// Holiday
	const holiday = getHoliday(cal.monthKey, cal.day)
	const holidayHtml = holiday
		? `<div class="calendar-holiday-stripe">
				<i class="fa-solid fa-star"></i>
				<span>${holiday}</span>
			</div>`
		: ''

	const arcSvg = renderArc(position, isDay, phaseIcon)
	const sky = computeSkyOpacities(cal.hour + cal.minute / 60, sunrise, sunset)
	const arcBg = `
		<img class="calendar-arc-bg" src="systems/dolmenwood/assets/calendar/night.webp" alt="" style="opacity: ${sky.night}">
		<img class="calendar-arc-bg" src="systems/dolmenwood/assets/calendar/sunrise.webp" alt="" style="opacity: ${sky.sunrise}">
		<img class="calendar-arc-bg" src="systems/dolmenwood/assets/calendar/midday.webp" alt="" style="opacity: ${sky.midday}">
		<img class="calendar-arc-bg" src="systems/dolmenwood/assets/calendar/evening.webp" alt="" style="opacity: ${sky.evening}">
	`

	const isGM = game.user.isGM
	const gmControls = isGM ? `
		<div class="calendar-gm-controls">
			<button type="button" class="calendar-gm-btn" data-advance="600" title="${game.i18n.localize('DOLMEN.Calendar.Advance10Min')}">+10m</button>
			<button type="button" class="calendar-gm-btn" data-advance="3600" title="${game.i18n.localize('DOLMEN.Calendar.Advance1Hr')}">+1h</button>
			<button type="button" class="calendar-gm-btn" data-advance="28800" title="${game.i18n.localize('DOLMEN.Calendar.Advance8Hr')}">+8h</button>
		</div>
	` : ''

	// Weather bar data
	const weather = game.settings.get('dolmenwood', 'currentWeather')
	const hasWeather = weather && weather.text
	let weatherBarHtml = ''
	if (hasWeather) {
		const wIcon = getWeatherIcon(weather.text)
		let badges = ''
		const badgeInfo = {
			I: game.i18n.localize('DOLMEN.Calendar.Weather.Impeded'),
			V: game.i18n.localize('DOLMEN.Calendar.Weather.Visibility'),
			W: game.i18n.localize('DOLMEN.Calendar.Weather.Wet')
		}
		for (const flag of (weather.effects || '')) {
			if (badgeInfo[flag]) {
				badges += `<span class="weather-badge weather-badge-${flag}" title="${badgeInfo[flag]}">${flag}</span>`
			}
		}
		const rollBtn = isGM
			? `<a class="calendar-weather-roll" title="${game.i18n.localize('DOLMEN.Calendar.Weather.RollWeather')}"><i class="fa-solid fa-dice"></i></a>`
			: ''
		weatherBarHtml = `
			<div class="calendar-weather-bar">
				<i class="fa-solid ${wIcon}"></i>
				<span class="calendar-weather-text">${weather.text}</span>
				${badges}
				${rollBtn}
			</div>`
	} else if (isGM) {
		weatherBarHtml = `
			<div class="calendar-weather-bar">
				<span class="calendar-weather-text">${game.i18n.localize('DOLMEN.Calendar.Weather.NoWeather')}</span>
				<a class="calendar-weather-roll" title="${game.i18n.localize('DOLMEN.Calendar.Weather.RollWeather')}"><i class="fa-solid fa-dice"></i></a>
			</div>`
	}

	return `
		<div class="calendar-arc-container">${arcBg}${arcSvg}</div>
		<div class="calendar-row">
			${weatherBarHtml}
			<div class="calendar-bar">
				<div class="calendar-section calendar-day-name${isWysenday ? ' wysenday' : ''}">
					<span>${dayDisplayName}</span>
				</div>
				<div class="calendar-divider"></div>
				<div class="calendar-section calendar-date${isGM ? ' gm-clickable' : ''}">
					${holidayHtml}
					<i class="fa-solid fa-calendar-day"></i>
					<span>${dateStr}</span>
				</div>
				<div class="calendar-divider"></div>
				<div class="calendar-section calendar-time${isGM ? ' gm-clickable' : ''}">
					${gmControls}
					<i class="fa-solid fa-clock"></i>
					<span>${timeStr}</span>
				</div>
				<div class="calendar-divider"></div>
				<div class="calendar-section calendar-season${isGM ? ' gm-clickable' : ''}">
					${activeUnseason ? `<div class="calendar-unseason-stripe">
						<i class="${CONFIG.DOLMENWOOD.unseasons[activeUnseason]?.icon ?? 'fa-solid fa-bolt'}"></i>
						<span>${game.i18n.localize(`DOLMEN.Calendar.Unseasons.${activeUnseason}`)}</span>
					</div>` : ''}
					<i class="${seasonData.icon}"></i>
					<span>${seasonName}</span>
				</div>
				<div class="calendar-divider"></div>
				<div class="calendar-section calendar-moon">
					<img class="calendar-moon-icon" src="systems/dolmenwood/assets/calendar/${phaseIcon}.webp" alt="${phaseName}">
					<span>${moonName} (${phaseName})</span>
				</div>
			</div>
		</div>
	`
}

/**
 * Position the widget centered above the hotbar using its bounding rect.
 */
function updateWidgetPosition(widget) {
	const hotbar = document.getElementById('hotbar')
	if (!hotbar) return
	const rect = hotbar.getBoundingClientRect()
	const widgetRect = widget.getBoundingClientRect()
	widget.style.left = `${rect.left + rect.width / 2 - widgetRect.width / 2}px`
	widget.style.bottom = `${window.innerHeight - rect.top + 4}px`
}

/**
 * Inject or update the widget in the DOM.
 */
function injectWidget() {
	let widget = document.getElementById('dolmen-calendar-widget')
	if (!widget) {
		widget = document.createElement('div')
		widget.id = 'dolmen-calendar-widget'
		widget.classList.add('dolmen')
		document.body.appendChild(widget)
	}
	widget.innerHTML = renderWidget()
	attachListeners(widget)
	requestAnimationFrame(() => updateWidgetPosition(widget))
}

/**
 * Attach click listeners to GM controls.
 */
function attachListeners(widget) {
	for (const btn of widget.querySelectorAll('.calendar-gm-btn[data-advance]')) {
		btn.addEventListener('click', (e) => {
			e.stopPropagation()
			const seconds = parseInt(btn.dataset.advance)
			game.time.advance(seconds)
		})
	}
	const dateSection = widget.querySelector('.calendar-date.gm-clickable')
	if (dateSection) {
		dateSection.addEventListener('click', openSetDateDialog)
	}
	const timeSection = widget.querySelector('.calendar-time.gm-clickable')
	if (timeSection) {
		timeSection.addEventListener('click', openSetTimeDialog)
	}
	const seasonSection = widget.querySelector('.calendar-season.gm-clickable')
	if (seasonSection) {
		seasonSection.addEventListener('click', openSetUnseasonDialog)
	}
	const weatherBtn = widget.querySelector('.calendar-weather-roll')
	if (weatherBtn) {
		weatherBtn.addEventListener('click', (e) => {
			e.stopPropagation()
			rollWeather()
		})
	}
}

/**
 * Build the inner HTML for the calendar date picker.
 */
function buildPickerContent(year, monthKey, selectedDay) {
	const monthName = game.i18n.localize(`DOLMEN.Months.${monthKey}`)
	const weekDays = CONFIG.DOLMENWOOD.weekDays
	const holidays = CONFIG.DOLMENWOOD.holidays[monthKey] || {}
	const wysendays = CONFIG.DOLMENWOOD.wysendays[monthKey]
	const yearLabel = game.i18n.localize('DOLMEN.Calendar.Year')

	// Weekday headers
	const headers = weekDays.map(key => {
		const short = game.i18n.localize(`DOLMEN.Calendar.WeekDaysShort.${key}`)
		return `<th>${short}</th>`
	}).join('')

	// Day cells (4 rows x 7 cols = 28 regular days)
	let gridRows = ''
	for (let row = 0; row < 4; row++) {
		let cells = ''
		for (let col = 0; col < 7; col++) {
			const day = row * 7 + col + 1
			const selected = day === selectedDay ? ' selected' : ''
			const holiday = holidays[day]
			const holidayClass = holiday ? ' holiday' : ''
			const titleAttr = holiday ? ` title="${holiday}"` : ''
			cells += `<td><div class="calendar-picker-day${selected}${holidayClass}" data-calendar-day="${day}"${titleAttr}>${day}</div></td>`
		}
		gridRows += `<tr>${cells}</tr>`
	}

	// Wysenday pills (days 29+)
	let wysendayHtml = ''
	if (wysendays && wysendays.length > 0) {
		const pills = wysendays.map((name, i) => {
			const day = 29 + i
			const selected = day === selectedDay ? ' selected' : ''
			const holiday = holidays[day]
			const holidayClass = holiday ? ' holiday' : ''
			const titleAttr = holiday ? ` title="${holiday}"` : ''
			return `<div class="calendar-picker-wysenday${selected}${holidayClass}" data-calendar-day="${day}"${titleAttr}>${name}</div>`
		}).join('')
		wysendayHtml = `<div class="calendar-picker-wysendays">${pills}</div>`
	}

	return `
		<div class="calendar-picker-nav">
			<button type="button" data-calendar-nav="prev-year" title="Previous year">\u00AB</button>
			<button type="button" data-calendar-nav="prev-month" title="Previous month">\u2039</button>
			<div class="calendar-picker-title">${monthName}, ${yearLabel} ${year}</div>
			<button type="button" data-calendar-nav="next-month" title="Next month">\u203A</button>
			<button type="button" data-calendar-nav="next-year" title="Next year">\u00BB</button>
		</div>
		<table class="calendar-picker-grid">
			<thead><tr>${headers}</tr></thead>
			<tbody>${gridRows}</tbody>
		</table>
		${wysendayHtml}
	`
}

/**
 * Open a calendar-style dialog to set the game date.
 */
function openSetDateDialog() {
	const cal = worldTimeToCalendar(game.time.worldTime)
	const monthKeys = Object.keys(CONFIG.DOLMENWOOD.months)

	const content = `<div class="calendar-picker" data-year="${cal.year}" data-month="${cal.monthKey}" data-selected-day="${cal.day}">
		${buildPickerContent(cal.year, cal.monthKey, cal.day)}
	</div>`

	function handlePickerClick(event) {
		const picker = document.querySelector('.calendar-picker')
		if (!picker) return

		// Day / wysenday selection
		const dayEl = event.target.closest('[data-calendar-day]')
		if (dayEl && picker.contains(dayEl)) {
			picker.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'))
			dayEl.classList.add('selected')
			picker.dataset.selectedDay = dayEl.dataset.calendarDay
			return
		}

		// Nav buttons
		const navBtn = event.target.closest('[data-calendar-nav]')
		if (navBtn && picker.contains(navBtn)) {
			const action = navBtn.dataset.calendarNav
			let year = parseInt(picker.dataset.year)
			let monthIndex = monthKeys.indexOf(picker.dataset.month)
			let selectedDay = parseInt(picker.dataset.selectedDay)

			if (action === 'prev-year') year = Math.max(1, year - 1)
			else if (action === 'next-year') year++
			else if (action === 'prev-month') {
				monthIndex--
				if (monthIndex < 0) {
					monthIndex = monthKeys.length - 1
					year = Math.max(1, year - 1)
				}
			} else if (action === 'next-month') {
				monthIndex++
				if (monthIndex >= monthKeys.length) {
					monthIndex = 0
					year++
				}
			}

			const newMonthKey = monthKeys[monthIndex]
			const maxDays = CONFIG.DOLMENWOOD.months[newMonthKey].days
			selectedDay = Math.min(selectedDay, maxDays)

			picker.dataset.year = year
			picker.dataset.month = newMonthKey
			picker.dataset.selectedDay = selectedDay
			picker.innerHTML = buildPickerContent(year, newMonthKey, selectedDay)
		}
	}

	document.addEventListener('click', handlePickerClick, true)

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.Calendar.SetDateTitle') },
		content,
		buttons: [
			{
				action: 'set',
				label: game.i18n.localize('DOLMEN.Calendar.SetTimeConfirm'),
				icon: 'fas fa-check',
				callback: () => {
					const picker = document.querySelector('.calendar-picker')
					if (!picker) return
					const current = worldTimeToCalendar(game.time.worldTime)
					const year = parseInt(picker.dataset.year) || 1
					const monthKey = picker.dataset.month
					const day = parseInt(picker.dataset.selectedDay) || 1
					const newTime = calendarToWorldTime(year, monthKey, day, current.hour, current.minute)
					game.time.advance(newTime - game.time.worldTime)
				}
			},
			{
				action: 'cancel',
				label: game.i18n.localize('DOLMEN.Cancel'),
				icon: 'fas fa-times'
			}
		]
	}).finally(() => {
		document.removeEventListener('click', handlePickerClick, true)
	})
}

/**
 * Open a dialog to set the game time (hour and minute).
 */
function openSetTimeDialog() {
	const cal = worldTimeToCalendar(game.time.worldTime)

	const content = `
		<div class="calendar-time-form">
			<input type="number" class="calendar-time-hour" value="${String(cal.hour).padStart(2, '0')}" min="0" max="23">
			<span class="calendar-time-colon">:</span>
			<input type="number" class="calendar-time-minute" value="${String(cal.minute).padStart(2, '0')}" min="0" max="59">
		</div>
	`

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.Calendar.SetTimeTitle') },
		content,
		buttons: [
			{
				action: 'set',
				label: game.i18n.localize('DOLMEN.Calendar.SetTimeConfirm'),
				icon: 'fas fa-check',
				callback: (event, button) => {
					const form = button.closest('.dialog-content') ?? button.closest('.window-content')
					const hour = Math.min(Math.max(parseInt(form.querySelector('.calendar-time-hour')?.value) || 0, 0), 23)
					const minute = Math.min(Math.max(parseInt(form.querySelector('.calendar-time-minute')?.value) || 0, 0), 59)
					const current = worldTimeToCalendar(game.time.worldTime)
					const newTime = calendarToWorldTime(current.year, current.monthKey, current.day, hour, minute)
					game.time.advance(newTime - game.time.worldTime)
				}
			},
			{
				action: 'cancel',
				label: game.i18n.localize('DOLMEN.Cancel'),
				icon: 'fas fa-times'
			}
		]
	})
}

/**
 * Open a dialog to set or clear the active unseason.
 */
function openSetUnseasonDialog() {
	const cal = worldTimeToCalendar(game.time.worldTime)
	const current = game.settings.get('dolmenwood', 'activeUnseason')

	// Build radio options: "None" plus each unseason valid for the current month
	const unseasons = CONFIG.DOLMENWOOD.unseasons
	let options = `<label class="calendar-unseason-option">
		<input type="radio" name="unseason" value="" ${!current ? 'checked' : ''}>
		<span>${game.i18n.localize('DOLMEN.Calendar.UnseasonsNone')}</span>
	</label>`
	for (const [key, data] of Object.entries(unseasons)) {
		const valid = data.months.includes(cal.monthKey)
		const checked = current === key ? ' checked' : ''
		const disabled = !valid && current !== key ? ' disabled' : ''
		const name = game.i18n.localize(`DOLMEN.Calendar.Unseasons.${key}`)
		const cls = valid ? '' : ' class="calendar-unseason-unavailable"'
		options += `<label class="calendar-unseason-option"${cls}>
			<input type="radio" name="unseason" value="${key}"${checked}${disabled}>
			<i class="${data.icon}"></i>
			<span>${name}</span>
		</label>`
	}

	const content = `<div class="calendar-unseason-form">${options}</div>`

	DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.Calendar.SetUnseasonTitle') },
		content,
		buttons: [
			{
				action: 'set',
				label: game.i18n.localize('DOLMEN.Calendar.SetTimeConfirm'),
				icon: 'fas fa-check',
				callback: (event, button) => {
					const form = button.closest('.dialog-content') ?? button.closest('.window-content')
					const selected = form.querySelector('input[name="unseason"]:checked')
					const value = selected ? selected.value : ''
					game.settings.set('dolmenwood', 'activeUnseason', value)
				}
			},
			{
				action: 'cancel',
				label: game.i18n.localize('DOLMEN.Cancel'),
				icon: 'fas fa-times'
			}
		]
	})
}

/**
 * Toggle widget visibility based on setting.
 */
function toggleWidget(visible) {
	const widget = document.getElementById('dolmen-calendar-widget')
	if (visible && !widget) {
		injectWidget()
	} else if (widget) {
		widget.classList.toggle('hidden', !visible)
		if (visible) updateWidgetPosition(widget)
	}
}

/** Debounced resize handler reference for cleanup */
let resizeHandler = null

/**
 * Initialize the calendar widget. Called from the ready hook.
 */
export function initCalendarWidget() {
	const enabled = game.settings.get('dolmenwood', 'showCalendar')
	if (enabled) injectWidget()

	// Re-inject when hotbar renders (position may have changed)
	Hooks.on('renderHotbar', () => {
		if (game.settings.get('dolmenwood', 'showCalendar')) {
			injectWidget()
		}
	})

	// Update display when world time changes
	Hooks.on('updateWorldTime', () => {
		if (game.settings.get('dolmenwood', 'showCalendar')) {
			injectWidget()
		}
	})

	// Re-render when unseason or weather setting changes
	Hooks.on('updateSetting', (setting) => {
		if ((setting.key === 'dolmenwood.activeUnseason' || setting.key === 'dolmenwood.currentWeather')
			&& game.settings.get('dolmenwood', 'showCalendar')) {
			injectWidget()
		}
	})

	// Reposition on window resize / fullscreen change
	resizeHandler = foundry.utils.debounce(() => {
		const widget = document.getElementById('dolmen-calendar-widget')
		if (widget && game.settings.get('dolmenwood', 'showCalendar')) {
			updateWidgetPosition(widget)
		}
	}, 100)
	window.addEventListener('resize', resizeHandler)
	document.addEventListener('fullscreenchange', resizeHandler)
}

export { toggleWidget }
