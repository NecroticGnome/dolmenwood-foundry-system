/**
 * Travel Procedure rules, kept free of Foundry calls so they can be tested.
 *
 * Travel and Losing Direction (DPB): road, no chance of getting lost; track, 1-in-6; travelling
 * wild, the terrain's Lost/Encounters chance. Reduced visibility adds 1, darkness adds 2. No risk
 * with a reliable guide, following a road or river, or heading towards an obvious landmark.
 * The Campaign Book (p112) limits the poor visibility increase to travelling wild.
 * Random Encounters use the terrain's Lost/Encounters chance on any route.
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
