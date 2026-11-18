/* global game, foundry, fromUuid, fromUuidSync, Roll, CONFIG, ChatMessage, CONST */

/**
 * Creature treasure: entries of results on system.treasure.hoard / .carried, edited in a window
 * opened from the Hoard / Possessions fields of the creature sheet.
 * An entry rolls its chance (blank = always) once and gives every result. The system rolls coins,
 * documents (a RollTable drawn N times, an Item listed) and text. Treasure codes (C3, R4, M2,
 * keywords like gems/magic) come from modules, through CONFIG.DOLMENWOOD.treasureResolvers
 * (see config.js) and rollTreasure below. @Treasure[code] links in any text roll them too.
 */

import { buildChoices, CHOICE_KEYS } from '../utils/choices.js'
import { createChatMessage } from './chat-helpers.js'

/** Each treasure list, with the creature's book-text field it sits beside */
export const TREASURE_KINDS = {
	hoard: { textField: 'treasureType', textLabel: 'DOLMEN.Creature.Hoard', title: 'DOLMEN.Creature.Treasure.HoardTitle' },
	carried: { textField: 'possessions', textLabel: 'DOLMEN.Creature.Possessions', title: 'DOLMEN.Creature.Treasure.CarriedTitle' }
}

const esc = s => foundry.utils.escapeHTML(String(s ?? ''))

const newResult = (data = {}) => ({ quantity: '', type: 'treasure', value: '', label: '', ...data })

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api

/**
 * The treasure window: a creature's book text for one list, and its entries.
 * One window per creature and list; it re-renders when the creature changes.
 */
