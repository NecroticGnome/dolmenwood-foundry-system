/*
 * Copied from the OSE premium module (ose-premium, ose-advancedfantasytome/scripts/ose-monster-parser.js).
 * Keep it close to the original so updates can be copied over: the local changes are marked "dolmenwood:".
 * creature-parser.js's parseOSEStatblock adapts its output to the Dolmenwood creature shape.
 */
/**
 * Parses a single OSE monster Statblock from raw text.
 */
export class OSEMonsterParser {
	// dolmenwood: the attack group per "or" alternative (Dolmenwood's attackGroup)
	static PATTERNS = ["a", "b", "c", "d", "e", "f"]

	// Various bullet styles use for monster ability lines.
	// Care must be taken as these are used directly in a regular expression,
	// so some characters need to be escaped or placed in specific positions
	// (e.g. dash must be first or last to avoid being interpreted as a range).
	static BULLET_STYLES = [
		"-", // Dash must be first for regex range
		"▶", // U+25B6
		"*",
		"•", // U+2022
		"►", // U+25BA
		"▸", // U+25B8
		"▪", // U+25AA
		"·", // U+00B7
		"‣", // U+2023
		"‒", // U+2012
		"–", // U+2013
		"—", // U+2014
		">"
	]

	// Regex to match ability lines starting with a bullet style, capturing name and text.
	static ABILITY_LINE_RE = new RegExp(
		`^[${OSEMonsterParser.BULLET_STYLES.join("")}]\\s*([^:]+)\\s*:(.*)$`,
		"i"
	)

	// Mapping of save type wording used within attack descriptions to their OSE abbreviations.
	static saveTypes = {
		death: "D",
		poison: "D",
		wand: "W",
		paralysis: "P",
		petrification: "P",
		petrify: "P",
		breath: "B",
		spell: "S",
		rod: "S",
		staff: "S"
	}

	// Mapping of save abbreviations to their full OSE save type names.
	static saveTypeMap = {
		D: "death",
		P: "paralysis",
		W: "wand",
		B: "breath",
		S: "spell"
	}

