/* global CONFIG, game, Hooks, foundry, Handlebars, ui */

import DOLMENWOOD from './module/config.js'
import DolmenSheet from './module/dolmen-sheet.js'
import DolmenCreatureSheet from './module/dolmen-creature-sheet.js'
import DolmenItemSheet from './module/dolmen-item-sheet.js'
import DolmenKindredSheet from './module/dolmen-kindred-sheet.js'
import DolmenClassSheet from './module/dolmen-class-sheet.js'
import DolmenActor from './module/dolmen-actor.js'
import DolmenItem from './module/dolmen-item.js'
import { AdventurerDataModel, CreatureDataModel, TraitDataModel, GearDataModel, TreasureDataModel, WeaponDataModel, SpellDataModel, HolySpellDataModel, ArmorDataModel, ForagedDataModel, GlamourDataModel, RuneDataModel, KindredDataModel, ClassDataModel } from './module/data-models.mjs'
import { setupDamageContextMenu } from './module/chat-damage.js'
import { setupSaveLinkListeners } from './module/chat-save.js'
import WelcomeDialog from './module/welcome-dialog.js'
import { initCalendarWidget, toggleWidget, handleCalendarSocket } from './module/calendar/calendar-widget.js'
import { getFaSymbol } from './module/sheet/data-context.js'
import { registerCombatSystem } from './module/combat/combat.js'

const { Actors, Items } = foundry.documents.collections

let themePreview = null

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

Hooks.once('init', async function () {
	CONFIG.DOLMENWOOD = DOLMENWOOD

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
		name: 'DOLMEN.Calendar.SettingName',
		hint: 'DOLMEN.Calendar.SettingHint',
		scope: 'world',
		config: true,
		type: Boolean,
		default: true,
		onChange: toggleWidget
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

	CONFIG.Actor.documentClass = DolmenActor
	CONFIG.Item.documentClass = DolmenItem

	// Register Actor data models
	CONFIG.Actor.dataModels = {
		Adventurer: AdventurerDataModel,
		Creature: CreatureDataModel,
		Trait: TraitDataModel
	}
	CONFIG.Item.dataModels = {
		Item: GearDataModel,
		Treasure: TreasureDataModel,
		Weapon: WeaponDataModel,
		Armor: ArmorDataModel,
		Foraged: ForagedDataModel,
		Spell: SpellDataModel,
		HolySpell: HolySpellDataModel,
		Glamour: GlamourDataModel,
		Rune: RuneDataModel,
		Kindred: KindredDataModel,
		Class: ClassDataModel
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
			slots: 'DOLMEN.Encumbrance.slots'
		},
		onChange: () => {
			ui.items?.render()
			Object.values(ui.windows).forEach(app => {
				if (app.collection?.documentName === 'Item') app.render()
			})
			foundry.applications.instances?.forEach(app => {
				if (app.collection?.documentName === 'Item') app.render()
			})
			// Re-render open adventurer sheets
			Object.values(ui.windows).forEach(app => {
				if (app.document?.type === 'Adventurer') app.render()
			})
			foundry.applications.instances?.forEach(app => {
				if (app.document?.type === 'Adventurer') app.render()
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

	game.settings.register('dolmenwood', 'showWelcomeDialog', {
		name: 'DOLMEN.Welcome.SettingName',
		hint: 'DOLMEN.Welcome.SettingHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
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

	Items.registerSheet('dolmen', DolmenItemSheet, {
		types: ['Item', 'Treasure', 'Weapon', 'Armor', 'Foraged', 'Spell', 'HolySpell', 'Glamour', 'Rune'],
		label: 'DOLMEN.ItemSheetTitle',
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

Hooks.once('ready', async function () {
	console.log(game.i18n.localize('DOLMEN.WelcomeMessage'))

	if (game.user.isGM && game.settings.get('dolmenwood', 'showWelcomeDialog')) {
		new WelcomeDialog().render(true)
	}

	initCalendarWidget()

	// Set default turn marker to system frame if not already customized
	if (game.user.isGM) {
		const config = game.settings.get('core', 'combatTrackerConfig')
		if (!config.turnMarker?.src) {
			await game.settings.set('core', 'combatTrackerConfig', foundry.utils.mergeObject(config, {
				turnMarker: { src: 'systems/dolmenwood/assets/turn_tracker.webp' }
			}))
		}
	}

	// Socket listener for player calendar note operations
	game.socket.on('system.dolmenwood', handleCalendarSocket)
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

// Add context menu to damage rolls and save link listeners in chat
Hooks.on('renderChatMessageHTML', (message, html) => {
	setupDamageContextMenu(html)
	setupSaveLinkListeners(html)
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

