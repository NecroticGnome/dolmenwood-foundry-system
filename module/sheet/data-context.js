/* global game, CONFIG */
/**
 * Data Context Helpers
 * Pure computation functions for preparing sheet context data.
 * All functions receive the actor (or relevant data) as parameters.
 */

import { AdventurerDataModel } from '../data-models.mjs'
import { computeTraitAdjustments } from './trait-helpers.js'

/**
 * Compute XP modifier from prime abilities.
 * Uses the lowest adjusted score among the class's prime abilities.
 * @param {Actor} actor - The actor
 * @param {object} adjustedAbilities - The adjusted abilities object
 * @returns {number} The XP modifier percentage (-20, -10, 0, 5, or 10)
 */
export function computeXPModifier(actor, adjustedAbilities) {
	const cls = actor.system.class
	const primes = CONFIG.DOLMENWOOD.primeAbilities[cls]
	if (!primes || primes.length === 0) return 0

	const lowestScore = Math.min(...primes.map(a => adjustedAbilities[a].score))

	if (lowestScore <= 5) return -20
	if (lowestScore <= 8) return -10
	if (lowestScore <= 12) return 0
	if (lowestScore <= 15) return 5
	return 10
}

/**
 * Compute moon sign and phase from birth month and day.
 * @param {string} month - The birth month key (e.g., 'grimvold')
 * @param {number} day - The birth day (1-31)
 * @returns {object|null} { moon, phase } or null if birthday not set
 */
export function computeMoonSign(month, day) {
	const offset = CONFIG.DOLMENWOOD.monthOffsets[month]
	if (offset === undefined || !day || day <= 0) return null

	const doy = offset + day
	for (const [start, end, moon, phase] of CONFIG.DOLMENWOOD.moonSignTable) {
		if (doy >= start && doy <= end) return { moon, phase }
	}
	return null
}

/**
 * Compute adjusted values by adding manual adjustments and trait adjustments to base values.
 * @param {Actor} actor - The actor
 * @returns {object} Object containing all adjusted values
 */
export function computeAdjustedValues(actor) {
	const system = actor.system
	const adj = system.adjustments
	const traitAdj = computeTraitAdjustments(actor)
	const skillOverrides = traitAdj._skillOverrides || {}

	// Helper to get trait adjustment for a path
	const getTraitAdj = (path) => traitAdj[path] || 0

	// Helper to compute skill value with override support
	const skillAdjusted = (name) => {
		const overridePath = `skills.${name}`
		if (skillOverrides[overridePath] !== undefined) {
			// Override sets the base value, then add manual adjustments
			return skillOverrides[overridePath] + (adj.skills[name] || 0)
		}
		return system.skills[name] + (adj.skills[name] || 0) + getTraitAdj(overridePath)
	}

	// Merge trait adjustments into ability adjustments
	const abilityAdjusted = (name) => {
		const base = system.abilities[name]
		const manualAdj = adj.abilities[name]
		const traitScoreAdj = getTraitAdj(`abilities.${name}.score`)
		const traitModAdj = getTraitAdj(`abilities.${name}.mod`)

		const adjustedScore = base.score + (manualAdj.score || 0) + traitScoreAdj
		const baseMod = AdventurerDataModel.computeModifier(adjustedScore)
		const adjustedMod = baseMod + (manualAdj.mod || 0) + traitModAdj

		return { score: adjustedScore, mod: adjustedMod }
	}

	return {
		abilities: {
			strength: abilityAdjusted('strength'),
			intelligence: abilityAdjusted('intelligence'),
			wisdom: abilityAdjusted('wisdom'),
			dexterity: abilityAdjusted('dexterity'),
			constitution: abilityAdjusted('constitution'),
			charisma: abilityAdjusted('charisma')
		},
		hp: {
			max: system.hp.max + (adj.hp.max || 0) + getTraitAdj('hp.max')
		},
		ac: system.ac + (adj.ac || 0) + getTraitAdj('ac'),
		attack: system.attack + (adj.attack || 0) + getTraitAdj('attack'),
		attackMelee: getTraitAdj('attack.melee'),
		attackMissile: getTraitAdj('attack.missile'),
		saves: {
			doom: system.saves.doom + (adj.saves.doom || 0) + getTraitAdj('saves.doom'),
			ray: system.saves.ray + (adj.saves.ray || 0) + getTraitAdj('saves.ray'),
			hold: system.saves.hold + (adj.saves.hold || 0) + getTraitAdj('saves.hold'),
			blast: system.saves.blast + (adj.saves.blast || 0) + getTraitAdj('saves.blast'),
			spell: system.saves.spell + (adj.saves.spell || 0) + getTraitAdj('saves.spell')
		},
		magicResistance: system.magicResistance + (adj.magicResistance || 0) + getTraitAdj('magicResistance'),
		skills: {
			listen: skillAdjusted('listen'),
			search: skillAdjusted('search'),
			survival: skillAdjusted('survival')
		},
		speed: system.speed + (adj.speed || 0) + getTraitAdj('speed'),
		movement: {
			exploring: system.movement.exploring + (adj.movement.exploring || 0),
			overland: system.movement.overland + (adj.movement.overland || 0)
		}
	}
}

