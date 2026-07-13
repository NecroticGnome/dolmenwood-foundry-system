/* global CONFIG, game, Hooks, foundry, Handlebars, ui, Roll, Actor */

import DOLMENWOOD from './module/config.js'
import DolmenSheet from './module/dolmen-sheet.js'
import DolmenCreatureSheet from './module/dolmen-creature-sheet.js'
import DolmenHorseSheet from './module/dolmen-horse-sheet.js'
import DolmenVehicleSheet from './module/dolmen-vehicle-sheet.js'
import DolmenItemSheet from './module/dolmen-item-sheet.js'
import DolmenKindredSheet from './module/dolmen-kindred-sheet.js'
import DolmenClassSheet from './module/dolmen-class-sheet.js'
import DolmenActor from './module/dolmen-actor.js'
import DolmenItem from './module/dolmen-item.js'
import { AdventurerDataModel, CreatureDataModel, HorseDataModel, VehicleDataModel, GearDataModel, ContainerDataModel, TreasureDataModel, WeaponDataModel, SpellDataModel, HolySpellDataModel, ArmorDataModel, ForagedDataModel, GlamourDataModel, RuneDataModel, KindredDataModel, ClassDataModel, EffectDataModel } from './module/data-models.mjs'
import { setupDamageContextMenu } from './module/chat-damage.js'
import { createSaveLinkEnricher, createChanceLinkEnricher, openInlineSaveModifierPanel, rollChance } from './module/chat-save.js'
import WelcomeDialog from './module/welcome-dialog.js'
import { initCalendarWidget, toggleWidget, handleCalendarSocket } from './module/calendar/calendar-widget.js'
import { worldTimeToCalendar, dateKeyToEpochDay } from './module/calendar/calendar-time.js'
import { DolmenwoodCalendar, buildCalendarConfig } from './module/calendar/calendar-data.js'
import { getFaSymbol, getRuneUsage } from './module/sheet/data-context.js'
import { registerCombatSystem } from './module/combat/combat.js'
import { handleCombatSocket } from './module/combat/combat-rolls.js'
import { initDungeonTracker, toggleDungeonTracker, onLightSourcesChanged, onTrackerPausedChanged, onTurnCounterChanged, onRestBaselineChanged } from './module/dungeon-tracker/dungeon-tracker.js'
import { initPartyViewer, togglePartyViewer, onPartyMembersChanged } from './module/party-viewer/party-viewer.js'
import { openCreatureImportDialog } from './module/creature-importer.js'
import { executeMacroAttack } from './module/attack-macros.js'
import DolmenEffectSheet from './module/dolmen-effect-sheet.js'
import { EFFECT_FIELDS } from './module/effect-fields.js'

const { Actors, Items } = foundry.documents.collections

let themePreview = null
let lastRuneRefreshDay = null

function isFoundryDark() {
	return document.documentElement.classList.contains('theme-dark')
		|| document.body?.classList.contains('theme-dark')
}

function applyTheme(theme) {
	const resolved = theme === 'auto'
		? (isFoundryDark() ? 'coldironaxe' : 'silverdagger')
		: theme
	document.documentElement.setAttribute('data-dolmen-theme', resolved)
}

Hooks.on('initializeDynamicTokenRingConfig', ringConfig => {
	const dolmenwoodRing = new foundry.canvas.placeables.tokens.DynamicRingData({
		id: 'dolmenwoodRing',
		label: 'Dolmenwood',
		effects: {
			RING_PULSE: 'TOKEN.RING.EFFECTS.RING_PULSE',
			RING_GRADIENT: 'TOKEN.RING.EFFECTS.RING_GRADIENT',
			BKG_WAVE: 'TOKEN.RING.EFFECTS.BKG_WAVE',
			INVISIBILITY: 'TOKEN.RING.EFFECTS.INVISIBILITY',
			COLOR_OVER_SUBJECT: 'TOKEN.RING.EFFECTS.COLOR_OVER_SUBJECT'
		},
		spritesheet: 'systems/dolmenwood/assets/dynamic-token-ring/dynamic-dolmen-spritesheet.json'
	})
	ringConfig.addConfig('dolmenwoodRing', dolmenwoodRing)
})

