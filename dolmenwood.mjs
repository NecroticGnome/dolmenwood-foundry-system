/* global CONFIG, game, Hooks, foundry, Handlebars */

import DOLMENWOOD from './module/config.js'
import DolmenSheet from './module/dolmen-sheet.js'
import DolmenItemSheet from './module/dolmen-item-sheet.js'
import DolmenActor from './module/dolmen-actor.js'
import DolmenItem from './module/dolmen-item.js'
import { AdventurerDataModel, CreatureDataModel, TraitDataModel, ItemDataModel, TreasureDataModel, WeaponDataModel, SpellDataModel, ArmorDataModel, ForagedDataModel } from './module/data-models.mjs'
import { KINDRED_TRAITS, CLASS_TRAITS, KINDRED_CLASS_TRAITS, COMBAT_TALENTS, HOLY_ORDERS, KINDRED_CLASS_NAMES, ADJUSTMENT_TARGETS } from './module/config/traits.js'

const { Actors, Items } = foundry.documents.collections

Hooks.once('init', async function () {
	CONFIG.DOLMENWOOD = {
		...DOLMENWOOD,
		traits: {
			kindred: KINDRED_TRAITS,
			class: CLASS_TRAITS,
			kindredClass: KINDRED_CLASS_TRAITS,
			combatTalents: COMBAT_TALENTS,
			holyOrders: HOLY_ORDERS,
			kindredClassNames: KINDRED_CLASS_NAMES,
			adjustmentTargets: ADJUSTMENT_TARGETS
		}
	}

	// Register Handlebars helpers
	Handlebars.registerHelper('add', (a, b) => (a || 0) + (b || 0))

	CONFIG.Actor.documentClass = DolmenActor
	CONFIG.Item.documentClass = DolmenItem
	
	// Register Actor data models
	CONFIG.Actor.dataModels = {
		Adventurer: AdventurerDataModel,
		Creature: CreatureDataModel,
		Trait: TraitDataModel
	}
	CONFIG.Item.dataModels = {
		Item: ItemDataModel,
		Treasure: TreasureDataModel,
		Weapon: WeaponDataModel,
		Armor: ArmorDataModel,
		Foraged: ForagedDataModel,
		Spell: SpellDataModel
	}

	Actors.registerSheet('dolmen', DolmenSheet, {
		types: ['Adventurer', 'Creature'],
		label: 'DOLMEN.SheetTitle',
		makeDefault: true
	})

	Items.registerSheet('dolmen', DolmenItemSheet, {
		types: ['Item', 'Treasure', 'Weapon', 'Armor', 'Foraged', 'Spell'],
		label: 'DOLMEN.ItemSheetTitle',
		makeDefault: true
	})
})

Hooks.once('ready', async function () {
	console.log(game.i18n.localize('DOLMEN.WelcomeMessage'))
})