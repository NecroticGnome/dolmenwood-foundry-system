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

/**
 * Convert a single OSE actor (monster or character) to Dolmenwood format.
 * Returns the converted actor data ready for Actor.createDocuments().
 */
function convertActor(ose) {
	const oseType = (ose.type || "").toLowerCase()
	if (oseType === "monster") return convertMonster(ose)
	if (oseType === "character") return convertCharacter(ose)
	// Unknown type — return as Creature with minimal conversion
	return convertMonster(ose)
}

// ---------------------------------------------------------------------------
// Convert token delta system data (for unlinked tokens with overrides)
// ---------------------------------------------------------------------------

function convertTokenDelta(delta) {
	if (!delta || typeof delta !== "object") return delta
	const converted = { ...delta }

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

	// Convert embedded item overrides in the delta
	if (Array.isArray(converted.items)) {
		converted.items = converted.items.map(item => convertItem(item))
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
	// Recreate folder structure under a "OSE Import" root folder
	// ---------------------------------------------------------------

	// Map from old folder ID → new folder ID
	const oldToNewFolderId = new Map()

	// Determine which document types have data
	const typeHasData = {
		Actor: allOseActors.length > 0,
		Item: allOseItems.length > 0,
		Scene: allOseScenes.length > 0,
		JournalEntry: allOseJournals.length > 0,
		RollTable: allOseTables.length > 0,
		Macro: allOseMacros.length > 0,
		Playlist: allOsePlaylists.length > 0,
		Cards: allOseCards.length > 0,
	}

	// Collect exported folders grouped by type
	const oseFolders = data.world.folders || []
	const foldersByType = {}
	for (const f of oseFolders) {
		if (!foldersByType[f.type]) foldersByType[f.type] = []
		foldersByType[f.type].push(f)
	}

	// Also count types with data but no exported folders (they still need a root)
	const typesWithData = Object.entries(typeHasData)
		.filter(([, has]) => has)
		.map(([type]) => type)

	// Create "OSE Import" root folders for each document type that has data
	const rootFolders = {}
	if (typesWithData.length > 0) {
		const rootDefs = typesWithData.map(type => ({
			name: "OSE Import", type, sorting: "a",
		}))
		const createdRoots = await Folder.createDocuments(rootDefs, { keepId: false })
		for (let i = 0; i < createdRoots.length; i++) {
			rootFolders[typesWithData[i]] = createdRoots[i].id
		}
	}

	// Recreate the original folder hierarchy under each "OSE Import" root.
	// Process level by level (top-level first, then children) to ensure
	// parent folders exist before their children are created.
	for (const type of typesWithData) {
		const typeFolders = foldersByType[type] || []
		if (typeFolders.length === 0) continue

		// Sort into levels: top-level first (folder === null/undefined), then children
		const queue = typeFolders.filter(f => !f.folder)
		const visited = new Set()
		let maxIterations = typeFolders.length + 1

		while (queue.length > 0 && maxIterations-- > 0) {
			const batch = [...queue]
			queue.length = 0

			for (const f of batch) {
				// Determine new parent: if top-level, parent is the "OSE Import" root;
				// otherwise, map through oldToNewFolderId
				const newParent = !f.folder
					? rootFolders[type]
					: (oldToNewFolderId.get(f.folder) ?? rootFolders[type])

				try {
					const created = await Folder.createDocuments([{
						name: f.name,
						type: f.type,
						folder: newParent,
						sorting: f.sorting || "a",
						color: f.color || null,
					}], { keepId: false })
					oldToNewFolderId.set(f._id, created[0].id)
					visited.add(f._id)
				} catch (err) {
					warnings.push(`Failed to create folder "${f.name}": ${err.message}`)
					visited.add(f._id)
				}
			}

			// Enqueue children whose parents were just created
			for (const f of typeFolders) {
				if (!visited.has(f._id) && f.folder && visited.has(f.folder)) {
					queue.push(f)
				}
			}
		}

		// Safety net: any folders not yet processed (orphaned parents, cycles)
		// get created directly under the "OSE Import" root
		for (const f of typeFolders) {
			if (visited.has(f._id)) continue
			try {
				const created = await Folder.createDocuments([{
					name: f.name,
					type: f.type,
					folder: rootFolders[type],
					sorting: f.sorting || "a",
					color: f.color || null,
				}], { keepId: false })
				oldToNewFolderId.set(f._id, created[0].id)
			} catch (err) {
				warnings.push(`Failed to create folder "${f.name}": ${err.message}`)
			}
		}
	}

	/**
	 * Resolve the new folder ID for an imported document.
	 * Falls back to the "OSE Import" root for that type.
	 */
	function resolveFolder(oldFolderId, docType) {
		if (oldFolderId && oldToNewFolderId.has(oldFolderId)) {
			return oldToNewFolderId.get(oldFolderId)
		}
		return rootFolders[docType] || null
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
				converted.folder = resolveFolder(oseActor.folder, "Actor")
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

		// Create actors one at a time to prevent one failure from killing the batch
		for (const actorDatum of actorData) {
			const oldId = actorDatum._oseOriginalId
			delete actorDatum._oseOriginalId
			try {
				const created = await Actor.createDocuments([actorDatum], { keepId: false })
				if (oldId) oldToNewActorId.set(oldId, created[0].id)
				stats.actors++
			} catch (err) {
				warnings.push(`Failed to create actor "${actorDatum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import items (convert OSE → Dolmenwood)
	// ---------------------------------------------------------------
	if (allOseItems.length > 0) {
		ui.notifications.info(`Converting ${allOseItems.length} items...`)
		const itemData = []
		for (const oseItem of allOseItems) {
			try {
				const converted = convertItem(oseItem)
				converted.folder = resolveFolder(oseItem.folder, "Item")
				itemData.push(converted)
			} catch (err) {
				warnings.push(`Failed to convert item "${oseItem.name}": ${err.message}`)
			}
		}

		for (const datum of itemData) {
			try {
				await Item.createDocuments([datum], { keepId: false })
				stats.items++
			} catch (err) {
				warnings.push(`Failed to create item "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import scenes (remap token actorIds)
	// ---------------------------------------------------------------
	if (allOseScenes.length > 0) {
		ui.notifications.info(`Importing ${allOseScenes.length} scenes...`)
		const sceneData = []
		for (const oseScene of allOseScenes) {
			const converted = { ...oseScene }
			delete converted._id
			converted.folder = resolveFolder(oseScene.folder, "Scene")

			// Remap tokens
			if (Array.isArray(converted.tokens)) {
				for (const token of converted.tokens) {
					if (token.actorId) {
						const newId = oldToNewActorId.get(token.actorId)
						if (newId) {
							token.actorId = newId
						} else {
							warnings.push(`Scene "${oseScene.name}" token "${token.name || "(unnamed)"}" references unknown actor ${token.actorId}`)
						}
					}
					// Convert token delta system data
					if (token.delta) {
						token.delta = convertTokenDelta(token.delta)
					}
				}
			}

			sceneData.push(converted)
		}

		for (const datum of sceneData) {
			try {
				await Scene.createDocuments([datum], { keepId: false })
				stats.scenes++
			} catch (err) {
				warnings.push(`Failed to create scene "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import journals (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseJournals.length > 0) {
		ui.notifications.info(`Importing ${allOseJournals.length} journal entries...`)
		const journalData = allOseJournals.map(j => {
			const copy = { ...j }
			delete copy._id
			copy.folder = resolveFolder(j.folder, "JournalEntry")
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

		for (const datum of journalData) {
			try {
				await JournalEntry.createDocuments([datum], { keepId: false })
				stats.journals++
			} catch (err) {
				warnings.push(`Failed to create journal "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import rollable tables (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseTables.length > 0) {
		ui.notifications.info(`Importing ${allOseTables.length} rollable tables...`)
		const tableData = allOseTables.map(t => {
			const copy = { ...t }
			delete copy._id
			copy.folder = resolveFolder(t.folder, "RollTable")
			if (Array.isArray(copy.results)) {
				copy.results = copy.results.map(r => {
					const rc = { ...r }
					delete rc._id
					return rc
				})
			}
			return copy
		})

		for (const datum of tableData) {
			try {
				await RollTable.createDocuments([datum], { keepId: false })
				stats.tables++
			} catch (err) {
				warnings.push(`Failed to create table "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import macros (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseMacros.length > 0) {
		ui.notifications.info(`Importing ${allOseMacros.length} macros...`)
		const macroData = allOseMacros.map(m => {
			const copy = { ...m }
			delete copy._id
			copy.folder = resolveFolder(m.folder, "Macro")
			return copy
		})

		for (const datum of macroData) {
			try {
				await Macro.createDocuments([datum], { keepId: false })
				stats.macros++
			} catch (err) {
				warnings.push(`Failed to create macro "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import playlists (1:1 copy)
	// ---------------------------------------------------------------
	if (allOsePlaylists.length > 0) {
		ui.notifications.info(`Importing ${allOsePlaylists.length} playlists...`)
		const playlistData = allOsePlaylists.map(p => {
			const copy = { ...p }
			delete copy._id
			copy.folder = resolveFolder(p.folder, "Playlist")
			if (Array.isArray(copy.sounds)) {
				copy.sounds = copy.sounds.map(s => {
					const sc = { ...s }
					delete sc._id
					return sc
				})
			}
			return copy
		})

		for (const datum of playlistData) {
			try {
				await Playlist.createDocuments([datum], { keepId: false })
				stats.playlists++
			} catch (err) {
				warnings.push(`Failed to create playlist "${datum.name}": ${err.message}`)
			}
		}
	}

	// ---------------------------------------------------------------
	// Import card stacks (1:1 copy)
	// ---------------------------------------------------------------
	if (allOseCards.length > 0) {
		ui.notifications.info(`Importing ${allOseCards.length} card stacks...`)
		const cardsData = allOseCards.map(c => {
			const copy = { ...c }
			delete copy._id
			copy.folder = resolveFolder(c.folder, "Cards")
			if (Array.isArray(copy.cards)) {
				copy.cards = copy.cards.map(card => {
					const cc = { ...card }
					delete cc._id
					return cc
				})
			}
			return copy
		})

		for (const datum of cardsData) {
			try {
				await Cards.createDocuments([datum], { keepId: false })
				stats.cards++
			} catch (err) {
				warnings.push(`Failed to create card stack "${datum.name}": ${err.message}`)
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
