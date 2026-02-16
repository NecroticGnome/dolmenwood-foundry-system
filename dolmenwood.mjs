/* global CONFIG, game, Hooks, foundry, Handlebars */

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
import { initCalendarWidget, toggleWidget } from './module/calendar/calendar-widget.js'

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

	// Register Handlebars helpers
	Handlebars.registerHelper('add', (a, b) => (a || 0) + (b || 0))
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

	game.settings.register('dolmenwood', 'showWelcomeDialog', {
		name: 'DOLMEN.Welcome.SettingName',
		hint: 'DOLMEN.Welcome.SettingHint',
		scope: 'client',
		config: true,
		type: Boolean,
		default: true
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
		default: false,
		onChange: toggleWidget
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

