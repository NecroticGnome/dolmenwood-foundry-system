/* global game */

/**
 * Utility functions for building localized choice objects for dropdowns and selects.
 */

/**
 * Build a choice object from an array of keys and a localization namespace.
 * @param {string} namespace - The localization namespace (e.g., 'DOLMEN.Kindreds')
 * @param {string[]} keys - Array of choice keys
 * @returns {Object} Object mapping keys to localized labels
 */
export function buildChoices(namespace, keys) {
	const choices = {}
	for (const key of keys) {
		choices[key] = game.i18n.localize(`${namespace}.${key}`)
	}
	return choices
}

/**
 * Build a choice object with a blank/none option at the start.
 * @param {string} namespace - The localization namespace
 * @param {string[]} keys - Array of choice keys
 * @param {string} blankLabel - Label for the blank option (default: " ")
 * @returns {Object} Object mapping keys to localized labels with blank option
 */
export function buildChoicesWithBlank(namespace, keys, blankLabel = " ") {
	return {
		none: blankLabel,
		...buildChoices(namespace, keys)
	}
}

/**
 * Build quality options for weapon checkboxes.
 * @param {string[]} currentQualities - Array of currently selected quality IDs
 * @returns {Object[]} Array of quality option objects with checked state
 */
export function buildQualityOptions(currentQualities = []) {
	return CHOICE_KEYS.weaponQualities.map(id => ({
		id,
		label: game.i18n.localize(`DOLMEN.Item.Quality.${id}`),
		checked: currentQualities.includes(id)
	}))
}

/**
 * Weapon type properties: size and combat usage categories.
 * Used by class sheet to build weapon proficiency multi-select.
 */
const WEAPON_TYPE_PROPERTIES = {
	battleAxe: { size: 'large', melee: true, missile: false },
	club: { size: 'medium', melee: true, missile: false },
	crossbow: { size: 'medium', melee: false, missile: true },
	dagger: { size: 'small', melee: true, missile: true },
	flail: { size: 'medium', melee: true, missile: false },
	handAxe: { size: 'small', melee: true, missile: true },
	holyWater: { size: 'small', melee: false, missile: true },
	javelin: { size: 'medium', melee: false, missile: true },
	lance: { size: 'large', melee: true, missile: false },
	longbow: { size: 'large', melee: false, missile: true },
	longsword: { size: 'medium', melee: true, missile: false },
	mace: { size: 'medium', melee: true, missile: false },
	oil: { size: 'small', melee: false, missile: true },
	polearm: { size: 'large', melee: true, missile: false },
	shortbow: { size: 'medium', melee: false, missile: true },
	shortsword: { size: 'medium', melee: true, missile: false },
	sling: { size: 'small', melee: false, missile: true },
	spear: { size: 'medium', melee: true, missile: true },
	staff: { size: 'medium', melee: true, missile: false },
	torch: { size: 'small', melee: true, missile: false },
	twoHandedSword: { size: 'large', melee: true, missile: false },
	warHammer: { size: 'medium', melee: true, missile: false }
}

/** Special group tags for weapon proficiency */
export const WEAPON_PROF_GROUPS = ['any', 'anyMelee', 'anyMissile', 'small', 'medium', 'large']

/**
 * Get weapon type IDs that belong to a group tag.
 * @param {string} groupTag - One of the WEAPON_PROF_GROUPS
 * @returns {string[]} Array of weapon type IDs in that group
 */
export function getWeaponTypesForGroup(groupTag) {
	const types = Object.entries(WEAPON_TYPE_PROPERTIES)
	switch (groupTag) {
	case 'any':
		return types.map(([id]) => id)
	case 'anyMelee':
		return types.filter(([, p]) => p.melee).map(([id]) => id)
	case 'anyMissile':
		return types.filter(([, p]) => p.missile && !p.melee).map(([id]) => id)
	case 'small':
		return types.filter(([, p]) => p.size === 'small').map(([id]) => id)
	case 'medium':
		return types.filter(([, p]) => p.size === 'medium').map(([id]) => id)
	case 'large':
		return types.filter(([, p]) => p.size === 'large').map(([id]) => id)
	default:
		return []
	}
}

