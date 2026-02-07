/* global game, ui, Roll, ChatMessage, CONST */
/**
 * Attack Roll Handlers
 * All melee/missile attack flows, context menu attacks, and roll utilities.
 * Functions receive the sheet instance as the first parameter.
 */

import { createContextMenu } from './context-menu.js'
import { computeAdjustedValues } from './data-context.js'
import { getAllActiveTraits } from './trait-helpers.js'

/* -------------------------------------------- */
/*  Weapon Helpers                              */
/* -------------------------------------------- */

/**
 * Build HTML for weapon selection menu items.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Array of weapons
 * @returns {string} HTML string
 */
export function buildWeaponMenuHtml(sheet, weapons) {
	return weapons.map(w => {
		const proficient = isWeaponProficient(sheet, w)
		const penaltyLabel = proficient ? '' : ' <span class="weapon-penalty">(-4)</span>'
		const nonprofClass = proficient ? '' : ' nonproficient'
		return `
		<div class="weapon-menu-item${nonprofClass}" data-weapon-id="${w.id}" data-proficient="${proficient}">
			<img src="${w.img}" alt="${w.name}" class="weapon-icon">
			<span class="weapon-name">${w.name}${penaltyLabel}</span>
			<span class="weapon-damage">${w.system.damage}</span>
		</div>
	`
	}).join('')
}

/**
 * Check if the current character is proficient with a weapon.
 * Non-proficient weapons incur a -4 attack penalty.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - The weapon item
 * @returns {boolean} True if proficient
 */
export function isWeaponProficient(sheet, weapon) {
	const cls = sheet.actor.system.class
	if (!cls) return true

	// Knight: no missile weapons
	if (cls === 'knight' && weapon.system.qualities?.includes('missile')) {
		return false
	}

	// Classes restricted to specific weapon types (by weaponType field)
	const restrictedTypes = {
		magician: ['dagger', 'staff', 'holyWater', 'oil', 'torch'],
		friar: ['club', 'dagger', 'holyWater', 'oil', 'sling', 'staff', 'torch']
	}
	if (restrictedTypes[cls]) {
		const wType = weapon.system.weaponType
		if (wType && !restrictedTypes[cls].includes(wType)) return false
	}

	// Classes restricted to small/medium weapons (no large)
	const sizeRestrictedClasses = new Set([
		'bard', 'enchanter', 'thief', 'grimalkin', 'mossling', 'woodgrue'
	])
	if (sizeRestrictedClasses.has(cls) && weapon.system.size === 'large') {
		return false
	}

	return true
}

/**
 * Get equipped weapons that have a specific quality.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} quality - The weapon quality to filter by ('melee' or 'missile')
 * @returns {Item[]} Array of equipped weapons with the specified quality
 */
export function getEquippedWeaponsByQuality(sheet, quality) {
	return sheet.actor.items.filter(item =>
		item.type === 'Weapon' &&
		item.system.equipped &&
		item.system.qualities?.includes(quality)
	)
}

/**
 * Create a pseudo-weapon object for unarmed attacks.
 * @param {DolmenSheet} sheet - The sheet instance
 * @returns {object} Unarmed weapon-like object
 */
export function createUnarmedWeapon(sheet) {
	const strMod = computeAdjustedValues(sheet.actor).abilities.strength.mod
	const modStr = strMod >= 0 ? ` + ${strMod}` : ` - ${Math.abs(strMod)}`
	return {
		id: 'unarmed',
		name: game.i18n.localize('DOLMEN.Attack.Unarmed'),
		img: 'icons/skills/melee/unarmed-punch-fist.webp',
		system: {
			damage: `1d2${modStr}`,
			size: 'small',
			qualities: ['melee']
		}
	}
}

/* -------------------------------------------- */
/*  Attack Modifiers                            */
/* -------------------------------------------- */

/**
 * Get attack modifiers for a given attack type.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} attackType - Either 'melee' or 'missile'
 * @returns {object} Object containing attackMod, abilityMod, traitMod, and totalMod
 */
export function getAttackModifiers(sheet, attackType) {
	const adjusted = computeAdjustedValues(sheet.actor)
	const attackMod = adjusted.attack || 0
	const abilityMod = attackType === 'melee'
		? adjusted.abilities.strength.mod
		: adjusted.abilities.dexterity.mod
	// Include type-specific trait bonuses (e.g., Hunter's missile bonus)
	const traitMod = attackType === 'melee'
		? (adjusted.attackMelee || 0)
		: (adjusted.attackMissile || 0)
	return {
		attackMod,
		abilityMod,
		traitMod,
		totalMod: attackMod + abilityMod + traitMod
	}
}

