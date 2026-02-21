/* global game, foundry, canvas, ui, Hooks, ChatMessage */

import { computeXPModifier, computeAdjustedValues } from '../sheet/data-context.js'

const { DialogV2 } = foundry.applications.api

const RETAINER_SHARES = { quarter: 0.25, half: 0.5, full: 1 }

/**
 * Get the treasure share weight for an actor.
 * PCs get 1, retainers get their configured share (0.25, 0.5, or 1).
 */
function getTreasureShare(actor) {
	const r = actor.system.retainer
	return r ? (RETAINER_SHARES[r] ?? 0.5) : 1
}

/**
 * Get a display label for a retainer's share (e.g. "½ share").
 */
function getRetainerLabel(actor) {
	const r = actor.system.retainer
	if (!r) return null
	const labels = { quarter: '¼', half: '½', full: '1' }
	return `${labels[r] ?? '½'} share`
}

let widgetEl = null
let partyMembers = [] // array of actor IDs

/**
 * Load party member IDs from the world setting.
 */
function loadParty() {
	try {
		partyMembers = game.settings.get('dolmenwood', 'partyMembers') ?? []
	} catch {
		partyMembers = []
	}
}

/**
 * Save party member IDs to the world setting.
 */
function saveParty() {
	if (!game.user.isGM) return
	game.settings.set('dolmenwood', 'partyMembers', partyMembers)
}

/**
 * Render the party member cards inside the widget.
 */
function renderParty() {
	if (!widgetEl) return
	const list = widgetEl.querySelector('.party-member-list')
	if (!list) return
	list.innerHTML = ''

	for (const actorId of partyMembers) {
		const actor = game.actors.get(actorId)
		if (!actor) continue

		const card = document.createElement('div')
		card.className = 'party-member-card'
		card.dataset.actorId = actorId

		// Row 1: Name
		const nameEl = document.createElement('span')
		nameEl.className = 'party-name'
		nameEl.textContent = actor.name
		nameEl.title = actor.name
		card.appendChild(nameEl)

		// Row 2-3: Portrait (spanning) + HP/AC stacked
		const body = document.createElement('div')
		body.className = 'party-body'

		const img = document.createElement('img')
		img.className = 'party-portrait'
		img.src = actor.img || 'icons/svg/mystery-man.svg'
		img.alt = actor.name
		body.appendChild(img)

		const stats = document.createElement('div')
		stats.className = 'party-stats'

		const hp = actor.system.hp
		const hpRatio = hp.max > 0 ? hp.value / hp.max : 0
		let hpClass = 'hp-healthy'
		if (hpRatio <= 0) hpClass = 'hp-dead'
		else if (hpRatio <= 0.25) hpClass = 'hp-critical'
		else if (hpRatio <= 0.5) hpClass = 'hp-wounded'

		stats.innerHTML = `<span class="party-hp ${hpClass}"><i class="fa-solid fa-heart"></i> ${hp.value}/${hp.max}</span>`
			+ `<span class="party-ac"><i class="fa-solid fa-shield"></i> ${actor.system.ac}</span>`
		body.appendChild(stats)
		card.appendChild(body)

		// Retainer indicator
		const retLabel = getRetainerLabel(actor)
		if (retLabel) {
			const retainerEl = document.createElement('span')
			retainerEl.className = 'party-retainer'
			retainerEl.textContent = retLabel
			card.appendChild(retainerEl)
		}

		// Remove button (GM only)
		if (game.user.isGM) {
			const removeBtn = document.createElement('button')
			removeBtn.type = 'button'
			removeBtn.className = 'party-remove-btn'
			removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
			removeBtn.title = game.i18n.localize('DOLMEN.PartyViewer.Remove')
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation()
				removeMember(actorId)
			})
			card.appendChild(removeBtn)
		}

		// Click card to open character sheet
		card.addEventListener('click', () => {
			actor.sheet.render(true)
		})

		list.appendChild(card)
	}
}