/**
 * Prepare spell slot data for display.
 * @param {object} slots - The spell slots object from actor system data
 * @param {number} maxRanks - Maximum number of ranks (6 for arcane, 5 for holy)
 * @returns {object[]} Array of slot data with labels
 */
export function prepareSpellSlots(slots, maxRanks) {
	const result = []
	for (let i = 1; i <= maxRanks; i++) {
		const key = `rank${i}`
		result.push({
			key,
			label: game.i18n.localize(`DOLMEN.Magic.SpellRank`)+` ${i}`,
			max: slots[key]?.max || 0,
			used: slots[key]?.used || 0
		})
	}
	return result
}

/**
 * Prepare knack abilities based on knack type and character level.
 * @param {string} knackType - The selected knack type
 * @param {number} level - Character level
 * @returns {object[]} Array of knack abilities with unlock status
 */
export function prepareKnackAbilities(knackType, level) {
	if (!knackType) return []

	const knackLevels = [1, 3, 5, 7]
	return knackLevels.map(knackLevel => ({
		level: knackLevel,
		description: game.i18n.localize(`DOLMEN.Magic.Knacks.Abilities.${knackType}.level${knackLevel}`),
		unlocked: level >= knackLevel
	}))
}

/**
 * Prepare spell data for display.
 * @param {Item} spell - The spell item
 * @returns {object} Prepared spell data
 */
export function prepareSpellData(spell) {
	return {
		id: spell.id,
		name: spell.name,
		img: spell.img,
		system: spell.system
	}
}

/**
 * Group spells by rank for display.
 * @param {Item[]} spells - Array of spell items
 * @param {number} maxRank - Maximum rank (6 for arcane, 5 for holy)
 * @returns {object[]} Array of rank groups with spells
 */
export function groupSpellsByRank(spells, maxRank) {
	const groups = []

	for (let rank = 1; rank <= maxRank; rank++) {
		const rankSpells = spells
			.filter(s => s.system.rank === rank)
			.map(s => prepareSpellData(s))
			.sort((a, b) => a.name.localeCompare(b.name))

		if (rankSpells.length > 0) {
			groups.push({
				rank,
				icon: 'fa-'+rank,
				spells: rankSpells
			})
		}
	}

	return groups
}

/**
 * Prepare memorized spell slots for display.
 * @param {object} slotsData - The spell slots data from actor system
 * @param {Item[]} knownSpells - Array of known spell items
 * @param {number} maxRank - Maximum rank (6 for arcane, 5 for holy)
 * @returns {object[]} Array of rank objects with slots array
 */
export function prepareMemorizedSlots(slotsData, knownSpells, maxRank) {
	const result = []

	for (let rank = 1; rank <= maxRank; rank++) {
		const key = `rank${rank}`
		const slotData = slotsData[key] || { max: 0, memorized: [] }
		const maxSlots = slotData.max || 0
		const memorizedIds = slotData.memorized || []

		if (maxSlots === 0) continue

		const slots = []
		for (let i = 0; i < maxSlots; i++) {
			const spellId = memorizedIds[i]
			if (spellId) {
				// Find the spell in known spells
				const spell = knownSpells.find(s => s.id === spellId)
				if (spell) {
					slots.push({
						index: i,
						filled: true,
						spell: prepareSpellData(spell)
					})
				} else {
					// Spell no longer exists, show empty slot
					slots.push({
						index: i,
						filled: false,
						spell: null
					})
				}
			} else {
				// Empty slot
				slots.push({
					index: i,
					filled: false,
					spell: null
				})
			}
		}

		result.push({
			rank,
			key,
			icon: 'fa-' + rank,
			slots
		})
	}

	return result
}