/**
 * Build the attack roll formula string.
 * @param {number} totalMod - Total modifier to apply
 * @returns {string} Roll formula like "1d20 + 3" or "1d20 - 1"
 */
export function buildAttackFormula(totalMod) {
	return totalMod >= 0 ? `1d20 + ${totalMod}` : `1d20 - ${Math.abs(totalMod)}`
}

/**
 * Get critical/fumble state from an attack roll.
 * @param {Roll} attackRoll - The evaluated attack roll
 * @returns {object} Object with resultClass and resultLabel
 */
export function getAttackResultState(attackRoll) {
	const d20Result = attackRoll.dice[0].results[0].result
	if (d20Result === 20) {
		return {
			resultClass: 'critical',
			resultLabel: `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Critical')}</span>`
		}
	} else if (d20Result === 1) {
		return {
			resultClass: 'fumble',
			resultLabel: `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Fumble')}</span>`
		}
	}
	return { resultClass: '', resultLabel: '' }
}

/**
 * Build chat message HTML for attack rolls.
 * @param {object} config - Configuration object
 * @param {Item} config.weapon - The weapon used
 * @param {string} config.attackType - 'melee' or 'missile'
 * @param {object} [config.attack] - Attack roll data
 * @param {object} [config.damage] - Damage roll data
 * @returns {string} HTML content for the chat message
 */
export function buildAttackChatHtml({ weapon, attackType, attack, damage }) {
	const attackTypeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)

	// Build badges: single trait name (legacy) or multiple modifier names (new melee flow)
	let badges = ''
	if (attack?.modifierNames?.length > 0) {
		badges = attack.modifierNames.map(n => `<span class="trait-badge">${n}</span>`).join('')
	} else if (attack?.traitName) {
		badges = `<span class="trait-badge">${attack.traitName}</span>`
	}

	// Attack mode name badge (Charge, Push)
	const attackModeBadge = attack?.attackModeName
		? `<span class="trait-badge">${attack.attackModeName}</span>`
		: ''

	let rollSections = ''
	if (attack) {
		rollSections += `
			<div class="roll-section attack-section ${attack.resultClass}">
				<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
				<div class="roll-result">
					${attack.anchor.outerHTML}
					${attack.resultLabel}
				</div>
				<span class="roll-breakdown">${attack.formula}</span>
			</div>`
	}
	if (damage) {
		rollSections += `
			<div class="roll-section damage-section">
				<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
				<div class="roll-result">
					${damage.anchor.outerHTML}
				</div>
				<span class="roll-breakdown">${damage.formula}</span>
			</div>`
	}

	// Special text (e.g., Push save info)
	const specialSection = attack?.specialText
		? `<div class="roll-section special-section"><span class="roll-breakdown">${attack.specialText}</span></div>`
		: ''

	return `
		<div class="dolmen attack-roll">
			<div class="attack-header">
				<img src="${weapon.img}" alt="${weapon.name}" class="weapon-icon">
				<div class="attack-info">
					<h3>${weapon.name}${attackModeBadge}${badges}</h3>
					<span class="attack-type">${attackTypeName}</span>
				</div>
			</div>
			<div class="roll-results">${rollSections}${specialSection}</div>
		</div>
	`
}

/**
 * Unified attack roll method supporting attack-only, damage-only, or both.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item} weapon - The weapon to use
 * @param {string} attackType - Either 'melee' or 'missile'
 * @param {object} [options] - Roll options
 */
