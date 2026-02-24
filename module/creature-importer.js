/* global game, ui, foundry, Actor */

/**
 * Creature Statblock Importer
 * Parses pasted creature statblock text and creates Creature actors.
 */

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
	'any alignment': 'neutral',
	'alignment by individual': 'neutral'
}

// --- Helpers ---

/**
 * Convert ALL CAPS or mixed text to Title Case.
 * @param {string} str
 * @returns {string}
 */
function titleCase(str) {
	return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

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
		// Extract range (e.g. "range 20'/40'/60'" or "range 20′/40′/60′") from damage or effect
		let rangeShort = 0, rangeMedium = 0, rangeLong = 0
		const rangeRe = /,?\s*range\s+(\d+)[′']\s*\/\s*(\d+)[′']\s*\/\s*(\d+)[′']/i
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
		// Check if next attack was preceded by "|" (or) → advance group
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

/**
 * Parse special ability lines into structured objects.
 * Abilities start with "Name: Description" and can span multiple lines.
 * @param {string[]} lines - Lines after the stat block
 * @returns {object[]} Array of { name, description } objects
 */
function parseSpecialAbilities(lines) {
	const abilities = []
	let current = null

	for (const line of lines) {
		// Detect new ability: "Name:" or "Name (usage):" followed by description
		const m = line.match(/^([A-Z][A-Za-z' -]{0,40}(?:\s*\([^)]*\))?):\s+(.*)$/)
		if (m) {
			if (current) abilities.push(current)
			current = { name: m[1].trim(), description: m[2].trim() }
		} else if (current) {
			// Continuation line for current ability
			current.description += (current.description ? ' ' : '') + line
		}
	}

	if (current) abilities.push(current)
	for (const ability of abilities) {
		ability.description = enrichSaveLinks(ability.description)
		ability.description = enrichRollFormulas(ability.description)
	}
	return abilities
}

// --- Main Parser ---

/**
 * Parse a creature statblock text into structured data.
 *
 * Expected format:
 *   NAME (ALL CAPS)
 *   Description text...
 *   size type—intelligence—alignment
 *   Level X AC Y HP XdY (Z) Saves D# R# H# B# S#
 *   Att [N] name (+bonus, damage) [and ...] [Speed #] [Fly #] [Swim #] ...
 *   ... Morale # XP # Enc # Hoard ...
 *   Ability Name: Description...
 *
 * Stats after the Level/AC/HP/Saves line can span multiple lines and are
 * parsed by keyword, so the exact line breaks don't matter.
 *
 * @param {string} text - Raw statblock text
 * @returns {object} Parsed creature data
 */
export function parseStatblock(text) {
	// Normalize line endings and dashes
	text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
	text = text.replace(/\u2013/g, '\u2014') // en-dash → em-dash
	text = text.replace(/--/g, '\u2014')      // double-hyphen → em-dash

	const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
	if (lines.length < 4) {
		throw new Error('Statblock too short — need at least name, type line, and stats')
	}

	// Find type line (anchor): line with 2+ em-dashes and a known alignment keyword
	let typeLineIndex = -1
	for (let i = 0; i < lines.length; i++) {
		const dashes = (lines[i].match(/\u2014/g) || []).length
		if (dashes >= 2) {
			const lower = lines[i].toLowerCase()
			if (['lawful', 'neutral', 'chaotic', 'any alignment', 'alignment by individual'].some(a => lower.includes(a))) {
				typeLineIndex = i
				break
			}
		}
	}
	if (typeLineIndex === -1) {
		throw new Error('Could not find type line (expected format: "size type\u2014intelligence\u2014alignment")')
	}

	// --- Name + Description ---
	const name = titleCase(lines[0])
	const description = lines.slice(1, typeLineIndex).join(' ').trim()

	// --- Parse Type Line ---
	const typeParts = lines[typeLineIndex].split('\u2014').map(s => s.trim().toLowerCase())

	// First part: [size] monsterType
	let size = 'medium'
	let monsterType = 'mortal'
	const firstPart = typeParts[0]
	let sizeFound = false
	for (const [key, value] of Object.entries(SIZE_MAP)) {
		if (firstPart.startsWith(key + ' ')) {
			size = value
			const rest = firstPart.slice(key.length).trim()
			monsterType = MONSTER_TYPE_MAP[rest] || 'mortal'
			sizeFound = true
			break
		}
		if (firstPart === key) {
			size = value
			sizeFound = true
			break
		}
	}
	if (!sizeFound) {
		monsterType = MONSTER_TYPE_MAP[firstPart] || 'mortal'
	}

	// Second part: intelligence
	let intelligence = 'animal'
	const intPart = typeParts[1] || ''
	for (const [key, value] of Object.entries(INTELLIGENCE_MAP)) {
		if (intPart.includes(key)) {
			intelligence = value
			break
		}
	}

	// Third part: alignment
	const alignPart = (typeParts[2] || '').trim()
	const alignment = ALIGNMENT_MAP[alignPart] || 'neutral'

	// --- Stats Line 1: Level, AC, HP, Saves ---
	const statsLine1 = lines[typeLineIndex + 1] || ''
	const levelMatch = statsLine1.match(/Level\s+(\d+)/i)
	const acMatch = statsLine1.match(/AC\s+(\d+)/i)
	const hpMatch = statsLine1.match(/HP\s+(\d+d\d+(?:[+-]\d+)?)\s*\((\d+)\)/i)
	const savesMatch = statsLine1.match(/Saves?\s+D(\d+)\s+R(\d+)\s+H(\d+)\s+B(\d+)\s+S(\d+)/i)

	const level = levelMatch ? parseInt(levelMatch[1]) : 1
	const ac = acMatch ? parseInt(acMatch[1]) : 10
	const hpDice = hpMatch ? hpMatch[1] : '1d8'
	const hpValue = hpMatch ? parseInt(hpMatch[2]) : 4
	const saves = {
		doom: savesMatch ? parseInt(savesMatch[1]) : 10,
		ray: savesMatch ? parseInt(savesMatch[2]) : 10,
		hold: savesMatch ? parseInt(savesMatch[3]) : 10,
		blast: savesMatch ? parseInt(savesMatch[4]) : 10,
		spell: savesMatch ? parseInt(savesMatch[5]) : 10
	}

	// --- Remaining lines: stats, metadata fields, then special abilities ---
	// Classify lines after the Level/Saves line into:
	//   1. Stat lines (Attacks/Speed/Morale/XP/Encounters/Hoard — joined for keyword parsing)
	//   2. Metadata fields (Behaviour/Speech/Possessions — multi-line, parsed separately)
	//   3. Special abilities (everything else with "Name: description" pattern)
	const METADATA_RE = /^(Behaviou?r|Speech|Possessions|Hoard)\b/i
	const METADATA_SPLIT_RE = /\s+(Behaviou?r|Speech|Possessions|Hoard)\s+/i

	// Pre-process: split lines that contain multiple metadata keywords
	// e.g. "Possessions None Hoard None" → ["Possessions None", "Hoard None"]
	const rawRemaining = lines.slice(typeLineIndex + 2)
	const remainingLines = []
	for (const line of rawRemaining) {
		if (METADATA_RE.test(line)) {
			const splitMatch = line.match(METADATA_SPLIT_RE)
			if (splitMatch) {
				const idx = line.indexOf(splitMatch[0])
				remainingLines.push(line.slice(0, idx).trim())
				remainingLines.push(line.slice(idx).trim())
				continue
			}
		}
		remainingLines.push(line)
	}

	// Pass 1: collect metadata fields and stat lines, find where abilities start
	const metadata = {}
	const statLines = []
	let currentMeta = null
	let abilityStart = remainingLines.length

	for (let i = 0; i < remainingLines.length; i++) {
		const line = remainingLines[i]
		const metaMatch = line.match(/^(Behaviou?r|Speech|Possessions|Hoard)\s+(.*)$/i)
		if (metaMatch) {
			if (currentMeta) metadata[currentMeta.key] = currentMeta.value
			currentMeta = { key: metaMatch[1].toLowerCase().replace('behavior', 'behaviour'), value: metaMatch[2].trim() }
			continue
		}
		// Check if this is a new ability (not a stat line and not a metadata continuation)
		const isAbility = /^[A-Z][A-Za-z' -]{0,40}(?:\s*\([^)]*\))?:\s+/.test(line)
		const isStatLine = /^(?:Att|Speed|Morale|XP|Enc)\b/i.test(line)
			|| /^(?:or|and)\s+/i.test(line) // continuation of attack line like "or 2 bramble darts..." or "or gaze (...)"
		if (isStatLine) {
			if (currentMeta) {
				metadata[currentMeta.key] = currentMeta.value; currentMeta = null 
			}
			statLines.push(line)
		} else if (isAbility) {
			if (currentMeta) {
				metadata[currentMeta.key] = currentMeta.value; currentMeta = null 
			}
			abilityStart = i
			break
		} else if (currentMeta) {
			// Continuation of current metadata field
			currentMeta.value += ' ' + line
		} else {
			// Continuation of previous stat line (e.g. multi-line attacks)
			statLines.push(line)
		}
	}
	if (currentMeta) metadata[currentMeta.key] = currentMeta.value

	const statsRemainder = statLines.join(' ')

	// Extract attack portion: between "Att" and first movement/stat keyword
	const attMatch = statsRemainder.match(/Att(?:acks?)?\s+(.*?)\s+(?:Speed|Fly|Swim|Climb|Burrow|Morale)\b/i)
	const attackStr = attMatch ? attMatch[1] : ''
	const attacks = parseAttacks(attackStr)

	// Speed and additional movement types
	const speedMatch = statsRemainder.match(/Speed\s+(\d+)/i)
	const speed = speedMatch ? parseInt(speedMatch[1]) : 40

	const movement = { swim: 0, fly: 0, climb: 0, burrow: 0 }
	const flyMatch = statsRemainder.match(/Fly\s+(\d+)/i)
	const swimMatch = statsRemainder.match(/Swim\s+(\d+)/i)
	const climbMatch = statsRemainder.match(/Climb\s+(\d+)/i)
	const burrowMatch = statsRemainder.match(/Burrow\s+(\d+)/i)
	if (flyMatch) movement.fly = parseInt(flyMatch[1])
	if (swimMatch) movement.swim = parseInt(swimMatch[1])
	if (climbMatch) movement.climb = parseInt(climbMatch[1])
	if (burrowMatch) movement.burrow = parseInt(burrowMatch[1])

	// Morale, XP
	const moraleMatch = statsRemainder.match(/Morale\s+(\d+)/i)
	const xpMatch = statsRemainder.match(/XP\s+([\d,]+)/i)
	const morale = moraleMatch ? parseInt(moraleMatch[1]) : 7
	const xpAward = xpMatch ? parseInt(xpMatch[1].replace(/,/g, '')) : 0

	// Encounters and lair chance — "Encounters 2d6 (25% in lair)" or "(always in lair)"
	const encMatch = statsRemainder.match(/Enc(?:ounters?)?\s+(\S+)(?:\s+\((\d+)%\s+in\s+lair\)|\s+\(always\s+in\s+lair\))?/i)
	const encounters = encMatch ? encMatch[1] : ''
	const alwaysInLair = encMatch && /always\s+in\s+lair/i.test(statsRemainder)
	const lairChance = alwaysInLair ? 100 : (encMatch && encMatch[2] ? parseInt(encMatch[2]) : 0)

	// Metadata fields
	const behaviour = metadata.behaviour || ''
	const speech = metadata.speech || ''
	const possessions = metadata.possessions || ''
	const treasureType = metadata.hoard || ''

	// --- Special Abilities (remaining lines after stats/metadata) ---
	const abilityLines = remainingLines.slice(abilityStart)
	const specialAbilities = parseSpecialAbilities(abilityLines)

	// Replace attack effects that match a special ability name with the ability description
	// Compare ignoring parenthetical parts, e.g. effect "command" matches "Commanding bleat (thrice a day)"
	// Also: if effect is "see below", match by attack name instead
	for (const attack of attacks) {
		const effectLower = (attack.attackEffect || '').trim().toLowerCase()
		const isSeeBelow = effectLower === 'see below'
		const attackNameLower = attack.attackName.trim().toLowerCase()

		// Try matching effect text to ability name first, then fall back to attack name
		// Last resort: try "effect+ing attackName" e.g. "command" + "bleat" → "commanding bleat"
		const lookupKeys = (!effectLower || isSeeBelow) ? [attackNameLower] : [effectLower, attackNameLower]
		const compoundKey = effectLower && !isSeeBelow
			? (effectLower.endsWith('ing') ? effectLower : effectLower + 'ing') + ' ' + attackNameLower
			: null
		if (compoundKey) lookupKeys.push(compoundKey)
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
		if (!matched && isSeeBelow) {
			attack.attackEffect = 'See special abilities'
		}
	}

	return {
		name, description, size, monsterType, intelligence, alignment,
		level, ac, hpDice, hpValue, saves,
		attacks, speed, movement,
		morale, xpAward, encounters, lairChance, treasureType,
		behaviour, speech, possessions,
		specialAbilities
	}
}

// --- OSE Statblock Parser ---

// Bullet styles used in OSE ability lines
const OSE_BULLET_CHARS = '-▶*•►▸▪·‣‒–—>'

/**
 * Parse an OSE-format creature statblock into the same data structure as parseStatblock().
 *
 * Expected format:
 *   Name
 *   Optional description text...
 *   AC X [Y], HD X (N hp), Att ..., THAC0 X [+Y], MV X' (Y'), SV DX WX PX BX SX, ML X, AL X, XP X, NA X (Y), TT X
 *   ▶ Ability Name: Description text...
 *
 * @param {string} text - Raw OSE statblock text
 * @returns {object} Parsed creature data (same shape as parseStatblock output)
 */
export function parseOSEStatblock(text) {
	// Normalize text
	text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
	text = text.replace(/[""]/g, '"')
	text = text.replace(/[''′]/g, "'")
	text = text.replace(/\u00d7/g, '×')
	text = text.replace(/\s*×\s*/g, ' x ')
	text = text.replace(/\u2013|\u2014/g, '-')
	text = text.replace(/['`]/g, "'")
	text = text.replace(/\s+$/g, '')
	text = text.replace(/[ \t]+\n/g, '\n')
	text = text.replace(/\n{2,}/g, '\n')

	const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
	if (lines.length < 2) {
		throw new Error('Statblock too short — need at least name and stats')
	}

	// Line 1 = name
	const name = titleCase(lines[0])

	// Find the stats line (starts with AC)
	let statsStartIdx = -1
	for (let i = 1; i < lines.length; i++) {
		if (/^AC\s*-?\d+/i.test(lines[i])) {
			statsStartIdx = i
			break
		}
	}
	if (statsStartIdx === -1) {
		throw new Error('Could not find stats line (expected to start with "AC")')
	}

	// Lines between name and stats = description
	const description = lines.slice(1, statsStartIdx).join(' ').trim()

	// Combine stats lines (everything from AC line until first ability)
	// Abilities can be bulleted (▶ Name:) or plain (Name:)
	const bulletAbilityRe = new RegExp(`^[${OSE_BULLET_CHARS}]\\s*[^:]+\\s*:`, 'i')
	const plainAbilityRe = /^[A-Z][A-Za-z' -]+(?:\s*\([^)]*\))?:\s/
	let combinedStats = ''
	let abilityStartIdx = lines.length

	for (let i = statsStartIdx; i < lines.length; i++) {
		if (bulletAbilityRe.test(lines[i]) || (i > statsStartIdx && plainAbilityRe.test(lines[i]))) {
			abilityStartIdx = i
			break
		}
		// Line continuation: strip trailing hyphen
		if (combinedStats.endsWith('-')) {
			combinedStats = combinedStats.slice(0, -1) + lines[i]
		} else {
			combinedStats += (combinedStats ? ' ' : '') + lines[i]
		}
	}

	// --- Parse stats from combined line ---

	// AC: use ascending AC from brackets
	const acMatch = combinedStats.match(/\bAC\s*(-?\d+)\s*\[([+-]?\d+)]?/i)
	let ac = 10
	if (acMatch) {
		if (acMatch[2]) {
			ac = parseInt(acMatch[2].replace('\u2011', '-'), 10)
		} else {
			// No ascending AC — convert from descending: ascending = 19 - descending
			ac = 19 - (parseInt(acMatch[1], 10) || 0)
		}
	}

	// HD: dice and hp value
	const hdMatch = combinedStats.match(/\bHD\s+(\d+)([+-]\d+)?(?:\*+)?(?:\s*\((\d+)\s*hp\))?/i)
	let level = 1
	let hpDice = '1d8'
	let hpValue = 4
	if (hdMatch) {
		const hdNum = parseInt(hdMatch[1], 10)
		level = Math.max(1, hdNum)
		hpDice = hdNum >= 1 ? `${hdNum}d8` : '1d4'
		if (hdMatch[2]) {
			const mod = parseInt(hdMatch[2].replace('\u2011', '-'), 10)
			if (mod !== 0) hpDice += mod > 0 ? `+${mod}` : `${mod}`
		}
		if (hdMatch[3]) {
			hpValue = parseInt(hdMatch[3], 10)
		}
	}

	// THAC0: extract attack bonus
	const thac0Match = combinedStats.match(/THAC0\s+(\d+)(?:\s*\[([+-]?\d+)])?/i)
	let attackBonus = 0
	if (thac0Match) {
		if (thac0Match[2]) {
			attackBonus = parseInt(thac0Match[2].replace('\u2011', '-'), 10)
		} else {
			attackBonus = 19 - parseInt(thac0Match[1], 10)
		}
	}

	// Saves: D W P B S → doom ray hold blast spell
	const savesMatch = combinedStats.match(/SV\s+D(\d+)\s+W(\d+)\s+P(\d+)\s+B(\d+)\s+S(\d+)/i)
	const saves = {
		doom: savesMatch ? parseInt(savesMatch[1]) : 10,
		ray: savesMatch ? parseInt(savesMatch[2]) : 10,
		hold: savesMatch ? parseInt(savesMatch[3]) : 10,
		blast: savesMatch ? parseInt(savesMatch[4]) : 10,
		spell: savesMatch ? parseInt(savesMatch[5]) : 10
	}

	// Movement: parse encounter speeds for each type
	// e.g. "120' (40')" or "120' (40') / 360' (120') flying"
	let speed = 40
	const movement = { swim: 0, fly: 0, climb: 0, burrow: 0 }
	const mvMatch = combinedStats.match(/\bMV\s+([^,;]+?)(?=[,;]\s*SV\b|$)/i)
	if (mvMatch) {
		const mvText = mvMatch[1].trim()
		// Parse movement segments separated by /
		const segments = mvText.split('/')
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i].trim()
			// Extract encounter speed from parentheses
			const encMatch = seg.match(/\((\d+)'?\)/)
			const encSpeed = encMatch ? parseInt(encMatch[1], 10) : 0
			if (i === 0) {
				// First segment = ground speed
				speed = encSpeed || Math.round((parseInt(seg, 10) || 120) / 3)
			} else {
				// Additional segments: check for type keyword
				const segLower = seg.toLowerCase()
				const spd = encSpeed || Math.round((parseInt(seg, 10) || 0) / 3)
				if (/fly|flying/.test(segLower)) movement.fly = spd
				else if (/swim|swimming/.test(segLower)) movement.swim = spd
				else if (/climb|climbing/.test(segLower)) movement.climb = spd
				else if (/burrow|burrowing/.test(segLower)) movement.burrow = spd
			}
		}
	}

	// Morale
	const moraleMatch = combinedStats.match(/\bML\s+(\d+)/i)
	const morale = moraleMatch ? parseInt(moraleMatch[1], 10) : 7

	// Alignment
	const alignMatch = combinedStats.match(/\bAL\s+([^,;]+)/i)
	const alignText = alignMatch ? alignMatch[1].trim().toLowerCase() : 'neutral'
	const alignment = ALIGNMENT_MAP[alignText] || 'neutral'

	// XP
	const xpMatch = combinedStats.match(/\bXP\s+([\d,]+)/i)
	const xpAward = xpMatch ? parseInt(xpMatch[1].replace(/,/g, ''), 10) : 0

	// Number Appearing: use wilderness value (in parentheses)
	const naMatch = combinedStats.match(/\bNA\s+(\S+)\s*(?:\(([^)]+)\))?/i)
	const encounters = naMatch && naMatch[2] ? naMatch[2].trim() : (naMatch ? naMatch[1].trim() : '')

	// Treasure Type
	const ttMatch = combinedStats.match(/\bTT\s+([^,;\n]+)/i)
	const treasureType = ttMatch ? ttMatch[1].trim() : ''

	// --- Parse attacks ---
	const attMatch = combinedStats.match(/\bAtt\s+(.*?)(?=[,;]\s*THAC0\b)/i)
	const attacks = []

	if (attMatch) {
		const attText = attMatch[1].trim()

		// Split on top-level commas and "or" (respecting parentheses)
		const segments = []
		let buf = ''
		let depth = 0
		for (let i = 0; i < attText.length; i++) {
			const ch = attText[i]
			if (ch === '(') depth++
			else if (ch === ')') depth = Math.max(0, depth - 1)
			if (ch === ',' && depth === 0) {
				segments.push({ text: buf.trim(), sep: ',' })
				buf = ''
				continue
			}
			// Check for top-level " or "
			if (depth === 0 && attText.slice(i, i + 4).toLowerCase() === ' or ') {
				segments.push({ text: buf.trim(), sep: 'or' })
				buf = ''
				i += 3
				continue
			}
			buf += ch
		}
		if (buf.trim()) segments.push({ text: buf.trim(), sep: null })

		const groups = ['a', 'b', 'c', 'd', 'e', 'f']
		let groupIdx = 0

		for (const seg of segments) {
			const expr = seg.text
			if (!expr) continue

			// Parse: [N x] name (bracket_content)
			const atkMatch = expr.match(/^(?:(\d+)\s*x\s*)?(.+?)\s*(?:\((.+?)\))?\s*$/i)
			if (!atkMatch) continue

			const count = atkMatch[1] ? parseInt(atkMatch[1], 10) : 1
			const rawName = atkMatch[2].trim()
			const attackName = rawName.replace(/\b\w/g, c => c.toUpperCase())
			const bracket = atkMatch[3] ? atkMatch[3].trim() : ''

			// Determine damage and effect from bracket content
			let attackDamage = '\u2014'
			let attackEffect = ''
			let attackType = 'attack'

			if (bracket) {
				const hasDice = /\d+d\d+/i.test(bracket)
				if (hasDice) {
					// Extract dice formula as damage
					const diceMatch = bracket.match(/^(\d+d\d+(?:\s*[+*x-]\s*\d+)*)/i)
					if (diceMatch) {
						attackDamage = diceMatch[1].replace(/\s+/g, '').replace(/x/gi, '*')
						const remaining = bracket.slice(diceMatch[0].length).trim().replace(/^[,+]\s*/, '')
						if (remaining) {
							attackEffect = enrichSaveLinks(capitalize(remaining))
						}
					} else {
						attackDamage = bracket.replace(/\s+/g, '')
					}
				} else {
					// No dice — effect-only (save type)
					attackEffect = enrichSaveLinks(capitalize(bracket))
					attackType = 'save'
				}
			}

			attacks.push({
				numAttacks: count,
				attackName,
				attackBonus,
				attackDamage,
				attackEffect,
				attackType,
				rangeShort: 0,
				rangeMedium: 0,
				rangeLong: 0,
				attackGroup: groups[groupIdx % groups.length]
			})

			// "or" separator → advance group
			if (seg.sep === 'or') groupIdx++
		}
	}

	// --- Parse special abilities ---
	const abilityLines = lines.slice(abilityStartIdx)
	const specialAbilities = []
	let currentAbility = null
	// Match bulleted abilities (▶ Name: text) or plain (Name: text)
	const bulletLineRe = new RegExp(`^[${OSE_BULLET_CHARS}]\\s*([^:]+)\\s*:(.*)$`, 'i')
	const plainLineRe = /^([A-Z][A-Za-z' -]+(?:\s*\([^)]*\))?):\s+(.*)$/

	for (const line of abilityLines) {
		const m = line.match(bulletLineRe) || line.match(plainLineRe)
		if (m) {
			if (currentAbility) specialAbilities.push(currentAbility)
			currentAbility = {
				name: m[1].trim().replace(/\b\w/g, c => c.toUpperCase()),
				description: (m[2] || '').trim()
			}
		} else if (currentAbility) {
			// Continuation line
			if (currentAbility.description.endsWith('-')) {
				currentAbility.description = currentAbility.description.slice(0, -1) + line
			} else {
				currentAbility.description += (currentAbility.description ? ' ' : '') + line
			}
		}
	}
	if (currentAbility) specialAbilities.push(currentAbility)

	// Enrich save links and dice formulas in abilities
	for (const ability of specialAbilities) {
		ability.description = enrichSaveLinks(ability.description)
		ability.description = enrichRollFormulas(ability.description)
	}

	// Post-process: match attack effects to special abilities (same as Dolmenwood parser)
	for (const attack of attacks) {
		const effectLower = (attack.attackEffect || '').trim().toLowerCase()
		const isSeeBelow = effectLower === 'see below'
		const attackNameLower = attack.attackName.trim().toLowerCase()

		const lookupKeys = (!effectLower || isSeeBelow) ? [attackNameLower] : [effectLower, attackNameLower]
		const compoundKey = effectLower && !isSeeBelow
			? (effectLower.endsWith('ing') ? effectLower : effectLower + 'ing') + ' ' + attackNameLower
			: null
		if (compoundKey) lookupKeys.push(compoundKey)
		let matched = false
		for (const key of lookupKeys) {
			for (const ability of specialAbilities) {
				const parenMatch = ability.name.match(/\s*\(([^)]*)/)
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
		if (!matched && isSeeBelow) {
			attack.attackEffect = 'See special abilities'
		}
	}

	return {
		name, description, size: 'medium', monsterType: 'mortal', intelligence: 'animal', alignment,
		level, ac, hpDice, hpValue, saves,
		attacks, speed, movement,
		morale, xpAward, encounters, lairChance: 0, treasureType,
		behaviour: '', speech: '', possessions: '',
		specialAbilities
	}
}

// --- Actor Creation ---

/**
 * Parse a statblock and create a Creature actor.
 * @param {string} text - Raw statblock text
 * @param {string} format - 'dolmenwood' or 'ose'
 * @returns {Actor} The created Creature actor
 */
export async function importCreatureStatblock(text, format = 'dolmenwood') {
	const data = format === 'ose' ? parseOSEStatblock(text) : parseStatblock(text)

	// Wrap leading "Source X" in parentheses
	if (data.description) {
		data.description = data.description.replace(/^(Source\s+\S+)\s*/, '($1) ')
	}

	const actorData = {
		name: data.name,
		type: 'Creature',
		system: {
			level: data.level,
			hp: { value: data.hpValue, max: data.hpValue },
			ac: data.ac,
			saves: data.saves,
			speed: data.speed,
			size: data.size,
			alignment: data.alignment,
			monsterType: data.monsterType,
			intelligence: data.intelligence,
			hpDice: data.hpDice,
			attacks: data.attacks,
			morale: data.morale,
			xpAward: data.xpAward,
			encounters: data.encounters,
			lairChance: data.lairChance,
			movement: data.movement,
			treasureType: data.treasureType,
			description: data.description || '',
			specialAbilities: data.specialAbilities,
			behaviour: data.behaviour,
			speech: data.speech,
			possessions: data.possessions
		}
	}

	return await Actor.create(actorData)
}

// --- Dialog ---

/**
 * Open the creature statblock import dialog.
 */
export async function openCreatureImportDialog() {
	const { DialogV2 } = foundry.applications.api

	const content = `
		<div class="import-creature-dialog">
			<p>${game.i18n.localize('DOLMEN.CreatureImport.Hint')}</p>
			<div style="display:flex;gap:1rem;margin-bottom:0.5rem;">
				<label style="font-size:0.85rem;"><input type="radio" name="format" value="dolmenwood" checked> ${game.i18n.localize('DOLMEN.CreatureImport.FormatDolmenwood')}</label>
				<label style="font-size:0.85rem;"><input type="radio" name="format" value="ose"> ${game.i18n.localize('DOLMEN.CreatureImport.FormatOSE')}</label>
			</div>
			<textarea id="creature-statblock" rows="15" placeholder="${game.i18n.localize('DOLMEN.CreatureImport.Placeholder')}" style="width:100%;font-family:monospace;font-size:12px;"></textarea>
		</div>`

	const result = await DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.CreatureImport.Title') },
		position: { width: 560 },
		content,
		buttons: [
			{
				action: 'import',
				label: game.i18n.localize('DOLMEN.CreatureImport.Button'),
				icon: 'fas fa-file-import',
				callback: (event, button) => {
					const dialog = button.form?.closest('.dialog') || button.closest('.dialog')
					const text = dialog?.querySelector('#creature-statblock')?.value || ''
					const format = dialog?.querySelector('input[name="format"]:checked')?.value || 'dolmenwood'
					return { text, format }
				}
			},
			{
				action: 'cancel',
				label: game.i18n.localize('DOLMEN.Cancel'),
				icon: 'fas fa-times'
			}
		],
		rejectClose: false,
		modal: true
	})

	if (result === 'cancel' || result === null || result === undefined) return

	const rawText = typeof result === 'object' ? (result.text || '').trim() : ''
	const format = typeof result === 'object' ? (result.format || 'dolmenwood') : 'dolmenwood'
	if (!rawText) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.CreatureImport.EmptyWarning'))
		return
	}

	try {
		const actor = await importCreatureStatblock(rawText, format)
		ui.notifications.info(game.i18n.format('DOLMEN.CreatureImport.Success', { name: actor.name }))
	} catch (err) {
		console.error('Creature statblock import failed:', err)
		ui.notifications.error(`${game.i18n.localize('DOLMEN.CreatureImport.ParseError')}: ${err.message}`)
	}
}
