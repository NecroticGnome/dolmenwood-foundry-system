/* global CONFIG, Roll, ChatMessage, CONST, game, foundry, ui */
import { createChatMessage } from './chat-helpers.js'
/**
 * Listener Setup
 * All _setup* methods that wire up DOM event listeners on the sheet.
 * Each function receives the sheet instance as the first parameter.
 */

import { getFutureDateKey, getFutureDateKeyByYears } from '../calendar/calendar-time.js'
import { onMeleeAttackRoll, onMissileAttackRoll, onAttackRollContextMenu, onWeaponInventoryAttack } from './attack-rolls.js'
import { onAbilityRoll, onSaveRoll, onSkillRoll, rollTrait, useTrait } from './roll-handlers.js'
import { openXPDialog, openXPEditDialog, openAddSkillDialog, openCoinDialog, removeSkill, levelUp, levelDown } from './dialogs.js'
import { createContextMenu } from './context-menu.js'
import { drawFromTable, drawFromTableRaw } from '../utils/roll-tables.js'
import { stripSecrets } from '../utils/save-links.js'

const { DialogV2 } = foundry.applications.api

/**
 * Setup listeners for adjustable inputs.
 * Syncs changes to hidden input and highlights adjusted values.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupAdjustableInputListeners(sheet) {
	sheet.element.querySelectorAll('input.adjustable').forEach(input => {
		const baseValue = input.dataset.base
		const adjustedValue = input.dataset.adjusted
		const manualAdj = parseFloat(input.dataset.manualAdj) || 0
		const targetName = input.dataset.target

		// Add visual indicator if value is modified by adjustment
		if (manualAdj !== 0 || baseValue !== adjustedValue) {
			const diff = parseFloat(adjustedValue) - parseFloat(baseValue)
			// Saves and skills are "lower is better" — a negative diff is a buff
			const lowerIsBetter = targetName?.startsWith('system.saves.') || targetName?.startsWith('system.skills.') || targetName?.startsWith('system.extraSkills.')
			const isBuff = lowerIsBetter ? diff < 0 : diff > 0
			input.classList.add(isBuff ? 'has-buff' : 'has-penalty')
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

	// Show notification when clicking readonly skill inputs
	sheet.element.querySelectorAll('input.skill-target[readonly]').forEach(input => {
		input.addEventListener('mousedown', () => {
			ui.notifications.info(game.i18n.localize('DOLMEN.Skills.CustomizeRequired'))
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
 * Setup level up/down button listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupLevelListeners(sheet) {
	const upBtn = sheet.element.querySelector('.level-up')
	if (upBtn) {
		upBtn.addEventListener('click', (e) => {
			e.preventDefault()
			levelUp(sheet)
		})
	}
	const downBtn = sheet.element.querySelector('.level-down')
	if (downBtn) {
		downBtn.addEventListener('click', (e) => {
			e.preventDefault()
			levelDown(sheet)
		})
	}
}

/**
 * Setup coin adjustment button listener.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupCoinListener(sheet) {
	const coinBtn = sheet.element.querySelector('.coins-adjust-btn')
	if (coinBtn) {
		coinBtn.addEventListener('click', (event) => {
			event.preventDefault()
			openCoinDialog(sheet)
		})
	}

	const bankBtn = sheet.element.querySelector('.coins-bank-btn')
	if (bankBtn) {
		bankBtn.addEventListener('click', async (event) => {
			event.preventDefault()
			const actor = sheet.actor
			const coinsGold = (actor.system.coins.copper || 0) * 0.01
				+ (actor.system.coins.silver || 0) * 0.1
				+ (actor.system.coins.gold || 0)
				+ (actor.system.coins.pellucidium || 0) * 10
			const bankedGold = actor.system.bankedGold || 0
			const newGold = Math.max(0, coinsGold - bankedGold)
			const fmt = v => v % 1 === 0 ? v : parseFloat(v.toFixed(2))
			const confirmed = await foundry.applications.api.DialogV2.confirm({
				window: { title: game.i18n.localize('DOLMEN.Coins.BankTitle') },
				content: `<p>${game.i18n.format('DOLMEN.Coins.BankConfirm', { value: fmt(newGold) })}</p>`,
				yes: { default: true }
			})
			if (confirmed) {
				await actor.update({ 'system.bankedGold': coinsGold })
				ui.notifications.info(game.i18n.format('DOLMEN.Coins.BankSuccess', { value: fmt(newGold) }))
			}
		})

		bankBtn.addEventListener('contextmenu', (event) => {
			event.preventDefault()
			const actor = sheet.actor
			const html = `
				<div class="weapon-menu-item" data-action="resetBank"><span class="weapon-name">${game.i18n.localize('DOLMEN.Coins.BankReset')}</span></div>
				<div class="weapon-menu-item" data-action="modifyBank"><span class="weapon-name">${game.i18n.localize('DOLMEN.Coins.BankModify')}</span></div>
			`
			createContextMenu(sheet, {
				html,
				position: { top: event.clientY, left: event.clientX },
				onItemClick: async (item, menu) => {
					menu.remove()
					const action = item.dataset.action
					if (action === 'resetBank') {
						await actor.update({ 'system.bankedGold': 0 })
						ui.notifications.info(game.i18n.localize('DOLMEN.Coins.BankResetDone'))
					} else if (action === 'modifyBank') {
						const current = actor.system.bankedGold || 0
						const fmt = v => v % 1 === 0 ? v : parseFloat(v.toFixed(2))
						const result = await foundry.applications.api.DialogV2.prompt({
							window: { title: game.i18n.localize('DOLMEN.Coins.BankModify') },
							content: `<div class="form-group"><label>${game.i18n.localize('DOLMEN.Coins.BankModifyLabel')}</label><input type="number" name="bankedGold" value="${fmt(current)}" min="0" step="0.01" autofocus></div>`,
							ok: {
								label: game.i18n.localize('DOLMEN.Coins.AdjustUpdate'),
								callback: (event, button) => {
									const val = parseFloat(button.form.elements.bankedGold.value)
									return isNaN(val) ? current : Math.max(0, val)
								}
							}
						})
						if (result !== null && result !== undefined) {
							await actor.update({ 'system.bankedGold': result })
						}
					}
				}
			})
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
			new foundry.applications.apps.FilePicker.implementation({
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
 * Setup right-click attack on weapon items in the inventory tab.
 * Right-clicking a weapon row opens the attack flow, skipping weapon selection.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupInventoryWeaponAttackListeners(sheet) {
	sheet.element.querySelectorAll('.tab-inventory .item-row.weapon').forEach(row => {
		row.addEventListener('contextmenu', (event) => {
			onWeaponInventoryAttack(sheet, event)
		})
	})
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
			const customName = event.currentTarget.dataset.skillName || null
			if (skillKey) {
				onSkillRoll(sheet, skillKey, targetOverride, event, customName)
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

const KNOWN_LANGUAGE_IDS = ['woldish', 'gaffe', 'caprice', 'sylvan', 'highElfish', 'mewl', 'mulch']

/**
 * Setup languages edit button listener.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupLanguagesListener(sheet) {
	// Only enable the hover tooltip when the languages line is actually
	// truncated (overflowing) — no point showing it when it all fits.
	// Measured on hover so layout and fonts are fully settled, avoiding the
	// render-time timing edge cases.
	const langValue = sheet.element.querySelector('.languages-value')
	const langText = langValue?.querySelector('.languages-text')
	if (langValue && langText) {
		langValue.addEventListener('mouseenter', () => {
			langValue.classList.toggle('has-overflow', langText.scrollWidth > langText.clientWidth)
		})
	}

	const btn = sheet.element.querySelector('.edit-languages-btn')
	if (!btn) return
	btn.addEventListener('click', (e) => {
		e.preventDefault()
		openLanguagesDialog(sheet)
	})
}

/**
 * Get localized name for a language ID.
 */