export async function performAttackRoll(sheet, weapon, attackType, {
	attackOnly = false, damageOnly = false,
	traitBonus = 0, traitName = null,
	totalAttackMod = null, damageFormula = null,
	modifierNames = null, attackModeName = null, specialText = null
} = {}) {
	const rolls = []
	let attackData = null
	let damageData = null

	// Handle attack roll
	if (!damageOnly) {
		let finalMod
		if (totalAttackMod !== null) {
			finalMod = totalAttackMod
		} else {
			const { totalMod } = getAttackModifiers(sheet, attackType)
			finalMod = totalMod + traitBonus
		}
		const formula = buildAttackFormula(finalMod)
		const roll = new Roll(formula)
		await roll.evaluate()
		rolls.push(roll)

		const { resultClass, resultLabel } = getAttackResultState(roll)
		attackData = {
			anchor: await roll.toAnchor({ classes: ['attack-inline-roll'] }),
			formula,
			resultClass,
			resultLabel,
			traitName,
			modifierNames,
			attackModeName,
			specialText
		}
	}

	// Handle damage roll
	if (!attackOnly) {
		const formula = damageFormula || weapon.system.damage
		const roll = new Roll(formula)
		await roll.evaluate()
		rolls.push(roll)

		damageData = {
			anchor: await roll.toAnchor({ classes: ['damage-inline-roll'] }),
			formula
		}
	}

	// Build and send chat message
	const chatContent = buildAttackChatHtml({
		weapon,
		attackType,
		attack: attackData,
		damage: damageData
	})

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: chatContent,
		rolls,
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Perform a full attack roll with a weapon (attack + damage).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item} weapon - The weapon to attack with
 * @param {string} attackType - Either 'melee' or 'missile'
 * @param {number} [traitBonus=0] - Bonus from selected trait
 * @param {string} [traitName=null] - Name of trait providing bonus
 */
export async function rollAttack(sheet, weapon, attackType, traitBonus = 0, traitName = null) {
	return performAttackRoll(sheet, weapon, attackType, { traitBonus, traitName })
}

/**
 * Perform an attack roll only (no damage).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item} weapon - The weapon to attack with
 * @param {string} attackType - Either 'melee' or 'missile'
 */
export async function rollAttackOnly(sheet, weapon, attackType) {
	return performAttackRoll(sheet, weapon, attackType, { attackOnly: true })
}

/**
 * Perform a damage roll only (no attack).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item} weapon - The weapon to roll damage for
 * @param {string} attackType - Either 'melee' or 'missile'
 */
export async function rollDamageOnly(sheet, weapon, attackType) {
	return performAttackRoll(sheet, weapon, attackType, { damageOnly: true })
}

/* -------------------------------------------- */
/*  Melee Attack Flow                           */
/* -------------------------------------------- */

/**
 * Handle click on melee attack icon. Opens the 3-step attack flow.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Event} event - The click event
 */
export function onMeleeAttackRoll(sheet, event) {
	const weapons = getEquippedWeaponsByQuality(sheet, 'melee')
	const position = {
		top: event.currentTarget.getBoundingClientRect().top,
		left: event.currentTarget.getBoundingClientRect().left
	}
	openAttackTypeMenu(sheet, weapons, position)
}

/**
 * Step 1: Open attack type selection menu (Normal / Charge / Push).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Equipped melee weapons
 * @param {object} position - Position {top, left}
 */
export function openAttackTypeMenu(sheet, weapons, position) {
	const types = [
		{ id: 'normal', icon: 'fa-swords', nameKey: 'DOLMEN.Attack.Type.Normal' },
		{ id: 'charge', icon: 'fa-horse-head', nameKey: 'DOLMEN.Attack.Type.Charge' },
		{ id: 'push', icon: 'fa-hand-fist', nameKey: 'DOLMEN.Attack.Type.Push' }
	]

	const html = types.map(t => `
		<div class="weapon-menu-item" data-attack-mode="${t.id}">
			<i class="fas ${t.icon}"></i>
			<span class="weapon-name">${game.i18n.localize(t.nameKey)}</span>
		</div>
	`).join('')

	createContextMenu(sheet, {
		html,
		position,
		onItemClick: (item, menu) => {
			const attackMode = item.dataset.attackMode
			menu.remove()

			if (attackMode === 'push') {
				const unarmed = createUnarmedWeapon(sheet)
				setTimeout(() => openModifierPanel(sheet, unarmed, attackMode, position), 0)
			} else {
				setTimeout(() => openMeleeWeaponMenu(sheet, weapons, attackMode, position), 0)
			}
		}
	})
}

/**
 * Step 2: Open weapon selection menu for melee attacks, including Unarmed option.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Equipped melee weapons
 * @param {string} attackMode - 'normal', 'charge', or 'push'
 * @param {object} position - Position {top, left}
 */
