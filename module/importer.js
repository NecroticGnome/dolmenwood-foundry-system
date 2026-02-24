/* global game, ui, foundry */

/**
 * Character Data Importer
 * Parses HTML output from external character generators and populates an actor.
 */

// --- Lookup Maps ---

const KNACK_TYPE_MAP = {
	'bird friend': 'birdFriend',
	'lock singer': 'lockSinger',
	'root friend': 'rootFriend',
	'thread whistling': 'threadWhistling',
	'wood kenning': 'woodKenning',
	'yeast master': 'yeastMaster'
}

const MOON_NAME_MAP = {
	"grinning": "grinning",
	"dead": "dead",
	"beast": "beast",
	"squamous": "squamous",
	"knight's": "knights",
	"rotting": "rotting",
	"maiden's": "maidens",
	"witch's": "witch",
	"robber's": "robbers",
	"goat": "goat",
	"narrow": "narrow",
	"black": "black"
}

const MOON_PHASE_MAP = {
	'full': 'full',
	'waning': 'waning',
	'waxing': 'waxing'
}

const LANGUAGE_MAP = {
	'woldish': 'woldish',
	'gaffe': 'gaffe',
	'caprice': 'caprice',
	'sylvan': 'sylvan',
	'high elfish': 'highElfish',
	'mewl': 'mewl',
	'mulch': 'mulch'
}

const ABILITY_MAP = {
	'str': 'strength',
	'int': 'intelligence',
	'wis': 'wisdom',
	'dex': 'dexterity',
	'con': 'constitution',
	'cha': 'charisma'
}

const KINDRED_MAP = {
	'breggle': 'breggle',
	'elf': 'elf',
	'grimalkin': 'grimalkin',
	'human': 'human',
	'mossling': 'mossling',
	'woodgrue': 'woodgrue'
}

const CLASS_MAP = {
	'bard': 'bard',
	'cleric': 'cleric',
	'enchanter': 'enchanter',
	'fighter': 'fighter',
	'friar': 'friar',
	'hunter': 'hunter',
	'knight': 'knight',
	'magician': 'magician',
	'thief': 'thief',
	'elf': 'elf',
	'breggle': 'breggle',
	'grimalkin': 'grimalkin',
	'mossling': 'mossling',
	'woodgrue': 'woodgrue'
}

const ALIGNMENT_MAP = {
	'lawful': 'lawful',
	'neutral': 'neutral',
	'chaotic': 'chaotic'
}

// --- HTML Parser ---

/**
 * Parse character HTML from an external generator into structured data.
 * @param {string} html - Raw HTML string
 * @returns {object} Parsed character data
 */