/**
 * Group runes by magnitude for display.
 * @param {Item[]} runes - Array of rune items
 * @returns {object[]} Array of magnitude groups with runes
 */
export function groupRunesByMagnitude(runes) {
	const magnitudeOrder = ['lesser', 'greater', 'mighty']
	const groups = []

	for (const magnitude of magnitudeOrder) {
		// Include runes with matching magnitude, or unset magnitude defaults to 'lesser'
		const magnitudeRunes = runes
			.filter(r => r.system.magnitude === magnitude || (magnitude === 'lesser' && !r.system.magnitude))
			.map(r => prepareSpellData(r))
			.sort((a, b) => a.name.localeCompare(b.name))

		if (magnitudeRunes.length > 0) {
			groups.push({
				magnitude,
				label: game.i18n.localize(`DOLMEN.Magic.Fairy.Runes${magnitude.charAt(0).toUpperCase() + magnitude.slice(1)}`),
				icon: magnitude === 'lesser' ? 'fa-brightness-low' : (magnitude === 'greater' ? 'fa-sun-bright' : 'fa-sun'),
				runes: magnitudeRunes
			})
		}
	}

	return groups
}

/**
 * Group items by their type for display.
 * @param {object[]} items - Array of prepared item data
 * @returns {object[]} Array of type groups with items
 */
export function groupItemsByType(items) {
	const typeOrder = ['Weapon', 'Armor', 'Item', 'Treasure', 'Foraged']
	const groups = {}

	for (const item of items) {
		if (!groups[item.type]) {
			groups[item.type] = {
				type: item.type,
				typeLower: item.type.toLowerCase(),
				label: game.i18n.localize(`TYPES.Item.${item.type}`),
				items: [],
				isWeapon: item.type === 'Weapon',
				isArmor: item.type === 'Armor',
				isItem: item.type === 'Item',
				isTreasure: item.type === 'Treasure',
				isForaged: item.type === 'Foraged'
			}
		}
		groups[item.type].items.push(item)
	}

	// Sort groups by type order
	return typeOrder
		.filter(type => groups[type])
		.map(type => groups[type])
}

/**
 * Get Font Awesome symbol for a weapon quality.
 * @param {string} quality - The weapon quality key
 * @param {object} item - The item data
 * @returns {string} HTML string with icon and tooltip
 */
export function getFaSymbol(quality, item) {
	const ranges = `${item.system.rangeShort}/${item.system.rangeMedium}/${item.system.rangeLong}`
	const title = game.i18n.localize(`DOLMEN.Item.Quality.${quality}`)
	if (quality === "melee") return '<i class="fas fa-sword tooltip"><span class="tooltiptext">' + title + '</span></i>'
	if (quality === "missile") return '<i class="fas fa-bow-arrow tooltip"><span class="tooltiptext">'+title+' ('+ranges+')'+'</span></i>'
	if (quality === "armor-piercing") return '<i class="fas fa-bore-hole tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "brace") return '<i class="fas fa-shield-halved tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "reach") return '<i class="fas fa-arrows-left-right tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "reload") return '<i class="fas fa-arrows-rotate tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if(quality === "two-handed") return '<i class="fas fa-handshake-angle tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "charge") return '<i class="fas fa-horse-saddle tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "splash") return '<i class="fas fa-droplet tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "cold-iron") return '<i class="fas fa-snowflake tooltip"><span class="tooltiptext">'+title+'</span></i>'
	if (quality === "silver") return '<i class="fas fa-star-christmas tooltip"><span class="tooltiptext">'+title+'</span></i>'
	return quality
}

/**
 * Prepare item data for display in the inventory.
 * @param {Item} item - The item to prepare
 * @returns {object} Prepared item data
 */
export function prepareItemData(item) {
	const data = {
		id: item.id,
		name: item.name,
		img: item.img,
		type: item.type,
		system: item.system,
		isWeapon: item.type === 'Weapon',
		isArmor: item.type === 'Armor',
		cssClass: item.type.toLowerCase(),
		hasNotes: (item.system?.notes || "") === "" ? false : true
	}

	// Add weapon qualities display
	if (data.isWeapon && item.system.qualities?.length) {
		data.qualitiesDisplay = item.system.qualities
			.map(q => getFaSymbol(q, item))
			.join(', ')
	}
	// Add armor bulk display
	if (data.isArmor) {
		data.bulkDisplay = game.i18n.localize(`DOLMEN.Item.Bulk.${item.system.bulk}`)
	}

	return data
}