export function openMeleeWeaponMenu(sheet, weapons, attackMode, position) {
	let html = buildWeaponMenuHtml(sheet, weapons)

	// Add unarmed option (always proficient)
	const unarmedName = game.i18n.localize('DOLMEN.Attack.Unarmed')
	html += `
		<div class="weapon-menu-item" data-weapon-id="unarmed" data-proficient="true">
			<i class="fas fa-hand-fist"></i>
			<span class="weapon-name">${unarmedName}</span>
			<span class="weapon-damage">1d2</span>
		</div>
	`

	createContextMenu(sheet, {
		html,
		position,
		onItemClick: (item, menu) => {
			const weaponId = item.dataset.weaponId
			const proficient = item.dataset.proficient !== 'false'
			menu.remove()

			let weapon
			if (weaponId === 'unarmed') {
				weapon = createUnarmedWeapon(sheet)
			} else {
				weapon = sheet.actor.items.get(weaponId)
			}
			if (weapon) {
				setTimeout(() => openModifierPanel(sheet, weapon, attackMode, position, proficient), 0)
			}
		}
	})
}

/**
 * Get applicable melee attack modifiers based on character traits, talents, and weapon.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - The selected weapon
 * @returns {object[]} Array of modifier definitions
 */
export function getApplicableMeleeModifiers(sheet, weapon) {
	const modifiers = []
	const actor = sheet.actor
	const traits = getAllActiveTraits(actor)
	const hasTrait = (id) => traits.some(t => t.id === id)
	const level = actor.system.level
	const talents = actor.system.combatTalents || []
	const meleeWeaponCount = getEquippedWeaponsByQuality(sheet, 'melee').length

	// Backstab - thief class only
	if (actor.system.class === 'thief') {
		const strMod = computeAdjustedValues(actor).abilities.strength.mod
		const modStr = strMod >= 0 ? ` + ${strMod}` : ` - ${Math.abs(strMod)}`
		modifiers.push({
			id: 'backstab',
			name: game.i18n.localize('DOLMEN.Attack.Mod.Backstab'),
			attackBonus: 4,
			damageOverride: `3d4${modStr}`
		})
	}

	// Trophy - hunter has trophies trait
	if (hasTrait('trophies')) {
		modifiers.push({
			id: 'trophy',
			name: game.i18n.localize('DOLMEN.Attack.Mod.Trophy'),
			attackBonus: 1
		})
	}

	// Mounted Combat - knight trait
	if (hasTrait('mountedCombat')) {
		modifiers.push({
			id: 'mountedCombat',
			name: game.i18n.localize('DOLMEN.Traits.MountedCombat'),
			attackBonus: 1
		})
	}

	// Monster Slayer - knight trait, level 5+
	if (hasTrait('monsterSlayer') && level >= 5) {
		modifiers.push({
			id: 'monsterSlayer',
			name: game.i18n.localize('DOLMEN.Traits.MonsterSlayer'),
			attackBonus: 2,
			damageBonus: 2
		})
	}

	// St. Signis - cleric holy order
	if (actor.system.class === 'cleric' && actor.system.holyOrder === 'stSignis') {
		modifiers.push({
			id: 'stSignis',
			name: game.i18n.localize('DOLMEN.Attack.Mod.StSignis'),
			attackBonus: 1
		})
	}

	// Fighter combat talents
	if (talents.includes('battleRage')) {
		modifiers.push({
			id: 'battleRage',
			name: game.i18n.localize('DOLMEN.Traits.Talents.BattleRage'),
			attackBonus: 2,
			damageBonus: 2
		})
	}
	if (talents.includes('cleave')) {
		modifiers.push({
			id: 'cleave',
			name: game.i18n.localize('DOLMEN.Traits.Talents.Cleave'),
			attackBonus: -2
		})
	}
	if (talents.includes('mainGauche')) {
		modifiers.push({
			id: 'mainGauche',
			name: game.i18n.localize('DOLMEN.Traits.Talents.MainGauche'),
			attackBonus: 1
		})
	}
	if (talents.includes('slayer')) {
		modifiers.push({
			id: 'slayer',
			name: game.i18n.localize('DOLMEN.Traits.Talents.Slayer'),
			attackBonus: 1,
			damageBonus: 1
		})
	}
	if (talents.includes('weaponSpecialist')) {
		modifiers.push({
			id: 'weaponSpecialist',
			name: game.i18n.localize('DOLMEN.Traits.Talents.WeaponSpecialist'),
			attackBonus: 1,
			damageBonus: 1
		})
	}

	// Armor Piercing - weapon quality
	if (weapon.system.qualities?.includes('armor-piercing')) {
		modifiers.push({
			id: 'armorPiercing',
			name: game.i18n.localize('DOLMEN.Attack.Mod.ArmorPiercing'),
			attackBonus: 2
		})
	}

	// Two Weapons - requires 2+ equipped melee weapons AND STR or DEX as prime ability
	const twoWeaponClasses = new Set(['fighter', 'hunter', 'knight', 'thief', 'breggle', 'elf', 'grimalkin', 'woodgrue'])
	if (meleeWeaponCount >= 2 && twoWeaponClasses.has(actor.system.class)) {
		modifiers.push({
			id: 'twoWeaponsPrimary',
			name: game.i18n.localize('DOLMEN.Attack.Mod.TwoWeaponsPrimary'),
			attackBonus: -2
		})
		if (weapon.system.size === 'small') {
			modifiers.push({
				id: 'twoWeaponsSecondary',
				name: game.i18n.localize('DOLMEN.Attack.Mod.TwoWeaponsSecondary'),
				attackBonus: -4
			})
		}
	}

	return modifiers
}

