/* global CONFIG, game, Hooks, foundry */

import DOLMENWOOD from './module/config.js'
import DolmenSheet from './module/dolmen-sheet.js'
import DolmenActor from './module/dolmen-actor.js'
import DolmenItem from './module/dolmen-item.js'
import { AdventurerDataModel, CreatureDataModel, WeaponDataModel, SpellDataModel } from './module/data-models.mjs'

const { Actors } = foundry.documents.collections

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
		weapon: WeaponDataModel,
		spell: SpellDataModel
	}

	Actors.registerSheet('dolmen', DolmenSheet, {
		types: ['Adventurer', 'Creature'],
		label: 'DOLMEN.SheetTitle',
		makeDefault: true
	})
})

Hooks.once('ready', async function () {
	console.log(game.i18n.localize('DOLMEN.WelcomeMessage'))
})