function localizeLanguage(id) {
	const key = `DOLMEN.Languages.${id}`
	return game.i18n.has(key) ? game.i18n.localize(key) : id
}

/**
 * Open language editor dialog.
 * @param {DolmenSheet} sheet - The sheet instance
 */
function openLanguagesDialog(sheet) {
	const languages = [...(sheet.actor.system.languages || [])]

	function buildListHtml(langs) {
		if (langs.length === 0) return `<div class="lang-list-empty">${game.i18n.localize('DOLMEN.Languages.None')}</div>`
		return langs.map((id, i) => `
			<div class="lang-entry">
				<span class="lang-name">${localizeLanguage(id)}</span>
				<a class="lang-remove" data-index="${i}" title="${game.i18n.localize('DOLMEN.Remove')}"><i class="fas fa-trash"></i></a>
			</div>
		`).join('')
	}

	// Build select options from known IDs not already added
	function buildSelectOptions(langs) {
		const options = KNOWN_LANGUAGE_IDS
			.filter(id => !langs.includes(id))
			.map(id => `<option value="${id}">${localizeLanguage(id)}</option>`)
			.join('')
		return options + `<option value="_custom">${game.i18n.localize('DOLMEN.Languages.Custom')}</option>`
	}

	const content = `
		<div class="lang-dialog">
			<div class="lang-list">${buildListHtml(languages)}</div>
			<div class="lang-add-row">
				<select class="lang-select">${buildSelectOptions(languages)}</select>
				<input type="text" class="lang-custom-input" placeholder="${game.i18n.localize('DOLMEN.Languages.CustomPlaceholder')}" style="display:none;">
				<button type="button" class="lang-add-btn"><i class="fas fa-plus"></i></button>
			</div>
		</div>
	`

	const dialog = new DialogV2({
		window: { title: game.i18n.localize('DOLMEN.Languages.EditTitle') },
		content,
		buttons: [
			{
				action: 'save',
				icon: 'fas fa-check',
				label: game.i18n.localize('DOLMEN.Save'),
				default: true,
				callback: () => {
					sheet.actor.update({ 'system.languages': languages })
				}
			},
			{
				action: 'cancel',
				icon: 'fas fa-times',
				label: game.i18n.localize('DOLMEN.Cancel')
			}
		]
	})
	dialog.render(true)

	// Wire up interactivity after render
	dialog.addEventListener('render', () => {
		const el = dialog.element
		const listEl = el.querySelector('.lang-list')
		const selectEl = el.querySelector('.lang-select')
		const customInput = el.querySelector('.lang-custom-input')
		const addBtn = el.querySelector('.lang-add-btn')

		function refresh() {
			listEl.innerHTML = buildListHtml(languages)
			selectEl.innerHTML = buildSelectOptions(languages)
			customInput.style.display = 'none'
			customInput.value = ''
			wireRemoveButtons()
		}

		function wireRemoveButtons() {
			listEl.querySelectorAll('.lang-remove').forEach(btn => {
				btn.addEventListener('click', () => {
					languages.splice(parseInt(btn.dataset.index), 1)
					refresh()
				})
			})
		}

		selectEl.addEventListener('change', () => {
			customInput.style.display = selectEl.value === '_custom' ? '' : 'none'
		})

		addBtn.addEventListener('click', () => {
			const val = selectEl.value
			if (val === '_custom') {
				const custom = customInput.value.trim()
				if (custom && !languages.includes(custom)) {
					languages.push(custom)
					refresh()
				}
			} else if (val && !languages.includes(val)) {
				languages.push(val)
				refresh()
			}
		})

		wireRemoveButtons()
	})
}