/**
 * Step 3: Open modifier panel with ROLL button, trait toggles, and numeric modifiers.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - Selected weapon (real or unarmed)
 * @param {string} attackMode - 'normal', 'charge', or 'push'
 * @param {object} position - Position {top, left}
 * @param {boolean} [proficient=true] - Whether the character is proficient with this weapon
 */
export function openModifierPanel(sheet, weapon, attackMode, position, proficient = true) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	const modifiers = getApplicableMeleeModifiers(sheet, weapon)
	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Build HTML
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	// Modifier toggles (if any exist)
	if (modifiers.length > 0) {
		html += '<div class="menu-separator"></div>'
		for (const mod of modifiers) {
			const bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
			html += `
				<div class="modifier-item" data-mod-id="${mod.id}">
					<span class="mod-check"></span>
					<span class="mod-name">${mod.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

	// Numeric modifier grid
	html += '<div class="menu-separator"></div>'
	html += '<div class="numeric-grid">'
	for (const val of [-4, -3, -2, -1]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
	}
	for (const val of [1, 2, 3, 4]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
	}
	html += '</div>'

	// Create panel element
	const panel = document.createElement('div')
	panel.className = 'dolmen-weapon-context-menu modifier-panel'
	panel.innerHTML = html
	panel.style.position = 'fixed'
	panel.style.top = `${position.top}px`
	panel.style.left = `${position.left}px`
	sheet.element.appendChild(panel)

	// Adjust position (appear to left of click)
	const panelRect = panel.getBoundingClientRect()
	panel.style.left = `${position.left - panelRect.width - 5}px`

	// Modifier toggle behavior (multi-select)
	panel.querySelectorAll('.modifier-item').forEach(item => {
		item.addEventListener('click', () => {
			item.classList.toggle('selected')
			const check = item.querySelector('.mod-check')
			check.textContent = item.classList.contains('selected') ? '\u2713' : ''
		})
	})

	// Numeric button behavior (single-select toggle)
	panel.querySelectorAll('.numeric-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const wasSelected = btn.classList.contains('selected')
			panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
			if (!wasSelected) btn.classList.add('selected')
		})
	})

	// Close panel when clicking outside
	const closePanel = (e) => {
		if (!panel.contains(e.target)) {
			panel.remove()
			document.removeEventListener('click', closePanel)
		}
	}

	// ROLL button
	panel.querySelector('.roll-btn').addEventListener('click', () => {
		// Gather selected modifiers
		const selectedModifiers = []
		panel.querySelectorAll('.modifier-item.selected').forEach(item => {
			const mod = modifiers.find(m => m.id === item.dataset.modId)
			if (mod) selectedModifiers.push(mod)
		})

		// Gather numeric modifier
		const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
		const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0

		panel.remove()
		document.removeEventListener('click', closePanel)
		executeMeleeAttack(sheet, weapon, attackMode, selectedModifiers, numericMod, proficient)
	})

	setTimeout(() => document.addEventListener('click', closePanel), 0)
}

/**
 * Execute a melee attack with all selected options.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - The weapon (real or unarmed pseudo-weapon)
 * @param {string} attackMode - 'normal', 'charge', or 'push'
 * @param {object[]} selectedModifiers - Array of selected modifier definitions
 * @param {number} numericMod - Manual numeric modifier (-4 to +4)
 * @param {boolean} [proficient=true] - Whether the character is proficient with this weapon
 */
export async function executeMeleeAttack(sheet, weapon, attackMode, selectedModifiers, numericMod, proficient = true) {
	// Attack type bonuses
	const attackModeBonus = attackMode === 'charge' ? 2 : attackMode === 'push' ? -4 : 0
	const proficiencyPenalty = proficient ? 0 : -4
	const isPush = attackMode === 'push'

	// Sum modifier bonuses
	let modAttackBonus = 0
	let modDamageBonus = 0
	let damageOverride = null
	const modifierNames = []

	for (const mod of selectedModifiers) {
		modAttackBonus += mod.attackBonus || 0
		modDamageBonus += mod.damageBonus || 0
		if (mod.damageOverride) damageOverride = mod.damageOverride
		modifierNames.push(mod.name)
	}

	// Add numeric modifier as its own badge label
	if (numericMod !== 0) {
		modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
	}

	// Attack type name for chat
	const attackModeName = attackMode !== 'normal'
		? game.i18n.localize(`DOLMEN.Attack.Type.${attackMode.charAt(0).toUpperCase() + attackMode.slice(1)}`)
		: null

	// Compute total attack modifier
	const { totalMod } = getAttackModifiers(sheet, 'melee')
	const finalAttackMod = totalMod + attackModeBonus + modAttackBonus + numericMod + proficiencyPenalty

	// Determine damage formula
	let damageFormula
	if (damageOverride) {
		damageFormula = damageOverride
	} else {
		damageFormula = weapon.system.damage
		if (modDamageBonus !== 0) {
			damageFormula = modDamageBonus > 0
				? `${damageFormula} + ${modDamageBonus}`
				: `${damageFormula} - ${Math.abs(modDamageBonus)}`
		}
	}

	// Special text for push
	const specialText = isPush ? game.i18n.localize('DOLMEN.Attack.PushEffect') : null

	await performAttackRoll(sheet, weapon, 'melee', {
		attackOnly: isPush,
		totalAttackMod: finalAttackMod,
		damageFormula,
		modifierNames,
		attackModeName,
		specialText
	})
}

/* -------------------------------------------- */
/*  Missile Attack Flow                         */
/* -------------------------------------------- */

/**
 * Handle click on missile attack icon. Opens weapon select → modifier panel.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Event} event - The click event
 */
export function onMissileAttackRoll(sheet, event) {
	const weapons = getEquippedWeaponsByQuality(sheet, 'missile')

	if (weapons.length === 0) {
		const typeName = game.i18n.localize('DOLMEN.Item.Quality.missile')
		ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
		return
	}

	const position = {
		top: event.currentTarget.getBoundingClientRect().top,
		left: event.currentTarget.getBoundingClientRect().left
	}

	if (weapons.length === 1 && isWeaponProficient(sheet, weapons[0])) {
		openMissileModifierPanel(sheet, weapons[0], position, true)
	} else {
		openMissileWeaponMenu(sheet, weapons, position)
	}
}

/**
 * Open weapon selection menu for missile attacks, then modifier panel.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Equipped missile weapons
 * @param {object} position - Position {top, left}
 */
export function openMissileWeaponMenu(sheet, weapons, position) {
	createContextMenu(sheet, {
		html: buildWeaponMenuHtml(sheet, weapons),
		position,
		onItemClick: (item, menu) => {
			const weapon = sheet.actor.items.get(item.dataset.weaponId)
			const proficient = item.dataset.proficient !== 'false'
			menu.remove()
			if (weapon) {
				setTimeout(() => openMissileModifierPanel(sheet, weapon, position, proficient), 0)
			}
		}
	})
}

/**
 * Get applicable missile attack modifiers based on character traits, talents, and weapon.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - The selected weapon
 * @returns {object[]} Array of modifier definitions
 */
export function getApplicableMissileModifiers(sheet, weapon) {
	const modifiers = []
	const actor = sheet.actor
	const traits = getAllActiveTraits(actor)
	const hasTrait = (id) => traits.some(t => t.id === id)
	const level = actor.system.level
	const talents = actor.system.combatTalents || []

	// Trophy - hunter has trophies trait
	if (hasTrait('trophies')) {
		modifiers.push({
			id: 'trophy',
			name: game.i18n.localize('DOLMEN.Attack.Mod.Trophy'),
			attackBonus: 1
		})
	}

	// Monster Slayer - knight trait, level 5+
	if (hasTrait('monsterSlayer') && level >= 5) {
		modifiers.push({
			id: 'monsterSlayer',
			name: game.i18n.localize('DOLMEN.Traits.MonsterSlayer'),
			attackBonus: 2,
			damageBonus: 2
		})
	}

	// Fighter combat talents (applicable to missile)
	if (talents.includes('weaponSpecialist')) {
		modifiers.push({
			id: 'weaponSpecialist',
			name: game.i18n.localize('DOLMEN.Traits.Talents.WeaponSpecialist'),
			attackBonus: 1,
			damageBonus: 1
		})
	}
	if (talents.includes('slayer')) {
		modifiers.push({
			id: 'slayer',
			name: game.i18n.localize('DOLMEN.Traits.Talents.Slayer'),
			attackBonus: 1,
			damageBonus: 1
		})
	}

	// Armor Piercing - weapon quality
	if (weapon.system.qualities?.includes('armor-piercing')) {
		modifiers.push({
			id: 'armorPiercing',
			name: game.i18n.localize('DOLMEN.Attack.Mod.ArmorPiercing'),
			attackBonus: 2
		})
	}

	return modifiers
}

/**
 * Open modifier panel for missile attacks.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - Selected missile weapon
 * @param {object} position - Position {top, left}
 * @param {boolean} proficient - Whether the character is proficient with this weapon
 */
export function openMissileModifierPanel(sheet, weapon, position, proficient = true) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	const modifiers = getApplicableMissileModifiers(sheet, weapon)
	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Build HTML
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	// Modifier toggles
	if (modifiers.length > 0) {
		html += '<div class="menu-separator"></div>'
		for (const mod of modifiers) {
			const bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
			html += `
				<div class="modifier-item" data-mod-id="${mod.id}">
					<span class="mod-check"></span>
					<span class="mod-name">${mod.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

	// Numeric modifier grid
	html += '<div class="menu-separator"></div>'
	html += '<div class="numeric-grid">'
	for (const val of [-4, -3, -2, -1]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
	}
	for (const val of [1, 2, 3, 4]) {
		html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
	}
	html += '</div>'

	// Create panel element
	const panel = document.createElement('div')
	panel.className = 'dolmen-weapon-context-menu modifier-panel'
	panel.innerHTML = html
	panel.style.position = 'fixed'
	panel.style.top = `${position.top}px`
	panel.style.left = `${position.left}px`
	sheet.element.appendChild(panel)

	// Adjust position (appear to left of click)
	const panelRect = panel.getBoundingClientRect()
	panel.style.left = `${position.left - panelRect.width - 5}px`

	// Modifier toggle behavior (multi-select)
	panel.querySelectorAll('.modifier-item').forEach(item => {
		item.addEventListener('click', () => {
			item.classList.toggle('selected')
			const check = item.querySelector('.mod-check')
			check.textContent = item.classList.contains('selected') ? '\u2713' : ''
		})
	})

	// Numeric button behavior (single-select toggle)
	panel.querySelectorAll('.numeric-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const wasSelected = btn.classList.contains('selected')
			panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
			if (!wasSelected) btn.classList.add('selected')
		})
	})

	// Close panel when clicking outside
	const closePanel = (e) => {
		if (!panel.contains(e.target)) {
			panel.remove()
			document.removeEventListener('click', closePanel)
		}
	}

	// ROLL button
	panel.querySelector('.roll-btn').addEventListener('click', () => {
		const selectedModifiers = []
		panel.querySelectorAll('.modifier-item.selected').forEach(item => {
			const mod = modifiers.find(m => m.id === item.dataset.modId)
			if (mod) selectedModifiers.push(mod)
		})

		const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
		const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0

		panel.remove()
		document.removeEventListener('click', closePanel)
		executeMissileAttack(sheet, weapon, selectedModifiers, numericMod, proficient)
	})

	setTimeout(() => document.addEventListener('click', closePanel), 0)
}