Hooks.once('init', async function () {
	CONFIG.DOLMENWOOD = DOLMENWOOD
	CONFIG.DOLMENWOOD.effectFields = EFFECT_FIELDS

	// Expose the Dolmenwood calendar through the core time API
	// (game.time.calendar / game.time.components) for module interoperability
	CONFIG.time.worldCalendarClass = DolmenwoodCalendar
	CONFIG.time.worldCalendarConfig = buildCalendarConfig()
	CONFIG.time.formatters.timestamp = DolmenwoodCalendar.formatTimestamp
	game.dolmenwood = { executeMacroAttack }

	game.settings.register('dolmenwood', 'colorTheme', {
		name: 'DOLMEN.Settings.ColorTheme',
		hint: 'DOLMEN.Settings.ColorThemeHint',
		scope: 'client',
		config: true,
		type: String,
		default: 'auto',
		choices: {
			auto: 'DOLMEN.Settings.ThemeAuto',
			playerbook: 'DOLMEN.Settings.ThemePlayerbook',
			drunealtar: 'DOLMEN.Settings.ThemeDruneAltar',
			wintersdaughter: 'DOLMEN.Settings.ThemeWintersDaughter',
			coldprince: 'DOLMEN.Settings.ThemeColdPrince',
			grimalkin: 'DOLMEN.Settings.ThemeGrimalkin',
			naglord: 'DOLMEN.Settings.ThemeNagLord',
			woodgrue: 'DOLMEN.Settings.ThemeWoodgrue',
			mosslingden: 'DOLMEN.Settings.ThemeMosslingDen',
			bregglehorns: 'DOLMEN.Settings.ThemeBreggleHorns',
			mortalsend: 'DOLMEN.Settings.ThemeMortalsEnd',
			silverdagger: 'DOLMEN.Settings.ThemeSilverDagger',
			coldironaxe: 'DOLMEN.Settings.ThemeColdIronAxe',
			highcontrast: 'DOLMEN.Settings.ThemeHighContrast'
		},
		onChange: applyTheme
	})

	game.settings.register('dolmenwood', 'showCalendar', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true,
		onChange: toggleWidget
	})

	game.settings.register('dolmenwood', 'showDungeonTracker', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true,
		onChange: toggleDungeonTracker
	})

	game.settings.register('dolmenwood', 'showPartyViewer', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: false,
		onChange: togglePartyViewer
	})

	game.settings.register('dolmenwood', 'partyMembers', {
		scope: 'world',
		config: false,
		type: Array,
		default: [],
		onChange: onPartyMembersChanged
	})

	game.settings.register('dolmenwood', 'defeatedCreatures', {
		scope: 'world',
		config: false,
		type: Array,
		default: []
	})

	game.settings.register('dolmenwood', 'automatedKillLog', {
		name: 'DOLMEN.Settings.AutomatedKillLog',
		hint: 'DOLMEN.Settings.AutomatedKillLogHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'encounterChance', {
		scope: 'world',
		config: false,
		type: Number,
		default: 1
	})

	game.settings.register('dolmenwood', 'encounterDie', {
		scope: 'world',
		config: false,
		type: Number,
		default: 6
	})

	game.settings.register('dolmenwood', 'encounterInterval', {
		scope: 'world',
		config: false,
		type: Number,
		default: 2
	})

	game.settings.register('dolmenwood', 'restInterval', {
		scope: 'world',
		config: false,
		type: Number,
		default: 6
	})

	game.settings.register('dolmenwood', 'encounterTable', {
		scope: 'world',
		config: false,
		type: String,
		default: ''
	})

	game.settings.register('dolmenwood', 'encounterAutoRoll', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'encounterPublicRoll', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'tableAutoRoll', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'tablePublicRoll', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'autoWeather', {
		name: 'DOLMEN.Calendar.Weather.AutoSettingName',
		hint: 'DOLMEN.Calendar.Weather.AutoSettingHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	})

	// Register combat system (group initiative, tracker, declarations)
	registerCombatSystem()

	// Register custom text enrichers for save links and chance links
	CONFIG.TextEditor.enrichers.push({
		pattern: /\[([^\]]+)\]\(save:(\w+)\)/g,
		enricher: createSaveLinkEnricher
	})
	CONFIG.TextEditor.enrichers.push({
		pattern: /\[([^\]]+)\]\(chance:(\d+)\)/g,
		enricher: createChanceLinkEnricher
	})

	// Register Handlebars helpers
	Handlebars.registerHelper('add', (a, b) => (a || 0) + (b || 0))
	Handlebars.registerHelper('mul', (a, b) => (a || 0) * (b || 1))
	Handlebars.registerHelper('stackWeight', (weight, qty, stackSize) => {
		const w = weight || 0
		const q = qty || 1
		const s = stackSize || 1
		return s > 1 ? w * Math.ceil(q / s) : w * q
	})
	Handlebars.registerHelper('join', (array, separator) => {
		if (!array || !Array.isArray(array)) return ''
		return array.join(separator || ', ')
	})

	// Register Handlebars partials
	const partials = [
		'systems/dolmenwood/templates/shared/item-group.html',
		'systems/dolmenwood/templates/shared/container-list.html',
		'systems/dolmenwood/templates/shared/coins-grid.html'
	]
	for (const partialPath of partials) {
		const partialContent = await fetch(partialPath).then(r => r.text())
		Handlebars.registerPartial(partialPath, partialContent)
	}

	CONFIG.Actor.documentClass = DolmenActor
	CONFIG.Item.documentClass = DolmenItem

	// Register Actor data models
	CONFIG.Actor.dataModels = {
		Adventurer: AdventurerDataModel,
		Creature: CreatureDataModel,
		Horse: HorseDataModel,
		Vehicle: VehicleDataModel
	}
	CONFIG.Item.dataModels = {
		Item: GearDataModel,
		Treasure: TreasureDataModel,
		Weapon: WeaponDataModel,
		Armor: ArmorDataModel,
		Foraged: ForagedDataModel,
		Container: ContainerDataModel,
		Spell: SpellDataModel,
		HolySpell: HolySpellDataModel,
		Glamour: GlamourDataModel,
		Rune: RuneDataModel,
		Kindred: KindredDataModel,
		Class: ClassDataModel,
		Effect: EffectDataModel
	}

	game.settings.register('dolmenwood', 'encumbranceMethod', {
		name: 'DOLMEN.Encumbrance.Method',
		hint: 'DOLMEN.Encumbrance.MethodHint',
		scope: 'world',
		config: true,
		type: String,
		default: 'weight',
		choices: {
			weight: 'DOLMEN.Encumbrance.weight',
			treasure: 'DOLMEN.Encumbrance.treasure',
			slots: 'DOLMEN.Encumbrance.slots',
			disabled: 'DOLMEN.Encumbrance.disabled'
		},
		onChange: () => {
			ui.items?.render()
			Object.values(ui.windows).forEach(app => {
				if (app.collection?.documentName === 'Item') app.render()
			})
			foundry.applications.instances?.forEach(app => {
				if (app.collection?.documentName === 'Item') app.render()
			})
			// Recompute derived data and re-render open actor sheets
			const affectedTypes = ['Adventurer', 'Horse', 'Vehicle']
			game.actors.filter(a => affectedTypes.includes(a.type)).forEach(a => a.prepareData())
			Object.values(ui.windows).forEach(app => {
				if (affectedTypes.includes(app.document?.type)) app.render()
			})
			foundry.applications.instances?.forEach(app => {
				if (affectedTypes.includes(app.document?.type)) app.render()
			})
		}
	})

	game.settings.register('dolmenwood', 'significantLoad', {
		name: 'DOLMEN.Encumbrance.SignificantLoad',
		hint: 'DOLMEN.Encumbrance.SignificantLoadHint',
		scope: 'world',
		config: true,
		type: Number,
		default: 50,
		range: {
			min: 0,
			max: 100,
			step: 1
		}
	})

	game.settings.register('dolmenwood', 'coinsPerSlot', {
		name: 'DOLMEN.Encumbrance.CoinsPerSlot',
		hint: 'DOLMEN.Encumbrance.CoinsPerSlotHint',
		scope: 'world',
		config: true,
		type: Number,
		default: 100,
		range: {
			min: 1,
			max: 1000,
			step: 1
		}
	})

	game.settings.register('dolmenwood', 'customSkills', {
		name: 'DOLMEN.Settings.CustomSkills',
		hint: 'DOLMEN.Settings.CustomSkillsHint',
		scope: 'world',
		config: true,
		type: String,
		default: ''
	})

	game.settings.register('dolmenwood', 'randomizeCreatureHP', {
		name: 'DOLMEN.Settings.RandomizeCreatureHP',
		hint: 'DOLMEN.Settings.RandomizeCreatureHPHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'autoMissileRange', {
		name: 'DOLMEN.Settings.AutoMissileRange',
		hint: 'DOLMEN.Settings.AutoMissileRangeHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: false
	})

	game.settings.register('dolmenwood', 'showWelcomeDialog', {
		name: 'DOLMEN.Welcome.SettingName',
		hint: 'DOLMEN.Welcome.SettingHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
	})

	game.settings.register('dolmenwood', 'effectsMigrationDone', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: false
	})

	game.settings.register('dolmenwood', 'activeUnseason', {
		scope: 'world',
		config: false,
		type: String,
		default: ''
	})

	game.settings.register('dolmenwood', 'currentWeather', {
		scope: 'world',
		config: false,
		type: Object,
		default: { text: '', effects: '', roll: 0 }
	})

	game.settings.register('dolmenwood', 'calendarNotes', {
		scope: 'world',
		config: false,
		type: Object,
		default: {}
	})

	game.settings.register('dolmenwood', 'lightSources', {
		scope: 'world',
		config: false,
		type: Array,
		default: [],
		onChange: onLightSourcesChanged
	})

	game.settings.register('dolmenwood', 'trackerPaused', {
		scope: 'world',
		config: false,
		type: Boolean,
		default: true,
		onChange: onTrackerPausedChanged
	})

	game.settings.register('dolmenwood', 'trackerTurn', {
		scope: 'world',
		config: false,
		type: Number,
		default: 1,
		onChange: onTurnCounterChanged
	})

	game.settings.register('dolmenwood', 'trackerRestBaseline', {
		scope: 'world',
		config: false,
		type: Number,
		default: 0,
		onChange: onRestBaselineChanged
	})

	// Add scene control toolbar buttons for calendar and dungeon tracker
	Hooks.on('getSceneControlButtons', (controls) => {
		controls.dolmenwood = {
			name: 'dolmenwood',
			title: 'DOLMEN.SheetTitle',
			icon: 'fa-solid fa-tree',
			visible: game.user.isGM,
			activeTool: 'select',
			tools: {
				select: {
					name: 'select',
					title: 'DOLMEN.SheetTitle',
					icon: 'fa-solid fa-tree'
				},
				calendar: {
					name: 'calendar',
					title: 'DOLMEN.Calendar.SettingName',
					icon: 'fa-solid fa-calendar',
					toggle: true,
					active: game.settings.get('dolmenwood', 'showCalendar'),
					onChange: (event, active) => {
						game.settings.set('dolmenwood', 'showCalendar', active)
					}
				},
				dungeonTracker: {
					name: 'dungeonTracker',
					title: 'DOLMEN.DungeonTracker.SettingName',
					icon: 'fa-solid fa-dungeon',
					toggle: true,
					active: game.settings.get('dolmenwood', 'showDungeonTracker'),
					onChange: (event, active) => {
						game.settings.set('dolmenwood', 'showDungeonTracker', active)
					}
				},
				partyViewer: {
					name: 'partyViewer',
					title: 'DOLMEN.PartyViewer.SettingName',
					icon: 'fa-solid fa-users',
					toggle: true,
					active: game.settings.get('dolmenwood', 'showPartyViewer'),
					onChange: (event, active) => {
						game.settings.set('dolmenwood', 'showPartyViewer', active)
					}
				}
			}
		}
	})

	applyTheme(game.settings.get('dolmenwood', 'colorTheme'))

	// Re-apply auto theme when Foundry's own light/dark mode changes
	const themeObserver = new MutationObserver(() => {
		const active = themePreview ?? game.settings.get('dolmenwood', 'colorTheme')
		if (active === 'auto') applyTheme('auto')
	})
	themeObserver.observe(document.documentElement, { attributeFilter: ['class'] })
	if (document.body) {
		themeObserver.observe(document.body, { attributeFilter: ['class'] })
	}

	Actors.registerSheet('dolmen', DolmenSheet, {
		types: ['Adventurer'],
		label: 'DOLMEN.SheetTitle',
		makeDefault: true
	})

	Actors.registerSheet('dolmen', DolmenCreatureSheet, {
		types: ['Creature'],
		label: 'DOLMEN.CreatureSheetTitle',
		makeDefault: true
	})

	Actors.registerSheet('dolmen', DolmenHorseSheet, {
		types: ['Horse'],
		label: 'DOLMEN.HorseSheetTitle',
		makeDefault: true
	})

	Actors.registerSheet('dolmen', DolmenVehicleSheet, {
		types: ['Vehicle'],
		label: 'DOLMEN.VehicleSheetTitle',
		makeDefault: true
	})

	Items.registerSheet('dolmen', DolmenItemSheet, {
		types: ['Item', 'Treasure', 'Weapon', 'Armor', 'Foraged', 'Container', 'Spell', 'HolySpell', 'Glamour', 'Rune'],
		label: 'DOLMEN.ItemSheetTitle',
		makeDefault: true
	})

	Items.registerSheet('dolmen', DolmenEffectSheet, {
		types: ['Effect'],
		label: 'DOLMEN.EffectSheetTitle',
		makeDefault: true
	})

	Items.registerSheet('dolmen', DolmenKindredSheet, {
		types: ['Kindred'],
		label: 'DOLMEN.KindredSheetTitle',
		makeDefault: true
	})

	Items.registerSheet('dolmen', DolmenClassSheet, {
		types: ['Class'],
		label: 'DOLMEN.ClassSheetTitle',
		makeDefault: true
	})
})

