/* global game, CONFIG */
/**
 * Data Context Helpers
 * Pure computation functions for preparing sheet context data.
 * All functions receive the actor (or relevant data) as parameters.
 */

import { AdventurerDataModel } from '../data-models.mjs'
import { computeTraitAdjustments, getAllActiveTraits, isWearingHeavyArmor } from './trait-helpers.js'

/**
 * Compute XP modifier from prime abilities.
 * Uses the lowest adjusted score among the class's prime abilities.
 * @param {Actor} actor - The actor
 * @param {object} adjustedAbilities - The adjusted abilities object
 * @returns {number} The XP modifier percentage (-20, -10, 0, 5, or 10)
 */
export function computeXPModifier(actor, adjustedAbilities) {
	const classItem = actor.items.find(i => i.type === 'Class')
	const primes = classItem?.system?.primeAbilities

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
 * Compute encumbrance from inventory items and coins.
 * @param {Actor} actor - The actor
 * @returns {object} Encumbrance data with current/max values and computed speed
 */
export function computeEncumbrance(actor) {
	const system = actor.system
	const method = game.settings.get('dolmenwood', 'encumbranceMethod')
	const excludedTypes = ['Spell', 'HolySpell', 'Glamour', 'Rune', 'Kindred', 'Class']
	const items = actor.items.contents.filter(i => !excludedTypes.includes(i.type))
	const equipped = items.filter(i => i.system.equipped)
	const stowed = items.filter(i => !i.system.equipped)
	const totalCoins = (system.coins.copper || 0) + (system.coins.silver || 0)
		+ (system.coins.gold || 0) + (system.coins.pellucidium || 0)

	switch (method) {
	case 'weight': return computeWeightFull(equipped, stowed, totalCoins)
	case 'treasure': return computeWeightTreasure(equipped, stowed, totalCoins, game.settings.get('dolmenwood', 'significantLoad'))
	case 'slots': return computeSlots(equipped, stowed, totalCoins)
	default: return { current: 0, max: 1600, speed: 40 }
	}
}

function computeWeightFull(equipped, stowed, totalCoins) {
	const itemWeight = [...equipped, ...stowed].reduce(
		(sum, i) => sum + (i.system.weightCoins || 0) * (i.system.quantity || 1), 0
	)
	const current = itemWeight + totalCoins
	let speed = 40
	if (current > 1600) speed = 0
	else if (current > 800) speed = 10
	else if (current > 600) speed = 20
	else if (current > 400) speed = 30
	return { current, max: 1600, speed }
}

function computeWeightTreasure(equipped, stowed, totalCoins, significantLoad) {
	const treasureWeight = [...equipped, ...stowed]
		.filter(i => i.type === 'Treasure')
		.reduce((sum, i) => sum + (i.system.weightCoins || 0) * (i.system.quantity || 1), 0)
	const current = treasureWeight + totalCoins
	const threshold = 1600 * (significantLoad || 50) / 100
	const hasTreasure = current >= threshold

	// Find heaviest equipped armor bulk
	const bulkOrder = { none: 0, light: 1, medium: 2, heavy: 3 }
	let heaviestBulk = 'none'
	for (const item of equipped) {
		if (item.type === 'Armor' && bulkOrder[item.system.bulk] > bulkOrder[heaviestBulk]) {
			heaviestBulk = item.system.bulk
		}
	}

	// Speed lookup: armor × treasure
	let speed
	if (heaviestBulk === 'none') {
		speed = hasTreasure ? 30 : 40
	} else if (heaviestBulk === 'light') {
		speed = hasTreasure ? 20 : 30
	} else {
		// medium or heavy
		speed = hasTreasure ? 10 : 20
	}

	if (current > 1600) speed = 0
	return { current, max: 1600, speed }
}

function itemSlots(i) {
	const w = i.system.weightSlots || 0
	if (!w) return 0
	const qty = i.system.quantity || 1
	const stack = i.system.stackSize || 1
	if (stack > 1) return w * Math.ceil(qty / stack)
	return w * qty
}

function computeSlots(equipped, stowed, totalCoins) {
	const equippedSlots = equipped.reduce((sum, i) => sum + itemSlots(i), 0)
	const coinSlots = Math.ceil(totalCoins / 100)
	const stowedSlots = stowed.reduce((sum, i) => sum + itemSlots(i), 0) + coinSlots

	// Speed from equipped tier
	let equippedSpeed
	if (equippedSlots <= 3) equippedSpeed = 40
	else if (equippedSlots <= 5) equippedSpeed = 30
	else if (equippedSlots <= 7) equippedSpeed = 20
	else equippedSpeed = 10

	// Speed from stowed tier
	let stowedSpeed
	if (stowedSlots <= 10) stowedSpeed = 40
	else if (stowedSlots <= 12) stowedSpeed = 30
	else if (stowedSlots <= 14) stowedSpeed = 20
	else stowedSpeed = 10

	const speed = Math.min(equippedSpeed, stowedSpeed)

	return {
		equipped: { current: equippedSlots, max: 10 },
		stowed: { current: stowedSlots, max: 16 },
		speed
	}
}

/**
 * Compute adjusted values by adding manual adjustments and trait adjustments to base values.
 * @param {Actor} actor - The actor
 * @param {number|null} encumbranceSpeed - Speed derived from encumbrance, or null to use stored speed
 * @returns {object} Object containing all adjusted values
 */
export function computeAdjustedValues(actor, encumbranceSpeed = null) {
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

	const baseSpeed = encumbranceSpeed ?? system.speed

	// Compute AC from equipped armor + adjusted DEX modifier + shield bonus
	const equippedArmor = actor.items?.filter(i => i.type === 'Armor' && i.system.equipped) || []
	const bodyArmor = equippedArmor.filter(i => i.system.armorType !== 'shield')
	const shields = equippedArmor.filter(i => i.system.armorType === 'shield')
	const bestArmorAC = bodyArmor.length > 0
		? Math.max(...bodyArmor.map(a => a.system.ac || 10))
		: 10
	const dexMod = abilityAdjusted('dexterity').mod
	const shieldBonus = shields.length > 0
		? Math.max(...shields.map(s => s.system.ac || 1))
		: 0
	const computedAC = bestArmorAC + dexMod + shieldBonus

	// Build AC breakdown for tooltip
	const acSources = []
	if (bodyArmor.length > 0) {
		const bestArmor = bodyArmor.reduce((a, b) => (a.system.ac || 10) >= (b.system.ac || 10) ? a : b)
		acSources.push({ label: bestArmor.name, value: bestArmor.system.ac })
	} else {
		acSources.push({ label: game.i18n.localize('DOLMEN.Combat.Unarmored'), value: 10 })
	}
	if (dexMod !== 0) {
		acSources.push({ label: game.i18n.localize('DOLMEN.Abilities.DexterityShort'), value: dexMod })
	}
	if (shields.length > 0) {
		const bestShield = shields.reduce((a, b) => (a.system.ac || 1) >= (b.system.ac || 1) ? a : b)
		acSources.push({ label: bestShield.name, value: shieldBonus })
	}
	// Trait adjustments to AC
	const allTraits = getAllActiveTraits(actor)
	for (const trait of allTraits) {
		if (trait.traitType !== 'adjustment' || trait.adjustmentType !== 'static') continue
		if (trait.adjustmentTarget !== 'ac') continue
		if (trait.minLevel && system.level < trait.minLevel) continue
		if (trait.requiresNoHeavyArmor && isWearingHeavyArmor(actor)) continue
		const val = typeof trait.adjustmentValue === 'function' ? trait.adjustmentValue(system.level) : trait.adjustmentValue
		acSources.push({ label: game.i18n.localize(trait.nameKey), value: val })
	}
	// Manual adjustment
	if (adj.ac) {
		acSources.push({ label: game.i18n.localize('DOLMEN.Combat.Adjustment'), value: adj.ac })
	}
	const acBreakdown = acSources.map((s, i) => {
		const prefix = i > 0 && s.value >= 0 ? '+' : ''
		return `<div class="ac-source"><span>${s.label}</span><span>${prefix}${s.value}</span></div>`
	}).join('')

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
		ac: computedAC + (adj.ac || 0) + getTraitAdj('ac'),
		acBreakdown,
		attack: system.attack + (adj.attack || 0) + getTraitAdj('attack') + (system.exhaustion || 0),
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
		speed: baseSpeed + (adj.speed || 0) + getTraitAdj('speed'),
		movement: {
			exploring: (baseSpeed * 3) + (adj.movement.exploring || 0),
			overland: Math.floor((baseSpeed + (adj.speed || 0) + getTraitAdj('speed')) / 5) + (adj.movement.overland || 0)
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
 * Knack abilities with daily usage limits.
 * Keyed by knackType, each entry lists which levels have daily usage.
 */
const DAILY_KNACK_ABILITIES = {
	birdFriend: [5, 7],
	rootFriend: [1, 3, 5, 7],
	woodKenning: [7],
	yeastMaster: [5, 7]
}

/**
 * Prepare knack abilities based on knack type and character level.
 * @param {string} knackType - The selected knack type
 * @param {number} level - Character level
 * @param {object} knackUsage - Usage tracking data from actor
 * @returns {object[]} Array of knack abilities with unlock status
 */
export function prepareKnackAbilities(knackType, level, knackUsage = {}) {
	if (!knackType) return []

	const dailyLevels = DAILY_KNACK_ABILITIES[knackType] || []
	const knackLevels = [1, 3, 5, 7]
	return knackLevels.map(knackLevel => {
		const unlocked = level >= knackLevel
		const isDaily = dailyLevels.includes(knackLevel)
		const usageKey = `${knackType}_level${knackLevel}`
		const used = knackUsage[usageKey]?.used || 0

		return {
			level: knackLevel,
			description: game.i18n.localize(`DOLMEN.Magic.Knacks.Abilities.${knackType}.level${knackLevel}`),
			unlocked,
			isDaily: isDaily && unlocked,
			usageKey,
			used: Math.min(used, 1),
			usageLabel: game.i18n.localize('DOLMEN.Traits.OncePerDay')
		}
	})
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
 * Compute rune usage limits based on magnitude and character level.
 * @param {string} magnitude - 'lesser', 'greater', or 'mighty'
 * @param {number} level - Character level
 * @returns {object} { max, frequency, resetsOnRest, deleteOnUse }
 */
export function getRuneUsage(magnitude, level) {
	if (magnitude === 'lesser') {
		if (level >= 10) return { max: 3, frequency: 'DOLMEN.Magic.Fairy.ThricePerDay', resetsOnRest: true }
		if (level >= 5) return { max: 2, frequency: 'DOLMEN.Magic.Fairy.TwicePerDay', resetsOnRest: true }
		return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OncePerDay', resetsOnRest: true }
	}
	if (magnitude === 'greater') {
		if (level >= 10) return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OncePerDay', resetsOnRest: true }
		if (level >= 5) return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OncePerWeek', resetsOnRest: false }
		return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OncePerLevel', resetsOnRest: false }
	}
	// mighty
	if (level >= 10) return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OncePerYear', resetsOnRest: false }
	return { max: 1, frequency: 'DOLMEN.Magic.Fairy.OnceEver', resetsOnRest: false, deleteOnUse: true }
}

/**
 * Group runes by magnitude for display, with usage tracking.
 * @param {Item[]} runes - Array of rune items
 * @param {Actor} actor - The actor owning these runes
 * @returns {object[]} Array of magnitude groups with runes
 */
export function groupRunesByMagnitude(runes, actor) {
	const magnitudeOrder = ['lesser', 'greater', 'mighty']
	const level = actor.system.level
	const runeUsage = actor.system.runeUsage || {}
	const groups = []

	for (const magnitude of magnitudeOrder) {
		const magnitudeRunes = runes
			.filter(r => r.system.magnitude === magnitude || (magnitude === 'lesser' && !r.system.magnitude))
			.map(r => {
				const data = prepareSpellData(r)
				const usage = getRuneUsage(magnitude, level)
				const stored = runeUsage[r.id] || { used: 0 }
				const usedCount = Math.min(stored.used || 0, usage.max)

				data.usageFrequency = game.i18n.localize(usage.frequency)
				data.maxUses = usage.max
				data.usedCount = usedCount
				data.usesRemaining = usage.max - usedCount
				data.deleteOnUse = !!usage.deleteOnUse
				data.resetsOnRest = usage.resetsOnRest
				data.usageCheckboxes = []
				for (let i = 0; i < usage.max; i++) {
					data.usageCheckboxes.push({ index: i, checked: i < usedCount })
				}
				return data
			})
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
		hasEffects: ['Treasure', 'Foraged'].includes(item.type) && !!(item.system?.effects)
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

/**
 * Calculate available skill points when using the Customize Skills optional rule.
 * Based on the expertise points in the class item.
 * @param {Actor} actor - The actor
 * @returns {number} Available skill points to distribute
 */
export function computeSkillPoints(actor) {
	const sys = actor.system
	const level = sys.level || 1
	const classItem = actor.items.find(i => i.type === 'Class')

	// Read skill point config from class item data
	const base = classItem?.system?.skillPointsBase || 0
	const perLevel = classItem?.system?.skillPointsPerLevel || 0
	if (base === 0 && perLevel === 0) return 0

	// Calculate total expertise points awarded
	const totalAwarded = base + (level - 1) * perLevel

	// Calculate points spent (each point reduces a skill target by 1 from base of 6)
	let totalSpent = 0

	// Base skills (listen, search, survival)
	totalSpent += (6 - sys.skills.listen)
	totalSpent += (6 - sys.skills.search)
	totalSpent += (6 - sys.skills.survival)

	// Extra skills
	const extraSkills = sys.extraSkills || []
	for (const skill of extraSkills) {
		totalSpent += (6 - skill.target)
	}

	// Available = awarded - spent
	return totalAwarded - totalSpent
}
