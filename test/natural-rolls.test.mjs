import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { resolveD6Check, resolveD20Roll, withNaturalNote } from '../module/utils/natural-rolls.js'

// Core Rules (https://www.dolmenwood.necroticgnome.com/rules/doku.php?id=core_rules):
// Skill and Ability Checks: "1s and 6s: A roll of natural 1 always fails and a roll of natural 6 always succeeds, irrespective of modifiers."
// Saving Throws and Attack Rolls: "1s and 20s", likewise.

before(() => {
	// The helpers only use game.i18n for the note text
	globalThis.game = { i18n: { localize: key => ({ 'DOLMEN.Roll.Natural1': 'natural 1', 'DOLMEN.Roll.Natural6': 'natural 6', 'DOLMEN.Roll.Natural20': 'natural 20' })[key] } }
})

/** The rule as written, independent of the implementation. */
function expected(natural, total, target, faces) {
	const byTotal = total >= target
	if (natural === 1) return { isSuccess: false, naturalNote: byTotal ? 'natural 1' : '' }
	if (natural === faces) return { isSuccess: true, naturalNote: byTotal ? '' : `natural ${faces}` }
	return { isSuccess: byTotal, naturalNote: '' }
}

test('d6 checks follow 1s and 6s for every face, modifier, and target', () => {
	for (const target of [2, 3, 4, 5, 6]) {
		for (let mod = -5; mod <= 5; mod++) {
			for (let natural = 1; natural <= 6; natural++) {
				const total = natural + mod
				assert.deepEqual(resolveD6Check(natural, total, target), expected(natural, total, target, 6), `d6=${natural} mod=${mod} target=${target}`)
			}
		}
	}
})

test('d20 saves and attacks follow 1s and 20s for every face, modifier, and target', () => {
	for (const target of [2, 5, 10, 11, 14, 17, 19, 20, 22, 25]) {
		for (let mod = -8; mod <= 8; mod++) {
			for (let natural = 1; natural <= 20; natural++) {
				const total = natural + mod
				assert.deepEqual(resolveD20Roll(natural, total, target), expected(natural, total, target, 20), `d20=${natural} mod=${mod} target=${target}`)
			}
		}
	}
})

test('named cases', () => {
	// Ability check (target 4): a +3 modifier does not save a natural 1
	assert.deepEqual(resolveD6Check(1, 4, 4), { isSuccess: false, naturalNote: 'natural 1' })
	// Ability check: a natural 6 at -4 still succeeds
	assert.deepEqual(resolveD6Check(6, 2, 4), { isSuccess: true, naturalNote: 'natural 6' })
	// Skill check (target 6): a natural 6 with no modifier succeeds without a note
	assert.deepEqual(resolveD6Check(6, 6, 6), { isSuccess: true, naturalNote: '' })
	// Attack vs AC 17: a natural 20 at -6 still hits
	assert.deepEqual(resolveD20Roll(20, 14, 17), { isSuccess: true, naturalNote: 'natural 20' })
	// Save vs target 10: a natural 1 at +12 still fails
	assert.deepEqual(resolveD20Roll(1, 13, 10), { isSuccess: false, naturalNote: 'natural 1' })
	// Ordinary rolls are decided by the total
	assert.deepEqual(resolveD20Roll(12, 14, 14), { isSuccess: true, naturalNote: '' })
	assert.deepEqual(resolveD20Roll(12, 13, 14), { isSuccess: false, naturalNote: '' })
})

test('withNaturalNote only decorates when there is a note', () => {
	assert.equal(withNaturalNote('Hit', 'natural 20'), 'Hit (natural 20)')
	assert.equal(withNaturalNote('Success', ''), 'Success')
})
