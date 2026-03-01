/* global foundry, ui, Actor, Item, Scene, JournalEntry, RollTable, Macro, Playlist, Cards, Folder */

/**
 * OSE-to-Dolmenwood Import Macro
 *
 * Run this macro in your Dolmenwood world (Foundry VTT).
 * It reads a JSON file exported by the OSE Export macro,
 * converts all actors and items to Dolmenwood format,
 * and creates them as world-level documents.
 *
 * Usage:
 *   1. Open your Dolmenwood world in Foundry VTT
 *   2. Create a new Script macro and paste this entire file
 *   3. Run the macro and select the exported JSON file
 */

// ---------------------------------------------------------------------------
// Conversion helpers (pure JS, no Node.js deps)
// ---------------------------------------------------------------------------

function clamp(val, min, max) {
	const n = typeof val === "string" ? parseInt(val, 10) : val
	if (isNaN(n)) return min
	return Math.max(min, Math.min(max, n))
}

function safeInt(val, fallback = 0) {
	if (val === null || val === undefined) return fallback
	const n = typeof val === "string" ? parseInt(val, 10) : Number(val)
	return isNaN(n) ? fallback : n
}

function normalizeAlignment(al) {
	if (!al) return "neutral"
	const lower = al.toLowerCase().trim()
	if (lower.includes("lawful")) return "lawful"
	if (lower.includes("chaotic")) return "chaotic"
	return "neutral"
}

function parseHDLevel(hd) {
	if (!hd) return 1
	const str = String(hd).trim()
	if (str.includes("/")) return 1
	const m = str.match(/^(\d+)/)
	return m ? Math.max(1, parseInt(m[1], 10)) : 1
}

function abilityMod(score) {
	if (score <= 3) return -3
	if (score <= 5) return -2
	if (score <= 8) return -1
	if (score <= 12) return 0
	if (score <= 15) return 1
	if (score <= 17) return 2
	return 3
}

// ---------------------------------------------------------------------------
// Item converters
// ---------------------------------------------------------------------------

function convertWeapon(ose) {
	const sys = ose.system || {}
	const qualities = []
	if (sys.melee) qualities.push("melee")
	if (sys.missile) qualities.push("missile")
	if (sys.slow) qualities.push("two-handed")

	if (Array.isArray(sys.tags)) {
		for (const tag of sys.tags) {
			const val = (tag.value || tag.title || "").toLowerCase()
			if (val.includes("two-handed") && !qualities.includes("two-handed")) qualities.push("two-handed")
			if (val.includes("silver") && !qualities.includes("silver")) qualities.push("silver")
		}
	}

	if (!qualities.includes("melee") && !qualities.includes("missile")) {
		qualities.push("melee")
	}

	return {
		name: ose.name,
		type: "Weapon",
		img: ose.img || "icons/svg/sword.svg",
		system: {
			damage: sys.damage || "1d6",
			cost: safeInt(sys.cost, 0),
			costDenomination: "gp",
			weightCoins: safeInt(sys.weight, 0),
			equipped: !!sys.equipped,
			quantity: safeInt(sys.quantity?.value, 1),
			notes: sys.description || "",
			size: "medium",
			qualities,
			rangeShort: safeInt(sys.range?.short, 0),
			rangeMedium: safeInt(sys.range?.medium, 0),
			rangeLong: safeInt(sys.range?.long, 0),
		},
	}
}

function convertArmor(ose) {
	const sys = ose.system || {}
	const ac = safeInt(sys.aac?.value, 10)
	const bulk = sys.type || "medium"
	const nameLower = (ose.name || "").toLowerCase()
	const armorType = nameLower.includes("shield") ? "shield" : "armor"

	return {
		name: ose.name,
		type: "Armor",
		img: ose.img || "icons/svg/shield.svg",
		system: {
			ac,
			bulk: ["none", "light", "medium", "heavy"].includes(bulk) ? bulk : "medium",
			fit: "medium",
			armorType,
			cost: safeInt(sys.cost, 0),
			costDenomination: "gp",
			weightCoins: safeInt(sys.weight, 0),
			equipped: !!sys.equipped,
			quantity: safeInt(sys.quantity?.value, 1),
			notes: sys.description || "",
		},
	}
}

function convertSpell(ose) {
	const sys = ose.system || {}
	const oseClass = (sys.class || "").toLowerCase()
	const isHoly = oseClass.includes("cleric") || oseClass.includes("druid")

	if (isHoly) {
		return {
			name: ose.name,
			type: "HolySpell",
			img: ose.img || "icons/svg/book.svg",
			system: {
				rank: clamp(sys.lvl, 1, 5),
				range: sys.range || "",
				duration: sys.duration || "",
				description: sys.description || "",
			},
		}
	}

	return {
		name: ose.name,
		type: "Spell",
		img: ose.img || "icons/svg/book.svg",
		system: {
			rank: clamp(sys.lvl, 1, 6),
			range: sys.range || "",
			duration: sys.duration || "",
			description: sys.description || "",
		},
	}
}

function convertGenericItem(ose) {
	const sys = ose.system || {}
	const isTreasure = !!sys.treasure

	return {
		name: ose.name,
		type: isTreasure ? "Treasure" : "Item",
		img: ose.img || "icons/svg/item-bag.svg",
		system: {
			cost: safeInt(sys.cost, 0),
			costDenomination: "gp",
			weightCoins: safeInt(sys.weight, 0),
			equipped: !!sys.equipped,
			quantity: safeInt(sys.quantity?.value, 1),
			notes: sys.description || "",
		},
	}
}