/**
 * Add the currently selected token's actor to the party.
 */
function addCurrentToken() {
	if (!game.user.isGM) return
	const token = canvas.tokens?.controlled?.[0]
	if (!token?.actor) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.PartyViewer.NoTokenSelected'))
		return
	}
	const actor = token.actor
	if (actor.type !== 'Adventurer') {
		ui.notifications.warn(game.i18n.localize('DOLMEN.PartyViewer.NotAdventurer'))
		return
	}
	if (partyMembers.includes(actor.id)) {
		ui.notifications.info(game.i18n.localize('DOLMEN.PartyViewer.AlreadyInParty'))
		return
	}
	partyMembers.push(actor.id)
	saveParty()
	renderParty()
}

/**
 * Remove a member from the party by actor ID.
 */
function removeMember(actorId) {
	partyMembers = partyMembers.filter(id => id !== actorId)
	saveParty()
	renderParty()
}

/**
 * Attach a live-updating preview to a distribute dialog.
 * @param {DialogV2} dialog
 * @param {Function} updatePreview  (form) => void — reads inputs and updates preview DOM
 */
function attachPreviewListener(dialog, updatePreview) {
	const el = dialog.element
	const inputs = el.querySelectorAll('input[type="number"]')
	const update = () => updatePreview(el.querySelector('form'))
	for (const input of inputs) {
		input.addEventListener('input', update)
	}
}

/**
 * Show a dialog to distribute XP among party members.
 * Retainers receive half a share.
 */
async function addXP() {
	if (!game.user.isGM) return
	const validActors = partyMembers.map(id => game.actors.get(id)).filter(a => a)
	if (validActors.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.PartyViewer.NoMembers'))
		return
	}

	const members = validActors.map(a => {
		const isRetainer = a.system.retainer
		const adjusted = computeAdjustedValues(a)
		const baseMod = computeXPModifier(a, adjusted.abilities)
		const adjMod = a.system.adjustments.xpModifier || 0
		const bonusPct = baseMod + adjMod
		const basePct = isRetainer ? 50 : 100
		return { actor: a, isRetainer, basePct, bonusPct }
	})
	const headcount = members.length

	const previewRows = members.map((m, i) => {
		const rawPct = m.basePct * (100 + m.bonusPct) / 100
		const effectivePct = rawPct % 1 === 0 ? rawPct : rawPct.toFixed(1)
		const pctLabel = ` <span class="xp-retainer-tag">(${effectivePct}%)</span>`
		return `<div class="preview-row" data-index="${i}">
				<span class="preview-name">${m.actor.name}${pctLabel}</span>
				<span class="preview-amount"></span>
			</div>`
	}).join('')

	const computeShare = (perHead, m) => {
		const base = Math.floor(perHead * m.basePct / 100)
		return Math.floor(base * (100 + m.bonusPct) / 100)
	}

	const label = game.i18n.localize('DOLMEN.PartyViewer.XPAmount')

	const hookId = Hooks.once('renderDialogV2', (dialog) => {
		attachPreviewListener(dialog, (form) => {
			const total = parseInt(form.elements.amount.value) || 0
			const perHead = headcount > 0 ? Math.floor(total / headcount) : 0
			const rows = dialog.element.querySelectorAll('.preview-row')
			members.forEach((m, i) => {
				const amountEl = rows[i]?.querySelector('.preview-amount')
				if (amountEl) amountEl.textContent = computeShare(perHead, m)
			})
		})
	})

	const result = await DialogV2.prompt({
		window: { title: game.i18n.localize('DOLMEN.PartyViewer.DivideXP') },
		content: `
			<div class="form-group">
				<label>${label}</label>
				<input type="number" name="amount" placeholder="0" min="0" autofocus>
			</div>
			<div class="distribute-preview">${previewRows}</div>`,
		ok: {
			label: game.i18n.localize('DOLMEN.PartyViewer.DivideXP'),
			icon: 'fa-solid fa-star',
			callback: (event, button) => {
				return parseInt(button.form.elements.amount.value) || 0
			}
		},
		rejectClose: false
	})

	Hooks.off('renderDialogV2', hookId)

	if (!result || result <= 0) return
	if (headcount <= 0) return

	const perHead = Math.floor(result / headcount)
	for (const m of members) {
		const share = computeShare(perHead, m)
		if (share > 0) {
			await m.actor.update({ 'system.xp.value': m.actor.system.xp.value + share })
		}
	}

	ui.notifications.info(game.i18n.format('DOLMEN.PartyViewer.XPDistributed', {
		amount: result,
		count: validActors.length
	}))
}

