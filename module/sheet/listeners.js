/* global CONFIG, FilePicker, Roll, ChatMessage, CONST, game, foundry */
/**
 * Listener Setup
 * All _setup* methods that wire up DOM event listeners on the sheet.
 * Each function receives the sheet instance as the first parameter.
 */

import { onMeleeAttackRoll, onMissileAttackRoll, onAttackRollContextMenu } from './attack-rolls.js'
import { onAbilityRoll, onSaveRoll, onSkillRoll, rollTrait } from './roll-handlers.js'
import { openXPDialog, openXPEditDialog, openAddSkillDialog, removeSkill } from './dialogs.js'

/**
 * Setup listeners for adjustable inputs.
 * Syncs changes to hidden input and highlights adjusted values.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupAdjustableInputListeners(sheet) {
	sheet.element.querySelectorAll('input.adjustable').forEach(input => {
		const baseValue = input.dataset.base
		const adjustedValue = input.dataset.adjusted
		const targetName = input.dataset.target

		// Add visual indicator if value is modified by adjustment
		if (baseValue !== adjustedValue) {
			input.classList.add('has-adjustment')
		}

		// Find the corresponding hidden input
		const hiddenInput = sheet.element.querySelector(`input[type="hidden"][name="${targetName}"]`)

		// On focus, show the base value for editing
		input.addEventListener('focus', () => {
			input.value = baseValue
		})

		// On blur, sync to hidden input if changed, then show adjusted value
		input.addEventListener('blur', () => {
			const newValue = input.value
			if (newValue !== baseValue && hiddenInput) {
				hiddenInput.value = newValue
				hiddenInput.dispatchEvent(new Event('change', { bubbles: true }))
			}
			input.value = adjustedValue
		})
	})
}

/**
 * Setup tab navigation click listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupTabListeners(sheet) {
	// Primary tabs
	sheet.element.querySelectorAll('.tabs .item').forEach(tab => {
		tab.addEventListener('click', (event) => {
			event.preventDefault()
			const { tab: tabId, group } = event.currentTarget.dataset
			sheet._onChangeTab(tabId, group)
		})
	})

	// Magic sub-tabs
	sheet.element.querySelectorAll('.sub-tabs .item').forEach(tab => {
		tab.addEventListener('click', (event) => {
			event.preventDefault()
			if (event.currentTarget.classList.contains('disabled')) return
			const { tab: tabId, group } = event.currentTarget.dataset
			sheet._onChangeTab(tabId, group)
		})
	})

	// Set initial active state for magic sub-tabs
	updateMagicSubTabs(sheet)
}

/**
 * Update magic sub-tab active states.
 * If the current active tab is disabled, switch to the first enabled tab.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function updateMagicSubTabs(sheet) {
	let activeSubTab = sheet.tabGroups.magic || 'arcane'

	const subTabs = sheet.element.querySelectorAll('.sub-tabs .item')
	const activeTabElement = sheet.element.querySelector(`.sub-tabs .item[data-tab="${activeSubTab}"]`)

	if (activeTabElement?.classList.contains('disabled')) {
		for (const tab of subTabs) {
			if (!tab.classList.contains('disabled')) {
				activeSubTab = tab.dataset.tab
				sheet.tabGroups.magic = activeSubTab
				break
			}
		}
	}

	// Update sub-tab navigation
	subTabs.forEach(tab => {
		const isActive = tab.dataset.tab === activeSubTab
		tab.classList.toggle('active', isActive)
	})

	// Update sub-tab content visibility
	sheet.element.querySelectorAll('.sub-tab-content').forEach(content => {
		const isActive = content.dataset.tab === activeSubTab
		content.classList.toggle('active', isActive)
	})
}

/**
 * Setup XP button click listener.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupXPListener(sheet) {
	const xpBtn = sheet.element.querySelector('.xp-add-btn')
	if (xpBtn) {
		xpBtn.addEventListener('click', (event) => {
			event.preventDefault()
			openXPDialog(sheet)
		})
	}
	const xpEditBtn = sheet.element.querySelector('.xp-edit-btn')
	if (xpEditBtn) {
		xpEditBtn.addEventListener('click', (event) => {
			event.preventDefault()
			openXPEditDialog(sheet)
		})
	}
}

/**
 * Setup portrait image click for file picker.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupPortraitPicker(sheet) {
	const portrait = sheet.element.querySelector('.portrait-image')
	if (portrait) {
		portrait.addEventListener('click', () => {
			new FilePicker({
				type: 'image',
				current: sheet.actor.img,
				callback: (path) => sheet.actor.update({ img: path })
			}).browse()
		})
	}
}

/**
 * Setup add/remove skill button listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupSkillListeners(sheet) {
	const addSkillBtn = sheet.element.querySelector('.add-skill-btn')
	if (addSkillBtn) {
		addSkillBtn.addEventListener('click', (event) => {
			event.preventDefault()
			openAddSkillDialog(sheet)
		})
	}

	sheet.element.querySelectorAll('.remove-skill-btn').forEach(btn => {
		btn.addEventListener('click', (event) => {
			event.preventDefault()
			const index = parseInt(event.currentTarget.dataset.skillIndex)
			removeSkill(sheet, index)
		})
	})
}

/**
 * Setup melee and missile attack icon listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupAttackListeners(sheet) {
	// Melee attack
	const meleeBtn = sheet.element.querySelector('.fa-swords.rollable')
	if (meleeBtn) {
		meleeBtn.addEventListener('click', (event) => {
			event.preventDefault()
			onMeleeAttackRoll(sheet, event)
		})
		meleeBtn.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			onAttackRollContextMenu(sheet, 'melee', event)
		})
	}

	// Missile attack
	const missileBtn = sheet.element.querySelector('.combat .fa-bow-arrow.rollable')
	if (missileBtn) {
		missileBtn.addEventListener('click', (event) => {
			event.preventDefault()
			onMissileAttackRoll(sheet, event)
		})
		missileBtn.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			onAttackRollContextMenu(sheet, 'missile', event)
		})
	}
}

/**
 * Setup ability check roll listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupAbilityRollListeners(sheet) {
	sheet.element.querySelectorAll('.ability-roll').forEach(btn => {
		btn.addEventListener('click', (event) => {
			event.preventDefault()
			const abilityKey = event.currentTarget.dataset.ability
			if (abilityKey) {
				onAbilityRoll(sheet, abilityKey, event)
			}
		})
	})
}

/**
 * Setup saving throw roll listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupSaveRollListeners(sheet) {
	sheet.element.querySelectorAll('.save-roll').forEach(btn => {
		btn.addEventListener('click', (event) => {
			event.preventDefault()
			const saveKey = event.currentTarget.dataset.save
			if (saveKey) {
				onSaveRoll(sheet, saveKey, event)
			}
		})
	})
}

/**
 * Setup skill check roll listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupSkillRollListeners(sheet) {
	sheet.element.querySelectorAll('.skill-roll').forEach(btn => {
		btn.addEventListener('click', (event) => {
			event.preventDefault()
			const skillKey = event.currentTarget.dataset.skill
			const targetOverride = event.currentTarget.dataset.skillTarget
				? parseInt(event.currentTarget.dataset.skillTarget)
				: null
			if (skillKey) {
				onSkillRoll(sheet, skillKey, targetOverride, event)
			}
		})
	})
}

/**
 * Setup height/weight unit conversion listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupUnitConversionListeners(sheet) {
	const heightFeetInput = sheet.element.querySelector('[data-convert="height-feet"]')
	const heightCmInput = sheet.element.querySelector('[data-convert="height-cm"]')
	const weightLbsInput = sheet.element.querySelector('[data-convert="weight-lbs"]')
	const weightKgInput = sheet.element.querySelector('[data-convert="weight-kg"]')

	// Height conversion: feet/inches <-> cm
	if (heightFeetInput && heightCmInput) {
		const updateCmFromFeetInches = () => {
			const fIndex = heightFeetInput.value.indexOf("'")
			const iIndex = heightFeetInput.value.indexOf('"')
			let feet = 0
			let inches = 0
			if(fIndex === -1 && iIndex === -1){
				feet = parseInt(heightFeetInput.value) || 0
			}
			if(fIndex > 0)
				feet = parseInt(heightFeetInput.value.substring(0, fIndex)) || 0
			if(iIndex > fIndex)
				inches = parseInt(heightFeetInput.value.substring(fIndex + 1, iIndex)) || 0
			const totalInches = feet * 12 + inches
			heightCmInput.value = Math.round(totalInches * 2.54)
		}

		const updateFeetInchesFromCm = () => {
			const cm = parseInt(heightCmInput.value) || 0
			const totalInches = Math.round(cm / 2.54)
			heightFeetInput.value = Math.floor(totalInches / 12) + "'" + (totalInches % 12) + '"'
		}

		heightFeetInput.addEventListener('change', updateCmFromFeetInches)
		heightCmInput.addEventListener('change', updateFeetInchesFromCm)
	}

	// Weight conversion: lbs <-> kg
	if (weightLbsInput && weightKgInput) {
		weightLbsInput.addEventListener('change', (event) => {
			const lbs = parseInt(event.target.value) || 0
			weightKgInput.value = Math.round(lbs * 0.453592)
		})
		weightKgInput.addEventListener('change', (event) => {
			const kg = parseInt(event.target.value) || 0
			weightLbsInput.value = Math.round(kg / 0.453592)
		})
	}
}

/**
 * Setup rollable icon listeners for age, lifespan, and birthday on the details tab.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupDetailsRollListeners(sheet) {
	const kindred = sheet.actor.system.kindred

	// Roll age
	sheet.element.querySelector('.roll-age')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = CONFIG.DOLMENWOOD.kindredAgeFormulas[kindred]
		if (!formula) return
		const roll = await new Roll(formula).evaluate()
		sheet.actor.update({ 'system.physical.age': roll.total })
		const label = game.i18n.localize('DOLMEN.KindredDetails.CurrentAge')
		const rollAnchor = (await roll.toAnchor()).outerHTML
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor}`,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll lifespan
	sheet.element.querySelector('.roll-lifespan')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = CONFIG.DOLMENWOOD.kindredLifespanFormulas[kindred]
		if (!formula || formula === '0') return
		const roll = await new Roll(formula).evaluate()
		sheet.actor.update({ 'system.physical.lifespan': roll.total })
		const label = game.i18n.localize('DOLMEN.KindredDetails.Lifespan')
		const rollAnchor = (await roll.toAnchor()).outerHTML
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor}`,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll birthday
	sheet.element.querySelector('.roll-birthday')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const totalDays = 352
		const roll = await new Roll(`1d${totalDays}`).evaluate()
		const doy = roll.total
		const monthKeys = Object.keys(CONFIG.DOLMENWOOD.monthOffsets)
		let birthMonth = monthKeys[0]
		let birthDay = doy
		for (let i = monthKeys.length - 1; i >= 0; i--) {
			const offset = CONFIG.DOLMENWOOD.monthOffsets[monthKeys[i]]
			if (doy > offset) {
				birthMonth = monthKeys[i]
				birthDay = doy - offset
				break
			}
		}
		sheet.actor.update({
			'system.birthMonth': birthMonth,
			'system.birthDay': birthDay
		})
		const label = game.i18n.localize('DOLMEN.Birthday')
		const monthLabel = game.i18n.localize(`DOLMEN.Months.${birthMonth}`)
		const rollAnchor = (await roll.toAnchor()).outerHTML
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${birthDay} ${monthLabel}`,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll height
	sheet.element.querySelector('.roll-height')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = CONFIG.DOLMENWOOD.kindredHeightFormulas[kindred]
		if (!formula) return
		const roll = await new Roll(formula).evaluate()
		const totalInches = roll.total
		const feet = Math.floor(totalInches / 12)
		const inches = totalInches % 12
		const heightFeet = `${feet}'${inches}"`
		const heightCm = Math.round(totalInches * 2.54)
		sheet.actor.update({
			'system.physical.heightFeet': heightFeet,
			'system.physical.heightCm': heightCm
		})
		const label = game.i18n.localize('DOLMEN.KindredDetails.Height')
		const rollAnchor = (await roll.toAnchor()).outerHTML
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${heightFeet} / ${heightCm} cm`,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll weight
	sheet.element.querySelector('.roll-weight')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = CONFIG.DOLMENWOOD.kindredWeightFormulas[kindred]
		if (!formula) return
		const roll = await new Roll(formula).evaluate()
		const weightLbs = roll.total
		const weightKg = Math.round(weightLbs * 0.453592)
		sheet.actor.update({
			'system.physical.weightLbs': weightLbs,
			'system.physical.weightKg': weightKg
		})
		const label = game.i18n.localize('DOLMEN.KindredDetails.Weight')
		const rollAnchor = (await roll.toAnchor()).outerHTML
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${weightLbs} lbs / ${weightKg} kg`,
			rolls: [roll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})
}

/**
 * Setup trait rollable icon and usage checkbox listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupTraitListeners(sheet) {
	// Rollable trait clicks
	sheet.element.querySelectorAll('.trait .rollable').forEach(btn => {
		btn.addEventListener('click', (event) => {
			event.preventDefault()
			const traitId = event.currentTarget.dataset.traitId
			const formula = event.currentTarget.dataset.rollFormula
			const traitName = event.currentTarget.dataset.traitName
			const rollTarget = event.currentTarget.dataset.rollTarget
				? parseInt(event.currentTarget.dataset.rollTarget)
				: null
			if (formula) {
				rollTrait(sheet, traitId, traitName, formula, rollTarget)
			}
		})
	})

	// Usage checkbox clicks
	sheet.element.querySelectorAll('.trait-usage-checkbox').forEach(checkbox => {
		checkbox.addEventListener('change', async (event) => {
			const traitId = event.currentTarget.dataset.traitId
			const index = parseInt(event.currentTarget.dataset.usageIndex)
			const maxUses = parseInt(event.currentTarget.dataset.maxUses)

			const usage = foundry.utils.deepClone(sheet.actor.system.traitUsage || {})
			const traitData = usage[traitId] || { used: 0, max: maxUses }

			traitData.used = event.currentTarget.checked ? index + 1 : index
			traitData.max = maxUses
			usage[traitId] = traitData

			await sheet.actor.update({ 'system.traitUsage': usage })
		})
	})

	// Long rest button
	const longRestBtn = sheet.element.querySelector('.long-rest-btn')
	if (longRestBtn) {
		longRestBtn.addEventListener('click', async (event) => {
			event.preventDefault()
			await sheet.actor.resetTraitUsage()
		})
	}
}
