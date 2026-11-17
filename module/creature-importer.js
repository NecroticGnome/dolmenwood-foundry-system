/* global foundry, game, ui, Actor */

/**
 * The creature statblock importer window. The parsing is in creature-parser.js.
 */

import { parseStatblock, parseOSEStatblock } from './creature-parser.js'
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

const PARSERS = { dolmenwood: parseStatblock, ose: parseOSEStatblock }

/** Map parsed statblock data onto Creature actor data. */
function toActorData(data) {
	return {
		name: data.name,
		type: 'Creature',
		system: {
			level: data.level,
			hp: { value: data.hpValue, max: data.hpValue },
			ac: data.ac,
			saves: data.saves,
			speed: data.speed,
			size: data.size,
			alignment: data.alignment,
			monsterType: data.monsterType,
			intelligence: data.intelligence,
			hpDice: data.hpDice,
			attacks: data.attacks,
			morale: data.morale,
			xpAward: data.xpAward,
			encounters: data.encounters,
			lairChance: data.lairChance,
			movement: data.movement,
			treasureType: data.treasureType,
			// A leading "Source X" goes in parentheses
			description: (data.description || '').replace(/^(Source\s+\S+)\s*/, '($1) '),
			specialAbilities: data.specialAbilities,
			behaviour: data.behaviour,
			speech: data.speech,
			possessions: data.possessions
		}
	}
}

/**
 * Parse a statblock and create a Creature actor, without showing the window.
 * @param {string} text - Raw statblock text
 * @param {string} format - 'dolmenwood' or 'ose'
 * @returns {Promise<Actor>} The created Creature actor
 */
export async function importCreatureStatblock(text, format = 'dolmenwood') {
	const { data } = (PARSERS[format] ?? parseStatblock)(text)
	return Actor.create(toActorData(data))
}

class CreatureImporter extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'dolmenwood-creature-importer',
		classes: ['dolmen', 'creature-importer'],
		tag: 'div',
		window: { title: 'DOLMEN.CreatureImport.Title', icon: 'fas fa-file-import', resizable: true },
		position: { width: 920, height: 680 },
		actions: { create: CreatureImporter.#onCreate }
	}

	static PARTS = {
		paste: { template: 'systems/dolmenwood/templates/creature/import-paste.html' },
		preview: { template: 'systems/dolmenwood/templates/creature/import-preview.html', scrollable: [''] }
	}

	#text = ''
	#format = 'dolmenwood'
	/** Fields changed in the preview, by path ("saves.doom"). Kept until the paste or the format changes. */
	#edits = {}
	/** { data, warnings }, or { error }, or null when nothing has been pasted */
	#result = null
	#busy = false
	/** The actor this window created, if any */
	created = null

	#reparse = foundry.utils.debounce(() => {
		this.#parse()
		this.render({ parts: ['preview'] })
	}, 300)

	#parse() {
		this.#edits = {}
		if (!this.#text.trim()) {
			this.#result = null
			return
		}
		try {
			this.#result = PARSERS[this.#format](this.#text)
		} catch (err) {
			if (!err.message?.startsWith('DOLMEN.')) console.error('Creature statblock parse failed:', err)
			this.#result = { error: err.message }
		}
	}

	/** The parsed data with the preview's edits applied */
	#data() {
		return foundry.utils.mergeObject(foundry.utils.deepClone(this.#result.data), foundry.utils.expandObject(this.#edits))
	}

	async _preparePartContext(partId, context, options) {
		context = await super._preparePartContext(partId, context, options)
		const i18n = game.i18n
		if (partId === 'paste') {
			context.text = this.#text
			context.formats = ['dolmenwood', 'ose'].map(value => ({
				value,
				checked: value === this.#format,
				label: i18n.localize(`DOLMEN.CreatureImport.Format${value === 'ose' ? 'OSE' : 'Dolmenwood'}`)
			}))
		} else if (partId === 'preview') {
			const result = this.#result
			context.empty = !result
			context.error = result?.error ? i18n.localize(result.error) : ''
			if (result?.data) {
				const data = this.#data()
				context.data = data
				context.warnings = result.warnings.map(w => i18n.format(w.key, w.data))
				context.saves = ['doom', 'ray', 'hold', 'blast', 'spell'].map(key => ({
					key, value: data.saves[key], label: i18n.localize(`DOLMEN.Saves.${key[0].toUpperCase()}${key.slice(1)}`)
				}))
				context.choices = {
					size: buildChoices('DOLMEN.Sizes', CHOICE_KEYS.sizes),
					monsterType: buildChoices('DOLMEN.MonsterTypes', CHOICE_KEYS.monsterTypes),
					intelligence: buildChoices('DOLMEN.IntelligenceTypes', CHOICE_KEYS.intelligenceTypes),
					alignment: buildChoices('DOLMEN.Alignments', CHOICE_KEYS.creatureAlignments)
				}
				context.attacks = data.attacks.map(a => {
					const count = a.numAttacks > 1 ? `${a.numAttacks} × ` : ''
					const bonus = a.attackType === 'attack' ? `${a.attackBonus >= 0 ? '+' : ''}${a.attackBonus}, ` : ''
					return { group: a.attackGroup, text: `${count}${a.attackName} (${bonus}${a.attackDamage})` }
				})
				context.abilities = data.specialAbilities.map(a => a.name)
			}
			context.cannotCreate = !result?.data || this.#busy
		}
		return context
	}

	_onRender(context, options) {
		super._onRender(context, options)
		const parts = options.parts ?? Object.keys(this.constructor.PARTS)
		if (parts.includes('paste')) {
			const paste = this.element.querySelector('[data-application-part="paste"]')
			paste.querySelector('textarea').addEventListener('input', event => {
				this.#text = event.target.value
				this.#reparse()
			})
			paste.querySelectorAll('input[name="format"]').forEach(radio => radio.addEventListener('change', event => {
				this.#format = event.target.value
				this.#parse()
				this.render({ parts: ['preview'] })
			}))
		}
		if (parts.includes('preview')) {
			this.element.querySelector('[data-application-part="preview"]').addEventListener('change', event => {
				const input = event.target
				if (!input.name || !this.#result?.data) return
				this.#edits[input.name] = input.type === 'number' ? (Number(input.value) || 0) : input.value
			})
		}
	}

	static async #onCreate(_event, target) {
		if (this.#busy || !this.#result?.data) return
		const data = this.#data()
		if (!data.name?.trim()) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.CreatureImport.NeedName'))
			this.element.querySelector('input[name="name"]')?.focus()
			return
		}
		this.#busy = true // so a double-click can't make two actors
		target.disabled = true
		try {
			this.created = await Actor.create(toActorData(data))
			ui.notifications.info(game.i18n.format('DOLMEN.CreatureImport.Success', { name: this.created.name }))
			await this.close()
			this.created.sheet.render(true)
		} catch (err) {
			console.error('Creature statblock import failed:', err)
			ui.notifications.error(`${game.i18n.localize('DOLMEN.CreatureImport.CreateError')}: ${err.message}`)
			this.#busy = false
			target.disabled = false
		}
	}
}

/**
 * Open the creature statblock import window.
 * @returns {Promise<Actor|null>} Resolves when the window closes with the created actor or null
 */
export function openCreatureImportDialog() {
	const app = new CreatureImporter()
	const closed = new Promise(resolve => app.addEventListener('close', () => resolve(app.created), { once: true }))
	app.render(true)
	return closed
}
