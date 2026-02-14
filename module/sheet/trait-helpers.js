/* global game */
/**
 * Trait Helpers
 * Functions for resolving, computing, and preparing trait data.
 * All functions receive the actor as a parameter.
 */

/**
 * Resolve damage from a damageProgression array for a given level.
 * The array should contain { minLevel, damage } entries sorted by minLevel ascending.
 * Returns the damage string for the highest minLevel <= the character's level.
 * @param {object[]} progression - Array of { minLevel: number, damage: string }
 * @param {number} level - Character level
 * @returns {string|null} Damage formula or null if no matching entry
 */
export function resolveDamageProgression(progression, level) {
	if (!Array.isArray(progression) || progression.length === 0) return null
	let result = null
	for (const entry of progression) {
		if (level >= entry.minLevel) result = entry.damage
	}
	return result
}

/**
 * Check if the character is using a kindred-class (kindred as class).
 * @param {Actor} actor - The actor
 * @returns {boolean} True if using a kindred-class
 */
export function isKindredClass(actor) {
	const classItem = actor.items.find(i => i.type === 'Class')
	return classItem ? !!classItem.system.requiredKindred : false
}

/**
 * Flatten a trait object (with categories) into a flat array of traits.
 * @param {object} traitObj - Trait object with categories (active, passive, info, restrictions)
 * @returns {object[]} Flat array of traits
 */
export function flattenTraitObject(traitObj) {
	const result = []
	for (const category of ['active', 'passive', 'info', 'restrictions']) {
		const val = traitObj[category]
		if (Array.isArray(val)) {
			result.push(...val)
		}
	}
	return result
}

/**
 * Get all active traits for the character (kindred + class or kindred-class).
 * Reads from embedded Kindred/Class items first, then falls back to CONFIG for backward compatibility.
 * Deduplicates traits by ID to prevent double-application (e.g., Breggle kindred + Breggle class).
 * @param {Actor} actor - The actor
 * @returns {object[]} Array of raw trait definitions
 */
export function getAllActiveTraits(actor) {
	const traits = []
	const seenIds = new Set()
	const kindredItem = actor.items.find(i => i.type === 'Kindred')
	const classItem = actor.items.find(i => i.type === 'Class')

	// If we have embedded items, read traits from them
	// Get kindred traits
	if (kindredItem?.system?.traits) {
		for (const trait of flattenTraitObject(kindredItem.system.traits)) {
			if (seenIds.has(trait.id)) continue
			// Skip child traits not selected by the actor
			if (trait.parentTrait) {
				const selections = actor.system[trait.parentTrait]
				if (Array.isArray(selections)) {
					if (!selections.includes(trait.id)) continue
				} else if (typeof selections === 'string') {
					if (selections !== trait.id) continue
				} else {
					continue
				}
			}
			traits.push(trait)
			seenIds.add(trait.id)
		}
	}

	// Get class traits (deduplicate to avoid double-applying traits like Fur Defense)
	if (classItem?.system?.traits) {
		for (const trait of flattenTraitObject(classItem.system.traits)) {
			if (seenIds.has(trait.id)) continue
			// Skip child traits not selected by the actor
			if (trait.parentTrait) {
				const selections = actor.system[trait.parentTrait]
				if (Array.isArray(selections)) {
					if (!selections.includes(trait.id)) continue
				} else if (typeof selections === 'string') {
					if (selections !== trait.id) continue
				} else {
					continue
				}
			}
			traits.push(trait)
			seenIds.add(trait.id)
		}
	}

	return traits
}

/**
 * Check if the actor is wearing heavy armor (bulk >= 2).
 * @param {Actor} actor - The actor
 * @returns {boolean} True if wearing medium or heavy armor
 */
export function isWearingHeavyArmor(actor) {
	const equippedArmor = actor.items.find(item =>
		item.type === 'Armor' && item.system.equipped
	)
	if (!equippedArmor) return false
	// Bulk 1 = light, 2 = medium, 3 = heavy
	return (equippedArmor.system.bulk || 0) >= 2
}

