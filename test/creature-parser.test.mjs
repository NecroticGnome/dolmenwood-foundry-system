import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalize, parseStatblock, parseOSEStatblock } from '../module/creature-parser.js'

// Each fixture is test/fixtures/creature/<format>/<slug>.txt (a paste, kept messy) with a matching .json:
// { data: {the fields to check}, warnings: <count> } or { error: <i18n key> }.
// Only the keys in `data` are compared, recursing into objects and array items.
const FIXTURES = new URL('./fixtures/creature/', import.meta.url)
const PARSERS = { dolmenwood: parseStatblock, ose: parseOSEStatblock }

function assertSubset(actual, expected, path = 'data') {
	if (Array.isArray(expected)) {
		assert.equal(actual?.length, expected.length, `${path}.length`)
		expected.forEach((e, i) => assertSubset(actual[i], e, `${path}[${i}]`))
	} else if (expected && typeof expected === 'object') {
		for (const [k, v] of Object.entries(expected)) assertSubset(actual?.[k], v, `${path}.${k}`)
	} else {
		assert.equal(actual, expected, path)
	}
}

for (const [format, parse] of Object.entries(PARSERS)) {
	const dir = new URL(`${format}/`, FIXTURES)
	for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
		test(`${format}: ${file}`, () => {
			const text = fs.readFileSync(new URL(file, dir), 'utf8')
			const expected = JSON.parse(fs.readFileSync(new URL(file.replace(/\.txt$/, '.json'), dir), 'utf8'))
			if (expected.error) return assert.throws(() => parse(text), { message: expected.error })
			const { data, warnings } = parse(text)
			assertSubset(data, expected.data)
			assert.equal(warnings.length, expected.warnings, `warnings: ${warnings.map(w => w.key).join(', ')}`)
		})
	}
}

test('normalize: PDF clean-up rules', () => {
	assert.equal(normalize('eﬀects  dis­ease'), 'effects disease') // nfkc, invisible, whitespace
	assert.equal(normalize('Small Demi–Fey—Sentient--Neutral'), 'Small Demi—Fey—Sentient—Neutral') // dashes
	assert.equal(normalize('Small Demi‑fey', { dash: '-' }), 'Small Demi-fey')
	assert.equal(normalize('60′ “hi” it’s'), '60\' "hi" it\'s') // quotes and primes
	assert.equal(normalize('1d10 × 1,000gp'), '1d10 x 1,000gp') // times
	assert.equal(normalize('mist-\nwreathed Semi-\nIntelligent'), 'mistwreathed Semi-Intelligent') // dehyphenate
	assert.equal(normalize('a\r\n\r\n  b  \f\n'), 'a\nb') // whitespace
	assert.equal(normalize('Part T wo | Bestiary\nName\n37\n2.\nA Reader (Order #51488968)\nCombat Stats\nText'), 'Name\nText') // noise
})

test('dolmenwood: the name must look like a name', () => {
	const stats = '\nMedium Mortal—Sentient—Neutral\nLevel 1 AC 10 HP 1d8 (4) Saves D12 R13 H14 B15 S16\nAtt Club (+0, 1d4) Speed 40 Morale 7 XP 10'
	assert.equal(parseStatblock('GOBLIN KING OF THE WOOD' + stats).data.name, 'Goblin King of the Wood')
	const { data, warnings } = parseStatblock('Squat, ugly creatures that lurk in the woods. Fond of mischief.' + stats)
	assert.equal(data.name, '')
	assert.match(data.description, /^Squat, ugly/)
	assert.ok(warnings.some(w => w.key.endsWith('.NoName')))
})