/** Weapon types ordered by size for proficiency UI */
const WEAPON_TYPES_BY_SIZE = {
	small: ['dagger', 'handAxe', 'holyWater', 'oil', 'sling', 'torch'],
	medium: ['club', 'crossbow', 'flail', 'javelin', 'longsword', 'mace', 'shortbow', 'shortsword', 'spear', 'staff', 'warHammer'],
	large: ['battleAxe', 'lance', 'longbow', 'polearm', 'twoHandedSword']
}

/**
 * Build weapon proficiency options for class sheet checkboxes.
 * Returns types grouped by size for logical display order.
 * @param {string[]} currentProf - Array of currently selected proficiency IDs
 * @returns {{ groups: Object[], typesBySize: Object[] }} Group options and type groups with headers
 */
export function buildWeaponProfOptions(currentProf = []) {
	const hasAny = currentProf.includes('any')

	// Collect all types that are "covered" by active group tags
	const coveredTypes = new Set()
	for (const tag of WEAPON_PROF_GROUPS) {
		if (currentProf.includes(tag)) {
			for (const id of getWeaponTypesForGroup(tag)) {
				coveredTypes.add(id)
			}
		}
	}

	const groups = WEAPON_PROF_GROUPS.map(id => ({
		id,
		label: game.i18n.localize(`DOLMEN.WeaponProf.${id}`),
		checked: currentProf.includes(id),
		disabled: hasAny && id !== 'any'
	}))

	const typesBySize = Object.entries(WEAPON_TYPES_BY_SIZE).map(([size, ids]) => ({
		size,
		label: game.i18n.localize(`DOLMEN.WeaponProf.${size}`),
		types: ids.map(id => ({
			id,
			label: game.i18n.localize(`DOLMEN.Item.WeaponType.${id}`),
			checked: currentProf.includes(id) || coveredTypes.has(id),
			disabled: hasAny || coveredTypes.has(id)
		}))
	}))

	return { groups, typesBySize }
}

/**
 * Convert a weapon proficiency array to a human-readable display string.
 * @param {string[]} profArray - Array of proficiency IDs
 * @returns {string} Localized display string
 */
export function formatWeaponProficiency(profArray = []) {
	if (!profArray.length) return '—'
	const weaponOrder = [
		...WEAPON_PROF_GROUPS,
		...WEAPON_TYPES_BY_SIZE.small,
		...WEAPON_TYPES_BY_SIZE.medium,
		...WEAPON_TYPES_BY_SIZE.large
	]
	const sorted = [...profArray].sort((a, b) => weaponOrder.indexOf(a) - weaponOrder.indexOf(b))
	const labels = sorted.map(id => {
		if (WEAPON_PROF_GROUPS.includes(id)) {
			return game.i18n.localize(`DOLMEN.WeaponProf.${id}`)
		}
		return game.i18n.localize(`DOLMEN.Item.WeaponType.${id}`)
	})
	return labels.join(', ')
}

/** Armor proficiency options: bulk categories + shields */
const ARMOR_PROF_OPTIONS = ['any', 'light', 'medium', 'heavy', 'shields']

/**
 * Build armor proficiency options for class sheet checkboxes.
 * @param {string[]} currentProf - Array of currently selected armor proficiency IDs
 * @returns {Object[]} Array of option objects with checked/disabled state
 */
export function buildArmorProfOptions(currentProf = []) {
	const hasAny = currentProf.includes('any')
	return ARMOR_PROF_OPTIONS.map(id => ({
		id,
		label: game.i18n.localize(`DOLMEN.ArmorProf.${id}`),
		checked: id === 'shields' ? currentProf.includes('shields') : (hasAny || currentProf.includes(id)),
		disabled: hasAny && id !== 'any' && id !== 'shields'
	}))
}

/**
 * Convert an armor proficiency array to a human-readable display string.
 * @param {string[]} profArray - Array of proficiency IDs
 * @returns {string} Localized display string
 */