// Denomination order from highest to lowest, with conversion to next lower
const DENOM_ORDER = [
	{ key: 'pellucidium', abbr: 'pp', icon: 'coin-pellucidium', toLower: 10 },
	{ key: 'gold', abbr: 'gp', icon: 'coin-gold', toLower: 10 },
	{ key: 'silver', abbr: 'sp', icon: 'coin-silver', toLower: 10 },
	{ key: 'copper', abbr: 'cp', icon: 'coin-copper', toLower: 0 }
]

/**
 * Compute per-member coin distribution with weighted shares.
 * @param {Object} totals       {pellucidium, gold, silver, copper}
 * @param {number[]} weights    share weight per member (e.g. [1, 1, 0.5])
 * @param {boolean} denominate  convert remainders to lower denomination
 * @returns {{ grants: Object[], extras: Object }}
 */
function computeCoinShares(totals, weights, denominate) {
	const totalShares = weights.reduce((s, w) => s + w, 0)
	const count = weights.length
	const grants = weights.map(() => ({ copper: 0, silver: 0, gold: 0, pellucidium: 0 }))
	const extras = { copper: 0, silver: 0, gold: 0, pellucidium: 0 }
	const pool = { ...totals }

	for (let d = 0; d < DENOM_ORDER.length; d++) {
		const denom = DENOM_ORDER[d]
		const available = pool[denom.key] || 0
		if (available <= 0 || totalShares <= 0) continue

		// Per-share amount (one full share)
		const perShare = available / totalShares
		let distributed = 0
		for (let i = 0; i < count; i++) {
			const amount = Math.floor(perShare * weights[i])
			grants[i][denom.key] = amount
			distributed += amount
		}

		let remainder = available - distributed
		if (remainder > 0 && denominate && denom.toLower > 0) {
			const next = DENOM_ORDER[d + 1]
			pool[next.key] = (pool[next.key] || 0) + remainder * denom.toLower
			remainder = 0
		}
		extras[denom.key] = remainder
	}

	return { grants, extras }
}

/**
 * Format a coin bag as a string like "3 gp, 5 sp".
 */
function formatCoins(bag) {
	const parts = []
	for (const d of DENOM_ORDER) {
		if (bag[d.key]) parts.push(`${bag[d.key]} ${d.abbr}`)
	}
	return parts.join(', ') || '0'
}

/**
 * Show a dialog to distribute coins evenly among party members.
 */