/**
 * Execute a missile attack with all selected options.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {object} weapon - The missile weapon
 * @param {object[]} selectedModifiers - Array of selected modifier definitions
 * @param {number} numericMod - Manual numeric modifier (-4 to +4)
 * @param {boolean} proficient - Whether the character is proficient with this weapon
 */
export async function executeMissileAttack(sheet, weapon, selectedModifiers, numericMod, proficient = true) {
	let modAttackBonus = 0
	let modDamageBonus = 0
	const modifierNames = []

	// Apply proficiency penalty
	const proficiencyPenalty = proficient ? 0 : -4
	modAttackBonus += proficiencyPenalty

	for (const mod of selectedModifiers) {
		modAttackBonus += mod.attackBonus || 0
		modDamageBonus += mod.damageBonus || 0
		modifierNames.push(mod.name)
	}

	// Add numeric modifier as its own badge label
	if (numericMod !== 0) {
		modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
	}

	// Compute total attack modifier
	const { totalMod } = getAttackModifiers(sheet, 'missile')
	const finalAttackMod = totalMod + modAttackBonus + numericMod

	// Determine damage formula
	let damageFormula = weapon.system.damage
	if (modDamageBonus !== 0) {
		damageFormula = modDamageBonus > 0
			? `${damageFormula} + ${modDamageBonus}`
			: `${damageFormula} - ${Math.abs(modDamageBonus)}`
	}

	await performAttackRoll(sheet, weapon, 'missile', {
		totalAttackMod: finalAttackMod,
		damageFormula,
		modifierNames
	})
}

