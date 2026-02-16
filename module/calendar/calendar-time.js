/* global CONFIG */

/**
 * Convert Foundry worldTime (seconds) to a Dolmenwood calendar date.
 * Epoch: worldTime=0 → Year 1, 1st Grimvold, 00:00
 */
export function worldTimeToCalendar(worldTime) {
	const { DAYS_PER_YEAR, SECONDS_PER_DAY, months, monthOffsets } = CONFIG.DOLMENWOOD
	const totalDays = Math.floor(worldTime / SECONDS_PER_DAY)
	const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1
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
	const { DAYS_PER_YEAR, SECONDS_PER_DAY, monthOffsets } = CONFIG.DOLMENWOOD
	const dayOfYear = monthOffsets[monthKey] + day
	const totalDays = (year - 1) * DAYS_PER_YEAR + (dayOfYear - 1)
	return totalDays * SECONDS_PER_DAY + hour * 3600 + minute * 60
}

/**
 * Get the season key for a given month key.
 */
export function getSeason(monthKey) {
	return CONFIG.DOLMENWOOD.monthToSeason[monthKey] ?? 'winter'
}

/**
 * Get sunrise/sunset hours for a season.
 */
export function getDaylightHours(season) {
	const data = CONFIG.DOLMENWOOD.seasons[season]
	return { sunrise: data.sunrise, sunset: data.sunset }
}

/**
 * Look up the moon name and phase for a given day of the year.
 */
export function getMoonForDay(dayOfYear) {
	for (const [start, end, moon, phase] of CONFIG.DOLMENWOOD.moonSignTable) {
		if (dayOfYear >= start && dayOfYear <= end) {
			return { moon, phase }
		}
	}
	return { moon: 'black', phase: 'waning' }
}

/**
 * Calculate celestial body position on the arc.
 * Returns { position: 0-1, isDay: boolean }
 * position 0 = left (rise), 0.5 = zenith, 1 = right (set)
 */
export function getCelestialPosition(hour, sunrise, sunset) {
	const fractionalHour = hour
	if (fractionalHour >= sunrise && fractionalHour <= sunset) {
		const dayLength = sunset - sunrise
		const position = (fractionalHour - sunrise) / dayLength
		return { position, isDay: true }
	}
	const nightLength = 24 - (sunset - sunrise)
	let nightElapsed
	if (fractionalHour > sunset) {
		nightElapsed = fractionalHour - sunset
	} else {
		nightElapsed = (24 - sunset) + fractionalHour
	}
	const position = nightElapsed / nightLength
	return { position, isDay: false }
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