export function formatArmorProficiency(profArray = []) {
	if (!profArray.length) return game.i18n.localize('DOLMEN.ArmorProf.none')
	const hasShields = profArray.includes('shields')
	const armorOrder = ['light', 'medium', 'heavy', 'any']
	const armorTypes = profArray.filter(id => id !== 'shields').sort((a, b) => armorOrder.indexOf(a) - armorOrder.indexOf(b))
	if (!armorTypes.length) {
		return game.i18n.localize('DOLMEN.ArmorProf.shieldsOnly')
	}
	const labels = armorTypes.map(id => game.i18n.localize(`DOLMEN.ArmorProf.${id}`))
	const armorLabel = labels.length === 2
		? game.i18n.format('DOLMEN.ArmorProf.twoTypes', { typeA: labels[0], typeB: labels[1] })
		: labels.join(', ')
	const shieldSuffix = hasShields
		? game.i18n.localize('DOLMEN.ArmorProf.inclShields')
		: game.i18n.localize('DOLMEN.ArmorProf.noShields')
	return `${armorLabel}, ${shieldSuffix}`
}

/** Extra skill IDs available for class skill selection */
const EXTRA_SKILL_IDS = [
	'detectMagic', 'alertness', 'stalking', 'tracking', 'pickLock',
	'stealth', 'decipherDocument', 'climbWall', 'disarmMechanism',
	'legerdemain', 'monsterLore'
]

/**
 * Build class skill options for class sheet checkboxes.
 * @param {string[]} currentSkills - Array of currently selected skill IDs
 * @returns {Object[]} Array of option objects with checked state
 */
export function buildClassSkillOptions(currentSkills = []) {
	return EXTRA_SKILL_IDS.map(id => ({
		id,
		label: game.i18n.localize(`DOLMEN.Skills.${id}`),
		checked: currentSkills.includes(id)
	}))
}

// Pre-defined choice key arrays for common dropdowns
export const CHOICE_KEYS = {
	alignments: ['lawful', 'neutral', 'chaotic'],
	encumbranceMethods: ['weight', 'treasure', 'slots'],
	moonNames: ['grinning', 'dead', 'beast', 'squamous', 'knights', 'rotting', 'maidens', 'witch', 'robbers', 'goat', 'narrow', 'black'],
	moonPhases: ['waxing', 'full', 'waning'],
	months: ['grimvold', 'lymewald', 'haggryme', 'symswald', 'harchment', 'iggwyld', 'chysting', 'lillipythe', 'haelhold', 'reedwryme', 'obthryme', 'braghold'],
	creatureTypes: ['mortal', 'demi-fey', 'fairy'],
	sizes: ['small', 'medium', 'large'],
	armorBulks: ['none', 'light', 'medium', 'heavy'],
	armorTypes: ['armor', 'shield'],
	foragedTypes: ['plant', 'fungus', 'pipeleaf'],
	runeMagnitudes: ['lesser', 'greater', 'mighty'],
	knackTypes: ['birdFriend', 'lockSinger', 'rootFriend', 'threadWhistling', 'woodKenning', 'yeastMaster'],
	spellRanks: ['rank1', 'rank2', 'rank3', 'rank4', 'rank5', 'rank6'],
	holyOrders: ['stFaxis', 'stSedge', 'stSignis'],
	monsterTypes: ['animal', 'bug', 'construct', 'demi-fey', 'dragon', 'fairy', 'fungus', 'monstrosity', 'mortal', 'ooze', 'plant', 'undead'],
	intelligenceTypes: ["mindless", "animal", "semi-intelligent", "sentient", "genius"],
	costDenominations: ['gp', 'sp', 'cp', 'pp'],
	weaponQualities: ["armor-piercing", "brace", "charge", "melee", "missile", "reach", "reload", "splash", "two-handed", "cold-iron", "silver"],
	weaponTypes: [
		"battleAxe", "club", "crossbow", "dagger", "flail", "handAxe",
		"holyWater", "javelin", "lance", "longbow", "longsword", "mace",
		"oil", "polearm", "shortbow", "shortsword", "sling", "spear",
		"staff", "torch", "twoHandedSword", "warHammer"
	]
}