export class TreasureEditor extends HandlebarsApplicationMixin(DocumentSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'treasure-editor'],
		kind: 'hoard',
		sheetConfig: false,
		ownershipConfig: false,
		canImport: false,
		position: { width: 640, height: 'auto' },
		window: { resizable: true, icon: 'fas fa-gem' },
		form: { submitOnChange: true },
		actions: {
			addEntry: TreasureEditor.#onAddEntry,
			removeEntry: TreasureEditor.#onRemoveEntry,
			addResult: TreasureEditor.#onAddResult,
			removeResult: TreasureEditor.#onRemoveResult,
			openDocument: TreasureEditor.#onOpenDocument,
			roll: TreasureEditor.#onRoll
		}
	}

	static PARTS = {
		form: { template: 'systems/dolmenwood/templates/creature/treasure-editor.html', scrollable: [''] }
	}

	/**
	 * Open (or bring forward) the window for a creature's list.
	 * @param {Actor} actor - The creature
	 * @param {string} kind - 'hoard' or 'carried'
	 */
	static open(actor, kind) {
		const app = new TreasureEditor({ document: actor, kind })
		const existing = foundry.applications.instances.get(app.id)
		return (existing ?? app).render({ force: true })
	}

	/** @inheritDoc */
	_initializeApplicationOptions(options) {
		options = super._initializeApplicationOptions(options)
		options.uniqueId += `-${options.kind}`
		return options
	}

	get kind() {
		return this.options.kind
	}

	/** @override */
	get title() {
		return game.i18n.format(TREASURE_KINDS[this.kind].title, { name: this.document.name })
	}

	/** @inheritDoc */
	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const { textField, textLabel } = TREASURE_KINDS[this.kind]
		const base = `system.treasure.${this.kind}`
		return Object.assign(context, {
			kind: this.kind,
			textName: `system.${textField}`,
			textValue: this.document.system[textField],
			textLabel: game.i18n.localize(textLabel),
			typeChoices: buildChoices('DOLMEN.Creature.Treasure.Types', CHOICE_KEYS.treasureResultTypes),
			coinChoices: Object.fromEntries(CHOICE_KEYS.costDenominations.map(k => [k, k])),
			entries: (this.document.system.treasure?.[this.kind] ?? []).map((entry, index) => ({
				index,
				name: `${base}.${index}`,
				chance: entry.chance,
				chanceIn: entry.chanceIn,
				results: entry.results.map((r, rIndex) => ({
					...r,
					index: rIndex,
					name: `${base}.${index}.results.${rIndex}`,
					isCoins: r.type === 'coins',
					isDocument: r.type === 'document',
					docName: r.type === 'document' ? (fromUuidSync(r.value)?.name ?? r.value) : ''
				}))
			}))
		})
	}

	/** @inheritDoc */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options)
		if (!this.isEditable) return
		// a RollTable or Item dropped in: a result on the entry it lands on, else a new entry
		this.element.addEventListener('dragover', e => e.preventDefault())
		this.element.addEventListener('drop', e => this.#onDrop(e))
	}

	async #onDrop(event) {
		let data
		try {
			data = JSON.parse(event.dataTransfer.getData('text/plain'))
		} catch {
			return
		}
		if (!['RollTable', 'Item'].includes(data?.type) || !data.uuid) return
		event.preventDefault()
		const list = this.#list()
		const result = newResult({ type: 'document', value: data.uuid })
		const entry = list[Number(event.target.closest?.('.treasure-entry')?.dataset.entry)]
		if (entry) entry.results.push(result)
		else list.push({ chance: 1, chanceIn: 6, results: [result] })
		return this.#save(list)
	}

	#list() {
		return foundry.utils.deepClone(this.document.system.treasure?.[this.kind] ?? [])
	}

	#save(list) {
		return this.document.update({ [`system.treasure.${this.kind}`]: list })
	}

	static async #onAddEntry() {
		const list = this.#list()
		list.push({ chance: 1, chanceIn: 6, results: [newResult()] })
		return this.#save(list)
	}

	static async #onRemoveEntry(_event, target) {
		const list = this.#list()
		list.splice(Number(target.dataset.entry), 1)
		return this.#save(list)
	}

	static async #onAddResult(_event, target) {
		const list = this.#list()
		list[Number(target.dataset.entry)]?.results.push(newResult())
		return this.#save(list)
	}

	/** Remove a result; an entry left without results goes too. */
	static async #onRemoveResult(_event, target) {
		const { entry, result } = target.dataset
		const list = this.#list()
		const e = list[Number(entry)]
		if (!e) return
		e.results.splice(Number(result), 1)
		if (!e.results.length) list.splice(Number(entry), 1)
		return this.#save(list)
	}

	static async #onOpenDocument(_event, target) {
		const doc = await fromUuid(target.dataset.uuid)
		doc?.sheet?.render(true)
	}

	static async #onRoll() {
		return rollCreatureTreasure(this.document, this.kind)
	}
}

/* -------------------------------------------- */
/*  Rolling                                     */
/* -------------------------------------------- */

/**
 * How a result reads before it's rolled (for a missed chance).
 * @param {object} r - The result
 * @returns {string} HTML
 */
function describeResult(r) {
	if (r.label) return esc(r.label)
	const qty = r.quantity ? `${esc(r.quantity)} ` : ''
	if (r.type === 'document') return qty + esc(fromUuidSync(r.value)?.name ?? r.value)
	return qty + esc(r.value)
}

/**
 * Roll a quantity formula; blank is 1, a bad formula is shown as written.
 * @param {string} formula - Dice formula
 * @returns {Promise<number|null>} The total, or null when the formula is invalid
 */
async function rollQuantity(formula) {
	if (!formula?.trim()) return 1
	if (!Roll.validate(formula)) return null
	return (await new Roll(formula).evaluate()).total
}

/**
 * Text for one drawn table result: its text, or a link to its document.
 * @param {TableResult} result - The drawn result
 * @returns {string} HTML
 */
function tableResultText(result) {
	if (result.documentUuid) return `@UUID[${result.documentUuid}]{${esc(result.name)}}`
	return result.description || esc(result.name)
}

/**
 * Roll one result.
 * @param {object} r - The result
 * @param {Actor} actor - The creature
 * @returns {Promise<string|string[]>} HTML for the card (a line per draw for a table)
 */
