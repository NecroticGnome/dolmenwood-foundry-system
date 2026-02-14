/* global game, ui, Roll, ChatMessage, CONST */
/**
 * Attack Roll Handlers
 * All melee/missile attack flows, context menu attacks, and roll utilities.
 * Functions receive the sheet instance as the first parameter.
 */

import { createContextMenu } from './context-menu.js'
import { computeAdjustedValues } from './data-context.js'
import { getAllActiveTraits, resolveDamageProgression } from './trait-helpers.js'
import { parseSaveLinks } from '../chat-save.js'
import { getWeaponTypesForGroup, WEAPON_PROF_GROUPS } from '../utils/choices.js'

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
	const classItem = sheet.actor.getClassItem()
	if (!classItem) return true

	const proficiency = classItem.system?.weaponsProficiency || []
	if (proficiency.length === 0) return false

	// Build the set of allowed weapon type IDs from the proficiency array
	const allowed = new Set()
	for (const entry of proficiency) {
		if (WEAPON_PROF_GROUPS.includes(entry)) {
			for (const id of getWeaponTypesForGroup(entry)) allowed.add(id)
		} else {
			allowed.add(entry)
		}
	}

	const wType = weapon.system.weaponType
	if (!wType) return true
	return allowed.has(wType)
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
export function createUnarmedWeapon(actor) {
	const traits = getAllActiveTraits(actor)
	const level = actor.system.level
	const naturalWeapon = traits.find(t => t.traitType === 'naturalWeapon' && t.damageProgression)
	if (naturalWeapon) {
		const damage = resolveDamageProgression(naturalWeapon.damageProgression, level)
		if (damage) {
			return {
				id: 'unarmed',
				name: game.i18n.localize(naturalWeapon.nameKey),
				img: naturalWeapon.iconPath || 'systems/dolmenwood/assets/icons/punch.svg',
				system: {
					damage,
					size: 'small',
					qualities: ['melee']
				}
			}
		}
	}
	return {
		id: 'unarmed',
		name: game.i18n.localize('DOLMEN.Attack.Unarmed'),
		img: 'systems/dolmenwood/assets/icons/punch.svg',
		system: {
			damage: '1d2',
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

export function getDieIconFromFormula(formula) {
	const dieMatch = formula.match(/(\d*)d(\d+)/)
	if (dieMatch) {
		const dieSize = dieMatch[2]
		return `force-d${dieSize}-icon`
	}
	return ''
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

	const iconClass = getDieIconFromFormula(damage?.formula || weapon.system.damage)

	// Attack mode name badge (Charge, Push)
	const attackModeBadge = attack?.attackModeName
		? `<span class="trait-badge">${attack.attackModeName}</span>`
		: ''

	let rollSections = ''
	if (attack) {
		rollSections += `
			<div class="roll-section attack-section">
				<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
				<div class="roll-result">
					${attack.anchor.outerHTML}
				</div>
				<span class="roll-breakdown">${attack.formula}</span>
			</div>`
	}
	if (damage) {
		const weaponQualities = weapon.system.qualities || []
		const qualitiesAttr = weaponQualities.length > 0
			? ` data-weapon-qualities="${weaponQualities.join(',')}"`
			: ''
		rollSections += `
			<div class="roll-section damage-section"${qualitiesAttr}>
				<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
				<div class="roll-result ${iconClass}">
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
async function performAttackRoll(sheet, weapon, attackType, {
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

		attackData = {
			anchor: await roll.toAnchor({ classes: ['attack-inline-roll'] }),
			formula,
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
		// Enforce minimum 1 damage
		if (roll.total < 1) roll._total = 1
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
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 */
export function openAttackTypeMenu(sheet, weapons, position, rollType = null) {
	const types = [
		{ id: 'normal', icon: 'fa-sword', nameKey: 'DOLMEN.Attack.Type.Normal' },
		{ id: 'charge', icon: 'fa-person-running-fast', nameKey: 'DOLMEN.Attack.Type.Charge' },
		{ id: 'push', icon: 'fa-hand-wave', nameKey: 'DOLMEN.Attack.Type.Push' }
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
				const unarmed = createUnarmedWeapon(sheet.actor)
				setTimeout(() => openModifierPanel(sheet, unarmed, attackMode, position, true, rollType), 0)
			} else {
				setTimeout(() => openMeleeWeaponMenu(sheet, weapons, attackMode, position, rollType), 0)
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 */
export function openMeleeWeaponMenu(sheet, weapons, attackMode, position, rollType = null) {
	let html = buildWeaponMenuHtml(sheet, weapons)

	// Add unarmed option (always proficient)
	const unarmed = createUnarmedWeapon(sheet.actor)
	const unarmedIcon = unarmed.img !== 'systems/dolmenwood/assets/icons/punch.svg'
		? `<img src="${unarmed.img}" alt="${unarmed.name}" class="weapon-icon">`
		: '<i class="fas fa-hand-fist"></i>'
	html += `
		<div class="weapon-menu-item" data-weapon-id="unarmed" data-proficient="true">
			${unarmedIcon}
			<span class="weapon-name">${unarmed.name}</span>
			<span class="weapon-damage">${unarmed.system.damage}</span>
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
				weapon = unarmed
			} else {
				weapon = sheet.actor.items.get(weaponId)
			}
			if (weapon) {
				setTimeout(() => openModifierPanel(sheet, weapon, attackMode, position, proficient, rollType), 0)
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
	const classItem = actor.getClassItem()
	const traits = getAllActiveTraits(actor)
	const level = actor.system.level
	const meleeWeaponCount = getEquippedWeaponsByQuality(sheet, 'melee').length

	// Backstab - available if class has backstab feature
	if (classItem?.system?.hasBackstab) {
		const strMod = computeAdjustedValues(actor).abilities.strength.mod
		const modStr = strMod >= 0 ? ` + ${strMod}` : ` - ${Math.abs(strMod)}`
		modifiers.push({
			id: 'backstab',
			name: game.i18n.localize('DOLMEN.Attack.Mod.Backstab'),
			attackBonus: 4,
			damageOverride: `3d4${modStr}`
		})
	}

	// Attack modifiers from rollOption traits
	for (const trait of traits) {
		if (trait.adjustmentType !== 'rollOption') continue
		const target = trait.adjustmentTarget
		if (target !== 'attack' && target !== 'attack.melee') continue
		if (trait.minLevel && level < trait.minLevel) continue
		const attackBonus = typeof trait.adjustmentValue === 'function'
			? trait.adjustmentValue(level) : trait.adjustmentValue
		modifiers.push({
			id: trait.id,
			name: game.i18n.localize(trait.nameKey),
			attackBonus,
			damageBonus: trait.damageValue || 0
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

	// Two Weapons - requires 2+ equipped melee weapons and class ability
	if (meleeWeaponCount >= 2 && classItem?.system?.canTwoWeaponFight) {
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 */
export function openModifierPanel(sheet, weapon, attackMode, position, proficient = true, rollType = null) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	const isDamageOnly = rollType === 'damage'
	const allModifiers = getApplicableMeleeModifiers(sheet, weapon)
	const modifiers = isDamageOnly
		? allModifiers.filter(m => m.damageBonus || m.damageOverride)
		: allModifiers
	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Build HTML
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	// Modifier toggles (if any exist)
	if (modifiers.length > 0) {
		html += '<div class="menu-separator"></div>'
		for (const mod of modifiers) {
			let bonusStr
			if (isDamageOnly) {
				bonusStr = mod.damageOverride || (mod.damageBonus >= 0 ? `+${mod.damageBonus}` : `${mod.damageBonus}`)
			} else {
				bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
			}
			html += `
				<div class="modifier-item" data-mod-id="${mod.id}">
					<span class="mod-check"></span>
					<span class="mod-name">${mod.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

	// Numeric modifier grid (not shown for damage-only)
	if (!isDamageOnly) {
		html += '<div class="menu-separator"></div>'
		html += '<div class="numeric-grid">'
		for (const val of [-4, -3, -2, -1]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
		}
		for (const val of [1, 2, 3, 4]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
		}
		html += '</div>'
	}

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
		executeMeleeAttack(sheet, weapon, attackMode, selectedModifiers, numericMod, proficient, rollType)
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 */
async function executeMeleeAttack(sheet, weapon, attackMode, selectedModifiers, numericMod, proficient = true, rollType = null) {
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

	// Determine damage formula (melee adds STR modifier; damageOverride already includes STR)
	let damageFormula
	if (damageOverride) {
		damageFormula = damageOverride
	} else {
		damageFormula = weapon.system.damage
		const strMod = computeAdjustedValues(sheet.actor).abilities.strength.mod
		if (strMod !== 0) {
			damageFormula = strMod > 0
				? `${damageFormula} + ${strMod}`
				: `${damageFormula} - ${Math.abs(strMod)}`
		}
		if (modDamageBonus !== 0) {
			damageFormula = modDamageBonus > 0
				? `${damageFormula} + ${modDamageBonus}`
				: `${damageFormula} - ${Math.abs(modDamageBonus)}`
		}
	}

	// Special text for push (interactive save link)
	const specialText = isPush
		? parseSaveLinks(`[${game.i18n.localize('DOLMEN.Attack.PushEffect')}](save:hold)`)
		: null

	await performAttackRoll(sheet, weapon, 'melee', {
		attackOnly: isPush || rollType === 'attack',
		damageOnly: !isPush && rollType === 'damage',
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

	openMissileRangeMenu(sheet, weapons, position)
}

/**
 * Open range selection menu for missile attacks (Close / Medium / Long).
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Equipped missile weapons
 * @param {object} position - Position {top, left}
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 */
export function openMissileRangeMenu(sheet, weapons, position, rollType = null) {
	const ranges = [
		{ id: 'close', mod: 1, nameKey: 'DOLMEN.Attack.Range.Close', icon: 'fa-grid-2' },
		{ id: 'medium', mod: 0, nameKey: 'DOLMEN.Attack.Range.Medium', icon: 'fa-grid' },
		{ id: 'long', mod: -1, nameKey: 'DOLMEN.Attack.Range.Long', icon: 'fa-grid-4' }
	]

	const html = ranges.map(r => {
		const modStr = r.mod > 0 ? `(+${r.mod})` : r.mod === 0 ? '(0)' : `(${r.mod})`
		return `
		<div class="weapon-menu-item" data-range-mod="${r.mod}" data-range-name="${game.i18n.localize(r.nameKey)}">
			<i class="fas ${r.icon}"></i>
			<span class="weapon-name">${game.i18n.localize(r.nameKey)}</span>
			<span class="weapon-damage">${modStr}</span>
		</div>
	`
	}).join('')

	createContextMenu(sheet, {
		html,
		position,
		onItemClick: (item, menu) => {
			const rangeMod = parseInt(item.dataset.rangeMod)
			const rangeName = item.dataset.rangeName
			menu.remove()

			if (weapons.length === 1 && isWeaponProficient(sheet, weapons[0])) {
				setTimeout(() => openMissileModifierPanel(sheet, weapons[0], position, true, rollType, rangeMod, rangeName), 0)
			} else {
				setTimeout(() => openMissileWeaponMenu(sheet, weapons, position, rollType, rangeMod, rangeName), 0)
			}
		}
	})
}

/**
 * Open weapon selection menu for missile attacks, then modifier panel.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {Item[]} weapons - Equipped missile weapons
 * @param {object} position - Position {top, left}
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 * @param {number} [rangeMod=0] - Range modifier to attack
 * @param {string|null} [rangeName=null] - Range name for chat badge
 */
export function openMissileWeaponMenu(sheet, weapons, position, rollType = null, rangeMod = 0, rangeName = null) {
	createContextMenu(sheet, {
		html: buildWeaponMenuHtml(sheet, weapons),
		position,
		onItemClick: (item, menu) => {
			const weapon = sheet.actor.items.get(item.dataset.weaponId)
			const proficient = item.dataset.proficient !== 'false'
			menu.remove()
			if (weapon) {
				setTimeout(() => openMissileModifierPanel(sheet, weapon, position, proficient, rollType, rangeMod, rangeName), 0)
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
	const level = actor.system.level

	// Attack modifiers from rollOption traits
	for (const trait of traits) {
		if (trait.adjustmentType !== 'rollOption') continue
		const target = trait.adjustmentTarget
		if (target !== 'attack' && target !== 'attack.missile') continue
		if (trait.minLevel && level < trait.minLevel) continue
		const attackBonus = typeof trait.adjustmentValue === 'function'
			? trait.adjustmentValue(level) : trait.adjustmentValue
		modifiers.push({
			id: trait.id,
			name: game.i18n.localize(trait.nameKey),
			attackBonus,
			damageBonus: trait.damageValue || 0
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 * @param {number} [rangeMod=0] - Range modifier to attack
 * @param {string|null} [rangeName=null] - Range name for chat badge
 */
export function openMissileModifierPanel(sheet, weapon, position, proficient = true, rollType = null, rangeMod = 0, rangeName = null) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	const isDamageOnly = rollType === 'damage'
	const allModifiers = getApplicableMissileModifiers(sheet, weapon)
	const modifiers = isDamageOnly
		? allModifiers.filter(m => m.damageBonus || m.damageOverride)
		: allModifiers
	const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

	// Build HTML
	let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`

	// Modifier toggles
	if (modifiers.length > 0) {
		html += '<div class="menu-separator"></div>'
		for (const mod of modifiers) {
			let bonusStr
			if (isDamageOnly) {
				bonusStr = mod.damageOverride || (mod.damageBonus >= 0 ? `+${mod.damageBonus}` : `${mod.damageBonus}`)
			} else {
				bonusStr = mod.attackBonus >= 0 ? `+${mod.attackBonus}` : `${mod.attackBonus}`
			}
			html += `
				<div class="modifier-item" data-mod-id="${mod.id}">
					<span class="mod-check"></span>
					<span class="mod-name">${mod.name}</span>
					<span class="mod-bonus">${bonusStr}</span>
				</div>
			`
		}
	}

	// Numeric modifier grid (not shown for damage-only)
	if (!isDamageOnly) {
		html += '<div class="menu-separator"></div>'
		html += '<div class="numeric-grid">'
		for (const val of [-4, -3, -2, -1]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
		}
		for (const val of [1, 2, 3, 4]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
		}
		html += '</div>'
	}

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
		executeMissileAttack(sheet, weapon, selectedModifiers, numericMod, proficient, rollType, rangeMod, rangeName)
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
 * @param {string|null} [rollType=null] - 'attack', 'damage', or null for both
 * @param {number} [rangeMod=0] - Range modifier to attack
 * @param {string|null} [rangeName=null] - Range name for chat badge
 */
async function executeMissileAttack(sheet, weapon, selectedModifiers, numericMod, proficient = true, rollType = null, rangeMod = 0, rangeName = null) {
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

	// Compute total attack modifier (includes range modifier)
	const { totalMod } = getAttackModifiers(sheet, 'missile')
	const finalAttackMod = totalMod + modAttackBonus + numericMod + rangeMod

	// Determine damage formula
	let damageFormula = weapon.system.damage
	if (modDamageBonus !== 0) {
		damageFormula = modDamageBonus > 0
			? `${damageFormula} + ${modDamageBonus}`
			: `${damageFormula} - ${Math.abs(modDamageBonus)}`
	}

	await performAttackRoll(sheet, weapon, 'missile', {
		attackOnly: rollType === 'attack',
		damageOnly: rollType === 'damage',
		totalAttackMod: finalAttackMod,
		damageFormula,
		modifierNames,
		attackModeName: rangeName
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

	// Only check for empty weapons on missile (melee always has unarmed)
	if (attackType === 'missile' && weapons.length === 0) {
		const typeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
		ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
		return
	}

	const iconRect = event.currentTarget.getBoundingClientRect()
	const position = { top: iconRect.top, left: iconRect.left }

	openRollTypeContextMenu(sheet, weapons, attackType, position)
}

/**
 * Open a context menu to choose roll type (attack only or damage only),
 * then continue into the standard melee or missile attack flow.
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

			if (attackType === 'melee') {
				if (rollType === 'damage') {
					// Damage-only skips attack type selection, uses 'normal'
					setTimeout(() => openMeleeWeaponMenu(sheet, weapons, 'normal', position, rollType), 0)
				} else {
					setTimeout(() => openAttackTypeMenu(sheet, weapons, position, rollType), 0)
				}
			} else {
				if (rollType === 'damage') {
					// Damage-only skips range selection (range only affects attack)
					if (weapons.length === 1 && isWeaponProficient(sheet, weapons[0])) {
						setTimeout(() => openMissileModifierPanel(sheet, weapons[0], position, true, rollType), 0)
					} else {
						setTimeout(() => openMissileWeaponMenu(sheet, weapons, position, rollType), 0)
					}
				} else {
					// Attack-only goes through range selection
					setTimeout(() => openMissileRangeMenu(sheet, weapons, position, rollType), 0)
				}
			}
		}
	})
}
