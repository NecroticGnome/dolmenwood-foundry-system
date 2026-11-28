/**
 * Travel Procedure rules, kept free of Foundry calls so they can be tested.
 *
 * Travel and Losing Direction (DPB): road, no chance of getting lost; track, 1-in-6; travelling
 * wild, the terrain's Lost/Encounters chance. Reduced visibility adds 1, darkness adds 2. No risk
 * with a reliable guide, following a road or river, or heading towards an obvious landmark.
 * The Campaign Book (p112) limits the poor visibility increase to travelling wild.
 * Random Encounters use the terrain's Lost/Encounters chance on any route.
 *
 * Travel Points (DPB): a party has Speed ÷ 5 Travel Points per day, using its slowest member's
 * Speed (Time and Movement). A forced march gives 50% more. Travel impeded weather (DCB) costs 2.
 */

/** Lost/Encounters X-in-6 chance by terrain (Terrain Types, DPB). */
export const TERRAIN_CHANCE = { light: 1, moderate: 2, difficult: 3 }

/** Chance of getting lost when following a track. */
export const TRACK_CHANCE = 1

/**
 * The X-in-6 chance of getting lost today.
 * @param {object} options
 * @param {'road'|'track'|'wild'} options.route
 * @param {number} options.chance - The terrain's Lost/Encounters chance
 * @param {boolean} [options.noRisk] - Reliable guide, following a road or river, or an obvious landmark
 * @param {boolean} [options.poorVisibility] - Fog, blizzard, or a weather result marked V
 * @param {boolean} [options.darkness]
 * @param {boolean} [options.visibilityOnTracks] - Also apply poor visibility on tracks
 * @returns {number} 0 to 6
 */
export function losingDirectionChance({ route, chance, noRisk = false, poorVisibility = false, darkness = false, visibilityOnTracks = false }) {
	if (noRisk || route === 'road') return 0
	let result = route === 'track' ? TRACK_CHANCE : chance
	if (poorVisibility && (route === 'wild' || visibilityOnTracks)) result += 1
	if (darkness) result += 2
	return Math.min(Math.max(result, 0), 6)
}

/**
 * Whether an X-in-6 roll comes up.
 * @param {number} face - The d6 result
 * @param {number} chance - X in X-in-6
 * @returns {boolean}
 */
export function inSix(face, chance) {
	return face <= chance
}

/**
 * Encounter distance in feet: 2d6 × 30′, halved in poor visibility (DCB p112).
 * @param {number} total - The 2d6 total
 * @param {boolean} [poorVisibility]
 * @returns {number}
 */
export function encounterDistance(total, poorVisibility = false) {
	const feet = total * 30
	return poorVisibility ? feet / 2 : feet
}

/** Speeds on the Travel Points Per Day table, fastest first (mounted 40, cart or wagon 30). */
export const TRAVEL_SPEEDS = [40, 30, 20, 10]

/**
 * Travel Points for the day.
 * @param {object} options
 * @param {number} options.base - Normal Travel Points (the party's Speed ÷ 5)
 * @param {boolean} [options.forcedMarch] - 50% more
 * @param {boolean} [options.impeded] - Travel impeded weather, 2 fewer
 * @returns {number}
 */
export function travelPoints({ base, forcedMarch = false, impeded = false }) {
	const points = forcedMarch ? Math.floor(base * 1.5) : base
	return Math.max(points - (impeded ? 2 : 0), 0)
}

/**
 * The party's normal Travel Points: those of its slowest member.
 * @param {number[]} memberPoints - Each member's Travel Points per day
 * @returns {number|null} null with no members
 */
export function partyTravelPoints(memberPoints) {
	const known = memberPoints.filter(Number.isFinite)
	return known.length ? Math.min(...known) : null
}