export function parseCharacterHTML(html) {
	const parser = new DOMParser()
	const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
	const text = doc.body.textContent
	const data = {}

	// Name: "<b>Name: Libib Oddpolyp</b>"
	const nameMatch = text.match(/Name:\s*(.+?)(?:\n|$)/i)
	if (nameMatch) data.name = nameMatch[1].trim()

	// Kindred: "Kindred: Mossling"
	const kindredMatch = text.match(/Kindred:\s*(\w+)/i)
	if (kindredMatch) data.kindred = KINDRED_MAP[kindredMatch[1].toLowerCase()] || null

	// Class: "Class: Level 1 Knight"
	const classMatch = text.match(/Class:\s*Level\s+(\d+)\s+(\w+)/i)
	if (classMatch) {
		data.level = parseInt(classMatch[1])
		data.class = CLASS_MAP[classMatch[2].toLowerCase()] || null
	}

	// Alignment: "Alignment: Lawful"
	const alignMatch = text.match(/Alignment:\s*(\w+)/i)
	if (alignMatch) data.alignment = ALIGNMENT_MAP[alignMatch[1].toLowerCase()] || 'neutral'

	// Background: "Background: Cheesemaker (59 years old)"
	const bgMatch = text.match(/Background:\s*(.+?)(?:\((\d+)\s*years?\s*old\))?(?:\n|$)/i)
	if (bgMatch) {
		data.background = bgMatch[1].trim().replace(/\s*\($/, '')
		if (bgMatch[2]) data.age = parseInt(bgMatch[2])
	}

	// Languages: "Languages: Woldish, Mulch"
	const langMatch = text.match(/Languages:\s*(.+?)(?:\n|$)/i)
	if (langMatch) {
		data.languages = langMatch[1].split(',').map(l => {
			const id = LANGUAGE_MAP[l.trim().toLowerCase()]
			return id || l.trim().toLowerCase()
		}).filter(Boolean)
	}

	// Description block - parse individual fields
	const descFields = ['Body', 'Head', 'Face', 'Speech', 'Demeanour', 'Dress', 'Belief', 'Desire']
	data.details = {}
	for (const field of descFields) {
		const re = new RegExp(`${field}:\\s*(.+?)(?=\\s*(?:${descFields.join('|')}|Trinket|Fertile Flesh|Knack|Moon Sign):|\\.\\s*$|$)`, 'i')
		const m = text.match(re)
		if (m) data.details[field.toLowerCase()] = m[1].replace(/\.\s*$/, '').trim()
	}

	// Trinket
	const trinketMatch = text.match(/Trinket:\s*(.+?)(?=\s*(?:Fertile Flesh|Knack|Moon Sign):|\.\s*$|$)/i)
	if (trinketMatch) data.trinket = trinketMatch[1].replace(/\.\s*$/, '').trim()

	// Fertile Flesh
	const fertileMatch = text.match(/Fertile Flesh:\s*(.+?)(?=\s*(?:Knack|Moon Sign):|\.\s*$|$)/i)
	if (fertileMatch) data.fertilFlesh = fertileMatch[1].replace(/\.\s*$/, '').trim()

	// Knack: "Knack: Wood kenning"
	const knackMatch = text.match(/Knack:\s*(.+?)(?=\.\s|$)/i)
	if (knackMatch) {
		const knackName = knackMatch[1].trim().replace(/\.\s*$/, '')
		data.knackType = KNACK_TYPE_MAP[knackName.toLowerCase()] || null
	}

	// Moon Sign: "Moon Sign: Knight's - Full: +1 AC bonus..."
	const moonMatch = text.match(/Moon Sign:\s*(.+?)\s*-\s*(Full|Waning|Waxing)/i)
	if (moonMatch) {
		data.moonName = MOON_NAME_MAP[moonMatch[1].trim().toLowerCase()] || null
		data.moonPhase = MOON_PHASE_MAP[moonMatch[2].trim().toLowerCase()] || null
	}

	// Ability Scores: "CHA 11 (0)\nCON 9 (0)\n..."
	data.abilities = {}
	const abilityRe = /(STR|INT|WIS|DEX|CON|CHA)\s+(\d+)\s*\([+-]?\d+\)/gi
	let aMatch
	while ((aMatch = abilityRe.exec(text)) !== null) {
		const key = ABILITY_MAP[aMatch[1].toLowerCase()]
		if (key) data.abilities[key] = parseInt(aMatch[2])
	}

	// Hit Points: "Hit Points: 6"
	const hpMatch = text.match(/Hit Points:\s*(\d+)/i)
	if (hpMatch) data.hp = parseInt(hpMatch[1])

	// Wealth/Coins: "Gold: 13" etc.
	data.coins = {}
	const coinTypes = { 'gold': 'gold', 'silver': 'silver', 'copper': 'copper', 'pellucidium': 'pellucidium' }
	for (const [label, key] of Object.entries(coinTypes)) {
		const coinRe = new RegExp(`${label}:\\s*(\\d+)`, 'i')
		const coinMatch = text.match(coinRe)
		if (coinMatch) data.coins[key] = parseInt(coinMatch[1])
	}

	return data
}

// --- Actor Update Builder ---

/**
 * Build a flat update object from parsed character data.
 * @param {object} data - Output from parseCharacterHTML
 * @returns {object} Update data for actor.update()
 */
export function buildActorUpdateData(data) {
	const update = {}

	if (data.name) update.name = data.name
	if (data.level) update['system.level'] = data.level
	if (data.alignment) update['system.alignment'] = data.alignment

	// Background
	if (data.background) update['system.background.profession'] = data.background
	if (data.age) update['system.physical.age'] = data.age

	// Languages
	if (data.languages?.length) update['system.languages'] = data.languages

	// Ability scores (just scores, mods are auto-computed)
	if (data.abilities) {
		for (const [key, score] of Object.entries(data.abilities)) {
			update[`system.abilities.${key}.score`] = score
		}
	}

	// HP (set both value and max)
	if (data.hp) {
		update['system.hp.value'] = data.hp
		update['system.hp.max'] = data.hp
	}

	// Coins - reset all to 0, then set parsed values
	update['system.coins.copper'] = 0
	update['system.coins.silver'] = 0
	update['system.coins.gold'] = 0
	update['system.coins.pellucidium'] = 0
	if (data.coins) {
		for (const [key, value] of Object.entries(data.coins)) {
			update[`system.coins.${key}`] = value
		}
	}

	// XP - reset to 0 for fresh import
	update['system.xp.value'] = 0

	// Character details
	if (data.details) {
		const detailMap = {
			body: 'body', head: 'head', face: 'face',
			speech: 'speech', demeanour: 'demeanour',
			dress: 'dress', belief: 'beliefs', desire: 'desires'
		}
		for (const [src, dest] of Object.entries(detailMap)) {
			if (data.details[src]) update[`system.details.${dest}`] = data.details[src]
		}
	}

	// Background notes (trinket, fertile flesh)
	const notesParts = []
	if (data.trinket) notesParts.push(`<p><strong>Trinket:</strong> ${data.trinket}</p>`)
	if (data.fertilFlesh) notesParts.push(`<p><strong>Fertile Flesh:</strong> ${data.fertilFlesh}</p>`)
	if (notesParts.length) update['system.background.notes'] = notesParts.join('')

	// Knack type
	if (data.knackType) update['system.knacks.type'] = data.knackType

	// Moon sign
	if (data.moonName) update['system.moonName'] = data.moonName
	if (data.moonPhase) update['system.moonPhase'] = data.moonPhase

	return update
}

// --- Compendium Helpers ---

/**
 * Add a kindred from the compendium by kindredId, bypassing setKindred
 * (which rolls random characteristics).
 * @param {Actor} actor - The target actor
 * @param {string} kindredId - The kindred ID (e.g., "mossling")
 */
async function addKindredFromCompendium(actor, kindredId) {
	const pack = game.packs.get('dolmenwood.kindreds')
	if (!pack) throw new Error(game.i18n.localize('DOLMEN.Import.KindredNotFound'))

	const index = await pack.getIndex({ fields: ['system.kindredId'] })
	const entry = index.find(e => e.system?.kindredId === kindredId)
	if (!entry) throw new Error(game.i18n.format('DOLMEN.Import.KindredNotFound', { id: kindredId }))

	const doc = await pack.getDocument(entry._id)
	await actor.createEmbeddedDocuments('Item', [doc.toObject()])
}

/**
 * Add a class from the compendium by classId, bypassing setClass
 * (which resets skills).
 * @param {Actor} actor - The target actor
 * @param {string} classId - The class ID (e.g., "knight")
 */
async function addClassFromCompendium(actor, classId) {
	const pack = game.packs.get('dolmenwood.classes')
	if (!pack) throw new Error(game.i18n.localize('DOLMEN.Import.ClassNotFound'))

	const index = await pack.getIndex({ fields: ['system.classId'] })
	const entry = index.find(e => e.system?.classId === classId)
	if (!entry) throw new Error(game.i18n.format('DOLMEN.Import.ClassNotFound', { id: classId }))

	const doc = await pack.getDocument(entry._id)
	await actor.createEmbeddedDocuments('Item', [doc.toObject()])
}

// --- Main Import Pipeline ---

/**
 * Import character data from HTML into an actor.
 * @param {Actor} actor - The target actor
 * @param {string} rawHTML - Raw HTML from external generator
 */
export async function importCharacterData(actor, rawHTML) {
	// 1. Parse HTML
	const data = parseCharacterHTML(rawHTML)

	if (!data.kindred || !data.class) {
		throw new Error(game.i18n.localize('DOLMEN.Import.ParseError'))
	}

	// 2. Delete all existing embedded items (clean slate)
	const existingIds = actor.items.map(i => i.id)
	if (existingIds.length) {
		await actor.deleteEmbeddedDocuments('Item', existingIds)
	}

	// 3. Add kindred from compendium
	await addKindredFromCompendium(actor, data.kindred)

	// 4. Add class from compendium
	await addClassFromCompendium(actor, data.class)

	// 5. Apply class progression (saves/attack/skills) for the imported level
	const updateData = buildActorUpdateData(data)
	const classItem = actor.getClassItem()
	if (classItem?.system) {
		const level = data.level || 1
		const prog = classItem.system

		// Attack bonus
		if (prog.attackProgression?.[level - 1] !== undefined) {
			updateData['system.attack'] = prog.attackProgression[level - 1]
		}

		// Saving throws
		if (prog.saveProgressions) {
			for (const save of ['doom', 'ray', 'hold', 'blast', 'spell']) {
				if (prog.saveProgressions[save]?.[level - 1] !== undefined) {
					updateData[`system.saves.${save}`] = prog.saveProgressions[save][level - 1]
				}
			}
		}

		// Skills (base + extra from class)
		if (prog.skillProgressions) {
			for (const skill of ['listen', 'search', 'survival']) {
				if (prog.skillProgressions[skill]?.[level - 1] !== undefined) {
					updateData[`system.skills.${skill}`] = prog.skillProgressions[skill][level - 1]
				}
			}
			const classSkills = prog.classSkills || []
			if (classSkills.length) {
				updateData['system.extraSkills'] = classSkills.map(id => ({
					id,
					target: prog.skillProgressions[id]?.[level - 1] ?? 6
				}))
			}
		}
	}

	// 6. Update actor data
	await actor.update(updateData)

	// TODO: Create weapon, armor, and gear items

	// 6. Show success notification
	ui.notifications.info(game.i18n.format('DOLMEN.Import.Success', { name: data.name || actor.name }))
}

// --- Dialog ---

/**
 * Open the import dialog with a textarea for pasting HTML.
 * @param {ActorSheet} sheet - The actor sheet instance
 */
export async function openImportDialog(sheet) {
	const { DialogV2 } = foundry.applications.api

	const content = `
		<div class="import-character-dialog">
			<p>${game.i18n.localize('DOLMEN.Import.Hint')}</p>
			<textarea id="import-html" rows="12" placeholder="${game.i18n.localize('DOLMEN.Import.Placeholder')}" style="width:100%;font-family:monospace;font-size:12px;"></textarea>
		</div>`

	const result = await DialogV2.wait({
		window: { title: game.i18n.localize('DOLMEN.Import.Title') },
		content,
		buttons: [
			{
				action: 'import',
				label: game.i18n.localize('DOLMEN.Import.Button'),
				icon: 'fas fa-file-import',
				callback: (event, button) => button.form?.closest('.dialog')?.querySelector('#import-html')?.value
					|| button.closest('.dialog')?.querySelector('#import-html')?.value || ''
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

	const rawHTML = typeof result === 'string' ? result.trim() : ''
	if (!rawHTML) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Import.EmptyWarning'))
		return
	}

	try {
		await importCharacterData(sheet.actor, rawHTML)
	} catch (err) {
		console.error('Character import failed:', err)
		ui.notifications.error(`${game.i18n.localize('DOLMEN.Import.ParseError')}: ${err.message}`)
	}
}