function convertAbilityItem(ose) {
	const sys = ose.system || {}
	return {
		name: ose.name,
		type: "Item",
		img: ose.img || "icons/svg/book.svg",
		system: {
			cost: 0,
			costDenomination: "gp",
			weightCoins: 0,
			equipped: false,
			quantity: 1,
			notes: sys.description || "",
		},
	}
}

function convertItem(ose) {
	const type = (ose.type || "").toLowerCase()
	switch (type) {
	case "weapon":    return convertWeapon(ose)
	case "armor":     return convertArmor(ose)
	case "spell":     return convertSpell(ose)
	case "ability":   return convertAbilityItem(ose)
	case "item":
	case "container":
	default:          return convertGenericItem(ose)
	}
}

// ---------------------------------------------------------------------------
// Actor converters
// ---------------------------------------------------------------------------

function convertMonster(ose) {
	const sys = ose.system || {}
	const details = sys.details || {}

	const hpValue = safeInt(sys.hp?.value, 4)
	const hpMax = safeInt(sys.hp?.max, hpValue)
	const hpDice = sys.hp?.hd || "1d8"

	const ac = safeInt(sys.aac?.value, 19 - safeInt(sys.ac?.value, 9))
	const attackBonus = safeInt(sys.thac0?.bba, 19 - safeInt(sys.thac0?.value, 19))

	const saves = {
		doom:  safeInt(sys.saves?.death?.value, 10),
		ray:   safeInt(sys.saves?.wand?.value, 10),
		hold:  safeInt(sys.saves?.paralysis?.value, 10),
		blast: safeInt(sys.saves?.breath?.value, 10),
		spell: safeInt(sys.saves?.spell?.value, 10),
	}

	const baseMove = safeInt(sys.movement?.base, 120)
	const speed = Math.round(baseMove / 3)

	const movement = { swim: 0, fly: 0, climb: 0, burrow: 0 }
	const mvStr = details.movement || ""
	if (mvStr) {
		const segments = mvStr.split("/")
		for (let i = 1; i < segments.length; i++) {
			const seg = segments[i].toLowerCase()
			const encMatch = seg.match(/\((\d+)'?\)/)
			const spd = encMatch ? parseInt(encMatch[1], 10) : 0
			if (/fly|flying/.test(seg)) movement.fly = spd
			else if (/swim|swimming/.test(seg)) movement.swim = spd
			else if (/climb|climbing/.test(seg)) movement.climb = spd
			else if (/burrow|burrowing/.test(seg)) movement.burrow = spd
		}
	}

	const alignment = normalizeAlignment(details.alignment)
	const morale = clamp(details.morale, 2, 12)
	const xpAward = safeInt(details.xp, 0)
	const encounters = details.appearing?.d || ""
	const treasureType = details.treasure?.type || ""

	// Parse embedded items into specialAbilities and attacks
	const embeddedItems = ose.items || []
	const specialAbilities = []
	const attacks = []
	for (const item of embeddedItems) {
		const itemType = (item.type || "").toLowerCase()
		if (itemType === "ability") {
			specialAbilities.push({
				name: item.name || "Ability",
				description: item.system?.description || "",
			})
		} else if (itemType === "weapon") {
			const wSys = item.system || {}
			attacks.push({
				numAttacks: safeInt(wSys.counter?.max, 1) || 1,
				attackName: item.name || "Attack",
				attackBonus: attackBonus + safeInt(wSys.bonus, 0),
				attackDamage: wSys.damage || wSys.description || "1d6",
				attackEffect: "",
				attackType: "attack",
				rangeShort: safeInt(wSys.range?.short, 0),
				rangeMedium: safeInt(wSys.range?.medium, 0),
				rangeLong: safeInt(wSys.range?.long, 0),
				attackGroup: "a",
			})
		}
	}

	const groupLetters = ["a", "b", "c", "d", "e", "f"]
	attacks.forEach((atk, i) => {
		atk.attackGroup = groupLetters[i % groupLetters.length]
	})

	return {
		name: ose.name,
		type: "Creature",
		img: ose.img || "icons/svg/mystery-man.svg",
		system: {
			level: parseHDLevel(hpDice),
			hp: { value: hpValue, max: hpMax },
			ac,
			saves,
			speed,
			size: "medium",
			alignment,
			monsterType: "mortal",
			intelligence: "animal",
			hpDice,
			attacks,
			morale,
			xpAward,
			encounters: String(encounters),
			movement,
			treasureType: String(treasureType),
			description: details.biography || "",
			specialAbilities,
		},
		prototypeToken: ose.prototypeToken || {},
		flags: ose.flags || {},
	}
}

function convertCharacter(ose) {
	const sys = ose.system || {}
	const details = sys.details || {}
	const scores = sys.scores || {}

	const strScore = clamp(scores.str?.value, 3, 18)
	const intScore = clamp(scores.int?.value, 3, 18)
	const wisScore = clamp(scores.wis?.value, 3, 18)
	const dexScore = clamp(scores.dex?.value, 3, 18)
	const conScore = clamp(scores.con?.value, 3, 18)
	const chaScore = clamp(scores.cha?.value, 3, 18)

	const hpValue = safeInt(sys.hp?.value, 4)
	const hpMax = safeInt(sys.hp?.max, hpValue)
	const ac = safeInt(sys.aac?.value, 19 - safeInt(sys.ac?.value, 9))
	const attack = safeInt(sys.thac0?.bba, 19 - safeInt(sys.thac0?.value, 19))

	const saves = {
		doom:  clamp(sys.saves?.death?.value, 2, 20),
		ray:   clamp(sys.saves?.wand?.value, 2, 20),
		hold:  clamp(sys.saves?.paralysis?.value, 2, 20),
		blast: clamp(sys.saves?.breath?.value, 2, 20),
		spell: clamp(sys.saves?.spell?.value, 2, 20),
	}

	const baseMove = safeInt(sys.movement?.base, 120)
	const speed = Math.round(baseMove / 3)
	const level = clamp(details.level, 1, 15)
	const alignment = normalizeAlignment(details.alignment)

	// Convert embedded items
	const embeddedItems = ose.items || []
	const convertedItems = embeddedItems.map(item => convertItem(item))

	return {
		name: ose.name,
		type: "Adventurer",
		img: ose.img || "icons/svg/mystery-man.svg",
		items: convertedItems,
		system: {
			level,
			hp: { value: hpValue, max: hpMax },
			ac,
			attack,
			saves,
			speed,
			size: "medium",
			alignment,
			kindred: "human",
			abilities: {
				strength:     { score: strScore, mod: abilityMod(strScore) },
				intelligence: { score: intScore, mod: abilityMod(intScore) },
				wisdom:       { score: wisScore, mod: abilityMod(wisScore) },
				dexterity:    { score: dexScore, mod: abilityMod(dexScore) },
				constitution: { score: conScore, mod: abilityMod(conScore) },
				charisma:     { score: chaScore, mod: abilityMod(chaScore) },
			},
			background: {
				notes: details.biography || "",
			},
		},
		prototypeToken: ose.prototypeToken || {},
		flags: ose.flags || {},
	}
}

// ---------------------------------------------------------------------------
// PDF Pager character converter
// ---------------------------------------------------------------------------

/**
 * Parse "Kindred & Class" field into separate kindred and class keys.
 * Examples: "Human Thief", "Elf Magician", "Breggle Hunter",
 *           "Human Fighter (Mercenary)", "Shorthorn Breggle Magician"
 */
function parseKindredClass(raw) {
	if (!raw) return { kindred: "human", class: "fighter" }
	const text = raw.toLowerCase().trim()

	const kindredMap = {
		breggle: "breggle", elf: "elf", grimalkin: "grimalkin",
		human: "human", mossling: "mossling", woodgrue: "woodgrue",
	}
	const classMap = {
		bard: "bard", cleric: "cleric", enchanter: "enchanter",
		fighter: "fighter", friar: "friar", hunter: "hunter",
		knight: "knight", magician: "magician", thief: "thief",
	}

	// Strip common prefixes like "Shorthorn", "Longhorn" (Breggle variants)
	const stripped = text.replace(/\b(shorthorn|longhorn)\b/g, "").trim()

	let kindred = "human"
	let cls = "fighter"

	for (const [key] of Object.entries(kindredMap)) {
		if (stripped.includes(key)) {
			kindred = key; break 
		}
	}
	for (const [key] of Object.entries(classMap)) {
		if (stripped.includes(key)) {
			cls = key; break 
		}
	}

	return { kindred, class: cls }
}

/**
 * Parse extra skill text like "Pick Lock: 5" or "CLIMB WALL 4" into
 * { id, target } matching Dolmenwood skill IDs.
 */
function parseExtraSkill(raw) {
	if (!raw) return null
	const text = raw.toLowerCase().trim()
	if (!text) return null

	const skillMap = {
		"pick lock": "pickLock",
		"picklock": "pickLock",
		"climb wall": "climbWall",
		"climb": "climbWall",
		"detect magic": "detectMagic",
		"decipher doc": "decipherDocument",
		"decipher document": "decipherDocument",
		"decipher": "decipherDocument",
		"legerdemain": "legerdemain",
		"stealth": "stealth",
		"stalking": "stalking",
		"tracking": "tracking",
		"disarm mech": "disarmMechanism",
		"disarm mechanism": "disarmMechanism",
		"disarm": "disarmMechanism",
		"alertness": "alertness",
		"monster lore": "monsterLore",
	}

	let id = null
	for (const [pattern, skillId] of Object.entries(skillMap)) {
		if (text.includes(pattern)) {
			id = skillId; break 
		}
	}
	if (!id) return null

	// Extract target number
	const numMatch = text.match(/(\d+)\s*$/)
	const target = numMatch ? clamp(parseInt(numMatch[1], 10), 2, 6) : 6

	return { id, target }
}

/**
 * Build notes HTML from the text fields on page 2 of the PDF.
 */
function buildPdfNotes(f) {
	const sections = []
	if (f["Kindred & Class Traits 1"]) sections.push(`<h3>Kindred & Class Traits</h3><p>${f["Kindred & Class Traits 1"].replace(/\n/g, "<br>")}</p>`)
	if (f["Kindred & Class Traits 2"]) sections.push(`<p>${f["Kindred & Class Traits 2"].replace(/\n/g, "<br>")}</p>`)
	if (f["Tiny Items"]) sections.push(`<h3>Tiny Items</h3><p>${f["Tiny Items"].replace(/\n/g, "<br>")}</p>`)
	if (f["Notes"]) sections.push(`<h3>Notes</h3><p>${f["Notes"].replace(/\n/g, "<br>")}</p>`)
	if (f["Other Notes"]) sections.push(`<h3>Other Notes</h3><p>${f["Other Notes"].replace(/\n/g, "<br>")}</p>`)
	if (f["Moon Sign"]) sections.push(`<h3>Moon Sign</h3><p>${f["Moon Sign"]}</p>`)
	return sections.join("\n")
}

/**
 * Convert a character actor using PDF Pager form data.
 * The fieldText contains Dolmenwood-native field names.
 */
function convertPdfPagerCharacter(ose) {
	const f = ose.flags["pdf-pager"].fieldText

	// Identity
	const { kindred, class: cls } = parseKindredClass(f["Kindred & Class"])

	// Ability scores
	const strScore = clamp(safeInt(f["Strength"], 10), 3, 18)
	const intScore = clamp(safeInt(f["Intelligence"], 10), 3, 18)
	const wisScore = clamp(safeInt(f["Wisdom"], 10), 3, 18)
	const dexScore = clamp(safeInt(f["Dexterity"], 10), 3, 18)
	const conScore = clamp(safeInt(f["Constitution"], 10), 3, 18)
	const chaScore = clamp(safeInt(f["Charisma"], 10), 3, 18)

	// Saves
	const saves = {
		doom:  clamp(safeInt(f["Doom"], 14), 2, 20),
		ray:   clamp(safeInt(f["Ray"], 14), 2, 20),
		hold:  clamp(safeInt(f["Hold"], 14), 2, 20),
		blast: clamp(safeInt(f["Blast"], 14), 2, 20),
		spell: clamp(safeInt(f["Spell"], 14), 2, 20),
	}

	// Combat
	const ac = safeInt(f["Armour Class"], 10)
	const attackRaw = (f["Attack"] || "0").replace(/\+/g, "")
	const attack = safeInt(attackRaw.split("/")[0], 0)
	const speed = safeInt(f["Speed"], 40)
	const magicResistance = safeInt((f["Magic Resistance"] || "0").replace(/\+/g, ""), 0)

	// HP — prefer PDF fields (Dolmenwood: "Hit Points"/"Max Hit Points",
	// OSE: "HP"/"Max HP"), fall back to OSE system data
	const sys = ose.system || {}
	const hpValue = (f["Hit Points"] || f["HP"])
		? safeInt(f["Hit Points"] || f["HP"], 4)
		: safeInt(sys.hp?.value, 4)
	const hpMax = (f["Max Hit Points"] || f["Max HP"])
		? safeInt(f["Max Hit Points"] || f["Max HP"], hpValue)
		: safeInt(sys.hp?.max, hpValue)

	// Level — prefer PDF field, fall back to OSE system data
	const level = f["Level"]
		? clamp(safeInt(f["Level"], 1), 1, 15)
		: clamp(safeInt(sys.details?.level, 1), 1, 15)

	// Alignment — prefer PDF field, fall back to OSE system data
	const alignment = f["Alignment"]
		? normalizeAlignment(f["Alignment"])
		: normalizeAlignment(sys.details?.alignment)

	// Skills
	const skills = {
		listen:   clamp(safeInt(f["Listen"], 6), 2, 6),
		search:   clamp(safeInt(f["Search"], 6), 2, 6),
		survival: clamp(safeInt(f["Survival"], 6), 2, 6),
	}

	// Extra skills
	const extraSkills = []
	for (let i = 1; i <= 6; i++) {
		const parsed = parseExtraSkill(f[`Extra Skill ${i}`])
		if (parsed) extraSkills.push(parsed)
	}

	// Movement
	const exploring = safeInt(f["Exploring"], 120)
	const overland = safeInt(f["Overland"], 24)

	// Coins
	const coins = {
		copper:      safeInt(f["Copper Pieces"], 0),
		silver:      safeInt(f["Silver Pieces"], 0),
		gold:        safeInt(f["Gold Pieces"], 0),
		pellucidium: safeInt(f["Pellucidium Pieces"], 0),
	}

	// Languages
	const languages = []
	for (let i = 1; i <= 2; i++) {
		const raw = f[`Languages ${i}`]
		if (raw) {
			for (const lang of raw.split(/[,;]/)) {
				const trimmed = lang.trim()
				if (trimmed) languages.push(trimmed)
			}
		}
	}

	// Items — create from equipped and stowed slots
	const items = []
	for (let i = 1; i <= 10; i++) {
		const name = (f[`Equipped Item ${i}`] || "").trim()
		if (name && !name.startsWith(">")) {
			items.push({
				name,
				type: "Item",
				img: "icons/svg/item-bag.svg",
				system: {
					cost: 0, costDenomination: "gp",
					weightCoins: safeInt(f[`Equipped Item Weight ${i}`], 0),
					equipped: true, quantity: 1, notes: "",
				},
			})
		}
	}
	for (let i = 1; i <= 16; i++) {
		const name = (f[`Stowed Item ${i}`] || "").trim()
		if (name && !name.startsWith(">")) {
			items.push({
				name,
				type: "Item",
				img: "icons/svg/item-bag.svg",
				system: {
					cost: 0, costDenomination: "gp",
					weightCoins: safeInt(f[`Stowed Item Weight ${i}`], 0),
					equipped: false, quantity: 1, notes: "",
				},
			})
		}
	}

	// Build background notes from PDF text fields
	const backgroundNotes = buildPdfNotes(f)

	return {
		name: ose.name,
		type: "Adventurer",
		img: ose.img || "icons/svg/mystery-man.svg",
		items,
		system: {
			level,
			hp: { value: hpValue, max: hpMax },
			ac,
			attack,
			saves,
			speed,
			size: kindred === "mossling" ? "small" : "medium",
			alignment,
			kindred,
			class: cls,
			magicResistance,
			abilities: {
				strength:     { score: strScore, mod: abilityMod(strScore) },
				intelligence: { score: intScore, mod: abilityMod(intScore) },
				wisdom:       { score: wisScore, mod: abilityMod(wisScore) },
				dexterity:    { score: dexScore, mod: abilityMod(dexScore) },
				constitution: { score: conScore, mod: abilityMod(conScore) },
				charisma:     { score: chaScore, mod: abilityMod(chaScore) },
			},
			skills,
			extraSkills,
			customizeSkills: true,
			movement: { exploring, overland },
			coins,
			languages: languages.length > 0 ? languages : ["Woldish"],
			background: {
				profession: f["Background"] || "",
				notes: backgroundNotes,
			},
			affiliation: f["Affiliation"] || "",
			xp: {
				value: safeInt(f["XP"], 0),
				nextLevel: safeInt(f["XP For Next Level"] || f["XP for Next Level"], 2000),
			},
		},
		prototypeToken: ose.prototypeToken || {},
		flags: ose.flags || {},
	}
}

/**
 * Convert a single OSE actor (monster or character) to Dolmenwood format.
 * Returns the converted actor data ready for Actor.createDocuments().
 */
function convertActor(ose) {
	const oseType = (ose.type || "").toLowerCase()
	if (oseType === "monster") return convertMonster(ose)
	// Characters with PDF Pager data get the richer Dolmenwood conversion
	if (oseType === "character" && ose.flags?.["pdf-pager"]?.fieldText) {
		return convertPdfPagerCharacter(ose)
	}
	if (oseType === "character") return convertCharacter(ose)
	// Unknown type — return as Creature with minimal conversion
	return convertMonster(ose)
}

// ---------------------------------------------------------------------------
// Convert token delta system data (for unlinked tokens with overrides)
// ---------------------------------------------------------------------------

function convertTokenDelta(delta, baseActorItems) {
	if (!delta || typeof delta !== "object") return delta
	const converted = { ...delta }

	// Build a lookup of base actor items by _id so we can fill in
	// missing fields on partial delta overrides
	const baseItemMap = new Map()
	if (Array.isArray(baseActorItems)) {
		for (const item of baseActorItems) {
			if (item._id) baseItemMap.set(item._id, item)
		}
	}

	// If the delta has system data, convert OSE fields to Dolmenwood
	if (converted.system) {
		const sys = converted.system
		const newSys = {}

		// HP
		if (sys.hp) newSys.hp = sys.hp

		// AC — prefer ascending
		if (sys.aac?.value !== undefined) {
			newSys.ac = safeInt(sys.aac.value, 10)
		} else if (sys.ac?.value !== undefined) {
			newSys.ac = 19 - safeInt(sys.ac.value, 9)
		}

		// Saves
		if (sys.saves) {
			newSys.saves = {
				doom:  safeInt(sys.saves.death?.value, 10),
				ray:   safeInt(sys.saves.wand?.value, 10),
				hold:  safeInt(sys.saves.paralysis?.value, 10),
				blast: safeInt(sys.saves.breath?.value, 10),
				spell: safeInt(sys.saves.spell?.value, 10),
			}
		}

		// Speed
		if (sys.movement?.base !== undefined) {
			newSys.speed = Math.round(safeInt(sys.movement.base, 120) / 3)
		}

		// Ability scores (character tokens)
		if (sys.scores) {
			const scores = sys.scores
			newSys.abilities = {}
			const mapping = { str: "strength", int: "intelligence", wis: "wisdom", dex: "dexterity", con: "constitution", cha: "charisma" }
			for (const [oseKey, dwKey] of Object.entries(mapping)) {
				if (scores[oseKey]?.value !== undefined) {
					const s = clamp(scores[oseKey].value, 3, 18)
					newSys.abilities[dwKey] = { score: s, mod: abilityMod(s) }
				}
			}
		}

		converted.system = newSys
	}

	// Convert embedded item overrides in the delta.
	// Delta items may be partial — fill in missing fields from the base item.
	// Items with _tombstone are deletions and should be skipped.
	if (Array.isArray(converted.items)) {
		converted.items = converted.items.map(item => {
			if (item._tombstone) return null
			const base = baseItemMap.get(item._id)
			if (base) {
				const merged = {
					...base,
					...item,
					system: { ...(base.system || {}), ...(item.system || {}) },
				}
				return convertItem(merged)
			}
			if (!item.name) return null
			return convertItem(item)
		}).filter(Boolean)
	}

	return converted
}

// ---------------------------------------------------------------------------
// Main import flow
// ---------------------------------------------------------------------------

async function importOSEData() {
	// File picker dialog
	const file = await new Promise((resolve) => {
		let resolved = false
		const done = (val) => {
			if (!resolved) {
				resolved = true; resolve(val) 
			} 
		}
		const content = `
			<p>Select the JSON file exported from your OSE world:</p>
			<input type="file" accept=".json" style="width:100%; margin-top:8px"/>
		`
		const d = new foundry.applications.api.DialogV2({
			window: { title: "Import OSE Data" },
			content,
			buttons: [{
				action: "import",
				label: "Import",
				callback: (event, button, dialog) => {
					const input = button.closest(".dialog-content")?.querySelector("input[type=file]")
						?? dialog.element?.querySelector("input[type=file]")
					done(input?.files[0] ?? null)
				},
			}, {
				action: "cancel",
				label: "Cancel",
				callback: () => done(null),
			}],
		})
		d.addEventListener("close", () => done(null))
		d.render({ force: true })
	})

	if (!file) return

	// Read and parse JSON
	ui.notifications.info("Reading export file...")
	let data
	try {
		const text = await file.text()
		data = JSON.parse(text)
	} catch (err) {
		ui.notifications.error(`Failed to read JSON file: ${err.message}`)
		return
	}

	// Validate format
	if (data.format !== "ose-to-dolmenwood-v1") {
		ui.notifications.error(`Invalid export format: expected "ose-to-dolmenwood-v1", got "${data.format}"`)
		return
	}

	ui.notifications.info(`Importing data from OSE world "${data.worldId}"...`)

	const warnings = []
	const stats = { actors: 0, items: 0, scenes: 0, journals: 0, tables: 0, macros: 0, playlists: 0, cards: 0 }

	// Batch creation helper — creates documents in groups with a short delay
	// between batches to avoid overwhelming Foundry's database backend.
	const BATCH_SIZE = 10
	const BATCH_DELAY = 100 // ms between batches
	async function createInBatches(DocClass, items, { onCreated, label = "documents" } = {}) {
		let created = 0
		for (let i = 0; i < items.length; i += BATCH_SIZE) {
			const batch = items.slice(i, i + BATCH_SIZE)
			try {
				const docs = await DocClass.createDocuments(batch, { keepId: false })
				created += docs.length
				if (onCreated) {
					for (const doc of docs) onCreated(doc)
				}
			} catch (_batchErr) {
				// If a batch fails, fall back to one-at-a-time with delays
				for (let j = 0; j < batch.length; j++) {
					try {
						const docs = await DocClass.createDocuments([batch[j]], { keepId: false })
						created += docs.length
						if (onCreated) {
							for (const doc of docs) onCreated(doc)
						}
					} catch (err) {
						warnings.push(`Failed to create ${label} "${batch[j].name}": ${err.message}`)
					}
					if (j < batch.length - 1) {
						await new Promise(r => setTimeout(r, BATCH_DELAY))
					}
				}
			}
			// Brief pause between batches to let the DB breathe
			if (i + BATCH_SIZE < items.length) {
				await new Promise(r => setTimeout(r, BATCH_DELAY))
			}
		}
		return created
	}

	// Combine world-level and compendium pack data into unified lists
	const allOseActors = [...(data.world.actors || [])]
	const allOseItems = [...(data.world.items || [])]
	const allOseScenes = [...(data.world.scenes || [])]
	const allOseJournals = [...(data.world.journal || [])]
	const allOseTables = [...(data.world.tables || [])]
	const allOseMacros = [...(data.world.macros || [])]
	const allOsePlaylists = [...(data.world.playlists || [])]
	const allOseCards = [...(data.world.cards || [])]

	// Add compendium pack documents to the appropriate lists
	for (const [, packData] of Object.entries(data.packs || {})) {
		const docs = packData.documents || []
		switch (packData.type) {
		case "Actor":        allOseActors.push(...docs); break
		case "Item":         allOseItems.push(...docs); break
		case "Scene":        allOseScenes.push(...docs); break
		case "JournalEntry": allOseJournals.push(...docs); break
		case "RollTable":    allOseTables.push(...docs); break
		case "Macro":        allOseMacros.push(...docs); break
		case "Playlist":     allOsePlaylists.push(...docs); break
		case "Cards":        allOseCards.push(...docs); break
		}
	}

	// ---------------------------------------------------------------
	// Recreate folder structure (1:1 copy of original hierarchy)
	// ---------------------------------------------------------------

	// Map from old folder ID → new folder ID
	const oldToNewFolderId = new Map()

	// Collect exported folders grouped by type
	const oseFolders = data.world.folders || []
	const foldersByType = {}
	for (const f of oseFolders) {
		if (!foldersByType[f.type]) foldersByType[f.type] = []
		foldersByType[f.type].push(f)
	}

	// Document types that have actual data to import
	const importableTypes = new Set(["Actor", "Item", "Scene", "JournalEntry", "RollTable", "Macro", "Playlist", "Cards"])

	// Recreate the original folder hierarchy exactly.
	// Process level by level (top-level first, then children) to ensure
	// parent folders exist before their children are created.
	for (const type of Object.keys(foldersByType)) {
		if (!importableTypes.has(type)) continue
		const typeFolders = foldersByType[type]

		// Start with top-level folders (no parent)
		const queue = typeFolders.filter(f => !f.folder)
		const visited = new Set()
		let maxIterations = typeFolders.length + 1

		while (queue.length > 0 && maxIterations-- > 0) {
			const batch = [...queue]
			queue.length = 0

			// Build folder data for this level, keyed by name+parent for matching
			const levelData = batch.map(f => ({
				name: f.name,
				type: f.type,
				folder: f.folder ? (oldToNewFolderId.get(f.folder) ?? null) : null,
				sorting: f.sorting || "a",
				color: f.color || null,
			}))
			// Parallel array of old IDs (same indices as levelData)
			const oldIds = batch.map(f => f._id)

			// Batch-create the entire level at once
			try {
				const created = await Folder.createDocuments(levelData, { keepId: false })
				// Match created folders back by name+parent (order not guaranteed).
				// doc.folder is a Folder object (not a string), so use .id
				const createdByKey = new Map()
				for (const doc of created) {
					const parentId = doc.folder?.id ?? doc.folder ?? ""
					createdByKey.set(`${doc.name}::${parentId}`, doc.id)
				}
				for (let k = 0; k < levelData.length; k++) {
					const key = `${levelData[k].name}::${levelData[k].folder ?? ""}`
					const newId = createdByKey.get(key)
					if (newId) {
						oldToNewFolderId.set(oldIds[k], newId)
					}
					visited.add(oldIds[k])
				}
			} catch (_batchErr) {
				// Fall back to one-at-a-time if batch fails
				for (let k = 0; k < levelData.length; k++) {
					try {
						const created = await Folder.createDocuments([levelData[k]], { keepId: false })
						oldToNewFolderId.set(oldIds[k], created[0].id)
					} catch (err) {
						warnings.push(`Failed to create folder "${levelData[k].name}": ${err.message}`)
					}
					visited.add(oldIds[k])
				}
			}

			// Brief pause between levels to let the DB breathe
			await new Promise(r => setTimeout(r, BATCH_DELAY))

			// Enqueue children whose parents were just created
			for (const f of typeFolders) {
				if (!visited.has(f._id) && f.folder && visited.has(f.folder)) {
					queue.push(f)
				}
			}
		}

		// Safety net: any folders not yet processed (orphaned parents, cycles)
		// get created at the root level
		if (typeFolders.some(f => !visited.has(f._id))) {
			const orphanData = []
			const orphanOldIds = []
			for (const f of typeFolders) {
				if (visited.has(f._id)) continue
				orphanOldIds.push(f._id)
				orphanData.push({
					name: f.name,
					type: f.type,
					folder: null,
					sorting: f.sorting || "a",
					color: f.color || null,
				})
			}
			try {
				const created = await Folder.createDocuments(orphanData, { keepId: false })
				// Match by name (all orphans are root-level so name is sufficient)
				const createdByName = new Map()
				for (const doc of created) createdByName.set(doc.name, doc.id)
				for (let k = 0; k < orphanData.length; k++) {
					const newId = createdByName.get(orphanData[k].name)
					if (newId) oldToNewFolderId.set(orphanOldIds[k], newId)
				}
			} catch (_batchErr) {
				for (let k = 0; k < orphanData.length; k++) {
					try {
						const created = await Folder.createDocuments([orphanData[k]], { keepId: false })
						oldToNewFolderId.set(orphanOldIds[k], created[0].id)
					} catch (err) {
						warnings.push(`Failed to create folder "${orphanData[k].name}": ${err.message}`)
					}
				}
			}
		}
	}

	/**
	 * Resolve the new folder ID for an imported document.
	 * Falls back to the world root (no folder).
	 */
	function resolveFolder(oldFolderId) {
		if (oldFolderId && oldToNewFolderId.has(oldFolderId)) {
			return oldToNewFolderId.get(oldFolderId)
		}
		return null
	}

	// ---------------------------------------------------------------
	// Import actors (convert OSE → Dolmenwood)
	// ---------------------------------------------------------------
	const oldToNewActorId = new Map()

	if (allOseActors.length > 0) {
		ui.notifications.info(`Converting ${allOseActors.length} actors...`)
		const actorData = []
		for (const oseActor of allOseActors) {
			try {
				const converted = convertActor(oseActor)
				converted.folder = resolveFolder(oseActor.folder)
				// Store the old ID for scene token remapping
				converted._oseOriginalId = oseActor._id
				actorData.push(converted)
			} catch (err) {
				warnings.push(`Failed to convert actor "${oseActor.name}": ${err.message}`)
			}
			// Warn about OSE module images
			if (oseActor.img && oseActor.img.includes("modules/ose-")) {
				warnings.push(`Actor "${oseActor.name}" uses OSE module image: ${oseActor.img}`)
			}
		}

		// Strip _oseOriginalId into a parallel array before creation
		const oldActorIds = actorData.map(d => {
			const oldId = d._oseOriginalId
			delete d._oseOriginalId
			return oldId
		})

		// Create actors in batches (special handling for old→new ID mapping)
		for (let i = 0; i < actorData.length; i += BATCH_SIZE) {
			const batch = actorData.slice(i, i + BATCH_SIZE)
			const batchOldIds = oldActorIds.slice(i, i + BATCH_SIZE)
			try {
				const docs = await Actor.createDocuments(batch, { keepId: false })
				for (let j = 0; j < docs.length; j++) {
					if (batchOldIds[j]) oldToNewActorId.set(batchOldIds[j], docs[j].id)
					stats.actors++
				}
			} catch (_batchErr) {
				// Fall back to one-at-a-time for this batch
				for (let j = 0; j < batch.length; j++) {
					try {
						const docs = await Actor.createDocuments([batch[j]], { keepId: false })
						if (batchOldIds[j]) oldToNewActorId.set(batchOldIds[j], docs[0].id)
						stats.actors++
					} catch (err) {
						warnings.push(`Failed to create actor "${batch[j].name}": ${err.message}`)
					}
				}
			}
			if (i + BATCH_SIZE < actorData.length) {
				await new Promise(r => setTimeout(r, BATCH_DELAY))
			}
		}
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import items (convert OSE → Dolmenwood)
	// ---------------------------------------------------------------
	if (allOseItems.length > 0) {
		ui.notifications.info(`Converting ${allOseItems.length} items...`)
		const itemData = []
		for (const oseItem of allOseItems) {
			try {
				const converted = convertItem(oseItem)
				converted.folder = resolveFolder(oseItem.folder)
				itemData.push(converted)
			} catch (err) {
				warnings.push(`Failed to convert item "${oseItem.name}": ${err.message}`)
			}
		}

		stats.items = await createInBatches(Item, itemData, { label: "item" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import journals (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseJournals.length > 0) {
		ui.notifications.info(`Importing ${allOseJournals.length} journal entries...`)
		const journalData = allOseJournals.map(j => {
			const copy = { ...j }
			delete copy._id
			copy.folder = resolveFolder(j.folder)
			// Strip _id from pages to let Foundry assign new ones
			if (Array.isArray(copy.pages)) {
				copy.pages = copy.pages.map(p => {
					const pc = { ...p }
					delete pc._id
					return pc
				})
			}
			return copy
		})

		stats.journals = await createInBatches(JournalEntry, journalData, { label: "journal" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import rollable tables (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseTables.length > 0) {
		ui.notifications.info(`Importing ${allOseTables.length} rollable tables...`)
		const tableData = allOseTables.map(t => {
			const copy = { ...t }
			delete copy._id
			copy.folder = resolveFolder(t.folder)
			if (Array.isArray(copy.results)) {
				copy.results = copy.results.map(r => {
					const rc = { ...r }
					delete rc._id
					return rc
				})
			}
			return copy
		})

		stats.tables = await createInBatches(RollTable, tableData, { label: "table" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import macros (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseMacros.length > 0) {
		ui.notifications.info(`Importing ${allOseMacros.length} macros...`)
		const macroData = allOseMacros.map(m => {
			const copy = { ...m }
			delete copy._id
			copy.folder = resolveFolder(m.folder)
			return copy
		})

		stats.macros = await createInBatches(Macro, macroData, { label: "macro" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import playlists (1:1 copy)
	// ---------------------------------------------------------------
	if (allOsePlaylists.length > 0) {
		ui.notifications.info(`Importing ${allOsePlaylists.length} playlists...`)
		const playlistData = allOsePlaylists.map(p => {
			const copy = { ...p }
			delete copy._id
			copy.folder = resolveFolder(p.folder)
			if (Array.isArray(copy.sounds)) {
				copy.sounds = copy.sounds.map(s => {
					const sc = { ...s }
					delete sc._id
					return sc
				})
			}
			return copy
		})

		stats.playlists = await createInBatches(Playlist, playlistData, { label: "playlist" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import card stacks (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseCards.length > 0) {
		ui.notifications.info(`Importing ${allOseCards.length} card stacks...`)
		const cardsData = allOseCards.map(c => {
			const copy = { ...c }
			delete copy._id
			copy.folder = resolveFolder(c.folder)
			if (Array.isArray(copy.cards)) {
				copy.cards = copy.cards.map(card => {
					const cc = { ...card }
					delete cc._id
					return cc
				})
			}
			return copy
		})

		stats.cards = await createInBatches(Cards, cardsData, { label: "card stack" })
	}

	// Pause between sections to let the DB settle
	await new Promise(r => setTimeout(r, BATCH_DELAY))

	// ---------------------------------------------------------------
	// Import scenes last (Foundry auto-loads scenes on creation,
	// so importing them earlier could cause DB pressure mid-import)
	// ---------------------------------------------------------------

	// Build a lookup of original OSE actors by ID for delta item merging
	const oseActorById = new Map()
	for (const oseActor of allOseActors) {
		if (oseActor._id) oseActorById.set(oseActor._id, oseActor)
	}

	if (allOseScenes.length > 0) {
		ui.notifications.info(`Importing ${allOseScenes.length} scenes...`)
		const sceneData = []
		for (const oseScene of allOseScenes) {
			const converted = { ...oseScene }
			delete converted._id
			converted.folder = resolveFolder(oseScene.folder)

			// Remap tokens
			if (Array.isArray(converted.tokens)) {
				for (const token of converted.tokens) {
					const originalActorId = token.actorId
					if (token.actorId) {
						const newId = oldToNewActorId.get(token.actorId)
						if (newId) {
							token.actorId = newId
						} else {
							warnings.push(`Scene "${oseScene.name}" token "${token.name || "(unnamed)"}" references unknown actor ${token.actorId}`)
						}
					}
					// Convert token delta system data, merging with base actor items
					if (token.delta) {
						const baseActor = oseActorById.get(originalActorId)
						token.delta = convertTokenDelta(token.delta, baseActor?.items || [])
					}
				}
			}

			sceneData.push(converted)
		}

		// Scenes are large documents — create one at a time with delay
		for (let i = 0; i < sceneData.length; i++) {
			try {
				await Scene.createDocuments([sceneData[i]], { keepId: false })
				stats.scenes++
			} catch (err) {
				warnings.push(`Failed to create scene "${sceneData[i].name}": ${err.message}`)
			}
			if (i < sceneData.length - 1) {
				await new Promise(r => setTimeout(r, BATCH_DELAY))
			}
		}
	}

	// ---------------------------------------------------------------
	// Summary
	// ---------------------------------------------------------------
	const parts = []
	if (stats.actors > 0) parts.push(`${stats.actors} actors`)
	if (stats.items > 0) parts.push(`${stats.items} items`)
	if (stats.scenes > 0) parts.push(`${stats.scenes} scenes`)
	if (stats.journals > 0) parts.push(`${stats.journals} journals`)
	if (stats.tables > 0) parts.push(`${stats.tables} tables`)
	if (stats.macros > 0) parts.push(`${stats.macros} macros`)
	if (stats.playlists > 0) parts.push(`${stats.playlists} playlists`)
	if (stats.cards > 0) parts.push(`${stats.cards} card stacks`)

	let summaryHtml = `<p><strong>Import complete!</strong></p><p>Created: ${parts.join(", ")}</p>`
	if (warnings.length > 0) {
		summaryHtml += `<p><strong>Warnings (${warnings.length}):</strong></p><ul>`
		for (const w of warnings) {
			summaryHtml += `<li>${w}</li>`
		}
		summaryHtml += "</ul>"
	}

	await foundry.applications.api.DialogV2.prompt({
		window: { title: "Import Summary" },
		content: summaryHtml,
		ok: { label: "OK" },
	})
}

importOSEData()