/**
 * Migrate existing manual adjustments on Adventurer actors to Effect items.
 * Walks the adjustments object tree, creates an Effect for each non-zero/non-false value,
 * then zeroes out the source adjustments.
 */
async function migrateAdjustmentsToEffects() {
	const MIGRATION_KEY = 'effectsMigrationDone'
	if (game.settings.get('dolmenwood', MIGRATION_KEY)) return

	console.log('Dolmenwood | Migrating manual adjustments to Effect items...')
	const { BOOLEAN_TARGETS } = await import('./module/effect-fields.js')

	// Recursively collect non-zero adjustment values as { path, value } entries
	function collectAdjustments(obj, prefix = '') {
		const entries = []
		for (const [key, val] of Object.entries(obj)) {
			const path = prefix ? `${prefix}.${key}` : key
			if (val && typeof val === 'object' && !Array.isArray(val)) {
				entries.push(...collectAdjustments(val, path))
			} else if (typeof val === 'boolean' && val === true) {
				entries.push({ path, value: 0, effectType: 'boolean' })
			} else if (typeof val === 'number' && val !== 0) {
				entries.push({ path, value: val, effectType: BOOLEAN_TARGETS.has(path) ? 'boolean' : 'numeric' })
			}
		}
		return entries
	}

	let totalEffects = 0
	for (const actor of game.actors.filter(a => a.type === 'Adventurer')) {
		// Read from source data since prepareDerivedData may have already zeroed adjustments
		const adj = actor._source?.system?.adjustments
		if (!adj) continue

		const entries = collectAdjustments(adj)
		if (!entries.length) continue

		// Create Effect items for each non-zero adjustment
		const effectsData = entries.map(e => ({
			name: `Migrated: ${e.path}`,
			type: 'Effect',
			system: {
				enabled: true,
				target: e.path,
				value: e.value,
				effectType: e.effectType
			}
		}))

		await actor.createEmbeddedDocuments('Item', effectsData)

		// Zero out the source adjustments so they don't double-apply if schema is ever read raw
		const resetUpdates = {}
		for (const e of entries) {
			const fullPath = `system.adjustments.${e.path}`
			resetUpdates[fullPath] = e.effectType === 'boolean' ? false : 0
		}
		await actor.update(resetUpdates)

		totalEffects += effectsData.length
		console.log(`Dolmenwood | Migrated ${effectsData.length} adjustments for "${actor.name}"`)
	}

	await game.settings.set('dolmenwood', MIGRATION_KEY, true)
	if (totalEffects > 0) {
		console.log(`Dolmenwood | Migration complete: created ${totalEffects} Effect items total`)
		ui.notifications.info(`Dolmenwood: Migrated ${totalEffects} manual adjustment(s) to Effect items.`)
	} else {
		console.log('Dolmenwood | Migration complete: no adjustments to migrate')
	}
}