/**
 * Compute static trait adjustments that should be auto-applied.
 * @param {Actor} actor - The actor
 * @returns {object} Object with adjustment paths and their values, plus skillOverrides
 */
export function computeTraitAdjustments(actor) {
	const traits = getAllActiveTraits(actor)
	const adjustments = {}
	const skillOverrides = {}
	const level = actor.system.level

	for (const trait of traits) {
		if (trait.traitType !== 'adjustment') continue

		// Check minimum level requirement
		if (trait.minLevel && level < trait.minLevel) continue

		// Check armor condition (e.g., Fur Defense only when not wearing heavy armor)
		if (trait.requiresNoHeavyArmor && isWearingHeavyArmor(actor)) continue

		// Get adjustment value (may be a function of level)
		const value = typeof trait.adjustmentValue === 'function'
			? trait.adjustmentValue(level)
			: trait.adjustmentValue

		// Handle skill overrides (set value instead of add)
		if (trait.adjustmentType === 'skillOverride' && trait.adjustmentTargets) {
			for (const target of trait.adjustmentTargets) {
				// Use the lowest override value if multiple exist
				if (skillOverrides[target] === undefined || value < skillOverrides[target]) {
					skillOverrides[target] = value
				}
			}
			continue
		}

		// Only process static adjustments for additive bonuses
		if (trait.adjustmentType !== 'static') continue

		const path = trait.adjustmentTarget
		if (path) {
			adjustments[path] = (adjustments[path] || 0) + value
		}
	}

	// Attach skill overrides to the result
	adjustments._skillOverrides = skillOverrides
	return adjustments
}

/**
 * Get alignment restrictions from traits.
 * @param {Actor} actor - The actor
 * @returns {string[]|null} Array of allowed alignments, or null if no restrictions
 */
export function getAlignmentRestrictions(actor) {
	const traits = getAllActiveTraits(actor)
	let allowedAlignments = null

	for (const trait of traits) {
		if (trait.traitType === 'alignmentRestriction' && trait.allowedAlignments) {
			if (allowedAlignments === null) {
				allowedAlignments = [...trait.allowedAlignments]
			} else {
				// Intersect with existing restrictions
				allowedAlignments = allowedAlignments.filter(a => trait.allowedAlignments.includes(a))
			}
		}
	}

	return allowedAlignments
}

/**
 * Get trait roll options for a given roll type.
 * These are situational bonuses that can be toggled during rolls.
 * @param {Actor} actor - The actor
 * @param {string} rollType - The type of roll being made (e.g., 'ac', 'attack', 'abilities.charisma', 'saves.doom')
 * @returns {object[]} Array of applicable roll options
 */
export function getTraitRollOptions(actor, rollType) {
	const traits = getAllActiveTraits(actor)
	const level = actor.system.level
	const options = []

	for (const trait of traits) {
		if (trait.traitType !== 'adjustment' || trait.adjustmentType !== 'rollOption') continue

		// Check if the target matches
		let targetMatches = trait.adjustmentTarget === rollType ||
			rollType.startsWith(trait.adjustmentTarget + '.')

		// Special handling for 'saves.all' - matches any save roll
		if (!targetMatches && trait.adjustmentTarget === 'saves.all' && rollType.startsWith('saves.')) {
			targetMatches = true
		}

		// Special handling for 'attack' - matches both melee and missile
		if (!targetMatches && trait.adjustmentTarget === 'attack' && (rollType === 'attack.melee' || rollType === 'attack.missile')) {
			targetMatches = true
		}

		if (!targetMatches) continue
		if (trait.minLevel && level < trait.minLevel) continue

		const bonus = typeof trait.adjustmentValue === 'function'
			? trait.adjustmentValue(level)
			: trait.adjustmentValue

		options.push({
			id: trait.id,
			name: game.i18n.localize(trait.nameKey),
			bonus,
			condition: trait.adjustmentCondition ? game.i18n.localize(trait.adjustmentCondition) : null
		})
	}

	return options
}