	/**
   * Parse a raw OSE Monster Statblock text into structured data.
   * @param {string} raw Raw Statblock text.
   * @return {{data: object, warnings: {field: string, message: string}[]}} Actor data and fallback warnings.
   */
	static parse(raw) {
		if (!raw) throw new Error("Empty input")
		const norm = this._normalize(raw)
		const warnings = []

		const data = {
			name: "",
			type: "monster",
			system: {
				hp: {
					hd: "",
					value: 0,
					max: 0
				},
				ac: {
					value: 0,
					mod: 0
				},
				aac: {
					value: 0,
					mod: 0
				},
				thac0: {
					value: 19
				},
				saves: {
					death: {
						value: 0
					},
					wand: {
						value: 0
					},
					paralysis: {
						value: 0
					},
					breath: {
						value: 0
					},
					spell: {
						value: 0
					}
				},
				movement: {
					base: 120
				},
				details: {
					biography: "",
					alignment: "",
					xp: 0,
					specialAbilities: 0,
					treasure: {
						table: "",
						type: ""
					},
					appearing: {
						d: 0,
						w: 0
					},
					morale: 0,
					movement: ""
				}
			},
			attacks: [],
			abilities: []
		}

		const lines = norm.trim()
			.split("\n")
			.map(l => l.trim())
			.filter(Boolean)
		// Join a wrapped ability heading (e.g. "▶ Disease; Afraid of fire; Attacking in" / "water: See main entry.").
		const bulletRe = new RegExp(`^[${OSEMonsterParser.BULLET_STYLES.join("")}]`)
		for (let i = 0; i < lines.length - 1; i++) {
			while (bulletRe.test(lines[i]) && !lines[i].includes(":") && i + 1 < lines.length && !bulletRe.test(lines[i + 1])) {
				lines[i] += ` ${lines.splice(i + 1, 1)[0]}`
			}
		}
		if (!lines.length) throw new Error("Empty input")

		// A name is a short heading, not the stats line or a sentence
		const first = lines[0]
		const isName = !/^AC\s*-?\d/i.test(first) && first.split(/\s+/).length <= 6 && !/[.!?]$/.test(first)
		if (isName) data.name = first
		else warnings.push({ field: "name", message: "No name line found; the name is left blank." })
		let encounteredStats = false
		let completedStats = false
		let combinedStatsLine = ""
		let abilityBuffer = null

		// Parse remaining lines
		for (let i = isName ? 1 : 0; i < lines.length; i++) {
			const line = lines[i].trim()

			// Capture leading description text before stats start
			if (!encounteredStats) {
				if (!line.match(/^AC\s*-?\d+/i)) {
					// Accumulate description
					data.system.details.biography = OSEMonsterParser.joinLine(data.system.details.biography, line)

					continue
				}
			}

			encounteredStats = true
			// Accumulate stats line until Abilities section starts
			if (!completedStats && !line.match(OSEMonsterParser.ABILITY_LINE_RE)) {
				combinedStatsLine = OSEMonsterParser.joinLine(combinedStatsLine, line)

				continue
			}

			if (!completedStats) {
				combinedStatsLine = this.parseStatsLine(combinedStatsLine, data, warnings)
			}

			completedStats = true

			const abilityMatch = line.match(OSEMonsterParser.ABILITY_LINE_RE)
			if (abilityMatch) {
				if (abilityBuffer) {
					// New ability started, finalize previous one
					const abilityItem = {
						...structuredClone(OSEMonsterParser.baseAbility),
						name: abilityBuffer.name.replace(/\b\w/g, c => c.toUpperCase())
					}
					abilityItem.system.description = abilityBuffer.text.trim()
					data.abilities.push(abilityItem)
				}
				// Start new ability
				abilityBuffer = {
					name: abilityMatch[1].trim(),
					text: (abilityMatch[2] || "").trim()
				}
			} else if (abilityBuffer) {
				// Continuation line for current ability
				abilityBuffer.text = OSEMonsterParser.joinLine(abilityBuffer.text, line)
			}
		}

		// Finalize last pending ability
		if (abilityBuffer) {
			const abilityItem = {
				...structuredClone(OSEMonsterParser.baseAbility),
				name: abilityBuffer.name.replace(/\b\w/g, c => c.toUpperCase())
			}
			abilityItem.system.description = abilityBuffer.text.trim()
			data.abilities.push(abilityItem)
		}

		// If a monster has no abilities, the stats will not have been parsed yet.
		if (!completedStats) {
			this.parseStatsLine(combinedStatsLine, data, warnings)
		}

		return { data, warnings }
	}

	/**
   * Parse a Statblock that may describe several variants with slash-separated values
   * (e.g. "HD 8/12/16*", "HD 3** to 8**"). Returns one parsed monster per variant.
   * @param {string} raw Raw Statblock text.
   * @return {{variants: object[], warnings: {field: string, message: string}[]}} One entry per variant.
   */
	static parseAll(raw) {
		if (!raw) throw new Error("Empty input")
		const lines = this._normalize(raw).split("\n")
		const start = lines.findIndex(l => /^AC\s*-?\d/i.test(l.trim()))
		const single = () => {
			const { data, warnings } = this.parse(raw)
			return { variants: [data], warnings }
		}
		if (start < 0) return single()
		const bulletRe = new RegExp(`^[${OSEMonsterParser.BULLET_STYLES.join("")}]`)
		let end = lines.findIndex((l, i) => i > start && bulletRe.test(l.trim()))
		if (end < 0) end = lines.length
		const stats = lines.slice(start, end).join(" ")

		const variants = this._variantStats(stats)
		if (!variants) return single()
		// Warn from the first variant; "By Hit Dice" stats have no numbers until split
		let warnings = []
		const parsed = variants.map(({ hd, text }, i) => {
			const r = this.parse([...lines.slice(0, start), text, ...lines.slice(end)].join("\n"))
			if (i === 0) warnings = r.warnings
			// Unnamed variants stay blank; the importer adds the default name and HD
			if (r.data.name) r.data.name = `${r.data.name} (${hd}HD)`
			return r.data
		})
		return { variants: parsed, warnings }
	}