Hooks.once('ready', async function () {
	// Add custom skills to effect target fields (from settings + all actors)
	if (EFFECT_FIELDS.skills?.fields) {
		const customNames = new Set()
		const customSkillsSetting = game.settings.get('dolmenwood', 'customSkills') || ''
		for (const name of customSkillsSetting.split(',').map(s => s.trim()).filter(Boolean)) {
			customNames.add(name)
		}
		for (const actor of game.actors) {
			for (const skill of actor.system?.extraSkills || []) {
				if (skill.customName) customNames.add(skill.customName)
			}
		}
		for (const name of customNames) {
			EFFECT_FIELDS.skills.fields[`skills.custom.${name}`] = name
		}
	}

	console.log(game.i18n.localize('DOLMEN.WelcomeMessage'))

	if (game.user.isGM && game.settings.get('dolmenwood', 'showWelcomeDialog')) {
		new WelcomeDialog().render(true)
	}

	// Run one-time migration of manual adjustments to Effect items
	if (game.user.isGM) {
		await migrateAdjustmentsToEffects()
	}

	initCalendarWidget()
	initDungeonTracker()
	initPartyViewer()

	// Set turn marker to system image
	if (game.user.isGM) {
		const markerSrc = 'systems/dolmenwood/assets/turn_tracker.webp'
		const config = game.settings.get('core', 'combatTrackerConfig')
		if (!config.turnMarker?.src || config.turnMarker.src.includes('turn_tracker')) {
			await game.settings.set('core', 'combatTrackerConfig', foundry.utils.mergeObject(config, {
				turnMarker: { src: markerSrc }
			}))
		}
	}

	// Socket listeners for player operations that require GM permission
	game.socket.on('system.dolmenwood', handleCalendarSocket)
	game.socket.on('system.dolmenwood', handleCombatSocket)

	// Initialize rune refresh day tracking
	const initCal = worldTimeToCalendar(game.time.worldTime)
	lastRuneRefreshDay = `${initCal.year}-${initCal.monthKey}-${initCal.day}`
})