/**
 * Setup rollable icon listeners for age, lifespan, and birthday on the details tab.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupDetailsRollListeners(sheet) {
	const kindredItem = sheet.actor.getKindredItem()

	// Roll age
	sheet.element.querySelector('.roll-age')?.addEventListener('click', async (event) => {
		event.preventDefault()
		if (!kindredItem) {
			ui.notifications.warn('DOLMEN.Notifications.NoKindredSelected', { localize: true })
			return
		}
		const formula = kindredItem.system.ageFormula
		if (!formula) return
		const roll = await new Roll(formula).evaluate()
		sheet.actor.update({ 'system.physical.age': roll.total })
		const label = game.i18n.localize('DOLMEN.KindredDetails.CurrentAge')
		const rollAnchor = (await roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor}`,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll lifespan
	sheet.element.querySelector('.roll-lifespan')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = kindredItem?.system.lifespanFormula
		if (!formula || formula === '0') return
		const roll = await new Roll(formula).evaluate()
		sheet.actor.update({ 'system.physical.lifespan': roll.total })
		const label = game.i18n.localize('DOLMEN.KindredDetails.Lifespan')
		const rollAnchor = (await roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor}`,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
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
		const rollAnchor = (await roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${birthDay} ${monthLabel}`,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll height
	sheet.element.querySelector('.roll-height')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = kindredItem?.system.heightFormula
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
		const rollAnchor = (await roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${heightFeet} / ${heightCm} cm`,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})

	// Roll weight
	sheet.element.querySelector('.roll-weight')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const formula = kindredItem?.system.weightFormula
		if (!formula) return
		const roll = await new Roll(formula).evaluate()
		const weightLbs = roll.total
		const weightKg = Math.round(weightLbs * 0.453592)
		sheet.actor.update({
			'system.physical.weightLbs': weightLbs,
			'system.physical.weightKg': weightKg
		})
		const label = game.i18n.localize('DOLMEN.KindredDetails.Weight')
		const rollAnchor = (await roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
			content: `<strong>${label}:</strong> ${rollAnchor} — ${weightLbs} lbs / ${weightKg} kg`,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	})
}

/**
 * Map of detail field keys to their RollTable name suffixes.
 * Breggle/grimalkin use "Fur" instead of "Body".
 */
