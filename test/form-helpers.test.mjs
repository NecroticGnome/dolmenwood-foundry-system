import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteCSV, extractJSON } from '../module/utils/form-helpers.js'

test('rewriteCSV splits, trims, and drops empty entries', () => {
	const obj = { 'system.languages': 'woldish,  elvish , ,sylvan' }
	rewriteCSV(obj, 'system.languages')
	assert.deepEqual(obj, {
		'system.languages.0': 'woldish',
		'system.languages.1': 'elvish',
		'system.languages.2': 'sylvan'
	})
})

test('rewriteCSV ignores non-string values', () => {
	const obj = { 'system.languages': ['already', 'an', 'array'] }
	rewriteCSV(obj, 'system.languages')
	assert.deepEqual(obj, { 'system.languages': ['already', 'an', 'array'] })
})

test('extractJSON parses listed fields and removes them', () => {
	const flat = { 'system.attacks': '[{"name":"Bite"}]', 'system.name': 'Goblin' }
	const out = extractJSON(flat, ['attacks'], 'system')
	assert.deepEqual(out, { attacks: [{ name: 'Bite' }] })
	assert.deepEqual(flat, { 'system.name': 'Goblin' })
})

test('extractJSON keeps invalid JSON in place', () => {
	const flat = { 'system.attacks': '[not json' }
	assert.deepEqual(extractJSON(flat, ['attacks'], 'system'), {})
	assert.deepEqual(flat, { 'system.attacks': '[not json' })
})