// Decrement round-based effect durations when combat round advances
Hooks.on('combatRound', async (combat) => {
	if (game.user !== game.users.activeGM) return
	for (const combatant of combat.combatants) {
		const actor = combatant.actor
		if (!actor) continue
		const roundEffects = actor.items.filter(i =>
			i.type === 'Effect' && i.system.enabled && i.system.duration === 'rounds'
		)
		const toDelete = []
		const toUpdate = []
		for (const effect of roundEffects) {
			const remaining = effect.system.durationValue - 1
			if (remaining <= 0) {
				toDelete.push(effect.id)
			} else {
				toUpdate.push({ _id: effect.id, 'system.durationValue': remaining })
			}
		}
		if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate)
		if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', toDelete)
	}
})

// Compute expiry timestamp for time-based effect durations
function computeExpiresAt(duration, durationValue) {
	const SECONDS = { turns: 600, hours: 3600, days: 86400 }
	const perUnit = SECONDS[duration]
	if (!perUnit) return null
	return game.time.worldTime + (durationValue * perUnit)
}

// Stamp expiresAt when a time-based effect is created on an actor
Hooks.on('preCreateItem', (item, data) => {
	if (!item.isEmbedded || item.type !== 'Effect') return
	const dur = data.system?.duration || item.system.duration
	const noExpiry = ['permanent', 'rounds', 'untilRest', 'untilNextDay']
	if (!dur || noExpiry.includes(dur)) return
	const val = data.system?.durationValue || item.system.durationValue || 1
	item.updateSource({ 'system.expiresAt': computeExpiresAt(dur, val) })
})

// Update expiresAt when duration type or value changes on an existing effect
Hooks.on('preUpdateItem', (item, changes) => {
	if (item.type !== 'Effect') return
	// Skip if expiresAt is already explicitly set (system-managed update from updateWorldTime)
	if (changes.system?.expiresAt !== undefined) return
	// Recalculate expiresAt when re-enabling a time-based effect
	const enabling = changes.system?.enabled === true && !item.system.enabled
	const durChanged = changes.system?.duration !== undefined
	const valChanged = changes.system?.durationValue !== undefined
	if (!durChanged && !valChanged && !enabling) return
	const dur = changes.system?.duration ?? item.system.duration
	const val = changes.system?.durationValue ?? item.system.durationValue
	const noExpiry = ['permanent', 'rounds', 'untilRest', 'untilNextDay']
	if (noExpiry.includes(dur)) {
		changes.system = changes.system || {}
		changes.system.expiresAt = null
	} else {
		changes.system = changes.system || {}
		changes.system.expiresAt = computeExpiresAt(dur, val)
	}
})

// Expire and decrement time-based effects when world time advances
const DURATION_SECONDS = { turns: 600, hours: 3600, days: 86400 }
Hooks.on('updateWorldTime', async () => {
	if (game.user !== game.users.activeGM) return
	const now = game.time.worldTime
	for (const actor of game.actors) {
		const toDelete = []
		const toUpdate = []
		for (const item of actor.items) {
			if (item.type !== 'Effect' || !item.system.enabled) continue
			// Round-based effects expire when time advances (combat is over)
			if (item.system.duration === 'rounds') {
				toDelete.push(item.id)
				continue
			}
			// Time-based effects: check expiry and update remaining display value
			if (item.system.expiresAt == null) continue
			if (now >= item.system.expiresAt) {
				toDelete.push(item.id)
			} else {
				const remainingSec = item.system.expiresAt - now
				let dur = item.system.duration
				// Cascade: days → hours when less than 1 day remains
				if (dur === 'days' && remainingSec < 86400) dur = 'hours'
				// Cascade: hours → turns when less than 1 hour remains
				if (dur === 'hours' && remainingSec < 3600) dur = 'turns'
				const perUnit = DURATION_SECONDS[dur]
				if (!perUnit) continue
				const remaining = Math.max(1, Math.ceil(remainingSec / perUnit))
				if (remaining !== item.system.durationValue || dur !== item.system.duration) {
					toUpdate.push({
						_id: item.id,
						'system.duration': dur,
						'system.durationValue': remaining,
						'system.expiresAt': item.system.expiresAt
					})
				}
			}
		}
		if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate)
		if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', toDelete)
	}
})

