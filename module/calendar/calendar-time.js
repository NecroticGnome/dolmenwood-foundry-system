/* global CONFIG */

/**
 * Convert Foundry worldTime (seconds) to a Dolmenwood calendar date.
 * Epoch: worldTime=0 → BASE_YEAR, 1st Grimvold, 00:00
 */
export function worldTimeToCalendar(worldTime) {
	const { BASE_YEAR, DAYS_PER_YEAR, SECONDS_PER_DAY, months, monthOffsets } = CONFIG.DOLMENWOOD
	const totalDays = Math.floor(worldTime / SECONDS_PER_DAY)
	const year = Math.floor(totalDays / DAYS_PER_YEAR) + BASE_YEAR
	const dayOfYear = (totalDays % DAYS_PER_YEAR) + 1
	const remainderSeconds = worldTime % SECONDS_PER_DAY
	const hour = Math.floor(remainderSeconds / 3600)
	const minute = Math.floor((remainderSeconds % 3600) / 60)

	const monthKeys = Object.keys(months)
	const offsets = Object.values(monthOffsets)
	let monthIndex = 0
	for (let i = monthKeys.length - 1; i >= 0; i--) {
		if (dayOfYear > offsets[i]) {
			monthIndex = i
			break
		}
	}
	const monthKey = monthKeys[monthIndex]
	const day = dayOfYear - offsets[monthIndex]

	return { year, monthKey, monthIndex, day, dayOfYear, hour, minute }
}

/**
 * Convert calendar components back to Foundry worldTime (seconds).
 */
export function calendarToWorldTime(year, monthKey, day, hour, minute) {
	const { BASE_YEAR, DAYS_PER_YEAR, SECONDS_PER_DAY, monthOffsets } = CONFIG.DOLMENWOOD
	const dayOfYear = monthOffsets[monthKey] + day
	const totalDays = (year - BASE_YEAR) * DAYS_PER_YEAR + (dayOfYear - 1)
	return totalDays * SECONDS_PER_DAY + hour * 3600 + minute * 60
}

/**
 * Get the season key for a given month key.
 */
export function getSeason(monthKey) {
	return CONFIG.DOLMENWOOD.monthToSeason[monthKey] ?? 'winter'
}

/**
 * Get sunrise/sunset hours for a month.
 */
export function getDaylightHours(monthKey) {
	const data = CONFIG.DOLMENWOOD.months[monthKey]
	return { sunrise: data.sunrise, sunset: data.sunset }
}

/**
 * Look up the moon name, phase, and visual phase icon for a given day of the year.
 * Returns { moon, phase, phaseIcon } where phaseIcon is the image filename.
 */
export function getMoonForDay(dayOfYear) {
	for (const [start, end, moon, phase] of CONFIG.DOLMENWOOD.moonSignTable) {
		if (dayOfYear >= start && dayOfYear <= end) {
			const duration = end - start + 1
			const progress = duration > 1 ? (dayOfYear - start) / (duration - 1) : 0.5
			return { moon, phase, phaseIcon: getPhaseIcon(phase, progress) }
		}
	}
	return { moon: 'black', phase: 'waning', phaseIcon: 'moon_waning_crescent' }
}

/**
 * Map a phase (waxing/full/waning) and progress (0-1) to a detailed moon icon filename.
 */
function getPhaseIcon(phase, progress) {
	if (phase === 'full') return 'moon_full'
	if (phase === 'waxing') {
		if (progress < 0.15) return 'moon_new'
		if (progress < 0.4) return 'moon_waning_crescent'
		if (progress < 0.65) return 'moon_third_quarter'
		return 'moon_waning_gibbous'
	}
	// waning
	if (progress < 0.35) return 'moon_waxing_gibbous'
	if (progress < 0.6) return 'moon_first_quarter'
	if (progress < 0.85) return 'moon_waxing_crescent'
	return 'moon_new'
}

/**
 * Calculate celestial body position on the arc.
 * Returns { position: 0-1, isDay: boolean }
 * position 0 = left (rise), 0.5 = zenith, 1 = right (set)
 * Sun zenith is fixed at 12:00, moon zenith at 0:00.
 */
export function getCelestialPosition(hour, sunrise, sunset) {
	if (hour >= sunrise && hour <= sunset) {
		// Daytime: sun rises at sunrise, peaks at 12:00, sets at sunset
		const morningLen = 12 - sunrise
		const afternoonLen = sunset - 12
		if (hour <= 12) {
			return { position: morningLen > 0 ? 0.5 * (hour - sunrise) / morningLen : 0.5, isDay: true }
		}
		return { position: 0.5 + (afternoonLen > 0 ? 0.5 * (hour - 12) / afternoonLen : 0.5), isDay: true }
	}
	// Nighttime: moon rises at sunset, peaks at 0:00, sets at sunrise
	const eveningLen = 24 - sunset   // sunset → midnight
	const predawnLen = sunrise        // midnight → sunrise
	if (hour > sunset) {
		return { position: eveningLen > 0 ? 0.5 * (hour - sunset) / eveningLen : 0.5, isDay: false }
	}
	return { position: 0.5 + (predawnLen > 0 ? 0.5 * hour / predawnLen : 0.5), isDay: false }
}

/**
 * Format a day number as an ordinal string (1st, 2nd, 3rd, etc.)
 */
export function ordinalDay(day) {
	const j = day % 10
	const k = day % 100
	if (j === 1 && k !== 11) return `${day}st`
	if (j === 2 && k !== 12) return `${day}nd`
	if (j === 3 && k !== 13) return `${day}rd`
	return `${day}th`
}

/**
 * Get the day name: a weekday key (days 1-28) or a wysenday name (days 29+).
 * Returns { name: string, isWysenday: boolean }
 * For weekdays, name is a key into CONFIG.DOLMENWOOD.weekDays (e.g. 'colly').
 * For wysendays, name is the proper display name (e.g. 'Hanglemas').
 */
export function getDayName(monthKey, day) {
	if (day > 28) {
		const names = CONFIG.DOLMENWOOD.wysendays[monthKey]
		if (names && names[day - 29]) {
			return { name: names[day - 29], isWysenday: true }
		}
		return { name: null, isWysenday: true }
	}
	const weekDayIndex = (day - 1) % 7
	return { name: CONFIG.DOLMENWOOD.weekDays[weekDayIndex], isWysenday: false }
}

/**
 * Get the holiday name for a given month and day, or null if none.
 */
export function getHoliday(monthKey, day) {
	const monthHolidays = CONFIG.DOLMENWOOD.holidays[monthKey]
	if (!monthHolidays) return null
	return monthHolidays[day] ?? null
}

/**
 * Get the days within a month where a moon phase transition occurs.
 * A transition is the first day of a new moonSignTable entry.
 * Returns Map<dayOfMonth, { moon, phase }>.
 */
export function getMoonChangesForMonth(monthKey) {
	const { months, monthOffsets, moonSignTable } = CONFIG.DOLMENWOOD
	const offset = monthOffsets[monthKey]
	const startDoy = offset + 1
	const endDoy = offset + months[monthKey].days
	const changes = new Map()
	for (const [start, , moon, phase] of moonSignTable) {
		if (start >= startDoy && start <= endDoy) {
			changes.set(start - offset, { moon, phase })
		}
	}
	return changes
}
