/* global CONFIG, game, Hooks, foundry */

import DOLMENWOOD from './module/config.js'
import DolmenSheet from './module/dolmen-sheet.js'
import DolmenItemSheet from './module/dolmen-item-sheet.js'
import DolmenActor from './module/dolmen-actor.js'
import DolmenItem from './module/dolmen-item.js'
import { AdventurerDataModel, CreatureDataModel, ItemDataModel, TreasureDataModel, WeaponDataModel, SpellDataModel, ArmorDataModel, ForagedDataModel } from './module/data-models.mjs'

const { Actors, Items } = foundry.documents.collections

Hooks.once('init', async function () {
	CONFIG.DOLMENWOOD = DOLMENWOOD

	CONFIG.Actor.documentClass = DolmenActor
	CONFIG.Item.documentClass = DolmenItem
	
	// Register Actor data models
	CONFIG.Actor.dataModels = {
		Adventurer: AdventurerDataModel,
		Creature: CreatureDataModel
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