async function rollResult(r, actor) {
	const n = await rollQuantity(r.quantity)
	if (n === null) return describeResult(r)
	const label = r.label ? ` <span class="treasure-label">(${esc(r.label)})</span>` : ''

	if (r.type === 'coins') return `${n.toLocaleString()} ${esc(r.value)}${label}`

	if (r.type === 'document') {
		const doc = r.value ? await fromUuid(r.value) : null
		if (!doc) return describeResult(r)
		if (doc.documentName === 'RollTable') {
			const drawn = []
			for (let i = 0; i < n; i++) {
				const { results } = await doc.roll()
				drawn.push(`<b>${esc(r.label || doc.name)}:</b> ${results.map(tableResultText).join(', ')}`)
			}
			return drawn // a line per draw
		}
		return `${n > 1 ? `${n} × ` : ''}@UUID[${doc.uuid}]{${esc(r.label || doc.name)}}`
	}

	if (r.type === 'treasure') {
		const { html } = await rollTreasure(r.value, { actor, quantity: n })
		return html || `${esc(r.label || r.value)}${n > 1 ? ` × ${n}` : ''}`
	}

	// text
	return `${r.quantity ? `${n} × ` : ''}${esc(r.label || r.value)}`
}

/**
 * Roll a creature's treasure list and post it to chat.
 * @param {Actor} actor - The creature
 * @param {string} kind - 'hoard' or 'carried'
 * @returns {Promise<ChatMessage|undefined>}
 */
export async function rollCreatureTreasure(actor, kind) {
	const entries = actor.system.treasure?.[kind] ?? []
	if (!entries.length) return
	const title = game.i18n.format(`DOLMEN.Creature.Treasure.Roll${kind === 'hoard' ? 'Hoard' : 'Carried'}`, { name: esc(actor.name) })
	return postTreasure(actor, title, await rollEntries(entries, actor))
}

/**
 * The extra treasure buttons modules add (CONFIG.DOLMENWOOD.treasureExtras) that apply to a creature.
 * @param {Actor} actor - The creature
 * @param {string} kind - 'hoard' or 'carried'
 * @returns {object[]} { id, label, icon } for each button
 */
export function treasureExtrasFor(actor, kind) {
	return Object.entries(CONFIG.DOLMENWOOD.treasureExtras ?? {})
		.filter(([, x]) => x.kind === kind && (x.show?.(actor) ?? true))
		.map(([id, x]) => ({ id, label: game.i18n.localize(x.label), icon: x.icon || 'fas fa-dice' }))
}

/**
 * Roll one of the extra treasure rolls modules add, for a creature, to chat.
 * @param {Actor} actor - The creature
 * @param {string} id - The CONFIG.DOLMENWOOD.treasureExtras key
 * @returns {Promise<ChatMessage|undefined>}
 */
export async function rollTreasureExtra(actor, id) {
	const extra = CONFIG.DOLMENWOOD.treasureExtras?.[id]
	if (!extra?.entries?.length) return
	const title = `${esc(actor.name)}: ${esc(game.i18n.localize(extra.label))}`
	return postTreasure(actor, title, await rollEntries(extra.entries, actor))
}

/**
 * Roll a list of entries: each entry's chance once, then its results.
 * @param {object[]} entries - Treasure entries
 * @param {Actor} actor - The creature
 * @returns {Promise<string[]>} A <li> per line
 */