// Randomize HP for unlinked creature tokens placed on canvas
Hooks.on('createToken', async (tokenDoc) => {
	if (!game.user.isGM) return
	if (!game.settings.get('dolmenwood', 'randomizeCreatureHP')) return

	const actor = tokenDoc.actor
	if (!actor || !['Creature', 'Horse'].includes(actor.type)) return
	if (tokenDoc.actorLink) return

	const hpDice = actor.system.hpDice
	if (!hpDice) return

	const roll = await new Roll(hpDice).evaluate()
	const hp = Math.max(1, roll.total)
	await tokenDoc.update({
		'delta.system.hp.value': hp,
		'delta.system.hp.max': hp
	})
})

// Ensure unlinked tokens are created with a valid ActorDelta containing all
// required fields. Without this, the server's delta source is null, and any
// subsequent delta update (e.g. HP randomization) constructs a new ActorDelta
// with clean:false — which skips cleanData and fails validation on required
// fields (items, effects, flags). Must use updateSource() because Foundry sends
// document._source to the server, not the raw data parameter.
Hooks.on('preCreateToken', (tokenDoc) => {
	if (tokenDoc.actorLink) return
	const delta = tokenDoc._source.delta ?? {}
	tokenDoc.updateSource({ delta: {
		items: delta.items ?? [],
		effects: delta.effects ?? [],
		flags: delta.flags ?? {}
	}})
})

// Track defeated creatures for XP distribution.
function recordDefeatedCreature(actor) {
	if (!actor) return
	const list = game.settings.get('dolmenwood', 'defeatedCreatures').slice()
	const existing = list.find(e => e.name === actor.name)
	if (existing) {
		existing.qty += 1
	} else {
		list.push({
			name: actor.name,
			xp: actor.system.xpAward || 0,
			img: actor.img,
			qty: 1
		})
	}
	game.settings.set('dolmenwood', 'defeatedCreatures', list)
	ui.notifications.info(game.i18n.format('DOLMEN.PartyViewer.XPCreatureRecorded', {
		name: actor.name,
		xp: actor.system.xpAward || 0
	}))
}

function actorHasDefeatedStatus(actor) {
	const defeatedId = CONFIG.specialStatusEffects?.DEFEATED ?? 'dead'
	return actor?.statuses?.has(defeatedId) ?? false
}

Hooks.on('preUpdateActor', (actor, changes) => {
	if (!game.user.isGM || actor.type !== 'Creature') return
	if (!game.settings.get('dolmenwood', 'automatedKillLog')) return
	const newHP = changes?.system?.hp?.value
	if (newHP === undefined || newHP > 0) return
	if (actor.system.hp.value <= 0) return
	if (actorHasDefeatedStatus(actor)) return
	recordDefeatedCreature(actor)
})

Hooks.on('preUpdateToken', (tokenDoc, changes) => {
	if (!game.user.isGM) return
	if (!game.settings.get('dolmenwood', 'automatedKillLog')) return
	if (tokenDoc.actorLink) return
	if (tokenDoc.actor?.type !== 'Creature') return
	const newHP = changes?.delta?.system?.hp?.value
	if (newHP === undefined || newHP > 0) return
	if (tokenDoc.actor.system.hp.value <= 0) return
	if (actorHasDefeatedStatus(tokenDoc.actor)) return
	recordDefeatedCreature(tokenDoc.actor)
})

// Catches both the Combat Tracker "Mark Defeated" path (toggleStatusEffect)
// and the Token HUD skull-icon path. Both create an ActiveEffect with the
// 'dead' status on the actor. Skip if HP is already 0 — the HP-path hook
// already recorded the kill (or chose not to).
Hooks.on('createActiveEffect', (effect) => {
	if (!game.user.isGM) return
	if (!game.settings.get('dolmenwood', 'automatedKillLog')) return
	const defeatedId = CONFIG.specialStatusEffects?.DEFEATED ?? 'dead'
	if (!effect.statuses?.has(defeatedId)) return
	const actor = effect.parent
	if (!actor || !(actor instanceof Actor) || actor.type !== 'Creature') return
	if (actor.system.hp.value <= 0) return
	recordDefeatedCreature(actor)
})