async function addCoins() {
	if (!game.user.isGM) return
	const validActors = partyMembers.map(id => game.actors.get(id)).filter(a => a)
	if (validActors.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.PartyViewer.NoMembers'))
		return
	}

	const weights = validActors.map(a => getTreasureShare(a))

	const coinInputs = DENOM_ORDER.map(d => {
		const label = game.i18n.localize(`DOLMEN.Coins.${d.key.charAt(0).toUpperCase() + d.key.slice(1)}`)
		return `<div class="party-coin-cell">
				<label title="${label}"><i class="fa-duotone fa-light fa-coin coin-icon ${d.icon}"></i></label>
				<input type="number" name="${d.key}" placeholder="0" min="0">
			</div>`
	}).join('')

	const denominateLabel = game.i18n.localize('DOLMEN.PartyViewer.DenominateSpare')
	const previewRows = validActors.map((a, i) => {
		const shareLabel = getRetainerLabel(a)
		const tag = shareLabel ? ` <span class="xp-retainer-tag">(${shareLabel})</span>` : ''
		return `<div class="preview-row" data-index="${i}">
				<span class="preview-name">${a.name}${tag}</span>
				<span class="preview-coins"></span>
			</div>`
	}).join('')

	const randomLabel = game.i18n.localize('DOLMEN.PartyViewer.DistributedRandomly')

	const hookId = Hooks.once('renderDialogV2', (dialog) => {
		const el = dialog.element
		const inputs = el.querySelectorAll('input[type="number"], input[name="denominate"]')
		const update = () => {
			const form = el.querySelector('form')
			const totals = {
				pellucidium: parseInt(form.elements.pellucidium.value) || 0,
				gold: parseInt(form.elements.gold.value) || 0,
				silver: parseInt(form.elements.silver.value) || 0,
				copper: parseInt(form.elements.copper.value) || 0
			}
			const denom = form.elements.denominate?.checked ?? false
			const { grants, extras } = computeCoinShares(totals, weights, denom)

			const rows = el.querySelectorAll('.preview-row')
			validActors.forEach((a, i) => {
				const coinsEl = rows[i]?.querySelector('.preview-coins')
				if (coinsEl) coinsEl.textContent = formatCoins(grants[i])
			})

			const remainderEl = el.querySelector('.preview-remainder')
			if (remainderEl) {
				const extraStr = formatCoins(extras)
				if (extraStr !== '0') {
					remainderEl.textContent = `${extraStr}: ${randomLabel}`
					remainderEl.style.display = ''
				} else {
					remainderEl.style.display = 'none'
				}
			}
		}
		for (const input of inputs) {
			input.addEventListener('input', update)
			input.addEventListener('change', update)
		}
	})

	const result = await DialogV2.prompt({
		window: { title: game.i18n.localize('DOLMEN.PartyViewer.DivideCoins') },
		content: `
			<div class="party-coins-row">${coinInputs}</div>
			<div class="party-denominate">
				<label><input type="checkbox" name="denominate"> ${denominateLabel}</label>
			</div>
			<div class="distribute-preview">${previewRows}</div>
			<div class="preview-remainder" style="display:none"></div>`,
		ok: {
			label: game.i18n.localize('DOLMEN.PartyViewer.DivideCoins'),
			icon: 'fa-solid fa-coins',
			callback: (event, button) => {
				const form = button.form.elements
				return {
					totals: {
						pellucidium: parseInt(form.pellucidium.value) || 0,
						gold: parseInt(form.gold.value) || 0,
						silver: parseInt(form.silver.value) || 0,
						copper: parseInt(form.copper.value) || 0
					},
					denominate: form.denominate?.checked ?? false
				}
			}
		},
		rejectClose: false
	})

	Hooks.off('renderDialogV2', hookId)

	if (!result) return
	const { totals, denominate } = result
	const hasAny = totals.copper || totals.silver || totals.gold || totals.pellucidium
	if (!hasAny) return

	const { grants, extras } = computeCoinShares(totals, weights, denominate)

	// Distribute remainders: pick random lucky PCs (not retainers)
	const indices = validActors.map((a, i) => a.system.retainer ? null : i).filter(i => i !== null)
	for (const d of DENOM_ORDER) {
		let rem = extras[d.key]
		if (rem <= 0) continue
		const shuffled = [...indices].sort(() => Math.random() - 0.5)
		for (let r = 0; r < rem && r < shuffled.length; r++) {
			grants[shuffled[r]][d.key]++
		}
	}

	// Apply updates
	for (let i = 0; i < validActors.length; i++) {
		const actor = validActors[i]
		const g = grants[i]
		const update = {}
		for (const d of DENOM_ORDER) {
			if (g[d.key]) update[`system.coins.${d.key}`] = actor.system.coins[d.key] + g[d.key]
		}
		if (Object.keys(update).length) await actor.update(update)
	}

	// Post chat summary
	const title = game.i18n.localize('DOLMEN.PartyViewer.DivideCoins')
	const totalStr = formatCoins(totals)
	const memberLines = validActors.map((a, i) => {
		const coinStr = formatCoins(grants[i])
		return `<div class="coin-summary-row"><span class="coin-summary-name">${a.name}</span> <span class="coin-summary-coins">${coinStr}</span></div>`
	}).join('')

	await ChatMessage.create({
		content: `
		<div class="dolmen encounter-roll">
			<div class="roll-header">
				<i class="fa-solid fa-coins"></i>
				<div class="roll-info">
					<h3>${title}</h3>
					<span class="roll-type">${totalStr}</span>
				</div>
			</div>
			<div class="roll-body">
				<div class="roll-section coin-summary">
					${memberLines}
				</div>
			</div>
		</div>`,
		speaker: { alias: title }
	})
}