const DETAIL_TABLE_NAMES = {
	head: 'Head',
	face: 'Face',
	dress: 'Dress',
	body: 'Body',
	demeanour: 'Demeanour',
	desires: 'Desires',
	beliefs: 'Beliefs',
	speech: 'Speech'
}
/**
 * Build a RollTable name from kindred and field.
 * Table names follow "{Kindred} {Field}" format from the Dolmenwood Player's Book codex.
 * @param {string} kindred - The kindred key (e.g. 'breggle')
 * @param {string} field - The field key (e.g. 'face', 'body')
 * @param {boolean} hasFur - Whether the kindred has fur (substitutes 'Fur' for 'Body')
 * @returns {string} Table name (e.g. 'Breggle Face', 'Breggle Fur')
 */
function buildTableName(kindred, field, hasFur) {
	const kindredLabel = kindred.charAt(0).toUpperCase() + kindred.slice(1)
	let fieldLabel = DETAIL_TABLE_NAMES[field] || field.charAt(0).toUpperCase() + field.slice(1)
	if (field === 'body' && hasFur) {
		fieldLabel = 'Fur'
	}
	return `${kindredLabel} ${fieldLabel}`
}

/**
 * Setup rollable icon listeners for extra detail fields (appearance and mannerisms).
 * Draws from Foundry RollTables named "{Kindred} {Field}" (e.g. "Breggle Face").
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupExtraDetailsRollListeners(sheet) {
	sheet.element.querySelectorAll('.roll-detail').forEach(btn => {
		btn.addEventListener('click', async (event) => {
			event.preventDefault()
			const kindredItem = sheet.actor.getKindredItem()
			if (!kindredItem) {
				ui.notifications.warn('DOLMEN.Notifications.NoKindredSelected', { localize: true })
				return
			}
			const kindred = kindredItem.system.kindredId
			const field = event.currentTarget.dataset.detail
			const tableName = buildTableName(kindred, field, kindredItem.system.hasFur)
			const result = await drawFromTable(tableName)
			if (result) {
				await sheet.actor.update({ [`system.details.${field}`]: result })
			}
		})
	})
}

/**
 * Setup rollable icon listener for background field.
 * Draws from Foundry RollTable named "{Kindred} Background" (e.g. "Human Background").
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupBackgroundRollListener(sheet) {
	sheet.element.querySelector('.roll-background')?.addEventListener('click', async (event) => {
		event.preventDefault()
		const kindredItem = sheet.actor.getKindredItem()
		if (!kindredItem) {
			ui.notifications.warn('DOLMEN.Notifications.NoKindredSelected', { localize: true })
			return
		}
		const kindredLabel = kindredItem.name
		const tableName = `${kindredLabel} Backgrounds`
		const result = await drawFromTable(tableName)
		if (result) {
			await sheet.actor.update({ 'system.background.profession': result })
		}
	})
}

/**
 * Parse a column value from a RollTable result's HTML description.
 * Description format: <table><tbody><tr><th>Column</th><td>Value</td></tr>...</tbody></table>
 * @param {string} html - The result description HTML
 * @param {string} column - The column header to extract (e.g. "Male", "Surname", "Rustic")
 * @returns {string|null} The extracted value, or null if not found
 */