test('dolmenwood: abilities named like stats, and keywords partway along a line', () => {
	const { data, warnings } = parseStatblock(`BEETLE, GIANT
Big beetles.
Medium Bug—Animal Intelligence—Neutral
Level 2 AC 14 HP 2d8 (9) Saves D12 R13 H14 B15 S16
Att Bite (+1, 1d6) Speed 30 Morale 8 (11 when guarding)
XP 20 Enc 2d4 Hoard Shiny things (see below)
Morale: Fight on when guarding eggs.
Hoard: 20% chance of 1d6 gems.`)
	assert.equal(data.morale, 8)
	assert.equal(data.treasureType, 'Shiny things (see below)')
	assert.deepEqual(data.specialAbilities.map(a => a.name), ['Morale', 'Hoard'])
	assert.equal(warnings.length, 0)
})

test('dolmenwood: a creature that only swims has speed 0, without a warning', () => {
	const { data, warnings } = parseStatblock(`Pike Thing
Medium Animal—Animal Intelligence—Neutral
Level 1 AC 12 HP 1d8 (4) Saves D12 R13 H14 B15 S16
Attacks Bite (+0, 1d4) Swim 40 Morale 7 XP 10`)
	assert.equal(data.speed, 0)
	assert.equal(data.movement.swim, 40)
	assert.equal(warnings.length, 0)
})

test('dolmenwood: Campaign Book NPC stats with no name line, fixed HP and a high level', () => {
	const { data, warnings } = parseStatblock(`Combat Stats
Large Monstrosity—Genius—Chaotic
Level 22 AC 20 HP 112 Saves D2 R2 H2 B2 S2
Att [6 hooves (+14, 1d4) and horn (+14, 1d10)]
or gaze (hypnotism) Speed 50 Morale 10
XP 15,350`)
	assert.equal(data.name, '')
	assert.equal(data.level, 22)
	assert.equal(data.hpValue, 112)
	assert.deepEqual(data.attacks.map(a => [a.numAttacks, a.attackName, a.attackGroup]), [[6, 'Hooves', 'a'], [1, 'Horn', 'a'], [1, 'Gaze', 'b']])
	assert.deepEqual(warnings.map(w => w.key.split('.').pop()), ['NoName', 'NoHPDice'])
})

test('ose: fractional HD and "AL Any"', () => {
	const { data, warnings } = parseOSEStatblock('Rat Thing\nAC 7 [12] HD ½ (2hp) Att Bite (1d3) THAC0 19 [0] MV 60′ (20′) SV D12 W13 P14 B15 S16 (NH) ML 8 AL Any XP 5 NA 2d6 (2d6) TT None')
	assert.deepEqual([data.level, data.hpDice, data.hpValue, data.alignment], [1, '1d4', 2, 'any'])
	assert.equal(warnings.length, 1) // just the size/type/intelligence reminder
})

test('ose: a statblock covering several Hit Dice uses the largest', () => {
	const { data, warnings } = parseOSEStatblock('Whirl Spirit\nAC 2 [17] HD 8/12/16* (36/54/72hp) Att Blow (1d8/1d10/1d12) THAC0 12 [+7] / 9 [+10] / 7 [+12] MV 120\' (40\') SV By Hit Dice ML 10 AL Neutral XP 1,200/1,900/3,000 NA 1 (1) TT None')
	assert.deepEqual([data.level, data.hpDice, data.hpValue, data.ac, data.xpAward], [16, '16d8', 72, 17, 3000])
	assert.deepEqual(data.attacks.map(a => [a.attackName, a.attackBonus, a.attackDamage]), [['Blow', 12, '1d12']])
	assert.deepEqual(data.saves, { doom: 2, ray: 3, hold: 4, blast: 3, spell: 6 })
	assert.ok(warnings.some(w => w.key.endsWith('.OSEVariants')))
})

test('dolmenwood: every defaulted field is reported', () => {
	const { data, warnings } = parseStatblock('Mystery\nLevel 3 AC 12\nSome text')
	assert.equal(data.level, 3)
	const keys = warnings.map(w => w.key.split('.').pop())
	for (const k of ['NoTypeLine', 'NoHP', 'NoSaves', 'NoAttacks', 'NoSpeed', 'NoMorale', 'NoXP']) assert.ok(keys.includes(k), k)
})
