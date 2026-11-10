import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSaveLinks } from '../module/utils/save-links.js'

test('save link becomes an anchor', () => {
	assert.equal(
		parseSaveLinks('[Save vs. Hold](save:hold)'),
		'<a class="inline-save-link" data-save="hold">Save vs. Hold</a>'
	)
})

test('ability, skill, and chance links', () => {
	assert.equal(parseSaveLinks('[STR](ability:str)'), '<a class="inline-ability-link" data-ability="str">STR</a>')
	assert.equal(parseSaveLinks('[Listen](skill:listen)'), '<a class="inline-skill-link" data-skill="listen">Listen</a>')
	assert.equal(parseSaveLinks('[Hide](chance:2)'), '<a class="inline-chance-link" data-target="2">Hide</a>')
})

test('several links in one string', () => {
	assert.equal(
		parseSaveLinks('Roll [Doom](save:doom) or [DEX](ability:dex).'),
		'Roll <a class="inline-save-link" data-save="doom">Doom</a> or <a class="inline-ability-link" data-ability="dex">DEX</a>.'
	)
})

test('non-numeric chance target is left alone', () => {
	assert.equal(parseSaveLinks('[Hide](chance:two)'), '[Hide](chance:two)')
})

test('empty and plain text pass through', () => {
	assert.equal(parseSaveLinks(''), '')
	assert.equal(parseSaveLinks(null), null)
	assert.equal(parseSaveLinks('no links here'), 'no links here')
})
