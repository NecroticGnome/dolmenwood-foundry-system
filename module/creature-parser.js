/**
 * Creature statblock parser. Pure functions with no Foundry calls, so they run under node --test.
 *
 * parseStatblock(text) and parseOSEStatblock(text) return { data, warnings }. Each warning is
 * { key, data }, with key under DOLMEN.CreatureImport.Warn, and there is one per field that was
 * guessed or defaulted. A paste that can't be read throws an Error whose message is a
 * DOLMEN.CreatureImport.Error key.
 *
 * The Pirate Borg and OSE importers use the same shape and the same normalize() rules.
 */

import { OSEMonsterParser } from './vendor/ose-monster-parser.js'

// --- Text clean-up ---

const SMALL_WORDS = new Set(['a', 'an', 'and', 'in', 'of', 'on', 'or', 'the', 'to'])

/**
 * Clean up text copied out of a PDF. The rules run in this order:
 * nfkc, invisible, dashes, quotes, times, dehyphenate, whitespace, noise.
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.dash='—'] - What en and em dashes become. Dolmenwood keeps em-dashes
 *   because its type line uses them as separators, while values like "demi-fey" contain real
 *   hyphens. OSE uses '-'.
 * @returns {string} The trimmed, non-blank lines, joined by \n
 */
export function normalize(text, { dash = '—' } = {}) {
	text = String(text ?? '')
		.normalize('NFKC') // nfkc: ligatures, non-breaking spaces, full-width forms
		.replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '') // invisible: soft hyphens, zero-width characters
		.replace(/[–—\u2015]|--/g, dash) // dashes
		.replace(/[\u2010\u2011‒\u2212]/g, '-')
		.replace(/[\u2018\u2019\u201A\u201B\u2032`]/g, "'") // quotes and primes
		.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
		.replace(/\u00D7/g, 'x') // times
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t\f\v]+\n/g, '\n')
		.replace(/([a-z])-\n[ \t]*([a-z])/g, '$1$2') // dehyphenate: "mist-\nwreathed" becomes "mistwreathed"
		.replace(/-\n[ \t]*([A-Z])/g, '-$1') //        while "Semi-\nIntelligent" keeps its hyphen
		.replace(/—\n[ \t]*/g, '—') //        and a type line that wraps after a dash is rejoined
	return text.split('\n')
		.map(l => l.replace(/[ \t\f\v]+/g, ' ').trim()) // whitespace
		.filter(l => l && !isNoise(l))
		.join('\n')
}

/** noise: page numbers, bare list markers, store watermarks, running page headers */
function isNoise(line) {
	return /^\d{1,3}$/.test(line)
		|| /^\d{1,2}\.$/.test(line)
		|| /\(Order #\d+\)/.test(line)
		|| /^Part [A-Za-z ]+\|/.test(line) // "Part Two | Bestiary"
		|| /^Combat Stats$/i.test(line) //     the heading over Campaign Book NPC stats
}

/** Whether a line could be a creature name: short, with no sentence punctuation. */
function looksLikeName(line) {
	return !!line && line.length <= 60 && line.split(/\s+/).length <= 6 && !/[.;:!?]/.test(line)
}

/** ALL CAPS names become Title Case. Names already in mixed case are kept as written. */
function cleanName(line) {
	if (/[a-z]/.test(line)) return line
	return line.toLowerCase().replace(/[a-z][a-z']*/g, (w, i) => (i && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
}

/** Text laid out as an OSE statblock, used for the "switch format?" error. */
const looksOSE = text => /\bTHAC0\b|\bHD\s+\d|\bSV\s+D\d/i.test(text)
/** Text laid out as a Dolmenwood statblock. */
const looksDolmenwood = text => /\bLevel\s+\d+\s+AC\b|\bSaves\s+D\d+\s+R\d+/i.test(text)

/** A warnings list and the function that adds to it. */
function warnings() {
	const list = []
	return [list, (key, data = {}) => list.push({ key: `DOLMEN.CreatureImport.Warn.${key}`, data })]
}

// --- Lookup Maps ---

const SIZE_MAP = {
	'tiny': 'small',
	'small': 'small',
	'medium': 'medium',
	'large': 'large',
	'huge': 'large',
	'gigantic': 'large'
}

const MONSTER_TYPE_MAP = {
	'animal': 'animal',
	'bug': 'bug',
	'construct': 'construct',
	'demi-fey': 'demi-fey',
	'dragon': 'dragon',
	'fairy': 'fairy',
	'fungus': 'fungus',
	'monstrosity': 'monstrosity',
	'mortal': 'mortal',
	'ooze': 'ooze',
	'plant': 'plant',
	'undead': 'undead'
}

const INTELLIGENCE_MAP = {
	'mindless': 'mindless',
	'animal intelligence': 'animal',
	'semi-intelligent': 'semi-intelligent',
	'sentient': 'sentient',
	'genius': 'genius'
}

const ALIGNMENT_MAP = {
	'lawful': 'lawful',
	'neutral': 'neutral',
	'chaotic': 'chaotic',
	'any alignment': 'any',
	'any': 'any', // OSE "AL Any"
	'alignment by individual': 'any',
	'alignment by season': 'bySeason',
	'lawful or neutral': 'lawfulOrNeutral',
	'neutral or chaotic': 'neutralOrChaotic'
}

// --- Helpers ---

/**
 * Convert "Save vs. X" / "Save Versus X" patterns into enriched save links.
 * E.g. "Save vs. Hold" → "[Save vs. Hold](save:hold)"
 * @param {string} text
 * @returns {string}
 */
function enrichSaveLinks(text) {
	return text.replace(/\bSave\s+(?:vs\.?|Versus)\s+(Doom|Ray|Hold|Blast|Spell)\b/gi,
		(match, saveKey) => `[${match}](save:${saveKey.toLowerCase()})`)
}

/**
 * Convert dice roll formulas (e.g. "1d6", "2d8+1") into Foundry inline rolls.
 * E.g. "1d6" → "[[/r 1d6]]"
 * @param {string} text
 * @returns {string}
 */
function enrichRollFormulas(text) {
	return text.replace(/\b(\d+d\d+(?:[+-]\d+)?)\b/g, '[[/r $1]]')
}

// --- Attack Parser ---

/**
 * Parse the attack portion of a statblock into structured attack objects.
 * @param {string} attackStr - Raw attack text between "Att" and "Speed"
 * @returns {object[]} Array of attack data objects
 */
/**
 * Capitalize the first letter of a string.
 */
function capitalize(str) {
	if (!str) return str
	return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Clean an attack name: strip leading "or"/"and", capitalize first letter.
 */
function cleanAttackName(name) {
	name = name.trim().replace(/^(?:or|and)\s+/i, '').trim()
	return name.charAt(0).toUpperCase() + name.slice(1)
}

function parseAttacks(attackStr) {
	if (!attackStr.trim() || attackStr.trim() === '\u2014') return []

	// Strip square brackets used for grouping attacks
	attackStr = attackStr.replace(/[[\]]/g, '')
	// Normalize separators: preserve or/and distinction for group assignment
	// "|" = or (new group), "&" = and (same group)
	attackStr = attackStr.replace(/\)\s+or\s+/gi, ') | ')
	attackStr = attackStr.replace(/\)\s+and\s+/gi, ') & ')
	attackStr = attackStr.replace(/^\s*(?:or|and)\s+/i, '')

	const attacks = [] // each entry gets a temporary _pos for ordering

	// Pass 1: Match standard attacks — [N] name (+bonus, damage)
	const attackRe = /(\d+)?\s*([a-zA-Z][a-zA-Z ]*?)\s*\(([+-]?\d+),\s*(.+?)\)/g
	let remaining = attackStr
	let m

	while ((m = attackRe.exec(attackStr)) !== null) {
		const raw = m[4].trim()
		const saveIdx = raw.search(/\bSave\s+(?:vs\.?|Versus)\s+(?:Doom|Ray|Hold|Blast|Spell)\b/i)
		let damage = raw
		let effect = ''
		if (saveIdx > 0) {
			damage = raw.slice(0, saveIdx).trim().replace(/[,+\s]+$/, '')
			effect = enrichSaveLinks(raw.slice(saveIdx).trim())
		}
		// Split "dice + effect text" (e.g. "1d3 + poison") — only when the part after + is non-numeric
		const effectSplit = damage.match(/^(\d+d\d+(?:[+-]\d+)?)\s*\+\s*([a-zA-Z].*)$/)
		if (effectSplit) {
			damage = effectSplit[1].trim()
			const extraEffect = effectSplit[2].trim()
			effect = effect ? effect + '\n' + extraEffect : extraEffect
		}
		// Handle "X or Y" alternative damage (e.g. "2 or 4")
		const altMatch = damage.match(/^(.+?)\s+or\s+(.+)$/i)
		if (altMatch) {
			damage = altMatch[1].trim()
			const altNote = `Alternative damage: ${altMatch[2].trim()} (check abilities)`
			effect = effect ? effect + '\n' + altNote : altNote
		}
		// Extract "when mounted" from damage into effect
		const mountedMatch = damage.match(/,?\s*when mounted/i)
		if (mountedMatch) {
			damage = damage.slice(0, mountedMatch.index).trim()
			const mountedNote = 'When mounted'
			effect = effect ? effect + '\n' + mountedNote : mountedNote
		}
		// Extract range (e.g. "range 20'/40'/60'" or "range 20\u2032/40\u2032/60\u2032") from damage or effect
		let rangeShort = 0, rangeMedium = 0, rangeLong = 0
		const rangeRe = /,?\s*range\s+(\d+)[\u2032']\s*\/\s*(\d+)[\u2032']\s*\/\s*(\d+)[\u2032']/i
		const rangeMatch = damage.match(rangeRe) || effect.match(rangeRe)
		if (rangeMatch) {
			rangeShort = parseInt(rangeMatch[1])
			rangeMedium = parseInt(rangeMatch[2])
			rangeLong = parseInt(rangeMatch[3])
			damage = damage.replace(rangeRe, '').trim()
			effect = effect.replace(rangeRe, '').trim()
		}
		attacks.push({
			_pos: m.index,
			numAttacks: m[1] ? parseInt(m[1]) : 1,
			attackName: cleanAttackName(m[2]),
			attackBonus: parseInt(m[3]),
			attackDamage: damage,
			attackEffect: capitalize(effect),
			attackType: 'attack',
			rangeShort,
			rangeMedium,
			rangeLong,
			attackGroup: ''
		})
		// Blank out matched portion so pass 2 skips it
		remaining = remaining.slice(0, m.index) + ' '.repeat(m[0].length) + remaining.slice(m.index + m[0].length)
	}

	// Pass 1b: Match damage-only attacks — name (damage[, extra]) with no +bonus
	const dmgOnlyRe = /(\d+)?\s*([a-zA-Z][a-zA-Z ]*?)\s*\((\d+d\d+(?:[+-]\d+)?)\s*(?:,\s*(.+?))?\)/g
	while ((m = dmgOnlyRe.exec(remaining)) !== null) {
		const damage = m[3].trim()
		const extra = m[4] ? m[4].trim() : ''
		attacks.push({
			_pos: m.index,
			numAttacks: m[1] ? parseInt(m[1]) : 1,
			attackName: cleanAttackName(m[2]),
			attackBonus: 0,
			attackDamage: damage,
			attackEffect: extra,
			attackType: 'save',
			rangeShort: 0,
			rangeMedium: 0,
			rangeLong: 0,
			attackGroup: ''
		})
		remaining = remaining.slice(0, m.index) + ' '.repeat(m[0].length) + remaining.slice(m.index + m[0].length)
	}

	// Pass 2: Match effect-only attacks — name (effect) with no comma inside parens
	const effectRe = /([a-zA-Z][a-zA-Z ]*?)\s*\(([^,)]+)\)/g
	while ((m = effectRe.exec(remaining)) !== null) {
		const name = cleanAttackName(m[1])
		const inner = m[2].trim()
		// "Weapon (+3)" — generic weapon attack with bonus only
		if (name.toLowerCase() === 'weapon' && /^[+-]?\d+$/.test(inner)) {
			attacks.push({
				_pos: m.index,
				numAttacks: 1,
				attackName: name,
				attackBonus: parseInt(inner),
				attackDamage: '1d6',
				attackEffect: '(Replace the damage formula with the weapon damage)',
				attackType: 'attack',
				rangeShort: 0,
				rangeMedium: 0,
				rangeLong: 0,
				attackGroup: ''
			})
		} else {
			const effectText = enrichSaveLinks(inner)
			attacks.push({
				_pos: m.index,
				numAttacks: 1,
				attackName: name,
				attackBonus: 0,
				attackDamage: '\u2014',
				attackEffect: capitalize(effectText),
				attackType: 'save',
				rangeShort: 0,
				rangeMedium: 0,
				rangeLong: 0,
				attackGroup: ''
			})
		}
	}

	// Assign group colors based on separator: "or" (|) = new group, "and" (&) = same group
	const groups = ['a', 'b', 'c', 'd', 'e', 'f']
	attacks.sort((a, b) => a._pos - b._pos)
	let groupIdx = 0
	for (let i = 0; i < attacks.length; i++) {
		attacks[i].attackGroup = groups[groupIdx % groups.length]
		// Check if next attack was preceded by "|" (or) \u2192 advance group
		if (i < attacks.length - 1) {
			const nextPos = attacks[i + 1]._pos
			const between = attackStr.slice(attacks[i]._pos, nextPos)
			if (between.includes('|')) groupIdx++
		}
		delete attacks[i]._pos
	}

	return attacks
}

// --- Special Abilities Parser ---

/** An ALL CAPS heading such as TRAITS or ENCOUNTERS, or the next creature's name ("BAT, GIANT"). */
const HEADING_RE = /^[A-Z][A-Z ,'-]{3,}$/

/**
 * Parse special ability lines into structured objects. An ability starts with "Name: Description"
 * and can span several lines. Reading stops at an ALL CAPS heading, so pasting a whole page
 * doesn't fold the tables that follow into the last ability.
 * @param {string[]} lines - The lines after the stats
 * @param {Function} matchStart - line => match array for an ability's first line (1: name, 2: text), or null
 * @param {Function} warn
 * @returns {object[]} Array of { name, description } objects
 */
function parseSpecialAbilities(lines, matchStart, warn) {
	const abilities = []
	let current = null
	for (const line of lines) {
		if (HEADING_RE.test(line)) {
			warn('IgnoredAfter', { heading: line })
			break
		}
		const m = matchStart(line)
		if (m) {
			if (current) abilities.push(current)
			current = { name: m[1].trim(), description: (m[2] || '').trim() }
		} else if (current) {
			// Continuation line (a trailing '-' left by the PDF joins without a space)
			current.description = current.description.endsWith('-')
				? current.description.slice(0, -1) + line
				: current.description + (current.description ? ' ' : '') + line
		}
	}
	if (current) abilities.push(current)
	for (const ability of abilities) {
		ability.description = enrichRollFormulas(enrichSaveLinks(ability.description))
	}
	return abilities
}

/**
 * Replace attack effects that name a special ability with that ability's text. The comparison
 * ignores parenthetical parts, so the effect "command" matches "Commanding bleat (thrice a day)".
 * An effect of "see below" is matched by the attack's name instead.
 */
function linkAttackEffects(attacks, specialAbilities) {
	for (const attack of attacks) {
		const effectLower = (attack.attackEffect || '').trim().toLowerCase()
		const isSeeBelow = effectLower === 'see below'
		const attackNameLower = attack.attackName.trim().toLowerCase()

		// Match the effect text first, then the attack name, then "effect+ing attackName"
		// (so "command" + "bleat" becomes "commanding bleat")
		const lookupKeys = (!effectLower || isSeeBelow) ? [attackNameLower] : [effectLower, attackNameLower]
		if (effectLower && !isSeeBelow) {
			lookupKeys.push((effectLower.endsWith('ing') ? effectLower : effectLower + 'ing') + ' ' + attackNameLower)
		}
		let matched = false
		for (const key of lookupKeys) {
			for (const ability of specialAbilities) {
				const parenMatch = ability.name.match(/\s*\(([^)]*)\)/)
				const nameBase = ability.name.replace(/\s*\([^)]*\)/, '').trim().toLowerCase()
				if (key === nameBase || key + 's' === nameBase || key === nameBase + 's') {
					const prefix = parenMatch ? `(${capitalize(parenMatch[1])}) ` : ''
					attack.attackEffect = prefix + ability.description
					matched = true
					break
				}
			}
			if (matched) break
		}
		if (!matched && isSeeBelow) attack.attackEffect = 'See special abilities'
	}
}

// --- Dolmenwood Statblock Parser ---

const ALIGN_RE = /\b(?:lawful|neutral|chaotic|any alignment|alignment by \w+)\b/i
const ABILITY_RE = /^([A-Z][A-Za-z' -]{0,40}(?:\s*\([^)]*\))?):\s+(.*)$/

/**
 * Parse a Dolmenwood creature statblock.
 *
 * The expected layout:
 *   Name
 *   Description text...
 *   Size Type—Intelligence—Alignment
 *   Level X AC Y HP XdY (Z) Saves D# R# H# B# S#
 *   Attacks [N] name (+bonus, damage) [and ...] Speed # [Fly #] ... Morale # XP # Encounters ...
 *   Behaviour ... Speech ... Possessions ... Hoard ...
 *   Ability Name: Description...
 *
 * Everything after the type line is found by keyword, so line breaks don't matter there. If the
 * type line is missing, the Level line is the anchor and the type fields are defaulted, with a
 * warning for each.
 *
 * @param {string} text - Raw statblock text
 * @returns {{ data: object, warnings: object[] }}
 */
export function parseStatblock(text) {
	const [warningList, warn] = warnings()
	const lines = normalize(text).split('\n').filter(Boolean)
	if (lines.length < 2) throw new Error('DOLMEN.CreatureImport.Error.TooShort')

	// Anchor on the type line. If the PDF gave spaced hyphens instead of dashes, accept those.
	// Without a type line, anchor on the Level/AC line.
	const levelIdx = lines.findIndex(l => /\bLevel\s+\d+\b/i.test(l) && /\bAC\s+\d+/i.test(l))
	let typeIdx = lines.findIndex(l => (l.match(/—/g) || []).length >= 2 && ALIGN_RE.test(l))
	if (typeIdx === -1) typeIdx = lines.findIndex(l => /\s-\s.*\s-\s/.test(l) && ALIGN_RE.test(l))
	if (typeIdx !== -1 && levelIdx !== -1 && typeIdx > levelIdx) typeIdx = -1
	if (typeIdx === -1 && levelIdx === -1) {
		throw new Error(looksOSE(text) ? 'DOLMEN.CreatureImport.Error.LooksOSE' : 'DOLMEN.CreatureImport.Error.NoTypeLine')
	}

	// --- Name + Description ---
	const header = lines.slice(0, typeIdx !== -1 ? typeIdx : levelIdx)
	let name = ''
	if (looksLikeName(header[0])) name = cleanName(header.shift())
	else warn('NoName')
	const description = header.join(' ').trim()

	// --- Type Line: size type—intelligence—alignment ---
	let size = 'medium'
	let monsterType = 'mortal'
	let intelligence = 'animal'
	let alignment = 'neutral'
	if (typeIdx === -1) {
		warn('NoTypeLine')
	} else {
		const [first = '', intPart = '', alignPart = ''] = lines[typeIdx].toLowerCase().split(/\s*—\s*|\s+-\s+/)
		const words = first.trim().split(/\s+/)
		if (SIZE_MAP[words[0]]) size = SIZE_MAP[words.shift()]
		else warn('UnknownSize', { value: first })
		const typeText = words.join(' ')
		if (MONSTER_TYPE_MAP[typeText]) monsterType = MONSTER_TYPE_MAP[typeText]
		else warn('UnknownType', { value: typeText || first })
		// Match on the first word, so "Animal Int." and "Semiintelligent" (a hyphen lost at a line break) still count
		const intKey = Object.keys(INTELLIGENCE_MAP).find(k => intPart.includes(k.split(/[ -]/)[0]))
		if (intKey) intelligence = INTELLIGENCE_MAP[intKey]
		else warn('UnknownIntelligence', { value: intPart })
		const alignText = alignPart.trim()
		const alignWord = alignText.match(/lawful|neutral|chaotic/)
		if (ALIGNMENT_MAP[alignText]) alignment = ALIGNMENT_MAP[alignText]
		else if (/^alignment by\b/.test(alignText)) alignment = 'any' // other "alignment by ..."
		else if (alignWord) {
			alignment = alignWord[0]
			warn('Alignment', { value: alignText, used: alignWord[0] })
		} else warn('UnknownAlignment', { value: alignText })
	}

	// --- The remaining lines are sorted into: ---
	//   1. Stat lines (Level/AC/HP/Saves/Attacks/Speed/Morale/XP/Encounters), joined for keyword parsing
	//   2. Metadata fields (Behaviour/Speech/Possessions/Hoard), which can span lines
	//   3. Special abilities: everything from the first "Name: description" line on
	// "Keyword value", but not an ability that shares the keyword's name ("Morale: Attack relentlessly...")
	const STAT_RE = /^(?:Level|AC|HP|Saves?|Att|Speed|Morale|XP|Enc)\b(?!:)/i
	const META_RE = /^(Behaviou?r|Speech|Possessions|Hoard)\s+(.*)$/i

	// Start a new line at each metadata keyword inside a stat or metadata line:
	// "Possessions None Hoard None", "XP 80 Enc 3d4 Hoard Gold or crystals"
	const remainingLines = []
	for (const line of lines.slice(typeIdx !== -1 ? typeIdx + 1 : levelIdx)) {
		if (STAT_RE.test(line) || META_RE.test(line)) {
			remainingLines.push(...line.split(/\s+(?=(?:Behaviou?r|Speech|Possessions|Hoard)\s)/).map(l => l.trim()))
		} else {
			remainingLines.push(line)
		}
	}

	const metadata = {}
	const statLines = []
	let currentMeta = null
	let abilityStart = remainingLines.length
	const endMeta = () => {
		if (currentMeta) metadata[currentMeta.key] = currentMeta.value
		currentMeta = null
	}
	for (let i = 0; i < remainingLines.length; i++) {
		const line = remainingLines[i]
		const metaMatch = line.match(META_RE)
		if (metaMatch) {
			endMeta()
			currentMeta = { key: metaMatch[1].toLowerCase().replace('behavior', 'behaviour'), value: metaMatch[2].trim() }
			continue
		}
		const isStatLine = STAT_RE.test(line)
			|| /^(?:or|and)\s+/i.test(line) // an attack line that wraps: "or 2 bramble darts..."
		if (isStatLine) {
			endMeta()
			statLines.push(line)
		} else if (ABILITY_RE.test(line) || HEADING_RE.test(line)) {
			endMeta()
			abilityStart = i
			break
		} else if (currentMeta) {
			currentMeta.value += ' ' + line
		} else {
			statLines.push(line) // the previous stat line continues (e.g. a long attack line)
		}
	}
	endMeta()

	// --- Stats, found by keyword ---
	const stats = statLines.join(' ')
	const number = (re, key, fallback) => {
		const m = stats.match(re)
		if (m) return parseInt(m[1].replace(/,/g, ''))
		warn(key, { value: fallback })
		return fallback
	}
	const level = number(/\bLevel\s+(\d+)/i, 'NoLevel', 1)
	const ac = number(/\bAC\s+(\d+)/i, 'NoAC', 10)
	let hpDice = `${level}d8`
	let hpValue = Math.max(1, Math.floor(level * 4.5))
	const hpMatch = stats.match(/\bHP\s+(\d+d\d+(?:[+-]\d+)?)\s*\((\d+)\)/i)
	const hpOnly = stats.match(/\bHP\s+(\d+)\b(?!d)/i)
	if (hpMatch) {
		hpDice = hpMatch[1]
		hpValue = parseInt(hpMatch[2])
	} else if (hpOnly) {
		hpValue = parseInt(hpOnly[1])
		warn('NoHPDice', { value: hpDice })
	} else {
		warn('NoHP', { value: `${hpDice} (${hpValue})` })
	}
	const savesMatch = stats.match(/\bSaves?\s+D(\d+)\s*R(\d+)\s*H(\d+)\s*B(\d+)\s*S(\d+)/i)
	if (!savesMatch) warn('NoSaves', { value: 10 })
	const save = n => (savesMatch ? parseInt(savesMatch[n]) : 10)
	const saves = { doom: save(1), ray: save(2), hold: save(3), blast: save(4), spell: save(5) }

	// Attacks run from "Att" or "Attacks" to the first movement or stat keyword
	const attMatch = stats.match(/\bAtt(?:acks?)?\s+(.*?)(?:\s+(?:Speed|Fly|Swim|Climb|Burrow|Morale|XP|Enc(?:ounters)?)\b|$)/i)
	const attacks = attMatch ? parseAttacks(attMatch[1]) : []
	if (!attMatch) warn('NoAttacks')
	else if (!attacks.length && !/^(?:—|none)$/i.test(attMatch[1].trim())) warn('AttacksUnread', { value: attMatch[1].trim() })

	const movement = { swim: 0, fly: 0, climb: 0, burrow: 0 }
	for (const type of Object.keys(movement)) {
		const m = stats.match(new RegExp(`\\b${type}\\s+(\\d+)`, 'i'))
		if (m) movement[type] = parseInt(m[1])
	}
	// A creature that only swims or flies has no Speed: that's 0, not a missing field
	const speed = Object.values(movement).some(Boolean) && !/\bSpeed\s+\d/i.test(stats) ? 0 : number(/\bSpeed\s+(\d+)/i, 'NoSpeed', 40)
	const morale = number(/\bMorale\s+(\d+)/i, 'NoMorale', 7)
	const xpAward = number(/\bXP\s+([\d,]+)/i, 'NoXP', 0)

	// Encounters and lair chance: "Encounters 2d6 (25% in lair)" or "(always in lair)"
	const encMatch = stats.match(/\bEnc(?:ounters?)?\s+(\S+)(?:\s+\((\d+)%\s+in\s+lair\)|\s+\(always\s+in\s+lair\))?/i)
	const encounters = encMatch ? encMatch[1] : ''
	const lairChance = encMatch && /always\s+in\s+lair/i.test(stats) ? 100 : (encMatch?.[2] ? parseInt(encMatch[2]) : 0)

	// --- Special Abilities ---
	const specialAbilities = parseSpecialAbilities(remainingLines.slice(abilityStart), l => l.match(ABILITY_RE), warn)
	linkAttackEffects(attacks, specialAbilities)

	return {
		data: {
			name, description, size, monsterType, intelligence, alignment,
			level, ac, hpDice, hpValue, saves,
			attacks, speed, movement,
			morale, xpAward, encounters, lairChance, treasureType: metadata.hoard || '',
			behaviour: metadata.behaviour || '', speech: metadata.speech || '', possessions: metadata.possessions || '',
			specialAbilities
		},
		warnings: warningList
	}
}

// --- OSE Statblock Parser ---

/** The OSE parser's warning fields, as Dolmenwood warning keys */
const OSE_WARNINGS = {
	name: 'NoName', ac: 'NoAC', hd: 'NoLevel', thac0: 'NoAttackBonus', mv: 'NoSpeed',
	sv: 'NoSaves', ml: 'NoMorale', al: 'UnknownAlignment', xp: 'NoXP', att: 'NoAttacks'
}

/**
 * Parse an OSE-format creature statblock into the same data structure as parseStatblock().
 * The reading is done by the OSE premium module's parser (vendor/ose-monster-parser.js);
 * this maps its OSE actor data onto Dolmenwood's creature fields.
 *
 * The expected layout (with or without commas between the stats):
 *   Name
 *   Optional description text...
 *   AC X [Y] HD X (N hp) Att ... THAC0 X [+Y] MV X' (Y') SV DX WX PX BX SX ML X AL X XP X NA X (Y) TT X
 *   ▶ Ability Name: Description text...
 *
 * A statblock covering several Hit Dice ("HD 8/12/16", "HD 3 to 7") uses the first, with a warning.
 * @param {string} text - Raw OSE statblock text
 * @returns {{ data: object, warnings: object[] }}
 */
export function parseOSEStatblock(text) {
	const [warningList, warn] = warnings()
	// Ligatures and non-breaking spaces; not full NFKC, which would break "HD ½"
	text = String(text ?? '').replace(/[\uFB00-\uFB06]/g, c => c.normalize('NFKC')).replace(/\u00A0/g, ' ')
	const lines = normalize(text, { dash: '-' }).split('\n')
	if (lines.length < 2) throw new Error('DOLMEN.CreatureImport.Error.TooShort')
	if (!lines.some((l, i) => i > 0 && /^AC\s*-?\d+/i.test(l))) {
		throw new Error(looksDolmenwood(text) ? 'DOLMEN.CreatureImport.Error.LooksDolmenwood' : 'DOLMEN.CreatureImport.Error.NoStatsLine')
	}

	const { variants, warnings: oseWarnings } = OSEMonsterParser.parseAll(text)
	// A statblock covering several sizes ("HD 8/12/16") gives the largest: it has every ability, and
	// abilities are easier to remove than to add
	const hitDice = v => {
		const m = v.system.hp.hd.match(/^(\d+)d(\d+)/)
		return m ? m[1] * m[2] / 8 : 0
	}
	const ose = variants.reduce((best, v) => (hitDice(v) > hitDice(best) ? v : best))
	const sys = ose.system
	const details = sys.details
	if (variants.length > 1) warn('OSEVariants', { count: variants.length, value: sys.hp.hd })
	const flagged = new Set(oseWarnings.map(w => w.field))

	// Level from the Hit Dice ("5d8" is level 5; under 1 HD or fixed hp is level 1)
	const hdDice = sys.hp.hd.match(/^(\d+)d(\d+)/)
	const level = hdDice && hdDice[2] === '8' ? Math.max(1, parseInt(hdDice[1])) : 1
	const hpDice = sys.hp.hd || '1d8'
	const hpValue = sys.hp.value || Math.max(1, Math.floor(level * 4.5))
	if (sys.hp.hd && !sys.hp.value) warn('NoHP', { value: `${hpDice} (${hpValue})` })

	const ac = sys.aac.value || (flagged.has('ac') ? 10 : 19 - sys.ac.value)
	const attackBonus = flagged.has('thac0') ? 0 : 19 - sys.thac0.value
	const save = key => sys.saves[key].value || 10
	const saves = { doom: save('death'), ray: save('wand'), hold: save('paralysis'), blast: save('breath'), spell: save('spell') }

	// Movement: the encounter rate of each mode, e.g. "120' (40') / 60' (20') swimming"
	let speed = 40
	const movement = { swim: 0, fly: 0, climb: 0, burrow: 0 }
	if (!flagged.has('mv')) {
		details.movement.split('/').forEach((seg, i) => {
			const enc = seg.match(/\((\d+)'?\)/)
			const rate = enc ? parseInt(enc[1]) : Math.round((parseInt(seg) || 0) / 3)
			if (i === 0) speed = rate || Math.round(sys.movement.base / 3)
			else for (const type of Object.keys(movement)) if (new RegExp(type, 'i').test(seg)) movement[type] = rate
		})
	}

	const alignText = details.alignment.toLowerCase()
	const alignWord = alignText.match(/lawful|neutral|chaotic/)
	const alignment = ALIGNMENT_MAP[alignText] || alignWord?.[0] || 'neutral'
	if (alignText && !ALIGNMENT_MAP[alignText]) warn(alignWord ? 'Alignment' : 'UnknownAlignment', { value: alignText, used: alignment })

	const attacks = ose.attacks.map(a => ({
		numAttacks: a.system.counter.value || 1,
		attackName: a.name,
		attackBonus,
		attackDamage: a.system.damage || '—',
		attackEffect: enrichSaveLinks(capitalize(a.system.description)),
		attackType: a.system.damage ? 'attack' : 'save',
		rangeShort: 0,
		rangeMedium: 0,
		rangeLong: 0,
		attackGroup: a.system.pattern
	}))
	const specialAbilities = ose.abilities.map(a => ({
		name: a.name,
		description: enrichRollFormulas(enrichSaveLinks(a.system.description))
	}))
	linkAttackEffects(attacks, specialAbilities)

	const used = { ac, level, speed, morale: 7, xp: 0, sv: 10, thac0: 0 }
	for (const w of oseWarnings) {
		const key = OSE_WARNINGS[w.field]
		if (key && !(key === 'UnknownAlignment' && alignText)) {
			warn(key, { value: { NoAC: used.ac, NoLevel: used.level, NoSpeed: used.speed, NoMorale: used.morale, NoXP: used.xp, NoSaves: used.sv, NoAttackBonus: used.thac0, UnknownAlignment: '' }[key] })
		}
	}
	warn('OSETypeFields')

	return {
		data: {
			name: ose.name ? cleanName(ose.name) : '', description: details.biography,
			size: 'medium', monsterType: 'mortal', intelligence: 'animal', alignment,
			level, ac, hpDice, hpValue, saves,
			attacks, speed, movement,
			morale: details.morale || 7, xpAward: details.xp, encounters: String(details.appearing.w || details.appearing.d || ''),
			lairChance: 0, treasureType: details.treasure.type,
			behaviour: '', speech: '', possessions: '',
			specialAbilities
		},
		warnings: warningList
	}
}