	// Monster THAC0 by Hit Dice (index = HD), 22+ is 5.
	static THAC0_BY_HD = [19, 19, 18, 17, 16, 15, 14, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5]

	static _thac0ByHD(hd) {
		return OSEMonsterParser.THAC0_BY_HD[Math.min(hd, 22)]
	}

	// Monster saves by Hit Dice: D W P B S.
	static _savesByHD(hd) {
		if (hd <= 3) return [12, 13, 14, 15, 16]
		if (hd <= 6) return [10, 11, 12, 13, 14]
		if (hd <= 9) return [8, 9, 10, 10, 12]
		if (hd <= 12) return [6, 7, 8, 8, 10]
		if (hd <= 15) return [4, 5, 6, 5, 8]
		if (hd <= 18) return [2, 3, 4, 3, 6]
		if (hd <= 21) return [2, 2, 2, 2, 4]
		return [2, 2, 2, 2, 2]
	}

	/**
   * Split a variant stats line into one stats line per variant.
   * @param {string} stats Combined stats line.
   * @return {{hd: number, text: string}[]|null} Null if the line has a single variant.
   */
	static _variantStats(stats) {
		const hdField = stats.match(/\bHD\s+(.*?)\s+Att\b/i)?.[1]
		if (!hdField) return null

		let hds, stars
		const list = hdField.match(/^(\d+(?:\s*\/\s*\d+)+)(\**)/)
		const range = hdField.match(/^(\d+)(\**)\s+to\s+(\d+)(\**)/i)
		if (list) {
			hds = list[1].split("/").map(n => parseInt(n, 10))
			stars = list[2]
		} else if (range) {
			const [lo, hi] = [parseInt(range[1], 10), parseInt(range[3], 10)]
			hds = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
			stars = range[4] || range[2]
		} else return null

		const n = hds.length
		const hpList = hdField.match(/\(([\d\s/]+)hp\)/i)?.[1].replace(/\s+/g, "").split("/")
		const hpPerHD = parseInt(hdField.match(/\((\d+)\s*hp per Hit Die\)/i)?.[1], 10)
		const hpFor = (hd, i) => hpList?.length === n ? hpList[i] : (hpPerHD ? hpPerHD * hd : null)

		// Split on field keywords so slash lists in movement text are left alone.
		const fields = stats.split(/(?=\b(?:AC|HD|Att|THAC0|MV|SV|ML|AL|XP|NA|TT)\s)/)
		const slashList = /-?[\w.,+*]+(?:\s*\[[^\]]*\])?(?:\s*\/\s*-?[\w.,+*]+(?:\s*\[[^\]]*\])?)+/g

		return hds.map((hd, i) => {
			const pick = s => s.replace(slashList, m => {
				const items = m.split(/\s*\/\s*/)
				return items.length === n ? items[i] : m
			})
			const text = fields.map(f => {
				if (/^HD\s/i.test(f)) {
					const hp = hpFor(hd, i)
					return `HD ${hd}${stars}${hp ? ` (${hp}hp)` : ""} `
				}
				if (/^THAC0\s/i.test(f) && /By Hit Dice/i.test(f)) {
					const t = this._thac0ByHD(hd)
					return `THAC0 ${t} [${19 - t >= 0 ? "+" : ""}${19 - t}] `
				}
				if (/^SV\s/i.test(f) && !/\bD\d+/i.test(f)) {
					const [d, w, p, b, s] = this._savesByHD(hd)
					return `SV D${d} W${w} P${p} B${b} S${s} (${hd}) `
				}
				if (/^Att\s/i.test(f)) {
					f = f.replace(new RegExp(`\\b${hds[0]}\\s+to\\s+${hds[n - 1]}\\b`, "i"), `${hd}`)
						.replace(/(\d+)d(\d+) per Hit Die/i, (_, c, s) => `${c * hd}d${s}`)
					return pick(f)
				}
				if (/^XP\s/i.test(f)) return pick(f.replace(/(\d) (?=\d)/g, "$1"))
				if (/^(AC|THAC0|SV)\s/i.test(f)) return pick(f)
				return f
			}).join("")
			return { hd, text }
		})
	}

	/**
   * Append a wrapped line.
   * @param {string} text Text so far.
   * @param {string} line Next line.
   * @return {string} Joined text.
   */
	static joinLine(text, line) {
		if (!text) return line
		// OSE doesn't hyphenate, so a trailing hyphen is part of the word
		if (text.endsWith("-")) return text + line
		// Punctuation joins without a space
		return text + (/^[.,;:)]/.test(line) ? "" : " ") + line
	}

	static parseStatsLine(combinedStatsLine, data, warnings = []) {
		combinedStatsLine = combinedStatsLine.trim()
		if (!combinedStatsLine) {
			warnings.push({ field: "stats", message: "No stats line found (it should start with AC); stats use defaults." })
			return combinedStatsLine
		}
		const missing = (field, message) => warnings.push({ field, message })

		// Extract AC and AAC
		const acMatch = combinedStatsLine.match(/\bAC\s*(-?\d+)\s*\[([+‑-]?\d+)]?/i)
		if (acMatch) {
			data.system.ac.value = parseInt(acMatch[1], 10) || 0
			if (acMatch[2]) {
				// Replace the potentially non-standard hyphen character
				const aacValue = parseInt(acMatch[2].replace("‑", "-"), 10)
				if (!isNaN(aacValue) && aacValue !== 0) {
					data.system.aac.value = aacValue
				}
			}
		} else missing("ac", "AC not found; using 0.")

		// Extract HP
		const hpOnlyMatch = combinedStatsLine.match(/\bHD\s+(\d+)\s*hp(\*+)?/i)
		const hdMatch = !hpOnlyMatch && combinedStatsLine.match(
			/\bHD\s+(\d+|[¼½¾⅓⅔⅛⅜⅝⅞])([+‑-]\d+)?(\*+)?(?:\s*\((\d+)\s*hp\))?/i
		)
		if (hpOnlyMatch) {
			// Fixed hit points, e.g. "HD 1hp*"
			const hp = parseInt(hpOnlyMatch[1], 10)
			data.system.hp.hd = `${hp}d1`
			data.system.hp.value = data.system.hp.max = hp
			if (hpOnlyMatch[2]) data.system.details.specialAbilities = hpOnlyMatch[2].length
		}
		if (hdMatch) {
			const rawHD = hdMatch[1].replace(/\s+/, " ")
				.trim()
			const numericHD = OSEMonsterParser.parseFractionNumber(rawHD)
			if (!isNaN(numericHD)) {
				if (numericHD >= 1) {
					data.system.hp.hd = `${numericHD}d8`
				} else if (numericHD > 0) {
					data.system.hp.hd = `1d${Math.round(8 * numericHD)}`
				}

				if (hdMatch[2]) {
					// Replace the potentially non-standard hyphen character
					const hdMod = parseInt(hdMatch[2].replace("‑", "-"), 10)
					if (!isNaN(hdMod) && hdMod !== 0) {
						data.system.hp.hd += hdMod > 0 ? `+${hdMod}` : `${hdMod}`
					}
				}
			}

			if (hdMatch[3]) {
				data.system.details.specialAbilities = hdMatch[3].length
			}

			if (hdMatch[4]) {
				// Record the value in brackets as HP
				data.system.hp.value = parseInt(hdMatch[4])
				data.system.hp.max = data.system.hp.value
			}
		}
		if (!hpOnlyMatch && !hdMatch) missing("hd", "HD not found; Hit Dice left blank.")

		// Extract THAC0
		const thac0Match = combinedStatsLine.match(/THAC0\s+(\d+)/i)
		if (thac0Match) {
			data.system.thac0.value = parseInt(thac0Match[1])
		} else missing("thac0", "THAC0 not found; using 19.")

		// Extract Movement
		const moveMatch = combinedStatsLine.match(/MV\s+((\d+)(?:'\s*)?(?:\([^)]*\))?\s*((?:(?!,|\bSV\b).)*))/i)
		if (moveMatch) {
			const desc = moveMatch[1].trim()
			data.system.details.movement = desc || ""
			data.system.movement.base = parseInt(moveMatch[2], 10) || 0
		} else missing("mv", "MV not found; using 120.")

		// Extract Save Values
		const savesMatch = combinedStatsLine.match(/SV\s+([^,]*\))/i)
		if (savesMatch) {
			for (const abbr of Object.values(OSEMonsterParser.saveTypes)) {
				const match = savesMatch[1].match(new RegExp(`\\b${abbr}\\s*(\\d+)\\b`, "i"))
				if (match) {
					data.system.saves[OSEMonsterParser.saveTypeMap[abbr]].value = parseInt(match[1], 10) || 0
				}
			}

			// TODO handle Save as HD value (inside brackets)
		}
		if (!savesMatch || Object.values(data.system.saves).some(s => !s.value)) missing("sv", "SV not found; saves left at 0.")

		// Extract Morale
		const moraleMatch = combinedStatsLine.match(/\bML\s+(\d+)/i)
		if (moraleMatch) {
			data.system.details.morale = parseInt(moraleMatch[1], 10) || 0
		} else missing("ml", "ML not found; using 0.")

		// Extract Alignment
		// Ends at a comma (pre-2026) or the next field (2026), so "Neutral or Chaotic" survives.
		const alignMatch = combinedStatsLine.match(/\bAL\s+(.+?)(?=\s*,|\s+(?:XP|NA|TT)\b|$)/i)
		if (alignMatch) {
			data.system.details.alignment = alignMatch[1].trim()
		} else missing("al", "AL not found; alignment left blank.")

		// Extract XP
		const xpMatch = combinedStatsLine.match(/\bXP\s+([\d,]+)/i)
		if (xpMatch) {
			data.system.details.xp = parseInt(xpMatch[1].replace(',', ''), 10) || 0
		} else missing("xp", "XP not found; using 0.")

		// Extract Number Appearing
		const naMatch = combinedStatsLine.match(/\bNA\s+(.+?\)|.+?,)/i)
		if (naMatch) {
			const naText = naMatch[1].trim()
			const naValMatch = naText.match(/(\S+)\s*(?:\(([^)]+)\))?/)
			if (naValMatch) {
				data.system.details.appearing.d = naValMatch[1].trim()
				if (naValMatch[2]) {
					data.system.details.appearing.w = naValMatch[2].trim()
				}
			}
		}

		// Link a table per type letter. Anything more (e.g. "E + 5,000gp", "R (C)") is kept as text
		const ttMatch = combinedStatsLine.match(/\bTT\s+(.+)$/i)
		if (ttMatch) {
			const ttText = ttMatch[1].trim()
			if (ttText && ttText !== "None") {
				// dolmenwood: there are no OSE treasure tables to link, so keep the text
				data.system.details.treasure.type = ttText
			}
		}

		// Create attacks
		const attMatch = combinedStatsLine.match(/\bAtt\s+(.+?),*\s*THAC0/i)
		if (attMatch) {
			const attText = attMatch[1].trim()
			const availablePatterns = OSEMonsterParser.PATTERNS // dolmenwood: attack groups a-f, not CONFIG.OSE.colors

			// Split on commas or " + " (ignoring those inside brackets)
			const splitTopLevelCommasAndPlus = (text) => {
				const parts = []
				let buf = ""
				let depthParens = 0
				let depthBrackets = 0
				for (let i = 0; i < text.length; i++) {
					const ch = text[i]
					if (ch === "(") depthParens++
					else if (ch === ")") depthParens = Math.max(0, depthParens - 1)
					else if (ch === "[") depthBrackets++
					else if (ch === "]") depthBrackets = Math.max(0, depthBrackets - 1)
					if ((ch === "," || ch === "+") && depthParens === 0 && depthBrackets === 0) {
						parts.push(buf.trim())
						buf = ""
						continue
					}
					buf += ch
				}
				if (buf.trim()) parts.push(buf.trim())
				return parts
			}

			// Split a segment on top-level " or " (ignoring those inside brackets)
			const splitTopLevelOr = (text) => {
				const parts = []
				let buf = ""
				let depthParens = 0
				let depthBrackets = 0
				for (let i = 0; i < text.length; i++) {
					const slice = text.slice(i, i + 4).toLowerCase()
					const ch = text[i]
					if (ch === "(") depthParens++
					else if (ch === ")") depthParens = Math.max(0, depthParens - 1)
					else if (ch === "[") depthBrackets++
					else if (ch === "]") depthBrackets = Math.max(0, depthBrackets - 1)

					if (slice === " or " && depthParens === 0 && depthBrackets === 0) {
						parts.push(buf.trim())
						buf = ""
						i += 3
						continue
					}
					buf += ch
				}
				if (buf.trim()) parts.push(buf.trim())
				return parts
			}

			const parseSingleAttack = (attackExpr, pattern) => {
				if (!attackExpr || /^none$/i.test(attackExpr.trim())) return
				const atkMatch = attackExpr.trim()
					.match(/^(?:(\d+)\s*x)?\s*([^(]+?)(?:\s*\(([^)]+)\))?\s*$/i)
				if (!atkMatch) return

				const count = atkMatch[1] ? parseInt(atkMatch[1], 10) : 1
				const rawName = atkMatch[2].trim()
				const name = rawName.replace(/\b\w/g, c => c.toUpperCase())
				const bracket = atkMatch[3] ? atkMatch[3].trim() : ""

				const normalizeForCompare = s => s.replace(/\s+/g, "").toLowerCase()
				let damageValue = ""
				let descriptionValue = ""
				const hasDice = !!(bracket && /\d*d\d+/i.test(bracket))

				if (hasDice) {
					const normNoSpace = normalizeForCompare(bracket)
					if (/^[0-9d+x-]+$/i.test(normNoSpace)) {
						damageValue = normNoSpace
					} else {
						const prefixMatch = bracket.match(/^(\d+d\d+(?:\s*[+x-]\s*\d+)*)/i)
						if (prefixMatch) damageValue = normalizeForCompare(prefixMatch[1])
						descriptionValue = bracket
						if (descriptionValue && damageValue &&
              normalizeForCompare(descriptionValue) === damageValue) {
							descriptionValue = ""
						}
					}
				} else {
					// Flat damage, e.g. "Bite (1)" or "Bite (1 + poison)".
					const flatMatch = bracket.match(/^\d+(?=\s*(?:\+|$))/)
					if (flatMatch) damageValue = flatMatch[0]
					descriptionValue = bracket || rawName
				}

				let foundSaveKey = ""
				const searchText = bracket || rawName
				if (searchText) {
					for (const key of Object.keys(OSEMonsterParser.saveTypes)) {
						if (new RegExp(`\\b${key}\\b`, "i").test(searchText)) {
							foundSaveKey = key
							break
						}
					}
				}

				if (damageValue) damageValue = damageValue.replace(/x/gi, "*")

				const attackItem = {
					...structuredClone(OSEMonsterParser.baseAttack),
					name
				}
				attackItem.system.counter.value = count
				attackItem.system.counter.max = count
				attackItem.system.save = foundSaveKey
				attackItem.system.pattern = pattern
				if (damageValue) attackItem.system.damage = damageValue
				if (descriptionValue && normalizeForCompare(descriptionValue) !== damageValue) {
					attackItem.system.description = descriptionValue
				}

				data.attacks.push(attackItem)
			}

			// Handle a bracketed group (all attacks share one pattern)
			const processBracketGroup = (groupText, pattern) => {
				const inner = groupText.slice(1, -1).trim()
				const orParts = splitTopLevelOr(inner)
				if (orParts.length > 1) {
					orParts.forEach(p => parseSingleAttack(p, pattern))
					return
				}
				const commaParts = splitTopLevelCommasAndPlus(inner)
				commaParts.forEach(p => parseSingleAttack(p, pattern))
			}

			// Split into attack groups by " or "
			const attackGroups = splitTopLevelOr(attText)
			let patternIdx = 0

			// Process each group
			for (const group of attackGroups) {
				// Each group gets a different color pattern
				const currentPattern = availablePatterns.length ? availablePatterns[patternIdx] : "green"
				const groupTrim = group.trim()

				// Split groups at " + " or " , " (legacy for pre-2026 stat blocks)
				const alternatives = splitTopLevelCommasAndPlus(groupTrim)
				for (const alt of alternatives) {
					const altTrim = alt.trim()
					if (/^\[.*]$/.test(altTrim)) {
						processBracketGroup(altTrim, currentPattern)
					} else {
						parseSingleAttack(altTrim, currentPattern)
					}
				}

				if (availablePatterns.length) patternIdx = (patternIdx + 1) % availablePatterns.length
			}
		} else missing("att", "Att not found; no attacks created.")
		return combinedStatsLine
	}

	static _normalize(t) {
		return t
			.replace(/\r/g, "")
			.replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "")
			.replace(/[\u2212\u2011]/g, "-")
			.replace(/[“”]/g, "\"")
			.replace(/[‘’′]/g, "'")
			.replace(/\u00d7/g, "×")
			.replace(/\s*×\s*/g, " x ")
			.replace(/\u2013|\u2014/g, "-")
			.replace(/\s*–\s*/g, "-")
			.replace(/[’`]/g, "'")
			.replace(/\s+$/g, "")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n{2,}/g, "\n")
			.trim()
		// Drop PDF page numbers and DriveThru watermarks
			.split("\n")
			.filter(l => !/^\s*\d{1,3}\s*$/.test(l) && !l.includes("(Order #"))
			.join("\n")
	}

	static FRACTION_MAP = {
		"¼": 0.25,
		"½": 0.5,
		"¾": 0.75,
		"⅓": 1 / 3,
		"⅔": 2 / 3,
		"⅛": 0.125,
		"⅜": 0.375,
		"⅝": 0.625,
		"⅞": 0.875
	}

	static parseFractionNumber = (raw) => {
		if (!raw) return NaN
		raw = raw.trim()

		if (/^\d+$/.test(raw)) return parseInt(raw, 10)

		let intPart = 0
		let fracPart = raw

		// Mixed number like "2 1/2" or "2½"
		const mixed = raw.match(/^(\d+)\s*(.*)$/)
		if (mixed) {
			const maybeFraction = mixed[2]
			if (maybeFraction && (maybeFraction.includes("/") || [...maybeFraction].some(c => OSEMonsterParser.FRACTION_MAP[c] != null))) {
				intPart = parseInt(mixed[1], 10)
				fracPart = maybeFraction
			}
		}

		let fracVal = 0;

		// Unicode fraction chars
		[...fracPart].forEach(ch => {
			if (OSEMonsterParser.FRACTION_MAP[ch] != null) {
				fracVal += OSEMonsterParser.FRACTION_MAP[ch]
				fracPart = fracPart.replace(ch, "")
			}
		})

		fracPart = fracPart.trim()

		// Standard a/b fraction
		if (/\d+\/\d+/.test(fracPart)) {
			const [a, b] = fracPart.split("/")
				.map(Number)
			if (b) fracVal += a / b
		}

		if (intPart === 0 && fracVal === 0) return NaN
		return intPart + fracVal
	}

	static baseAttack = {
		name: "",
		type: "weapon",
		img: "icons/skills/melee/swords-parry-block-blue.webp",
		system: {
			damage: "",
			description: "",
			melee: true,
			missile: false,
			pattern: "red",
			save: "",
			counter: {
				max: 0,
				value: 0
			}
		}
	}

	static baseAbility = {
		name: "",
		type: "ability",
		img: "icons/sundries/books/book-tooled-eye-gold-red.webp",
		system: {
			description: "",
			pattern: "white"
		}
	}
}