/* -------------------------------------------- */
/*  Context Menu Attacks                        */
/* -------------------------------------------- */

/**
 * Handle right-click on melee or missile attack icons.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} attackType - Either 'melee' or 'missile'
 * @param {Event} event - The contextmenu event
 */
export function onAttackRollContextMenu(sheet, attackType, event) {
	const weapons = getEquippedWeaponsByQuality(sheet, attackType)

	if (weapons.length === 0) {
		const typeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
		ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
		return
	}

	const iconRect = event.currentTarget.getBoundingClientRect()
	const position = { top: iconRect.top, left: iconRect.left }

	openRollTypeContextMenu(sheet, weapons, attackType, position)
}

/**
 * Open a context menu to choose roll type (attack only or damage only).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Array of weapons to potentially roll with
 * @param {string} attackType - Either 'melee' or 'missile'
 * @param {object} position - Position object with top and left properties
 */
export function openRollTypeContextMenu(sheet, weapons, attackType, position) {
	const attackOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollAttackOnly')
	const damageOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollDamageOnly')

	const html = `
		<div class="weapon-menu-item" data-roll-type="attack">
			<i class="fas fa-dice-d20"></i>
			<span class="weapon-name">${attackOnlyLabel}</span>
		</div>
		<div class="weapon-menu-item" data-roll-type="damage">
			<i class="fas fa-burst"></i>
			<span class="weapon-name">${damageOnlyLabel}</span>
		</div>
	`

	createContextMenu(sheet, {
		html,
		position,
		onItemClick: (item, menu) => {
			const rollType = item.dataset.rollType
			menu.remove()

			if (weapons.length === 1) {
				if (rollType === 'attack') {
					rollAttackOnly(sheet, weapons[0], attackType)
				} else if (rollType === 'damage') {
					rollDamageOnly(sheet, weapons[0], attackType)
				}
			} else {
				setTimeout(() => openWeaponSelectionMenu(sheet, weapons, attackType, rollType, position), 0)
			}
		}
	})
}

/**
 * Open weapon selection menu after roll type has been chosen.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Array of available weapons
 * @param {string} attackType - Either 'melee' or 'missile'
 * @param {string} rollType - Either 'attack' or 'damage'
 * @param {object} position - Position object with top and left properties
 */
export function openWeaponSelectionMenu(sheet, weapons, attackType, rollType, position) {
	createContextMenu(sheet, {
		html: buildWeaponMenuHtml(sheet, weapons),
		position,
		onItemClick: (item, menu) => {
			const weapon = sheet.actor.items.get(item.dataset.weaponId)
			if (weapon) {
				if (rollType === 'attack') {
					rollAttackOnly(sheet, weapon, attackType)
				} else if (rollType === 'damage') {
					rollDamageOnly(sheet, weapon, attackType)
				}
			}
			menu.remove()
		}
	})
}