/**
 * Create and inject the widget DOM into the document body.
 */
function injectWidget() {
	if (widgetEl) return
	widgetEl = document.createElement('div')
	widgetEl.id = 'dolmen-party-viewer'

	// GM control buttons (icon-only, compact)
	if (game.user.isGM) {
		const controls = document.createElement('div')
		controls.className = 'party-controls'

		const xpBtn = document.createElement('button')
		xpBtn.type = 'button'
		xpBtn.className = 'party-ctrl-btn'
		xpBtn.innerHTML = '<i class="fa-solid fa-star"></i>'
		xpBtn.title = game.i18n.localize('DOLMEN.PartyViewer.DivideXP')
		xpBtn.addEventListener('click', addXP)

		const gpBtn = document.createElement('button')
		gpBtn.type = 'button'
		gpBtn.className = 'party-ctrl-btn'
		gpBtn.innerHTML = '<i class="fa-solid fa-coins"></i>'
		gpBtn.title = game.i18n.localize('DOLMEN.PartyViewer.DivideCoins')
		gpBtn.addEventListener('click', addCoins)

		const addBtn = document.createElement('button')
		addBtn.type = 'button'
		addBtn.className = 'party-ctrl-btn'
		addBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i>'
		addBtn.title = game.i18n.localize('DOLMEN.PartyViewer.AddCurrent')
		addBtn.addEventListener('click', addCurrentToken)

		controls.appendChild(xpBtn)
		controls.appendChild(gpBtn)
		controls.appendChild(addBtn)
		widgetEl.appendChild(controls)
	}

	// Party member list (horizontal)
	const list = document.createElement('div')
	list.className = 'party-member-list'
	widgetEl.appendChild(list)

	const column = document.getElementById('ui-right-column-1')
	if (column) {
		column.appendChild(widgetEl)
	} else {
		document.body.appendChild(widgetEl)
	}
	renderParty()
}

/**
 * Remove the widget from the DOM.
 */
function removeWidget() {
	if (widgetEl) {
		widgetEl.remove()
		widgetEl = null
	}
}

/**
 * Toggle widget visibility. Called by setting onChange and on init.
 */
export function togglePartyViewer(visible) {
	if (visible) {
		loadParty()
		injectWidget()
	} else {
		removeWidget()
	}
}

/**
 * Handle updateActor hook — refresh party cards if the actor is in the party.
 */
function onUpdateActor(actor) {
	if (!widgetEl) return
	if (partyMembers.includes(actor.id)) {
		renderParty()
	}
}

/**
 * Handle partyMembers setting change — sync across clients.
 */
function onPartyMembersChanged(value) {
	partyMembers = value ?? []
	renderParty()
}

/**
 * Initialize the party viewer. Called from the ready hook.
 */
export function initPartyViewer() {
	loadParty()
	const show = game.settings.get('dolmenwood', 'showPartyViewer')
	if (show) {
		injectWidget()
	}

	Hooks.on('updateActor', onUpdateActor)
}

/**
 * Setting onChange handler for partyMembers setting.
 */
export { onPartyMembersChanged }