/**
 * Prepare trait data for display, computing level-based values.
 * @param {Actor} actor - The actor
 * @param {object} trait - Raw trait definition
 * @param {number} level - Character level
 * @returns {object} Prepared trait with computed values
 */
function prepareTrait(actor, trait, level) {
	const prepared = {
		id: trait.id,
		name: game.i18n.localize(trait.nameKey),
		description: game.i18n.localize(trait.descKey),
		rollable: trait.rollable || false,
		rollFormula: trait.rollFormula || null,
		rollTarget: trait.rollTarget || null,
		traitType: trait.traitType || 'info',
		hideFromTraitTab: trait.hideFromTraitTab || false
	}

	// Compute level-based value if function provided
	if (trait.getValue && typeof trait.getValue === 'function') {
		prepared.value = trait.getValue(actor, level)
	} else if (trait.value) {
		prepared.value = trait.value
	}

	// Compute level-based damage for rollable traits
	if (trait.getDamage && typeof trait.getDamage === 'function') {
		prepared.rollFormula = trait.getDamage(level)
	}

	// Natural weapon traits: resolve damage from progression data and show as value badge
	if (trait.traitType === 'naturalWeapon') {
		prepared.isNaturalWeapon = true
		const damage = resolveDamageProgression(trait.damageProgression, level)
		if (damage) {
			prepared.rollFormula = damage
			prepared.value = damage
		}
	}

	// Check minimum level requirement
	if (trait.minLevel && level < trait.minLevel) {
		prepared.locked = true
		prepared.minLevel = trait.minLevel
	}

	// Handle active traits with usage tracking
	if (trait.traitType === 'active' && (trait.maxUses || trait.getMaxUses)) {
		const maxUses = trait.getMaxUses ? trait.getMaxUses(level) : trait.maxUses
		const usageData = actor.system.traitUsage?.[trait.id] || { used: 0 }

		prepared.hasUsageTracking = true
		prepared.maxUses = maxUses
		prepared.usedCount = usageData.used || 0
		prepared.usesRemaining = maxUses - prepared.usedCount
		prepared.usageFrequency = trait.usageFrequency ? game.i18n.localize(trait.usageFrequency) : null

		// Create array for checkbox rendering
		prepared.usageCheckboxes = []
		for (let i = 0; i < maxUses; i++) {
			prepared.usageCheckboxes.push({
				index: i,
				checked: i < prepared.usedCount
			})
		}
	}

	// Handle info-type adjustments that need manual reminder
	if (trait.traitType === 'adjustment' && trait.adjustmentType === 'info') {
		prepared.isInfoReminder = true
		prepared.adjustmentCondition = trait.adjustmentCondition
			? game.i18n.localize(trait.adjustmentCondition)
			: null
	}

	// Handle roll-option adjustments
	if (trait.traitType === 'adjustment' && trait.adjustmentType === 'rollOption') {
		prepared.isRollOption = true
		prepared.adjustmentCondition = trait.adjustmentCondition
			? game.i18n.localize(trait.adjustmentCondition)
			: null
	}

	return prepared
}

/**
 * Flatten trait categories into a single array.
 * Filters out traits marked as hidden from the trait tab.
 * @param {Actor} actor - The actor
 * @param {object} traitDef - Trait definition with categories (active, passive, info, restrictions)
 * @param {number} level - Character level
 * @returns {object[]} Array of prepared traits
 */
