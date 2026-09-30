/* global foundry, game, Dialog, CONFIG, ui, Item, ChatMessage, CONST */
import { buildChoices, buildChoicesWithBlank, formatWeaponProficiency, formatArmorProficiency, CHOICE_KEYS } from './utils/choices.js'
import { getFutureDateKey, getFutureDateKeyByYears } from './calendar/calendar-time.js'
import { addRuneRefreshNote } from './sheet/listeners.js'
import { parseSaveLinks } from './chat-save.js'

// Sheet module imports
import {
	computeXPModifier, computeMoonSign,
	prepareSpellSlots, prepareKnackAbilities, prepareSpellData,
	groupSpellsByRank, prepareMemorizedSlots, groupRunesByMagnitude,
	groupItemsByType, prepareItemData, getRuneUsage, computeSkillPoints, calcItemWeight
} from './sheet/data-context.js'
import {
	isKindredClass, getAlignmentRestrictions, buildCustomSections,
	prepareKindredTraits, prepareClassTraits, prepareKindredClassTraits
} from './sheet/trait-helpers.js'
import {
	setupTabListeners, setupXPListener, setupLevelListeners, setupCoinListener,
	setupPortraitPicker, setupSkillListeners, setupAttackListeners, setupInventoryWeaponAttackListeners,
	setupAbilityRollListeners, setupSaveRollListeners,
	setupSkillRollListeners, setupUnitConversionListeners, setupLanguagesListener,
	setupDetailsRollListeners, setupExtraDetailsRollListeners,
	setupBackgroundRollListener, setupNameRollListener,
	setupTraitListeners, setupAdjustableInputListeners,
	setupRuneUsageListeners, setupKnackUsageListeners,
	setupChargesListeners, setupTreasureBankToggle
} from './sheet/listeners.js'
import { openAddSkillDialog, removeSkill } from './sheet/dialogs.js'
import { createContextMenu } from './sheet/context-menu.js'
import { onOpenItem, onIncreaseQty, onDecreaseQty, onToggleContainer, createDeleteItemHandler, onEquipItem, onStowItem, onRemoveFromContainer } from './sheet/inventory-actions.js'
import { getEffectTargetLabel } from './effect-fields.js'
import { createChatMessage } from './sheet/chat-helpers.js'

const TextEditor = foundry.applications.ux.TextEditor.implementation
const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

/**
 * Convert a height formula (in inches) to a display string with feet/inches notation.
 * e.g. "64 + 2d6" → "5'4\" + 2d6\""
 * @param {string} formula - Height formula where the base number is total inches
 * @returns {string} Formatted height string
 */
function formatHeightFormula(formula) {
	const match = formula.match(/^(\d+)\s*(.*)$/)
	if (!match) return formula
	const baseInches = parseInt(match[1])
	const rest = match[2].trim()
	const feet = Math.floor(baseInches / 12)
	const inches = baseInches % 12
	const base = inches > 0 ? `${feet}'${inches}"` : `${feet}'`
	return rest ? `${base} ${rest}"` : base
}

/**
 * Build a structural path (array of child indices) from a root element down
 * to a descendant, so the matching element can be located in a re-rendered
 * copy of the same subtree.
 * @param {HTMLElement} el - The descendant element
 * @param {HTMLElement} root - The ancestor to stop at
 * @returns {number[]|null} Child indices from root to el, or null if not nested
 */
function getElementPath(el, root) {
	const path = []
	while (el && el !== root) {
		const parent = el.parentElement
		if (!parent) return null
		path.unshift(Array.prototype.indexOf.call(parent.children, el))
		el = parent
	}
	return el === root ? path : null
}

/**
 * Resolve a structural path produced by getElementPath back to an element.
 * @param {HTMLElement} root - The ancestor the path is relative to
 * @param {number[]} path - Child indices from root
 * @returns {HTMLElement|null} The element at that path, or null if absent
 */
function getElementAtPath(root, path) {
	let el = root
	for (const idx of path) {
		el = el?.children[idx]
		if (!el) return null
	}
	return el
}

/**
 * Clean up memorized spell slots before deleting a spell item.
 * @param {Actor} actor - The actor owning the item
 * @param {Item} item - The item being deleted
 */
async function cleanupSpellSlots(actor, item) {
	if (!['Spell', 'HolySpell'].includes(item.type)) return
	const magicPath = item.type === 'HolySpell' ? 'holyMagic' : 'arcaneMagic'
	const slotsData = actor.system[magicPath]?.spellSlots
	if (!slotsData) return
	const updates = {}
	for (const [key, slot] of Object.entries(slotsData)) {
		const memorized = slot.memorized
		if (memorized?.includes(item.id)) {
			updates[`system.${magicPath}.spellSlots.${key}.memorized`] =
				memorized.map(id => id === item.id ? null : id)
		}
	}
	if (Object.keys(updates).length) {
		await actor.update(updates)
	}
}

class DolmenSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	constructor(options = {}) {
		super(options)
		this._updatingKindredClass = false
	}

	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'actor'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 900,
			height: 650,
		},
		window: {
			resizable: true,
		},
		actions: {
			addSkill: DolmenSheet._onAddSkill,
			removeSkill: DolmenSheet._onRemoveSkill,
			setKindred: DolmenSheet._onSetKindred,
			setClass: DolmenSheet._onSetClass,
			openItem: onOpenItem,
			equipItem: onEquipItem,
			stowItem: onStowItem,
			deleteItem: createDeleteItemHandler(cleanupSpellSlots),
			increaseQty: onIncreaseQty,
			decreaseQty: onDecreaseQty,
			memorizeSpell: DolmenSheet._onMemorizeSpell,
			forgetSpell: DolmenSheet._onForgetSpell,
			memorizeToSlot: DolmenSheet._onMemorizeToSlot,
			castSpell: DolmenSheet._onCastSpell,
			setExhaustion: DolmenSheet._onSetExhaustion,
			toggleContainer: onToggleContainer,
			removeFromContainer: onRemoveFromContainer,
			addInventoryItem: DolmenSheet._onAddInventoryItem,
			addSpell: DolmenSheet._onAddSpell,
			addEffect: DolmenSheet._onAddEffect,
			deleteEffect: DolmenSheet._onDeleteEffect,
			toggleEffect: DolmenSheet._onToggleEffect,
			toggleGearEffect: DolmenSheet._onToggleGearEffect,
			openItemEffects: DolmenSheet._onOpenItemEffects
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-stats.html',
			scrollable: ['']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-inventory.html',
			scrollable: ['']
		},
		magic: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-magic.html',
			scrollable: ['']
		},
		traits: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-traits.html',
			scrollable: ['']
		},
		details: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-details.html',
			scrollable: ['']
		},
		effects: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-effects.html',
			scrollable: ['']
		},
		notes: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-notes.html',
			scrollable: ['']
		},
		settings: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-settings.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-user', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'inventory', icon: 'fas fa-backpack', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'magic', icon: 'fas fa-sparkles', label: 'DOLMEN.Tabs.Magic' },
				{ id: 'traits', icon: 'fas fa-person-rays', label: 'DOLMEN.Tabs.Traits' },
				{ id: 'details', icon: 'fas fa-eye', label: 'DOLMEN.Tabs.Details' },
				{ id: 'effects', icon: 'fas fa-bolt', label: 'DOLMEN.Tabs.Effects' },
				{ id: 'notes', icon: 'fas fa-note-sticky', label: 'DOLMEN.Tabs.Notes' },
				{ id: 'settings', icon: 'fas fa-cog', label: '' }
			],
			initial: 'stats'
		}
	}

	tabGroups = {
		primary: 'stats',
		magic: 'arcane'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
			const group = {}
			for (const t of config.tabs) {
				group[t.id] = {
					id: t.id,
					group: groupId,
					icon: t.icon,
					label: game.i18n.localize(t.label),
					active: this.tabGroups[groupId] === t.id,
					cssClass: this.tabGroups[groupId] === t.id ? 'active' : ''
				}
			}
			tabs[groupId] = group
		}
		return tabs
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const actor = this.actor

		// Add actor and system data
		context.actor = actor
		context.system = actor.system
		context.isGM = game.user.isGM
		context.isToken = actor.isToken
		context.isLinked = actor.isToken ? actor.token.actorLink : actor.prototypeToken.actorLink

		// Prepare tabs for the tabs part
		context.tabs = this._getTabs()

		// Kindred and Class items
		const kindredItem = actor.getKindredItem()
		const classItem = actor.getClassItem()
		context.kindredItem = kindredItem
		context.classItem = classItem
		// Extract IDs as plain strings for template dropdown matching
		context.kindredName = kindredItem?.system?.kindredId || null
		context.className = classItem?.system?.classId || null

		// Build dropdown choices from compendia, module packs, and world items
		// Priority: system compendium > "New Player Options" packs from modules > world items
		const playerOptionPacks = game.packs.filter(p =>
			p.metadata.label === 'New Player Options' && p.metadata.type === 'Item'
		)

		const kindredMap = new Map()
		const kindredPack = game.packs.get('dolmenwood.kindreds')
		if (kindredPack) {
			const kindredIndex = await kindredPack.getIndex({ fields: ['system.kindredId'] })
			for (const e of kindredIndex) {
				if (e.system?.kindredId) {
					kindredMap.set(e.system.kindredId, game.i18n.localize(`DOLMEN.Kindreds.${e.system.kindredId}`))
				}
			}
		}
		for (const pack of playerOptionPacks) {
			const index = await pack.getIndex({ fields: ['system.kindredId'] })
			for (const e of index.filter(e => e.type === 'Kindred' && e.system?.kindredId)) {
				if (!kindredMap.has(e.system.kindredId)) {
					const locKey = `DOLMEN.Kindreds.${e.system.kindredId}`
					const localized = game.i18n.localize(locKey)
					kindredMap.set(e.system.kindredId, localized !== locKey ? localized : e.name)
				}
			}
		}
		for (const item of game.items.filter(i => i.type === 'Kindred')) {
			if (item.system?.kindredId && !kindredMap.has(item.system.kindredId)) {
				const locKey = `DOLMEN.Kindreds.${item.system.kindredId}`
				const localized = game.i18n.localize(locKey)
				kindredMap.set(item.system.kindredId, localized !== locKey ? localized : item.name)
			}
		}
		context.kindredChoices = Object.fromEntries(
			[...kindredMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
		)

		const classMap = new Map()
		const classPack = game.packs.get('dolmenwood.classes')
		if (classPack) {
			const classIndex = await classPack.getIndex({ fields: ['system.classId', 'system.requiredKindred'] })
			for (const e of classIndex) {
				if (e.system?.classId) {
					classMap.set(e.system.classId, {
						label: game.i18n.localize(`DOLMEN.Classes.${e.system.classId}`),
						isKindredClass: !!e.system.requiredKindred
					})
				}
			}
		}
		for (const pack of playerOptionPacks) {
			const index = await pack.getIndex({ fields: ['system.classId', 'system.requiredKindred'] })
			for (const e of index.filter(e => e.type === 'Class' && e.system?.classId)) {
				if (!classMap.has(e.system.classId)) {
					const locKey = `DOLMEN.Classes.${e.system.classId}`
					const localized = game.i18n.localize(locKey)
					classMap.set(e.system.classId, {
						label: localized !== locKey ? localized : e.name,
						isKindredClass: !!e.system.requiredKindred
					})
				}
			}
		}
		for (const item of game.items.filter(i => i.type === 'Class')) {
			if (item.system?.classId && !classMap.has(item.system.classId)) {
				const locKey = `DOLMEN.Classes.${item.system.classId}`
				const localized = game.i18n.localize(locKey)
				classMap.set(item.system.classId, {
					label: localized !== locKey ? localized : item.name,
					isKindredClass: !!item.system.requiredKindred
				})
			}
		}
		const classEntries = [...classMap.entries()]
			.map(([id, v]) => ({ id, label: v.label, isKindredClass: v.isKindredClass }))
			.sort((a, b) => a.isKindredClass === b.isKindredClass ? a.label.localeCompare(b.label) : a.isKindredClass ? 1 : -1)
		context.classChoices = Object.fromEntries(classEntries.map(e => [e.id, e.label]))

		// Apply alignment restrictions from traits
		const alignRestrictions = getAlignmentRestrictions(actor)
		if (alignRestrictions && alignRestrictions.length > 0) {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', alignRestrictions)
		} else {
			context.alignmentChoices = buildChoices('DOLMEN.Alignments', CHOICE_KEYS.alignments)
		}
		context.encumbranceMethod = game.settings.get('dolmenwood', 'encumbranceMethod')
		context.encumbranceMethodLabel = game.i18n.localize(`DOLMEN.Encumbrance.${context.encumbranceMethod}`)
		context.inventoryShowEquip = true
		context.exhaustionValues = [0, -1, -2, -3, -4].map(v => ({
			value: v,
			label: v === 0 ? '0' : String(v),
			selected: actor.system.exhaustion === v
		}))
		context.monthNameChoices = buildChoicesWithBlank('DOLMEN.Months', CHOICE_KEYS.months)
		// Build day choices (1-31) for birthday selector
		const dayChoices = { 0: ' ' }
		const selectedMonth = actor.system.birthMonth
		const monthData = CONFIG.DOLMENWOOD.months[selectedMonth]
		const maxDays = monthData ? monthData.days : 31
		for (let d = 1; d <= maxDays; d++) dayChoices[d] = String(d)
		context.dayChoices = dayChoices
		// Fairy kindred flag
		context.isFairy = actor.system.creatureType === 'fairy'

		// Compute moon sign from birthday (fairies have no moon sign)
		if (context.isFairy) {
			context.moonSignLabel = `${game.i18n.localize('DOLMEN.None')} (${game.i18n.localize('DOLMEN.CreatureTypes.fairy')})`
		} else {
			const moonSign = computeMoonSign(actor.system.birthMonth, actor.system.birthDay)
			if (moonSign) {
				const moonLabel = game.i18n.localize(`DOLMEN.MoonNames.${moonSign.moon}`)
				const phaseLabel = game.i18n.localize(`DOLMEN.MoonPhases.${moonSign.phase}`)
				context.moonSignLabel = `${moonLabel} ${game.i18n.localize('DOLMEN.Moon')} (${phaseLabel})`
			} else {
				context.moonSignLabel = '—'
			}
		}
		context.creatureTypeChoices = buildChoices('DOLMEN.CreatureTypes', CHOICE_KEYS.creatureTypes)
		context.creatureTypeLabel = game.i18n.localize(`DOLMEN.CreatureTypes.${actor.system.creatureType}`)

		// Localize language names for display
		const langIds = actor.system.languages || []
		context.localizedLanguages = (Array.isArray(langIds) ? langIds : [])
			.map(id => {
				const key = `DOLMEN.Languages.${id}`
				return game.i18n.has(key) ? game.i18n.localize(key) : id
			})
			.join(', ')

		// Max extra skills for template conditional
		context.maxExtraSkills = CONFIG.DOLMENWOOD.maxExtraSkills

		// Compute effective adjustment for each extra skill
		const skillAdj = actor.system.adjustments?.skills || {}
		const skillsAllAdj = actor.system.adjustments?.skillsAll || 0
		const customSkillEffects = actor.system._customSkillEffects || {}
		context.extraSkills = (actor.system.extraSkills || []).map(s => ({
			...s,
			effectiveAdj: s.customName
				? (s.adjustment || 0) + skillsAllAdj + (customSkillEffects[s.customName] || 0)
				: (skillAdj[s.id] || 0)
		}))

		// Determine body/fur label based on kindred
		const hasFur = kindredItem?.system?.hasFur
		const kindred = kindredItem?.system?.kindredId
		context.bodyLabel = hasFur
			? game.i18n.localize('DOLMEN.ExtraDetails.Fur')
			: game.i18n.localize('DOLMEN.ExtraDetails.Body')

		// Compute class detail strings from class item data
		if (classItem?.system) {
			const sys = classItem.system
			// Prime abilities: localize each ability name
			context.primeAbilities = sys.primeAbilities?.length > 0
				? sys.primeAbilities.map(a => game.i18n.localize(`DOLMEN.Abilities.${a.charAt(0).toUpperCase() + a.slice(1)}`)).join(', ')
				: '—'
			// Hit points: localized format with die + flat bonus
			context.hitPointsClass = sys.hitDice?.die
				? game.i18n.format('DOLMEN.ClassDetails.HitPointsFormat', {
					hitDie: sys.hitDice.die,
					flatBonus: sys.hitDice.flat || 0
				})
				: '—'
			// Combat aptitude: localize
			const aptKey = `DOLMEN.Class.CombatAptitudeChoices.${sys.combatAptitude}`
			context.combatAptitude = sys.combatAptitude && game.i18n.has(aptKey)
				? game.i18n.localize(aptKey)
				: '—'
		} else {
			context.primeAbilities = '—'
			context.hitPointsClass = '—'
			context.combatAptitude = '—'
		}
		// Weapons and armor proficiency from class item data
		if (classItem?.system) {
			context.weaponsProficiency = formatWeaponProficiency(classItem.system.weaponsProficiency)
			context.armorProficiency = formatArmorProficiency(classItem.system.armorProficiency)
		} else {
			context.weaponsProficiency = '—'
			context.armorProficiency = '—'
		}

		// Compute kindred physical characteristic display strings from item data
		if (kindredItem?.system) {
			const ks = kindredItem.system
			const fmt = f => f.replace(/\*/g, '×')
			context.ageTitle = ks.ageFormula ? `${fmt(ks.ageFormula)} years` : '—'
			context.lifespanTitle = ks.lifespanFormula && ks.lifespanFormula !== '0'
				? `${fmt(ks.lifespanFormula)} years`
				: game.i18n.localize('DOLMEN.Immortal')
			context.heightTitle = ks.heightFormula ? formatHeightFormula(ks.heightFormula) : '—'
			context.weightTitle = ks.weightFormula ? `${fmt(ks.weightFormula)} lbs` : '—'
		} else {
			context.ageTitle = '—'
			context.lifespanTitle = '—'
			context.heightTitle = '—'
			context.weightTitle = '—'
		}

		// Share slider data (used for both XP and Loot sliders)
		const shareSteps = [
			{ value: 'none', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerNoShare'), pct: '0%' },
			{ value: '1/5', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerFifth'), pct: '20%' },
			{ value: '1/4', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerQuarter'), pct: '25%' },
			{ value: '1/3', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerThird'), pct: '33%' },
			{ value: '2/5', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerTwoFifths'), pct: '40%' },
			{ value: '1/2', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerHalf'), pct: '50%' },
			{ value: '3/5', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerThreeFifths'), pct: '60%' },
			{ value: '2/3', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerTwoThirds'), pct: '66%' },
			{ value: '3/4', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerThreeQuarters'), pct: '75%' },
			{ value: '4/5', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerFourFifths'), pct: '80%' },
			{ value: 'full', label: game.i18n.localize('DOLMEN.PartyViewer.RetainerFull'), pct: '100%' }
		]
		const xpIdx = Math.max(0, shareSteps.findIndex(s => s.value === (actor.system.xpShare || '1/2')))
		const lootIdx = Math.max(0, shareSteps.findIndex(s => s.value === (actor.system.lootShare || '1/2')))
		context.xpShareIndex = xpIdx
		context.xpShareLabel = shareSteps[xpIdx].pct
		context.lootShareIndex = lootIdx
		context.lootShareLabel = shareSteps[lootIdx].pct
		context.shareOptions = shareSteps.map((s, i) => ({
			label: s.label,
			pct: s.pct,
			xpActive: i === xpIdx,
			lootActive: i === lootIdx
		}))

		// Prepare inventory items grouped by type (exclude spells, Kindred, and Class items)
		const excludedTypes = ['Spell', 'HolySpell', 'Glamour', 'Rune', 'Kindred', 'Class', 'Effect']
		const items = actor.items.contents.filter(i => !excludedTypes.includes(i.type))
		const equippedItems = items.filter(i => i.system.equipped && i.type !== 'Container').map(i => prepareItemData(i))
		const allStowedItems = items.filter(i => !i.system.equipped && i.type !== 'Container').map(i => prepareItemData(i))

		// Separate containers and build container data for stowed section
		const containerItems = items.filter(i => i.type === 'Container')
		const isSlots = context.encumbranceMethod === 'slots'
		const encDisabled = context.encumbranceMethod === 'disabled'
		const weightKey = isSlots ? 'weightSlots' : 'weightCoins'
		const toGold = { cp: 0.01, sp: 0.1, gp: 1, pp: 10 }
		const treasureItemGold = (i) => {
			const cost = i.system.cost || 0
			const qty = i.system.quantity || 1
			return cost * qty * (toGold[i.system.costDenomination || 'gp'] || 1)
		}
		const treasureGold = (items, excludeBanked = false) => items
			.filter(i => i.type === 'Treasure' && (!excludeBanked || !i.system.banked))
			.reduce((sum, i) => sum + treasureItemGold(i), 0)
		const formatGold = v => v % 1 === 0 ? v : parseFloat(v.toFixed(2))
		context.containers = containerItems.map(c => {
			const prepared = prepareItemData(c)
			const contents = allStowedItems.filter(i => i.system.containerId === c.id)
			const rawCoinsUsed = contents.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
			const containerGold = treasureGold(contents, true)
			return {
				...prepared,
				contents: groupItemsByType(contents),
				hasContents: contents.length > 0,
				coinsUsed: !encDisabled && rawCoinsUsed ? rawCoinsUsed : null,
				coinsMax: isSlots ? c.system.capacitySlots : c.system.capacityCoins,
				infiniteCapacity: c.system.infiniteCapacity,
				ignoreEncumbrance: c.system.ignoreEncumbrance,
				treasureGold: containerGold ? formatGold(containerGold) : null
			}
		})
		context.hasContainers = context.containers.length > 0

		// Loose stowed items (not in any container)
		const containerIds = new Set(containerItems.map(c => c.id))
		const looseStowedItems = allStowedItems.filter(i => !i.system.containerId || !containerIds.has(i.system.containerId))

		// Group items by type
		context.equippedByType = groupItemsByType(equippedItems)
		context.stowedByType = groupItemsByType(looseStowedItems)
		context.hasEquippedItems = equippedItems.length > 0
		context.hasLooseStowedItems = looseStowedItems.length > 0
		const rawUnsortedWeight = looseStowedItems.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
		context.unsortedWeight = !encDisabled && rawUnsortedWeight ? rawUnsortedWeight : null
		const unsortedGold = treasureGold(looseStowedItems, true)
		context.unsortedTreasureGold = unsortedGold ? formatGold(unsortedGold) : null
		context.hasStowedItems = context.hasLooseStowedItems || context.hasContainers
		const rawEquippedWeight = equippedItems.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
		context.equippedWeight = !encDisabled && rawEquippedWeight ? rawEquippedWeight : null
		const totalCoins = (actor.system.coins.copper || 0) + (actor.system.coins.silver || 0)
			+ (actor.system.coins.gold || 0) + (actor.system.coins.pellucidium || 0)
		const coinsWeight = isSlots ? Math.ceil(totalCoins / 100) : totalCoins
		const rawStowedWeight = allStowedItems.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
		context.stowedWeight = !encDisabled && rawStowedWeight ? rawStowedWeight : null
		context.coinsWeight = !encDisabled && coinsWeight ? coinsWeight : null

		// Compute treasure gold values per section (new/unbanked only for section headers)
		const equippedTreasureGold = treasureGold(equippedItems, true)
		const stowedTreasureGold = treasureGold(allStowedItems, true)
		const coinsGold = (actor.system.coins.copper || 0) * 0.01
			+ (actor.system.coins.silver || 0) * 0.1
			+ (actor.system.coins.gold || 0)
			+ (actor.system.coins.pellucidium || 0) * 10
		const bankedGold = actor.system.bankedGold || 0
		const newCoinsGold = Math.max(0, coinsGold - bankedGold)
		context.equippedTreasureGold = equippedTreasureGold ? formatGold(equippedTreasureGold) : null
		context.stowedTreasureGold = stowedTreasureGold ? formatGold(stowedTreasureGold) : null
		context.coinsGold = coinsGold ? formatGold(coinsGold) : null
		context.newCoinsGold = newCoinsGold ? formatGold(newCoinsGold) : null
		const totalNewTreasure = equippedTreasureGold + stowedTreasureGold + newCoinsGold
		context.totalTreasureGold = totalNewTreasure ? formatGold(totalNewTreasure) : 0
		context.showBankButton = true

		// Prepare magic tab data
		context.knackTypeChoices = buildChoices('DOLMEN.Magic.Knacks.Types', CHOICE_KEYS.knackTypes)

		// Prepare arcane spell slots
		context.arcaneSpellSlots = prepareSpellSlots(actor.system.arcaneMagic.spellSlots, 6)

		// Prepare holy spell slots
		context.holySpellSlots = prepareSpellSlots(actor.system.holyMagic.spellSlots, 5)

		// Prepare spells by type, grouped by rank
		const arcaneSpells = actor.items.contents.filter(i => i.type === 'Spell')
		const holySpells = actor.items.contents.filter(i => i.type === 'HolySpell')
		const glamourSpells = actor.items.contents.filter(i => i.type === 'Glamour')
		const runeSpells = actor.items.contents.filter(i => i.type === 'Rune')

		// Arcane magic: known spells and memorized slots
		context.knownArcaneSpellsByRank = groupSpellsByRank(arcaneSpells, 6)
		context.memorizedArcaneSlots = prepareMemorizedSlots(
			actor.system.arcaneMagic.spellSlots,
			arcaneSpells,
			6
		)
		context.hasKnownArcaneSpells = arcaneSpells.length > 0
		context.hasMemorizedSlots = context.memorizedArcaneSlots.some(r => r.total > 0)

		// Holy magic: known spells and memorized slots
		context.knownHolySpellsByRank = groupSpellsByRank(holySpells, 5)
		context.memorizedHolySlots = prepareMemorizedSlots(
			actor.system.holyMagic.spellSlots,
			holySpells,
			5
		)
		context.hasKnownHolySpells = holySpells.length > 0
		context.hasMemorizedHolySlots = context.memorizedHolySlots.some(r => r.total > 0)

		// Fairy magic
		context.glamourSpells = glamourSpells.map(s => prepareSpellData(s))
		context.runeSpellsByMagnitude = groupRunesByMagnitude(runeSpells, actor)
		context.hasGlamourSpells = glamourSpells.length > 0
		context.hasRuneSpells = runeSpells.length > 0

		// Prepare knack abilities
		context.knackTypeLabel = actor.system.knacks.type
			? game.i18n.localize(`DOLMEN.Magic.Knacks.Types.${actor.system.knacks.type}`)
			: ''
		context.knackAbilities = prepareKnackAbilities(
			actor.system.knacks.type,
			actor.system.level,
			actor.system.knackUsage
		)

		// Prepare traits
		context.isKindredClass = isKindredClass(actor)
		if (context.isKindredClass) {
			context.kindredClassTraits = prepareKindredClassTraits(actor)
			context.hasKindredClassTraits = context.kindredClassTraits.length > 0
			// For kindred-classes, use the localized class name (e.g., "Elf", "Grimalkin")
			const kcClassItem = actor.getClassItem()
			const kcClassId = kcClassItem?.system?.classId
			context.kindredClassName = kcClassId ? game.i18n.localize(`DOLMEN.Classes.${kcClassId}`) : ''
		} else {
			context.kindredTraits = prepareKindredTraits(actor)
			context.classTraits = prepareClassTraits(actor)
			context.hasKindredTraits = context.kindredTraits.length > 0
			context.hasClassTraits = context.classTraits.length > 0
			// kindredName and className are already set earlier from embedded items
		}

		// Build generic custom sections (combat talents, holy orders, etc.) from trait metadata
		context.customSections = buildCustomSections(actor)

		// Read precomputed final values from prepareDerivedData
		context.encumbrance = actor.system.encumbranceResult || { current: 0, max: 0, speed: null }
		context.adjusted = actor.system.final || {}
		const baseSpeed = actor.system.speed
		const encSpeed = context.encumbrance.speed
		const encSpeedVal = encSpeed !== null && encSpeed !== undefined ? encSpeed : 40
		context.encumbranceSpeed = context.adjusted.speed ?? baseSpeed
		context.isEncumbered = encSpeedVal < 40

		// Compute XP modifier from prime abilities + custom adjustment
		const baseXPMod = computeXPModifier(actor, context.adjusted.abilities)
		const xpModAdj = context.adjusted.xpModifier || 0
		context.xpModifier = baseXPMod + xpModAdj
		context.xpModifierLabel = context.xpModifier >= 0
			? `+${context.xpModifier}%`
			: `${context.xpModifier}%`
		context.xpModifierLabel+= ` ${game.i18n.localize('DOLMEN.Modifier')}`

		// Check if ready to level up
		context.canLevelUp = actor.system.xp.nextLevel > 0 && actor.system.xp.value >= actor.system.xp.nextLevel

		// Compute available skill points for customize skills option
		context.skillPoints = actor.system.customizeSkills ? computeSkillPoints(actor) : 0

		// Enrich notes HTML for editor
		context.enrichedNotes = await TextEditor.enrichHTML(actor.system.background.notes || '', {
			relativeTo: actor,
			async: true,
			secrets: game.user.isGM
		})

		// Prepare detail roll tooltips (show RollTable name)
		const kindredLabel = kindred ? kindred.charAt(0).toUpperCase() + kindred.slice(1) : ''
		const detailFields = ['head', 'face', 'dress', 'body', 'demeanour', 'desires', 'beliefs', 'speech']
		context.detailTitles = {}
		for (const field of detailFields) {
			let fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
			if (field === 'body' && hasFur) fieldLabel = 'Fur'
			context.detailTitles[field] = kindredLabel ? `${kindredLabel} ${fieldLabel}` : ''
		}

		// Prepare background and name roll tooltips
		context.backgroundTitle = kindredLabel ? `${kindredLabel} Backgrounds` : ''
		context.nameTitle = kindredLabel ? `${kindredLabel} Names` : ''

		// Prepare effects tab data
		const effectItems = actor.items.filter(i => i.type === 'Effect')
		context.effectItems = effectItems.map(e => {
			const dur = e.system.duration || 'permanent'
			let durationLabel = null
			if (dur === 'untilRest' || dur === 'untilNextDay') {
				durationLabel = game.i18n.localize(`DOLMEN.Effects.Duration${dur.charAt(0).toUpperCase() + dur.slice(1)}`)
			} else if (dur !== 'permanent') {
				durationLabel = `${e.system.durationValue} ${game.i18n.localize(`DOLMEN.Effects.Duration${dur.charAt(0).toUpperCase() + dur.slice(1)}`)}`
			}
			return {
				id: e.id,
				name: e.name,
				img: e.img,
				enabled: e.system.enabled,
				target: e.system.target,
				value: e.system.value,
				effectType: e.system.effectType,
				targetLabel: getEffectTargetLabel(e.system.target),
				durationLabel
			}
		}).sort((a, b) => a.name.localeCompare(b.name))

		// Gear effects summary
		const gearTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Container']
		context.gearEffects = actor.items
			.filter(i => gearTypes.includes(i.type) && i.system.statEffects?.length > 0)
			.flatMap(item => item.system.statEffects.map((eff, idx) => ({
				itemId: item.id,
				effectIdx: idx,
				itemImg: item.img,
				itemName: item.name,
				enabled: eff.enabled,
				equipped: item.system.equipped,
				condition: eff.condition,
				conditionLabel: game.i18n.localize(`DOLMEN.Effects.Condition.${eff.condition}`),
				active: eff.enabled && (eff.condition === 'whenInPossession' || item.system.equipped),
				targetLabel: getEffectTargetLabel(eff.target),
				value: eff.value,
				effectType: eff.effectType
			})))

		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)

		// For tab content parts, add the tab object
		const tabIds = ['stats', 'inventory', 'magic', 'traits', 'details', 'effects', 'notes', 'settings']
		if (tabIds.includes(partId)) {
			context.tab = context.tabs?.primary?.[partId] || {
				id: partId,
				cssClass: this.tabGroups.primary === partId ? 'active' : ''
			}
		}

		// Ensure kindredName and className are available in all parts
		if (partId === 'stats') {
			const kindredItem = this.actor.getKindredItem()
			const classItem = this.actor.getClassItem()
			context.kindredName = kindredItem?.system?.kindredId || null
			context.className = classItem?.system?.classId || null
		}

		return context
	}

	/* -------------------------------------------- */
	/*  Scroll Position Preservation                */
	/* -------------------------------------------- */

	/**
	 * Capture scroll positions of every scrolled descendant before a part is
	 * replaced, keyed by structural path. Foundry's built-in `scrollable`
	 * config only restores the part root or a single querySelector match, so
	 * it loses scroll on the multiple independent lists in our parts (the two
	 * inventory columns, the various spell lists, etc.).
	 */
	_preSyncPartState(partId, newElement, priorElement, state) {
		super._preSyncPartState(partId, newElement, priorElement, state)
		state.dolmenScroll = []
		for (const el of priorElement.querySelectorAll('*')) {
			if (el.scrollTop > 0) {
				const path = getElementPath(el, priorElement)
				if (path) state.dolmenScroll.push([path, el.scrollTop])
			}
		}
	}

	/**
	 * Restore the scroll positions captured in _preSyncPartState onto the
	 * matching elements of the freshly-rendered part.
	 */
	_syncPartState(partId, newElement, priorElement, state) {
		super._syncPartState(partId, newElement, priorElement, state)
		const positions = state.dolmenScroll || []
		if (!positions.length) return
		const restore = () => {
			for (const [path, scrollTop] of positions) {
				const el = getElementAtPath(newElement, path)
				if (el) el.scrollTop = scrollTop
			}
		}
		// Immediate restore handles lists in the always-visible primary tab
		// (inventory). Lists inside magic sub-tabs are display:none at this
		// point — the active sub-tab class is applied later in _onRender — so
		// scrollTop is clamped to 0 there. Re-apply on the next frame, once the
		// sub-tab has been made visible, to preserve those scroll positions too.
		restore()
		requestAnimationFrame(restore)
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	async render(options = {}) {
		// Prevent renders during kindred/class update
		if (this._updatingKindredClass && !options.force) {
			return this
		}
		return super.render(options)
	}

	_prepareSubmitData(event, form, formData) {
		// Sanitize extraSkills adjustment values before validation in super
		const obj = formData.object
		for (const key of Object.keys(obj)) {
			if (key.match(/^system\.extraSkills\.\d+\.adjustment$/)) {
				obj[key] = parseInt(obj[key]) || 0
			}
		}
		// Convert retainer radio to boolean
		if ('system.retainer' in obj) {
			obj['system.retainer'] = obj['system.retainer'] === 'true'
		}
		// Convert share slider indices to string values
		const shareValues = ['none', '1/5', '1/4', '1/3', '2/5', '1/2', '3/5', '2/3', '3/4', '4/5', 'full']
		for (const key of ['system.xpShare', 'system.lootShare']) {
			if (key in obj) obj[key] = shareValues[parseInt(obj[key])] ?? 'full'
		}
		const submitData = super._prepareSubmitData(event, form, formData)
		// Remove kindred/class selects from submission (they're handled separately)
		delete submitData._kindred
		delete submitData._class
		return submitData
	}

	/* -------------------------------------------- */
	/*  Event Listener Setup                        */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

		// Actor link toggle (only interactive on base actors, not placed tokens)
		if (!this.actor.isToken) {
			this.element.querySelector('.actor-link-icon')?.addEventListener('click', async () => {
				const linked = !this.actor.prototypeToken.actorLink
				await this.actor.update({'prototypeToken.actorLink': linked})
			})
		}

		// Toggle retainer share sliders visibility
		const sharesPanel = this.element.querySelector('.retainer-shares')
		this.element.querySelectorAll('input[name="system.retainer"]').forEach(radio => {
			radio.addEventListener('change', (ev) => {
				if (sharesPanel) sharesPanel.hidden = ev.target.value !== 'true'
			})
		})

		// Share slider live label updates
		this.element.querySelectorAll('.retainer-slider input[type="range"]').forEach(slider => {
			slider.addEventListener('input', (ev) => {
				const key = ev.target.dataset.slider
				const idx = parseInt(ev.target.value)
				const ticks = this.element.querySelector(`[data-labels="${key}"]`)?.querySelectorAll('.retainer-tick')
				ticks?.forEach((t, i) => t.classList.toggle('active', i === idx))
				const valueEl = this.element.querySelector(`[data-value="${key}"]`)
				if (valueEl && ticks?.[idx]) valueEl.textContent = `(${ticks[idx].dataset.pct})`
			})
		})

		setupTabListeners(this)
		setupXPListener(this)
		setupLevelListeners(this)
		setupCoinListener(this)
		setupPortraitPicker(this)
		setupSkillListeners(this)
		setupAttackListeners(this)
		setupInventoryWeaponAttackListeners(this)
		setupAbilityRollListeners(this)
		setupSaveRollListeners(this)
		setupSkillRollListeners(this)
		setupUnitConversionListeners(this)
		setupLanguagesListener(this)
		setupDetailsRollListeners(this)
		setupExtraDetailsRollListeners(this)
		setupBackgroundRollListener(this)
		setupNameRollListener(this)
		setupTraitListeners(this)
		setupRuneUsageListeners(this)
		setupKnackUsageListeners(this)
		setupChargesListeners(this)
		setupTreasureBankToggle(this)
		setupAdjustableInputListeners(this)

		// Setup kindred and class select listeners
		// These are handled separately to prevent form submission interference
		const kindredSelect = this.element.querySelector('.kindred-select')
		if (kindredSelect) {
			// Remove any existing listeners by cloning the element
			const newKindredSelect = kindredSelect.cloneNode(true)
			kindredSelect.parentNode.replaceChild(newKindredSelect, kindredSelect)

			newKindredSelect.addEventListener('change', async (event) => {
				event.preventDefault()
				event.stopPropagation()
				const kindredId = event.target.value
				if (kindredId) {
					this._updatingKindredClass = true
					await this.actor.setKindred(kindredId)
					this._updatingKindredClass = false
					this.render()
				}
			})
		}

		const classSelect = this.element.querySelector('.class-select')
		if (classSelect) {
			// Remove any existing listeners by cloning the element
			const newClassSelect = classSelect.cloneNode(true)
			classSelect.parentNode.replaceChild(newClassSelect, classSelect)

			newClassSelect.addEventListener('change', async (event) => {
				event.preventDefault()
				event.stopPropagation()
				const classId = event.target.value
				if (classId) {
					this._updatingKindredClass = true
					await this.actor.setClass(classId)
					this._updatingKindredClass = false
					this.render()
				}
			})
		}

	}

	/* -------------------------------------------- */
	/*  Static Action Handlers                      */
	/* -------------------------------------------- */

	static _onAddSkill() {
		openAddSkillDialog(this)
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		removeSkill(this, index)
	}

	static async _onSetKindred(_event, target) {
		const kindredId = target.value
		if (kindredId) {
			await this.actor.setKindred(kindredId)
			// Foundry auto-renders on actor updates
		}
	}

	static async _onSetClass(_event, target) {
		const classId = target.value
		if (classId) {
			await this.actor.setClass(classId)
			// Foundry auto-renders on actor updates
		}
	}

	static async _onMemorizeSpell(_event, target) {
		const itemId = target.dataset.itemId
		const spellType = target.dataset.spellType || 'arcane'
		if (!itemId) return

		const spell = this.actor.items.get(itemId)
		if (!spell) return

		const rank = spell.system.rank
		const slotKey = `rank${rank}`
		const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
		const slotData = this.actor.system[magicPath].spellSlots[slotKey]

		if (!slotData || slotData.max === 0) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.NoSlotsForRank'))
			return
		}

		const memorized = [...(slotData.memorized || [])]

		let emptyIndex = -1
		for (let i = 0; i < slotData.max; i++) {
			if (!memorized[i]) {
				emptyIndex = i
				break
			}
		}

		if (emptyIndex === -1) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.AllSlotsFull'))
			return
		}

		memorized[emptyIndex] = itemId
		await this.actor.update({
			[`system.${magicPath}.spellSlots.${slotKey}.memorized`]: memorized
		})
	}

	static async _onForgetSpell(_event, target) {
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey
		const spellType = target.dataset.spellType || 'arcane'

		if (isNaN(slotIndex) || !rankKey) return

		const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
		const slotData = this.actor.system[magicPath].spellSlots[rankKey]
		const memorized = [...(slotData.memorized || [])]

		memorized[slotIndex] = null
		await this.actor.update({
			[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized
		})
	}

	static async _onMemorizeToSlot(_event, target) {
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey
		const rank = parseInt(target.dataset.rank)
		const spellType = target.dataset.spellType || 'arcane'

		if (isNaN(slotIndex) || !rankKey || isNaN(rank)) return

		const itemType = spellType === 'holy' ? 'HolySpell' : 'Spell'
		const knownSpells = this.actor.items.filter(
			i => i.type === itemType && i.system.rank === rank
		)

		if (knownSpells.length === 0) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.Magic.NoKnownSpellsForRank'))
			return
		}

		const options = knownSpells.map(s =>
			`<option value="${s.id}">${s.name}</option>`
		).join('')

		const content = `
			<div class="memorize-spell-modal">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Magic.SelectSpellToMemorize')}</label>
					<select id="spell-select">${options}</select>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.Magic.MemorizeSpell'),
			content: content,
			buttons: {
				memorize: {
					icon: '<i class="fas fa-book-sparkles"></i>',
					label: game.i18n.localize('DOLMEN.Magic.Memorize'),
					callback: async (html) => {
						const spellId = html.find('#spell-select').val()
						const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
						const slotData = this.actor.system[magicPath].spellSlots[rankKey]
						const memorized = [...(slotData.memorized || [])]
						memorized[slotIndex] = spellId
						await this.actor.update({
							[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized
						})
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'memorize'
		})

		dialog.render(true)
	}

	static async _onCastSpell(_event, target) {
		const itemId = target.dataset.itemId
		const item = this.actor.items.get(itemId)
		if (!item) return

		const spellType = target.dataset.spellType
		const slotIndex = parseInt(target.dataset.slotIndex)
		const rankKey = target.dataset.rankKey

		// For arcane/holy memorized spells: remove from slot on use
		if (spellType && !isNaN(slotIndex) && rankKey) {
			const magicPath = spellType === 'holy' ? 'holyMagic' : 'arcaneMagic'
			const slotData = this.actor.system[magicPath].spellSlots[rankKey]
			const memorized = [...(slotData.memorized || [])]
			memorized[slotIndex] = null
			await this.actor.update({
				[`system.${magicPath}.spellSlots.${rankKey}.memorized`]: memorized
			})
		}

		// For runes: increment usage, handle refresh dates, and delete "once ever" runes
		if (item.type === 'Rune') {
			const magnitude = item.system.magnitude || 'lesser'
			const usage = getRuneUsage(magnitude, this.actor.system.level)
			const qty = item.system.quantity || 1
			const totalMax = usage.max * qty
			const runeUsage = foundry.utils.deepClone(this.actor.system.runeUsage || {})
			const runeData = runeUsage[itemId] || { used: 0, max: totalMax }
			runeData.used = Math.min(runeData.used + 1, totalMax)
			runeData.max = totalMax

			// Add refresh date and calendar note for week/year runes
			if (usage.frequencyType === 'week' || usage.frequencyType === 'year') {
				if (!runeData.refreshDates) runeData.refreshDates = []
				if (!runeData.refreshNoteIds) runeData.refreshNoteIds = []
				const refreshDate = usage.frequencyType === 'week'
					? getFutureDateKey(7)
					: getFutureDateKeyByYears(1)
				runeData.refreshDates.push(refreshDate)
				const noteId = await addRuneRefreshNote(refreshDate, item.name, this.actor.name)
				runeData.refreshNoteIds.push(noteId)
			}

			runeUsage[itemId] = runeData
			await this.actor.update({ 'system.runeUsage': runeUsage })

			if (usage.deleteOnUse && runeData.used >= totalMax) {
				await item.delete()
			}
		}

		// Build chat message
		const sys = item.system
		const typeLabels = {
			Spell: 'DOLMEN.Magic.Arcane.Title',
			HolySpell: 'DOLMEN.Magic.Holy.Title',
			Glamour: 'DOLMEN.Magic.Fairy.Glamours',
			Rune: 'DOLMEN.Magic.Fairy.Runes'
		}
		const typeLabel = game.i18n.localize(typeLabels[item.type] || typeLabels.Spell)

		let fields = ''
		if (sys.rank !== undefined) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.SpellRank')}:</strong> ${sys.rank}</div>`
		}
		if (sys.prayerName) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Prayer')}:</strong> ${sys.prayerName}</div>`
		}
		if (sys.magnitude) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Fairy.Magnitude')}:</strong> ${game.i18n.localize(`DOLMEN.Magic.Fairy.Magnitudes.${sys.magnitude}`)}</div>`
		}
		if (sys.range) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Range')}:</strong> ${sys.range}</div>`
		}
		if (sys.duration) {
			fields += `<div class="spell-field"><strong>${game.i18n.localize('DOLMEN.Magic.Duration')}:</strong> ${sys.duration}</div>`
		}
		if (sys.description) {
			fields += `<div class="spell-description">${parseSaveLinks(sys.description)}</div>`
		}
		if (sys.codexUuid) {
			fields += `<div class="spell-codex-link">@UUID[${sys.codexUuid}]{${game.i18n.localize('DOLMEN.Magic.CodexLink')}}</div>`
		}

		const content = `
			<div class="dolmen spell-card">
				<div class="spell-header">
					<img src="${item.img}" class="spell-card-image">
					<div class="spell-info">
						<h3>${item.name}</h3>
						<span class="spell-type-label">${typeLabel}</span>
					</div>
				</div>
				<div class="spell-body">${fields}</div>
			</div>`

		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	static async _onSetExhaustion(_event, target) {
		const value = Number(target.dataset.value)
		await this.actor.update({ 'system.exhaustion': value })
	}

	static _onAddInventoryItem(event, target) {
		const slot = target.dataset.slot
		const equipped = slot === 'equipped'
		const itemTypes = [
			{ type: 'Item', icon: 'fas fa-sack', label: game.i18n.localize('TYPES.Item.Item') },
			{ type: 'Weapon', icon: 'fas fa-sword', label: game.i18n.localize('TYPES.Item.Weapon') },
			{ type: 'Armor', icon: 'fas fa-shield', label: game.i18n.localize('TYPES.Item.Armor') },
			{ type: 'Treasure', icon: 'fas fa-gem', label: game.i18n.localize('TYPES.Item.Treasure') },
			{ type: 'Foraged', icon: 'fas fa-leaf', label: game.i18n.localize('TYPES.Item.Foraged') },
			{ type: 'Container', icon: 'fas fa-box', label: game.i18n.localize('TYPES.Item.Container') }
		]
		const html = itemTypes.map(t =>
			`<div class="weapon-menu-item" data-type="${t.type}"><i class="${t.icon}"></i><span class="weapon-name">${t.label}</span></div>`
		).join('')
		const rect = target.getBoundingClientRect()
		const menu = createContextMenu(this, {
			html,
			position: { top: rect.bottom, left: rect.right },
			menuClass: 'dolmen-add-item-menu',
			itemSelector: '.weapon-menu-item',
			onItemClick: async (menuItem, m) => {
				const type = menuItem.dataset.type
				const name = game.i18n.localize(`TYPES.Item.${type}`)
				const itemData = { name, type, system: { equipped } }
				const created = await this.actor.createEmbeddedDocuments('Item', [itemData])
				m.remove()
				if (created?.[0]) created[0].sheet.render(true)
			}
		})
		// Reposition: align right edge of menu with right edge of button
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${rect.right - menuRect.width}px`
	}

	static _onAddSpell(event, target) {
		const spellType = target.dataset.spellType
		const isHoly = spellType === 'holy'
		const maxRank = isHoly ? 5 : 6
		const itemType = isHoly ? 'HolySpell' : 'Spell'

		const ranks = []
		for (let i = 1; i <= maxRank; i++) {
			ranks.push({ rank: i, label: `${game.i18n.localize('DOLMEN.Magic.SpellRank')} ${i}` })
		}

		const html = ranks.map(r =>
			`<div class="weapon-menu-item" data-rank="${r.rank}"><span class="weapon-name">${r.label}</span></div>`
		).join('')

		const rect = target.getBoundingClientRect()
		const menu = createContextMenu(this, {
			html,
			position: { top: rect.bottom, left: rect.right },
			menuClass: 'dolmen-add-item-menu',
			itemSelector: '.weapon-menu-item',
			onItemClick: async (menuItem, m) => {
				const rank = parseInt(menuItem.dataset.rank)
				const name = game.i18n.localize(`TYPES.Item.${itemType}`)
				const itemData = { name, type: itemType, system: { rank } }
				const created = await this.actor.createEmbeddedDocuments('Item', [itemData])
				m.remove()
				if (created?.[0]) created[0].sheet.render(true)
			}
		})
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${rect.right - menuRect.width}px`
	}

	// Divide item cost by qty, converting to lower denomination if needed
	static _divideCost(system, qty) {
		if (!system.cost || qty <= 1) return
		const denomOrder = ['pp', 'gp', 'sp', 'cp']
		const toCopper = { pp: 1000, gp: 100, sp: 10, cp: 1 }
		const totalCp = system.cost * (toCopper[system.costDenomination] || 1)
		const perUnit = totalCp / qty
		for (const denom of denomOrder) {
			const val = perUnit / toCopper[denom]
			if (Number.isInteger(val) && val > 0) {
				system.cost = val
				system.costDenomination = denom
				return
			}
		}
		system.cost = Math.round(perUnit)
		system.costDenomination = 'cp'
	}

	static async _onAddEffect() {
		const itemData = {
			name: game.i18n.localize('DOLMEN.Effects.NewEffect'),
			type: 'Effect'
		}
		const created = await this.actor.createEmbeddedDocuments('Item', [itemData])
		if (created?.[0]) created[0].sheet.render(true)
	}

	static async _onDeleteEffect(event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item) await item.delete()
	}

	static async _onToggleEffect(event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item) await item.update({ 'system.enabled': !item.system.enabled })
	}

	static async _onToggleGearEffect(event, target) {
		const row = target.closest('[data-item-id]')
		const itemId = row?.dataset.itemId
		const idx = parseInt(row?.dataset.effectIdx)
		if (!itemId || isNaN(idx)) return
		const item = this.actor.items.get(itemId)
		if (!item) return
		const effects = foundry.utils.deepClone(item.system.statEffects || [])
		if (effects[idx]) {
			effects[idx].enabled = !effects[idx].enabled
			await item.update({ 'system.statEffects': effects })
		}
	}

	static _onOpenItemEffects(event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (!item) return
		item.sheet.tabGroups = { primary: 'effects' }
		item.sheet.render(true)
	}

	async _onDrop(event) {
		const data = TextEditor.getDragEventData(event)

		// Handle item drops
		if (data.type === 'Item') {
			const targetList = event.target.closest('[data-item-list]')?.dataset.itemList
			const item = await Item.fromDropData(data)

			// If dropped from another actor or compendium, create a copy
			if (item.parent !== this.actor) {
				let itemData = item.toObject()
				itemData.system.equipped = targetList === 'equipped'
				// Strip trailing "(N)" from name, set quantity
				const qtyMatch = itemData.name.match(/\s*\((\d+)\)\s*$/)
				if (qtyMatch) {
					const qty = parseInt(qtyMatch[1]) || 1
					const baseName = itemData.name.replace(/\s*\(\d+\)\s*$/, '').trim()
					// Try to find the base item in the same compendium
					let found = false
					const uuid = data.uuid || ''
					const compMatch = uuid.match(/^Compendium\.([^.]+\.[^.]+)\./)
					if (compMatch) {
						const pack = game.packs.get(compMatch[1])
						if (pack) {
							const index = pack.index.find(e => e.name === baseName)
							if (index) {
								const baseItem = await pack.getDocument(index._id)
								if (baseItem) {
									itemData = baseItem.toObject()
									itemData.system.equipped = targetList === 'equipped'
									found = true
								}
							}
						}
					}
					// Fallback: strip name and divide weight/cost
					if (!found) {
						itemData.name = baseName
						if (qty > 1) {
							if (itemData.system.weightCoins) itemData.system.weightCoins = +(itemData.system.weightCoins / qty).toFixed(2)
							DolmenSheet._divideCost(itemData.system, qty)
						}
					}
					if (itemData.system.quantity !== undefined) {
						itemData.system.quantity = qty
					}
				}
				// Strip "(Bag of X)" from name, divide weight and cost by X
				const bagMatch = itemData.name.match(/\s*\(Bag of (\d+)\)\s*$/i)
				if (bagMatch) {
					const bagQty = parseInt(bagMatch[1]) || 1
					itemData.name = itemData.name.replace(/\s*\(Bag of \d+\)\s*$/i, '').trim()
					if (bagQty > 1) {
						if (itemData.system.weightCoins) itemData.system.weightCoins = +(itemData.system.weightCoins / bagQty).toFixed(2)
						DolmenSheet._divideCost(itemData.system, bagQty)
					}
				}
				// If dropped onto a container, set containerId on the new item
				const containerGroup = event.target.closest('.container-group')
				if (containerGroup && itemData.type !== 'Container') {
					itemData.system.containerId = containerGroup.dataset.containerId
					itemData.system.equipped = false
				}
				await this.actor.createEmbeddedDocuments('Item', [itemData])
			} else {
				// If dropped within the same actor
				const containerGroup = event.target.closest('.container-group')
				if (containerGroup) {
					// Dropped onto a container � assign to it
					const containerId = containerGroup.dataset.containerId
					if (item.type !== 'Container' && item.system.containerId !== containerId) {
						await item.update({ 'system.containerId': containerId, 'system.equipped': false })
					}
				} else {
					// Dropped onto equipped/stowed list � toggle equipped and clear container
					const equipped = targetList === 'equipped'
					const updates = {}
					if (item.system.equipped !== equipped) updates['system.equipped'] = equipped
					if (item.system.containerId) updates['system.containerId'] = ''
					if (Object.keys(updates).length) {
						await item.update(updates)
					}
				}
			}
		}
	}
}

export default DolmenSheet