async function rollEntries(entries, actor) {
	const lines = []
	for (const entry of entries) {
		const chanceIn = entry.chanceIn || 100
		const chance = entry.chance ?? chanceIn
		let prefix = ''
		if (chance < chanceIn) {
			const roll = (await new Roll(`1d${chanceIn}`).evaluate()).total
			const odds = chanceIn === 100 ? `${chance}%` : `${chance}-in-${chanceIn}`
			prefix = `<span class="treasure-chance">${odds} (${roll})</span> `
			if (roll > chance) {
				const what = entry.results.map(describeResult).join(' + ')
				const hint = game.i18n.format('DOLMEN.Creature.Treasure.MissHint', { roll, chance })
				lines.push(`<li class="treasure-miss" data-tooltip="${hint}">${prefix}<s>${what}</s></li>`)
				continue
			}
		}
		const items = []
		for (const r of entry.results) {
			for (const html of [await rollResult(r, actor)].flat()) items.push(`<li>${html}</li>`)
		}
		// A chance entry that hits shows its roll once, with its results nested under it
		if (prefix) lines.push(`<li>${prefix}<ul>${items.join('')}</ul></li>`)
		else lines.push(...items)
	}
	return lines
}

/**
 * Post a treasure card.
 * @param {Actor} actor - The creature
 * @param {string} title - Card title (HTML)
 * @param {string[]} lines - <li> lines
 * @returns {Promise<ChatMessage>}
 */
function postTreasure(actor, title, lines) {
	return createChatMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		content: `<div class="dolmen treasure-roll"><div class="treasure-header"><h3>${title}</h3></div><ul>${lines.join('')}</ul></div>`,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/**
 * Roll a treasure code or keyword through the modules' resolvers (CONFIG.DOLMENWOOD.treasureResolvers),
 * in order; the first non-empty html wins. A resolver can call this for another module's codes.
 * @param {string} value - The code or keyword, e.g. 'C3' or 'magic'
 * @param {object} [options]
 * @param {Actor} [options.actor] - The creature, when rolled for one
 * @param {number} [options.quantity=1] - How many times to roll it
 * @returns {Promise<{html: string}>} Empty html when no resolver knows the value
 */
export async function rollTreasure(value, { actor = null, quantity = 1 } = {}) {
	for (const resolve of CONFIG.DOLMENWOOD.treasureResolvers ?? []) {
		try {
			const out = await resolve(value, { actor, quantity })
			if (out?.html) return { html: out.html }
		} catch (err) {
			console.error('Dolmenwood | treasure resolver failed for', value, err)
		}
	}
	return { html: '' }
}

/* -------------------------------------------- */
/*  @Treasure[...] links                        */
/* -------------------------------------------- */

/**
 * @Treasure[value] or @Treasure[quantity value], with an optional {label}.
 * @param {string[]} match - The enricher match
 * @returns {HTMLAnchorElement}
 */
function enrichTreasure([, inner, label]) {
	const parts = inner.trim().split(/\s+/)
	const a = document.createElement('a')
	a.className = 'content-link dolmen-treasure'
	a.dataset.treasure = parts.pop()
	if (parts.length) a.dataset.quantity = parts.join(' ')
	a.innerHTML = `<i class="fa-solid fa-gem"></i>${esc(label ?? inner.trim())}`
	return a
}

/**
 * Roll a clicked @Treasure link to chat.
 * @param {MouseEvent} event - The click
 */
async function onClickTreasure(event) {
	const a = event.target.closest?.('a.dolmen-treasure')
	if (!a) return
	event.preventDefault()
	event.stopPropagation()
	const { treasure, quantity: formula } = a.dataset
	const n = (await rollQuantity(formula)) ?? 1
	const { html } = await rollTreasure(treasure, { quantity: n })
	const title = esc(a.textContent.trim())
	return createChatMessage({
		speaker: ChatMessage.getSpeaker(),
		content: `<div class="dolmen treasure-roll"><div class="treasure-header"><h3>${title}</h3></div><ul><li>${html || title}</li></ul></div>`,
		style: CONST.CHAT_MESSAGE_STYLES.OTHER
	})
}

/** Register the @Treasure enricher and its click handler (init). */
export function registerTreasureLinks() {
	CONFIG.TextEditor.enrichers.push({ pattern: /@Treasure\[([^\]]+)\](?:\{([^}]+)\})?/g, enricher: enrichTreasure })
	document.body.addEventListener('click', onClickTreasure)
}