function parseNameColumn(html, column) {
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')
	for (const row of doc.querySelectorAll('tr')) {
		const th = row.querySelector('th')
		const td = row.querySelector('td')
		if (th && td && th.textContent.trim() === column) {
			return td.textContent.trim()
		}
	}
	return null
}

/**
 * Roll a name from a single name roll group.
 * Draws from the RollTable once per column in group.rolls, parses each,
 * joins parts with a space, updates actor name, and posts a chat message.
 * @param {DolmenSheet} sheet - The sheet instance
 * @param {string} tableName - The RollTable name (e.g. "Human Names")
 * @param {object} group - Name roll group with label and rolls array
 */
async function rollNameGroup(sheet, tableName, group) {
	const parts = []
	const draws = []
	for (const column of group.rolls) {
		const draw = await drawFromTableRaw(tableName)
		if (!draw) return
		const value = parseNameColumn(draw.result.description, column)
		if (!value) return
		parts.push(value)
		draws.push({ draw, value })
	}

	const fullName = parts.join(' ')
	await sheet.actor.update({ name: fullName })

	const anchors = []
	for (const { draw, value } of draws) {
		const anchor = (await draw.roll.toAnchor({ classes: ['inline-dsn-hidden'] })).outerHTML
		anchors.push(`${anchor}: ${value}`)
	}

	const labelSuffix = group.label ? ` (${game.i18n.localize(group.label)})` : ''
	await createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
		content: `<strong>${tableName}</strong>${labelSuffix}<br>${anchors.join('<br>')}`,
		rolls: draws.map(d => d.draw.roll),
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Setup rollable icon listener for name field.
 * Reads nameRollGroups from the kindred item:
 * - 1 group: roll directly (no context menu)
 * - Multiple groups: show context menu, user picks one
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupNameRollListener(sheet) {
	sheet.element.querySelector('.roll-name')?.addEventListener('click', async (event) => {
		event.preventDefault()

		const kindredItem = sheet.actor.getKindredItem()
		if (!kindredItem) {
			ui.notifications.warn('DOLMEN.Notifications.NoKindredSelected', { localize: true })
			return
		}

		const groups = kindredItem.system.nameRollGroups
		if (!groups || groups.length === 0) {
			ui.notifications.warn('DOLMEN.Notifications.NoNameRollGroups', { localize: true })
			return
		}

		const tableName = `${kindredItem.name} Names`

		if (groups.length === 1) {
			await rollNameGroup(sheet, tableName, groups[0])
		} else {
			const position = { top: event.clientY, left: event.clientX }
			const menuHtml = groups.map((g, i) =>
				`<div class="weapon-menu-item" data-group-index="${i}">${game.i18n.localize(g.label)}</div>`
			).join('')
			createContextMenu(sheet, {
				html: menuHtml,
				position,
				excludeFromClose: event.currentTarget,
				onItemClick: async (item, menu) => {
					menu.remove()
					const group = groups[parseInt(item.dataset.groupIndex)]
					await rollNameGroup(sheet, tableName, group)
				}
			})
		}
	})
}

/**
 * Setup trait rollable icon and usage checkbox listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupTraitListeners(sheet) {
	// Share trait to chat (name + description only)
	sheet.element.querySelectorAll('.trait-share-btn').forEach(btn => {
		btn.addEventListener('click', async (event) => {
			event.preventDefault()
			event.stopPropagation()
			const el = event.currentTarget
			const opts = {
				name: el.dataset.traitName,
				desc: el.dataset.traitDesc,
				value: el.dataset.traitValue || null,
				mode: 'shared'
			}
			// Include usage info if trait has usage tracking
			if (el.dataset.traitId && el.dataset.maxUses) {
				const traitId = el.dataset.traitId
				const maxUses = parseInt(el.dataset.maxUses)
				const traitData = sheet.actor.system.traitUsage?.[traitId] || { used: 0 }
				opts.usesRemaining = maxUses - (traitData.used || 0)
				opts.usageFrequency = el.dataset.usageFrequency || null
			}
			await useTrait(sheet, opts)
		})
	})

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

	// Trait invoke buttons (sparkles icon next to usage checkboxes)
	sheet.element.querySelectorAll('.trait-invoke-btn').forEach(btn => {
		btn.addEventListener('click', async (event) => {
			event.preventDefault()
			event.stopPropagation()

			const el = event.currentTarget
			const traitId = el.dataset.traitId
			const traitName = el.dataset.traitName
			const traitDesc = el.dataset.traitDesc
			const traitValue = el.dataset.traitValue || null
			const maxUses = parseInt(el.dataset.maxUses)
			const usageFrequency = el.dataset.usageFrequency || null
			const formula = el.dataset.rollFormula || null
			const rollTarget = el.dataset.rollTarget
				? parseInt(el.dataset.rollTarget)
				: null

			// Check if any uses remain
			const usage = foundry.utils.deepClone(sheet.actor.system.traitUsage || {})
			const traitData = usage[traitId] || { used: 0, max: maxUses }
			if (traitData.used >= maxUses) {
				ui.notifications.warn(game.i18n.format('DOLMEN.Traits.NoUsesRemaining', { name: traitName }))
				return
			}

			// Use a charge
			traitData.used = traitData.used + 1
			traitData.max = maxUses
			usage[traitId] = traitData
			await sheet.actor.update({ 'system.traitUsage': usage })

			// Post to chat (with roll if rollable)
			await useTrait(sheet, {
				name: traitName,
				desc: traitDesc,
				value: traitValue,
				mode: 'used',
				formula,
				rollTarget,
				usesRemaining: maxUses - traitData.used,
				usageFrequency
			})
		})
	})

	// Rest button - opens context menu with rest options
	const longRestBtn = sheet.element.querySelector('.long-rest-btn')
	if (longRestBtn) {
		longRestBtn.addEventListener('click', (event) => {
			event.preventDefault()
			const rect = event.currentTarget.getBoundingClientRect()
			const position = { top: rect.bottom + 4, left: rect.right }

			const html = `
				<div class="weapon-menu-item" data-rest-type="overnight">
					<i class="fa-solid fa-moon"></i>
					<span>${game.i18n.localize('DOLMEN.Rest.Overnight')}</span>
					<span class="rest-hint">${game.i18n.localize('DOLMEN.Rest.OvernightHint')}</span>
				</div>
				<div class="weapon-menu-item" data-rest-type="fullDay">
					<i class="fa-solid fa-moon-over-sun"></i>
					<span>${game.i18n.localize('DOLMEN.Rest.FullDay')}</span>
					<span class="rest-hint">${game.i18n.localize('DOLMEN.Rest.FullDayHint')}</span>
				</div>`

			createContextMenu(sheet, {
				html,
				position,
				onItemClick: async (item, menu) => {
					menu.remove()
					await sheet.actor.rest(item.dataset.restType)
				}
			})
		})
	}
}

/**
 * Set up rune usage checkbox listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupRuneUsageListeners(sheet) {
	sheet.element.querySelectorAll('.rune-usage-checkbox').forEach(checkbox => {
		checkbox.addEventListener('click', (e) => e.stopPropagation())
		checkbox.addEventListener('change', async (event) => {
			event.stopPropagation()
			const runeId = event.currentTarget.dataset.runeId
			const index = parseInt(event.currentTarget.dataset.usageIndex)
			const maxUses = parseInt(event.currentTarget.dataset.maxUses)
			const deleteOnUse = event.currentTarget.dataset.deleteOnUse === 'true'
			const frequencyType = event.currentTarget.dataset.frequencyType

			const usage = foundry.utils.deepClone(sheet.actor.system.runeUsage || {})
			const runeData = usage[runeId] || { used: 0, max: maxUses }

			const oldUsed = runeData.used || 0
			runeData.used = event.currentTarget.checked ? index + 1 : index
			runeData.max = maxUses

			// Handle refresh dates for week/year runes
			if (frequencyType === 'week' || frequencyType === 'year') {
				if (!runeData.refreshDates) runeData.refreshDates = []
				if (!runeData.refreshNoteIds) runeData.refreshNoteIds = []

				if (runeData.used > oldUsed) {
					// Checking a box — add refresh date and calendar note
					const refreshDate = frequencyType === 'week'
						? getFutureDateKey(7)
						: getFutureDateKeyByYears(1)
					runeData.refreshDates.push(refreshDate)

					const item = sheet.actor.items.get(runeId)
					const noteId = await addRuneRefreshNote(refreshDate, item?.name || 'Rune', sheet.actor.name)
					runeData.refreshNoteIds.push(noteId)
				} else if (runeData.used < oldUsed) {
					// Unchecking a box — remove last refresh date and calendar note
					const removedDate = runeData.refreshDates.pop()
					const removedNoteId = runeData.refreshNoteIds.pop()
					if (removedDate && removedNoteId) {
						await removeRuneRefreshNote(removedDate, removedNoteId)
					}
				}
			}

			usage[runeId] = runeData
			await sheet.actor.update({ 'system.runeUsage': usage })

			// Delete "once ever" runes when fully used
			if (deleteOnUse && runeData.used >= maxUses) {
				const item = sheet.actor.items.get(runeId)
				if (item) await item.delete()
			}
		})
	})
}

/**
 * Add a calendar note for a rune refresh date.
 * @param {string} dateKey - The date key for the note
 * @param {string} runeName - The rune's display name
 * @param {string} actorName - The actor's name
 * @returns {string} The note ID
 */
export async function addRuneRefreshNote(dateKey, runeName, actorName) {
	const noteId = foundry.utils.randomID()
	const text = game.i18n.format('DOLMEN.Magic.Fairy.RuneRefreshNote', { name: runeName, actor: actorName })
	const note = { id: noteId, text, gmOnly: false }
	if (game.user.isGM) {
		const notes = foundry.utils.deepClone(game.settings.get('dolmenwood', 'calendarNotes'))
		if (!notes[dateKey]) notes[dateKey] = []
		notes[dateKey].push(note)
		await game.settings.set('dolmenwood', 'calendarNotes', notes)
	} else {
		game.socket.emit('system.dolmenwood', { action: 'addCalendarNote', key: dateKey, note })
	}
	return noteId
}

/**
 * Remove a calendar note for a rune refresh.
 * @param {string} dateKey - The date key where the note lives
 * @param {string} noteId - The note ID to remove
 */
async function removeRuneRefreshNote(dateKey, noteId) {
	if (game.user.isGM) {
		const notes = foundry.utils.deepClone(game.settings.get('dolmenwood', 'calendarNotes'))
		if (!notes[dateKey]) return
		notes[dateKey] = notes[dateKey].filter(n => n.id !== noteId)
		if (notes[dateKey].length === 0) delete notes[dateKey]
		await game.settings.set('dolmenwood', 'calendarNotes', notes)
	} else {
		game.socket.emit('system.dolmenwood', { action: 'deleteCalendarNote', key: dateKey, noteId })
	}
}

/**
 * Set up knack ability usage checkbox listeners.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupKnackUsageListeners(sheet) {
	sheet.element.querySelectorAll('.knack-usage-checkbox').forEach(checkbox => {
		checkbox.addEventListener('change', async (event) => {
			event.stopPropagation()
			const usageKey = event.currentTarget.dataset.usageKey

			const usage = foundry.utils.deepClone(sheet.actor.system.knackUsage || {})
			usage[usageKey] = { used: event.currentTarget.checked ? 1 : 0 }

			await sheet.actor.update({ 'system.knackUsage': usage })
		})
	})
}

/**
 * Set up treasure banked toggle listeners.
 * Click toggles the XP-awarded (banked) state of a treasure item.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupTreasureBankToggle(sheet) {
	sheet.element.querySelectorAll('.treasure-bank-toggle').forEach(el => {
		el.addEventListener('click', async (event) => {
			event.preventDefault()
			event.stopPropagation()
			const item = sheet.actor.items.get(el.dataset.itemId)
			if (!item) return
			await item.update({ 'system.banked': !item.system.banked })
		})
	})
}

/**
 * Set up item charges icon listeners.
 * Left-click uses a charge (decrements remaining), right-click restores one.
 * @param {DolmenSheet} sheet - The sheet instance
 */
export function setupChargesListeners(sheet) {
	sheet.element.querySelectorAll('.item-charges-icon').forEach(icon => {
		// Left-click: use a charge
		icon.addEventListener('click', async (event) => {
			event.preventDefault()
			event.stopPropagation()

			const item = sheet.actor.items.get(icon.dataset.itemId)
			if (!item) return
			const charges = item.system.charges
			if (!charges || charges.max <= 0) return

			const used = charges.value || 0
			if (used >= charges.max) return // all used up
			const newUsed = used + 1
			await item.update({ 'system.charges.value': newUsed })

			// Post to chat
			const desc = item.system.effects || stripSecrets(item.system.notes) || ''
			const remaining = charges.max - newUsed
			const usageInfo = `<span class="trait-chat-usage">${remaining}/${charges.max} ${game.i18n.localize('DOLMEN.Traits.Remaining')}</span>`
			const descHtml = desc ? `<div class="trait-chat-desc">${desc}</div>` : ''
			const content = `
				<div class="dolmen trait-roll">
					<div class="trait-header">
						<h3>${item.name}</h3>
					</div>
					${descHtml}
					${usageInfo}
				</div>`
			await createChatMessage({
				speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
				content,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
		})

		// Right-click: restore a charge
		icon.addEventListener('contextmenu', async (event) => {
			event.preventDefault()
			event.stopPropagation()

			const item = sheet.actor.items.get(icon.dataset.itemId)
			if (!item) return
			const charges = item.system.charges
			if (!charges || charges.max <= 0) return

			const used = charges.value || 0
			if (used <= 0) return // none used
			await item.update({ 'system.charges.value': used - 1 })
		})
	})
}