function flattenTraits(actor, traitDef, level) {
	const traits = []
	const categories = ['active', 'passive', 'info', 'restrictions']

	for (const category of categories) {
		if (Array.isArray(traitDef[category])) {
			for (const trait of traitDef[category]) {
				// Skip traits marked as hidden from the trait tab
				if (trait.hideFromTraitTab === true) continue
				// Skip parent traits with requiresSelection (rendered as custom sections)
				if (trait.requiresSelection) continue

				const prepared = prepareTrait(actor, trait, level)
				// Skip traits locked behind a higher level
				if (prepared.locked) continue
				prepared.category = category
				traits.push(prepared)
			}
		}
	}

	return traits
}

/**
 * Prepare kindred traits for display.
 * @param {Actor} actor - The actor
 * @returns {object[]} Array of prepared kindred traits
 */
export function prepareKindredTraits(actor) {
	const kindredItem = actor.items.find(i => i.type === 'Kindred')
	const level = actor.system.level
	const traitDef = kindredItem?.system?.traits

	if (!traitDef) return []
	return flattenTraits(actor, traitDef, level)
}

/**
 * Prepare class traits for display.
 * @param {Actor} actor - The actor
 * @returns {object[]} Array of prepared class traits
 */
export function prepareClassTraits(actor) {
	const classItem = actor.items.find(i => i.type === 'Class')
	const level = actor.system.level
	const traitDef = classItem?.system?.traits

	if (!traitDef) return []
	return flattenTraits(actor, traitDef, level)
}

/**
 * Prepare kindred-class traits for display.
 * @param {Actor} actor - The actor
 * @returns {object[]} Array of prepared kindred-class traits
 */
export function prepareKindredClassTraits(actor) {
	const classItem = actor.items.find(i => i.type === 'Class')
	const level = actor.system.level
	// For kindred-classes, the class item contains both kindred and class traits
	const traitDef = classItem?.system?.traits

	if (!traitDef) return []
	return flattenTraits(actor, traitDef, level)
}

/**
 * Build custom sections (combat talents, holy orders, etc.) from trait metadata.
 * Finds all traits with requiresSelection in the class item and builds UI data.
 * @param {Actor} actor - The actor
 * @returns {object[]} Array of section objects for template rendering
 */
export function buildCustomSections(actor) {
	const classItem = actor.items.find(i => i.type === 'Class')
	if (!classItem?.system?.traits) return []

	const level = actor.system.level
	const sections = []

	// Find all parent traits with requiresSelection
	const allTraits = flattenTraitObject(classItem.system.traits)
	for (const parent of allTraits) {
		if (!parent.requiresSelection) continue

		const fieldName = parent.requiresSelection
		const isMulti = parent.selectionType === 'multi'
		const unlockLevels = parent.unlockLevels || []

		// For single-select: skip if level < first unlock level
		if (!isMulti && unlockLevels.length > 0 && level < unlockLevels[0]) continue

		// Build choices from child traits with matching parentTrait
		const childTraits = allTraits.filter(t => t.parentTrait === fieldName)
		const choices = { '': ' ' }
		for (const child of childTraits) {
			choices[child.id] = game.i18n.localize(child.nameKey)
		}

		// Build slots array
		const slots = []
		if (isMulti) {
			const selections = actor.system[fieldName] || []
			for (let i = 0; i < selections.length; i++) {
				const selectedId = selections[i]
				const child = childTraits.find(t => t.id === selectedId)
				slots.push({
					index: i,
					selected: selectedId,
					description: child ? game.i18n.localize(child.descKey) : ''
				})
			}
		} else {
			const selectedId = actor.system[fieldName] || ''
			const child = childTraits.find(t => t.id === selectedId)
			slots.push({
				selected: selectedId,
				description: child ? game.i18n.localize(child.descKey) : ''
			})
		}

		// Determine if hint should show
		const showHint = isMulti && slots.length < unlockLevels.length

		sections.push({
			name: game.i18n.localize(parent.nameKey),
			fieldName,
			isMulti,
			choices,
			slots,
			showHint,
			hintKey: parent.hintKey || ''
		})
	}

	return sections
}
