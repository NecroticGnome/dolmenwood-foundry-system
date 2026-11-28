import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TERRAIN_CHANCE, TRAVEL_SPEEDS, losingDirectionChance, inSix, encounterDistance, travelPoints, partyTravelPoints } from '../module/travel/travel-rules.js'

// Travel (https://www.dolmenwood.necroticgnome.com/rules/doku.php?id=travel):
// road, no chance of getting lost; track, 1-in-6; travelling wild, by terrain.
// "In conditions of reduced visibility, such as fog or blizzards, the chance of getting lost
// increases by 1 (e.g. 2-in-6 becomes 3-in-6), and in darkness by 2."
// Campaign Book p112: poor visibility increases it "while travelling wild".

test('terrain chances match the Terrain Types table', () => {
	assert.deepEqual(TERRAIN_CHANCE, { light: 1, moderate: 2, difficult: 3 })
})

test('road has no chance of getting lost, whatever the conditions', () => {
	assert.equal(losingDirectionChance({ route: 'road', chance: 3, poorVisibility: true, darkness: true, visibilityOnTracks: true }), 0)
})

test('track is 1-in-6, whatever the terrain', () => {
	for (const chance of [1, 2, 3]) assert.equal(losingDirectionChance({ route: 'track', chance }), 1)
})

test('travelling wild uses the terrain chance', () => {
	for (const chance of [1, 2, 3]) assert.equal(losingDirectionChance({ route: 'wild', chance }), chance)
})

test('the rules example: 2-in-6 becomes 3-in-6 in reduced visibility', () => {
	assert.equal(losingDirectionChance({ route: 'wild', chance: 2, poorVisibility: true }), 3)
})

test('poor visibility applies on tracks only when the setting is on', () => {
	assert.equal(losingDirectionChance({ route: 'track', chance: 2, poorVisibility: true }), 1)
	assert.equal(losingDirectionChance({ route: 'track', chance: 2, poorVisibility: true, visibilityOnTracks: true }), 2)
})

test('darkness adds 2 on tracks and travelling wild', () => {
	assert.equal(losingDirectionChance({ route: 'track', chance: 1, darkness: true }), 3)
	assert.equal(losingDirectionChance({ route: 'wild', chance: 2, darkness: true }), 4)
})

test('visibility and darkness add together and cap at 6-in-6', () => {
	assert.equal(losingDirectionChance({ route: 'wild', chance: 3, poorVisibility: true, darkness: true }), 6)
	assert.equal(losingDirectionChance({ route: 'wild', chance: 5, poorVisibility: true, darkness: true }), 6)
})

test('no risk of getting lost overrides everything', () => {
	assert.equal(losingDirectionChance({ route: 'wild', chance: 3, noRisk: true, poorVisibility: true, darkness: true }), 0)
})

test('X-in-6 comes up on X or lower', () => {
	assert.equal(inSix(3, 3), true)
	assert.equal(inSix(4, 3), false)
	assert.equal(inSix(1, 0), false)
})

test('encounter distance is 2d6 × 30′, halved in poor visibility', () => {
	assert.equal(encounterDistance(7), 210)
	assert.equal(encounterDistance(7, true), 105)
})

// Travel Points Per Day table: Speed 40 → 8 (forced march 12), 30 → 6 (9), 20 → 4 (6), 10 → 2 (3).
test('Travel Points match the Travel Points Per Day table', () => {
	const table = { 40: [8, 12], 30: [6, 9], 20: [4, 6], 10: [2, 3] }
	for (const speed of TRAVEL_SPEEDS) {
		const base = speed / 5
		assert.deepEqual([travelPoints({ base }), travelPoints({ base, forcedMarch: true })], table[speed])
	}
})

test('travel impeded costs 2 Travel Points, after a forced march, never below 0', () => {
	assert.equal(travelPoints({ base: 8, impeded: true }), 6)
	assert.equal(travelPoints({ base: 8, forcedMarch: true, impeded: true }), 10)
	assert.equal(travelPoints({ base: 2, impeded: true }), 0)
	assert.equal(travelPoints({ base: 1, impeded: true }), 0)
})

test('the party uses its slowest member', () => {
	assert.equal(partyTravelPoints([8, 6, 8]), 6)
	assert.equal(partyTravelPoints([8, undefined, NaN]), 8)
	assert.equal(partyTravelPoints([]), null)
})