// Refresh rune usage on day change (x/day, x/week, x/year)
Hooks.on('updateWorldTime', async () => {
	if (game.user !== game.users.activeGM) return

	const cal = worldTimeToCalendar(game.time.worldTime)
	const dayKey = `${cal.year}-${cal.monthKey}-${cal.day}`
	const dayChanged = lastRuneRefreshDay !== null && dayKey !== lastRuneRefreshDay
	lastRuneRefreshDay = dayKey
	if (!dayChanged) return

	// Remove "until next day" effects from all actors
	for (const actor of game.actors) {
		const dayEffects = actor.items.filter(i =>
			i.type === 'Effect' && i.system.duration === 'untilNextDay'
		)
		if (dayEffects.length) {
			await actor.deleteEmbeddedDocuments('Item', dayEffects.map(e => e.id))
		}
	}

	const currentEpochDay = dateKeyToEpochDay(dayKey)

	for (const actor of game.actors.filter(a => a.type === 'Adventurer' && a.system.fairyMagic?.enabled)) {
		const runeUsage = actor.system.runeUsage || {}
		const level = actor.system.level
		const resetUsage = {}
		let anyChange = false
		const notesToRemove = []

		for (const [runeId, data] of Object.entries(runeUsage)) {
			if (!data.used || data.used <= 0) continue
			const rune = actor.items.get(runeId)
			if (!rune || rune.type !== 'Rune') continue
			const magnitude = rune.system.magnitude || 'lesser'
			const usage = getRuneUsage(magnitude, level)

			if (usage.frequencyType === 'day') {
				// x/day: refresh all
				resetUsage[runeId] = { used: 0, max: data.max }
				anyChange = true
			} else if (usage.frequencyType === 'week' || usage.frequencyType === 'year') {
				// x/week or x/year: check individual refresh dates
				const refreshDates = data.refreshDates || []
				const refreshNoteIds = data.refreshNoteIds || []
				const newDates = []
				const newNoteIds = []
				let newUsed = data.used

				for (let i = 0; i < refreshDates.length; i++) {
					const refreshEpochDay = dateKeyToEpochDay(refreshDates[i])
					if (currentEpochDay >= refreshEpochDay) {
						// This slot has refreshed
						newUsed--
						if (refreshNoteIds[i]) {
							notesToRemove.push({ dateKey: refreshDates[i], noteId: refreshNoteIds[i] })
						}
					} else {
						// Not yet refreshed, keep it
						newDates.push(refreshDates[i])
						newNoteIds.push(refreshNoteIds[i] || null)
					}
				}

				if (newUsed !== data.used) {
					resetUsage[runeId] = {
						used: Math.max(0, newUsed),
						max: data.max,
						refreshDates: newDates,
						refreshNoteIds: newNoteIds
					}
					anyChange = true
				}
			}
		}

		if (anyChange) {
			const merged = foundry.utils.mergeObject(foundry.utils.deepClone(runeUsage), resetUsage)
			await actor.update({ 'system.runeUsage': merged })
		}

		// Clean up calendar notes for refreshed runes
		if (notesToRemove.length > 0) {
			const notes = foundry.utils.deepClone(game.settings.get('dolmenwood', 'calendarNotes'))
			for (const { dateKey: ndk, noteId } of notesToRemove) {
				if (!notes[ndk]) continue
				notes[ndk] = notes[ndk].filter(n => n.id !== noteId)
				if (notes[ndk].length === 0) delete notes[ndk]
			}
			await game.settings.set('dolmenwood', 'calendarNotes', notes)
		}
	}
})

// Live-preview theme when dropdown changes in settings
Hooks.on('renderSettingsConfig', (app, html) => {
	const select = html.querySelector('[name="dolmenwood.colorTheme"]')
	if (!select) return
	select.addEventListener('change', () => {
		themePreview = select.value
		applyTheme(select.value)
	})
	app.addEventListener('close', () => {
		themePreview = null
		applyTheme(game.settings.get('dolmenwood', 'colorTheme'))
	})
})

// Add context menu to damage rolls in chat
Hooks.on('renderChatMessageHTML', (message, html) => {
	setupDamageContextMenu(html)
})

// Global delegated listener for inline save links (chat, journals, item descriptions, etc.)
document.addEventListener('click', (event) => {
	const link = event.target.closest('.inline-save-link')
	if (!link) return
	event.preventDefault()
	event.stopPropagation()
	const saveKey = link.dataset.save
	if (!saveKey) return
	const position = { top: event.clientY, left: event.clientX }
	openInlineSaveModifierPanel(saveKey, position)
})

// Global delegated listener for inline chance links
document.addEventListener('click', (event) => {
	const link = event.target.closest('.inline-chance-link')
	if (!link) return
	event.preventDefault()
	event.stopPropagation()
	const target = parseInt(link.dataset.target)
	if (isNaN(target)) return
	rollChance(target)
})

// Sync embedded Kindred/Class items when source items are updated (world or compendium)
Hooks.on('updateItem', (item) => {
	if (item.isEmbedded) return
	if (!['Kindred', 'Class'].includes(item.type)) return

	const matchField = item.type === 'Kindred' ? 'kindredId' : 'classId'
	const matchValue = item.system[matchField]
	if (!matchValue) return

	for (const actor of game.actors) {
		const embedded = actor.items.find(i =>
			i.type === item.type && i.system[matchField] === matchValue
		)
		if (embedded) {
			embedded.update({
				name: item.name,
				img: item.img,
				system: item.toObject().system
			})
		}
	}
})

// Build item tag HTML for directory entries
function buildItemTags(item) {
	const tags = []
	if (item.type === 'Weapon') {
		if (item.system?.damage) {
			const dmgLabel = game.i18n.localize('DOLMEN.Attack.DamageRoll')
			tags.push(`<span class="compendium-tag tooltip"><i class="fa-sharp-duotone fa-light fa-burst"></i> ${item.system.damage}<span class="tooltiptext">${dmgLabel}</span></span>`)
		}
		if (item.system?.qualities?.length) {
			for (const q of item.system.qualities) {
				tags.push(`<span class="compendium-tag">${getFaSymbol(q, item)}</span>`)
			}
		}
	} else if (item.type === 'Armor') {
		if (item.system?.ac != null) {
			const acLabel = game.i18n.localize('DOLMEN.Combat.AC')
			const acPrefix = item.system?.armorType === 'shield' ? '+' : ''
			tags.push(`<span class="compendium-tag tooltip"><i class="fas fa-shield"></i> ${acPrefix}${item.system.ac}<span class="tooltiptext">${acLabel}</span></span>`)
		}
		if (item.system?.armorType === 'shield') {
			const shieldLabel = game.i18n.localize('DOLMEN.Item.ArmorType.shield')
			tags.push(`<span class="compendium-tag"><i class="fa-regular fa-shield"></i> ${shieldLabel}</span>`)
		} else if (item.system?.bulk) {
			const bulkLabel = game.i18n.localize(`DOLMEN.Item.Bulk.${item.system.bulk}`)
			const bulkIcons = { none: 'fa-regular fa-helmet-battle', light: 'fa-regular fa-helmet-battle', medium: 'fa-duotone fa-solid fa-helmet-battle', heavy: 'fa-solid fa-helmet-battle' }
			const icon = bulkIcons[item.system.bulk] || 'fa-solid fa-helmet-battle'
			tags.push(`<span class="compendium-tag"><i class="${icon}"></i> ${bulkLabel}</span>`)
		}
	}
	return tags.length ? tags.join('') : null
}

// Build weight/cost stats HTML for directory entries
function buildItemStats(item) {
	const stats = []
	const method = game.settings.get('dolmenwood', 'encumbranceMethod')
	const weight = method === 'slots' ? item.system?.weightSlots : item.system?.weightCoins
	if (weight) {
		const wtLabel = game.i18n.localize('DOLMEN.Item.Weight')
		stats.push(`<span class="compendium-stat tooltip"><i class="fas fa-weight-hanging"></i> <span class="stat-value">${weight}</span><span class="tooltiptext">${wtLabel}</span></span>`)
	}
	if (item.system?.cost) {
		const costLabel = game.i18n.localize('DOLMEN.Item.Cost')
		stats.push(`<span class="compendium-stat tooltip"><i class="fas fa-coins"></i> <span class="stat-value stat-cost">${item.system.cost}${item.system.costDenomination}</span><span class="tooltiptext">${costLabel}</span></span>`)
	}
	return stats.length ? stats.join('') : null
}

// Inject item tags into a directory listing
function injectItemTags(el, getItem) {
	el.classList.add('dolmen')
	for (const entry of el.querySelectorAll('.directory-item')) {
		const id = entry.dataset.documentId || entry.dataset.entryId
		const item = getItem(id)
		if (!item) continue
		const tagsHtml = buildItemTags(item)
		const statsHtml = buildItemStats(item)
		if (!tagsHtml && !statsHtml) continue
		const nameEl = entry.querySelector('.entry-name')
		if (nameEl) {
			const wrapper = document.createElement('div')
			wrapper.className = 'compendium-entry-wrapper'
			nameEl.parentNode.insertBefore(wrapper, nameEl)
			wrapper.appendChild(nameEl)
			if (tagsHtml) {
				const tagDiv = document.createElement('div')
				tagDiv.className = 'compendium-item-tags'
				tagDiv.innerHTML = tagsHtml
				wrapper.appendChild(tagDiv)
			}
			if (statsHtml) {
				const statsDiv = document.createElement('div')
				statsDiv.className = 'compendium-item-stats'
				statsDiv.innerHTML = statsHtml
				wrapper.appendChild(statsDiv)
			}
		}
	}
}

// Inject item property tags into compendium listings
Hooks.on('renderCompendium', async (app, html) => {
	const pack = app.collection
	if (pack.documentName !== 'Item') return
	const el = html instanceof HTMLElement ? html : html[0] || html
	const index = await pack.getIndex({
		fields: ['system.qualities', 'system.damage', 'system.rangeShort', 'system.rangeMedium', 'system.rangeLong', 'system.ac', 'system.bulk', 'system.armorType', 'system.weightSlots', 'system.weightCoins', 'system.cost', 'system.costDenomination']
	})
	injectItemTags(el, id => index.get(id))
})

// Inject item property tags into the Items sidebar directory
Hooks.on('renderItemDirectory', (app, html) => {
	const el = html instanceof HTMLElement ? html : html[0] || html
	injectItemTags(el, id => game.items.get(id))
})

// Add "Import Statblock" button to Actors directory (GM only)
Hooks.on('renderActorDirectory', (app, html) => {
	if (!game.user.isGM) return
	const el = html instanceof HTMLElement ? html : html[0] || html
	if (el.querySelector('.import-statblock')) return
	const actions = el.querySelector('.header-actions')
	if (!actions) return
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'import-statblock'
	btn.innerHTML = `<i class="fas fa-file-import"></i> ${game.i18n.localize('DOLMEN.CreatureImport.ImportStatblock')}`
	btn.addEventListener('click', () => openCreatureImportDialog())
	actions.appendChild(btn)
})

// Re-render item listings when a world/compendium item is updated so tags refresh
Hooks.on('updateItem', (item) => {
	if (!item.isEmbedded) ui.items?.render()
	// Re-render any open Item compendium windows
	foundry.applications.instances?.forEach(app => {
		if (app.collection?.documentName === 'Item') app.render()
	})
	Object.values(ui.windows).forEach(app => {
		if (app.collection?.documentName === 'Item') app.render()
	})
})

// Helper: re-prepare data and re-render open sheets for horses linked to a given rider actor
function refreshHorsesForRider(riderId) {
	for (const horse of game.actors.filter(a => a.type === 'Horse' && a.system.riderActorId === riderId)) {
		horse.prepareData()
		horse.sheet?.render()
	}
}

// When rider actor is updated (e.g. size change), refresh linked horse sheets
Hooks.on('updateActor', (actor) => {
	if (actor.type !== 'Adventurer') return
	refreshHorsesForRider(actor.id)
})

// When rider actor's items change, refresh linked horse sheets
Hooks.on('createItem', (item) => {
	if (!item.isEmbedded || item.parent?.type !== 'Adventurer') return
	refreshHorsesForRider(item.parent.id)
})
Hooks.on('updateItem', (item) => {
	if (!item.isEmbedded || item.parent?.type !== 'Adventurer') return
	refreshHorsesForRider(item.parent.id)
})
Hooks.on('deleteItem', (item) => {
	if (!item.isEmbedded || item.parent?.type !== 'Adventurer') return
	refreshHorsesForRider(item.parent.id)
})

