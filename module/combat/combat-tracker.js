/* global game, foundry, Hooks, canvas, Combat */

/**
 * DolmenCombatTracker
 * Custom combat tracker with grouped combatants, declaration badges,
 * and pre-combat utility buttons (surprise, distance, reaction).
 */

import { prepareTrackerGroups, DECLARATION_CONFIG, GROUP_CONFIG } from './combat-data.js'
import { GROUPS } from './combatant.js'
import { rollMoraleCheck, rollReaction, rollSurprise, rollEncounterDistance, rollInitiativeForGroup, allGroupsRolled } from './combat-rolls.js'
import { createContextMenu } from '../sheet/context-menu.js'

const { CombatTracker } = foundry.applications.sidebar.tabs

/* -------------------------------------------- */
/*  Shared Menu Helpers                         */
/* -------------------------------------------- */

/**
 * Build HTML for a numeric modifier strip.
 * @param {number[]} values - Modifier values (e.g. [-2,-1,1,2])
 * @returns {string} HTML string
 */
function buildModifierStrip(values) {
	let html = '<div class="numeric-grid">'
	for (const val of values) {
		html += `<div class="numeric-btn" data-num-mod="${val}">${val > 0 ? '+' : ''}${val}</div>`
	}
	html += '</div>'
	return html
}

/**
 * Build HTML for a roll button.
 * @returns {string} HTML string
 */
function buildRollButton() {
	return `<div class="tracker-roll-btn">
		<button type="button" class="tracker-roll-execute">${game.i18n.localize('DOLMEN.Combat.Roll')}</button>
	</div>`
}

/**
 * Wire up single-select toggle on numeric buttons within a menu element.
 * @param {HTMLElement} menu - The menu container
 */
function wireModifierStrip(menu) {
	menu.querySelectorAll('.numeric-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			const wasSelected = btn.classList.contains('selected')
			menu.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
			if (!wasSelected) btn.classList.add('selected')
		})
	})
}

/**
 * Read the selected numeric modifier from a menu.
 * @param {HTMLElement} menu - The menu container
 * @returns {number} The selected modifier or 0
 */
function readModifier(menu) {
	const selected = menu.querySelector('.numeric-btn.selected')
	return selected ? parseInt(selected.dataset.numMod) : 0
}

/**
 * Open a tracker context menu positioned relative to a toolbar action button.
 * @param {HTMLElement} element - The tracker element to search for the action button
 * @param {string} action - The data-action attribute value
 * @param {object} menuConfig - Config passed to createContextMenu
 * @returns {HTMLElement} The created menu element
 */
function openTrackerMenu(element, action, menuConfig) {
	const target = element?.querySelector(`[data-action="${action}"]`)
	const rect = target?.getBoundingClientRect() || { top: 200, left: 200 }
	return createContextMenu(document.body, {
		...menuConfig,
		position: { top: rect.top, left: rect.left },
		menuClass: 'dolmen-tracker-menu',
		excludeFromClose: target
	})
}

/* -------------------------------------------- */
/*  Tracker Class                               */
/* -------------------------------------------- */

export default class DolmenCombatTracker extends CombatTracker {

	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'dolmen-tracker-app'],
		actions: {
			rollGroupInitiative: DolmenCombatTracker._onRollGroupInitiative,
			rollPlayerInitiative: DolmenCombatTracker._onRollPlayerInitiative,
			assignGroup: DolmenCombatTracker._onAssignGroup,
			cycleDeclaration: DolmenCombatTracker._onCycleDeclaration,
			rollMorale: DolmenCombatTracker._onRollMorale,
			rollSurprise: DolmenCombatTracker._onRollSurprise,
			rollEncounterDistance: DolmenCombatTracker._onRollEncounterDistance,
			rollReaction: DolmenCombatTracker._onRollReaction,
			clearDeclarations: DolmenCombatTracker._onClearDeclarations,
			clearGroupInitiative: DolmenCombatTracker._onClearGroupInitiative,
			addParty: DolmenCombatTracker._onAddParty,
			clearParty: DolmenCombatTracker._onClearParty
		}
	}

	static override = {
		PARTS: true
	}

	static get PARTS() {
		const parts = { ...super.PARTS }
		parts.tracker = {
			template: 'systems/dolmenwood/templates/combat/tracker.html',
			scrollable: ['']
		}
		parts.actionOrder = {
			template: 'systems/dolmenwood/templates/combat/action-order.html'
		}
		return parts
	}

	/* -------------------------------------------- */
	/*  Context Preparation                         */
	/* -------------------------------------------- */

	async _preparePartContext(partId, context, options) {
		context = await super._preparePartContext(partId, context, options)
		if (partId !== 'tracker') return context

		const combat = this.viewed
		const optionalRules = game.settings.get('dolmenwood', 'optionalCombatRules')
		context.groups = prepareTrackerGroups(combat, optionalRules)
		context.isGM = game.user.isGM

		// Only highlight active combatant when all groups have rolled initiative
		const allRolled = context.groups.every(g => g.hasInitiative)
		const activeCombatant = allRolled
			? (combat?.combatant || combat?.turns?.[0])
			: null
		for (const group of context.groups) {
			if (activeCombatant) {
				for (const c of group.combatants) {
					c.active = c.id === activeCombatant.id
				}
			}
			// GM can always roll; players can roll for groups where they own a combatant
			group.canRollInitiative = !group.hasInitiative
				&& (context.isGM || group.combatants.some(c => combat.combatants.get(c.id)?.isOwner))

			// Map initiative value to dice icon
			const DICE_ICONS = ['', 'fa-dice-one', 'fa-dice-two', 'fa-dice-three', 'fa-dice-four', 'fa-dice-five', 'fa-dice-six']
			group.diceIcon = DICE_ICONS[group.initiative] || 'fa-dice-d6'
		}

		// Show "Add Party" button if party viewer is enabled and has members on this scene
		try {
			const sceneId = canvas.scene?.id
			const entries = game.settings.get('dolmenwood', 'partyMembers') || []
			context.showAddParty = context.isGM
				&& game.settings.get('dolmenwood', 'showPartyViewer')
				&& entries.some(e => e.sceneId === sceneId)
		} catch {
			context.showAddParty = false
		}

		return context
	}

	/* -------------------------------------------- */
	/*  Rendering                                   */
	/* -------------------------------------------- */

	// eslint-disable-next-line no-unused-vars
	_onRender(_context, _options) {
		// Skip super._onRender — parent expects default template DOM elements
		// Prevent double-click on controls from bubbling up to open actor sheets
		this.element?.querySelectorAll('.combatant-control')?.forEach(el => {
			el.addEventListener('dblclick', e => e.stopPropagation())
		})

		// Disable combat progression buttons until all groups have rolled initiative
		const combat = this.viewed
		if (combat) {
			const ready = allGroupsRolled(combat)
			const actions = ['startCombat', 'nextTurn', 'previousTurn', 'nextRound', 'previousRound']
			for (const action of actions) {
				const btn = this.element?.querySelector(`.combat-control[data-action="${action}"]`)
				if (btn) btn.disabled = !ready
			}
		}

		// Re-render when actor/token names change during combat
		if (!this._hooksRegistered) {
			this._hooksRegistered = true
			Hooks.on('updateActor', () => this.render())
			Hooks.on('updateToken', () => this.render())
		}
	}

	/* -------------------------------------------- */
	/*  Action Handlers                             */
	/* -------------------------------------------- */

	/**
	 * Roll group initiative for all groups.
	 */
	static async _onRollGroupInitiative() {
		const combat = this.viewed
		if (!combat) return
		await combat.rollGroupInitiative()
	}

	/**
	 * Roll initiative for the player's own group.
	 */
	static async _onRollPlayerInitiative(event, target) {
		const combat = this.viewed
		if (!combat) return
		const groupId = Number(target.dataset.groupId)
		if (Number.isNaN(groupId)) return
		await rollInitiativeForGroup(combat, groupId)
	}

	/**
	 * Clear initiative for an entire group by clicking its dice icon.
	 */
	static async _onClearGroupInitiative(event, target) {
		const combat = this.viewed
		if (!combat) return
		const groupId = Number(target.dataset.groupId)
		if (Number.isNaN(groupId)) return
		const updates = combat.combatants
			.filter(c => c.dispositionGroup === groupId)
			.map(c => ({ _id: c.id, initiative: null }))
		if (updates.length) {
			await combat.updateEmbeddedDocuments('Combatant', updates)
		}
	}

	/**
	 * Open a context menu to move a combatant to a different group.
	 * Group assignments are stored on the Combat document, not the token.
	 */
	static _onAssignGroup(event, target) {
		const combat = this.viewed
		if (!combat) return

		const li = target.closest('[data-combatant-id]')
		if (!li) return
		const combatant = combat.combatants.get(li.dataset.combatantId)
		if (!combatant) return

		const currentGroup = combatant.dispositionGroup
		const groupEntries = [
			{ id: GROUPS.FRIENDLY, config: GROUP_CONFIG[GROUPS.FRIENDLY] },
			{ id: GROUPS.GROUP_A, config: GROUP_CONFIG[GROUPS.GROUP_A] },
			{ id: GROUPS.GROUP_B, config: GROUP_CONFIG[GROUPS.GROUP_B] },
			{ id: GROUPS.GROUP_C, config: GROUP_CONFIG[GROUPS.GROUP_C] },
			{ id: GROUPS.GROUP_D, config: GROUP_CONFIG[GROUPS.GROUP_D] },
			{ id: GROUPS.GROUP_E, config: GROUP_CONFIG[GROUPS.GROUP_E] },
			{ id: GROUPS.GROUP_F, config: GROUP_CONFIG[GROUPS.GROUP_F] }
		]

		const items = groupEntries.map(({ id, config }) => {
			const activeClass = currentGroup === id ? ' active' : ''
			return `<div class="tracker-menu-item${activeClass}" data-group-id="${id}">
				<i class="fa-solid fa-circle" style="color: ${config.color}"></i>
				<span>${game.i18n.localize(config.labelKey)}</span>
			</div>`
		})

		const rect = target.getBoundingClientRect()
		createContextMenu(document.body, {
			html: items.join(''),
			position: { top: rect.top, left: rect.left },
			menuClass: 'dolmen-tracker-menu',
			itemSelector: '.tracker-menu-item',
			onItemClick: async (item, menu) => {
				const groupId = parseInt(item.dataset.groupId)
				await combat.setGroupFor(combatant.id, groupId)
				menu.remove()
			},
			excludeFromClose: target
		})
	}

	/**
	 * Open a context menu to pick a declaration for a combatant.
	 */
	static _onCycleDeclaration(event, target) {
		const combat = this.viewed
		if (!combat) return

		const li = target.closest('[data-combatant-id]')
		if (!li) return
		const combatant = combat.combatants.get(li.dataset.combatantId)
		if (!combatant) return

		const optionalRules = game.settings.get('dolmenwood', 'optionalCombatRules')
		const types = ['magic', 'flee']
		if (optionalRules) types.push('charge', 'parry')

		const current = combatant.declaration
		const items = types.map(t => {
			const cfg = DECLARATION_CONFIG[t]
			const activeClass = current === t ? ' active' : ''
			return `<div class="tracker-menu-item${activeClass}" data-declaration="${t}">
				<i class="${cfg.icon}"></i>
				<span>${game.i18n.localize(cfg.labelKey)}</span>
			</div>`
		})

		// Add "Clear" option if there's an active declaration
		if (current) {
			items.push(`<div class="tracker-menu-item menu-clear" data-declaration="clear">
				<i class="fa-solid fa-xmark"></i>
				<span>${game.i18n.localize('DOLMEN.Combat.Declaration.Clear')}</span>
			</div>`)
		}

		const rect = target.getBoundingClientRect()
		createContextMenu(document.body, {
			html: items.join(''),
			position: { top: rect.top, left: rect.left },
			menuClass: 'dolmen-tracker-menu',
			itemSelector: '.tracker-menu-item',
			onItemClick: async (item, menu) => {
				const value = item.dataset.declaration
				await combatant.setDeclaration(value === 'clear' ? null : value)
				menu.remove()
			},
			excludeFromClose: target
		})
	}

	/**
	 * Roll morale check. Shows a panel with morale values from creatures in
	 * combat (or manual input if none), plus a -2 to +2 modifier strip.
	 */
	static _onRollMorale() {
		const combat = this.viewed

		// Collect unique morale values from creature combatants
		const moraleMap = new Map()
		if (combat) {
			for (const c of combat.combatants) {
				const morale = c.actor?.system?.morale
				if (morale == null) continue
				if (!moraleMap.has(morale)) moraleMap.set(morale, [])
				moraleMap.get(morale).push(c.token?.name || c.actor?.name || c.name)
			}
		}

		// Build morale options
		const sorted = [...moraleMap.entries()].sort((a, b) => a[0] - b[0])
		let moraleItems = ''
		if (sorted.length === 0) {
			moraleItems = `<div class="tracker-manual-entry">
				<label>${game.i18n.localize('DOLMEN.Creature.Morale')}</label>
				<input type="number" class="morale-input" value="7" min="2" max="12" step="1">
			</div>`
		} else if (sorted.length === 1) {
			const [[morale]] = sorted
			moraleItems = `<div class="tracker-menu-item selected" data-morale="${morale}">
				<span>${game.i18n.localize('DOLMEN.Creature.Morale')}: <strong>${morale}</strong></span>
			</div>`
		} else {
			moraleItems = sorted.map(([morale, names], idx) => {
				const nameList = names.join(', ')
				const selectedClass = idx === 0 ? ' selected' : ''
				return `<div class="tracker-menu-item${selectedClass}" data-morale="${morale}">
					<span><strong>${morale}</strong> — ${nameList}</span>
				</div>`
			}).join('')
		}

		const html = moraleItems + buildModifierStrip([-2, -1, 1, 2]) + buildRollButton()

		const menu = openTrackerMenu(this.element, 'rollMorale', {
			html,
			itemSelector: '.tracker-menu-item[data-morale]',
			onItemClick: (item, _menu) => {
				_menu.querySelectorAll('.tracker-menu-item[data-morale]').forEach(el => el.classList.remove('selected'))
				item.classList.add('selected')
			}
		})

		wireModifierStrip(menu)

		menu.querySelector('.tracker-roll-execute')?.addEventListener('click', async () => {
			let morale
			const manualInput = menu.querySelector('.morale-input')
			if (manualInput) {
				morale = parseInt(manualInput.value) || 7
			} else {
				const selected = menu.querySelector('.tracker-menu-item.selected')
				if (!selected) return
				morale = parseInt(selected.dataset.morale)
			}
			menu.remove()
			await rollMoraleCheck(morale + readModifier(menu))
		})
	}

	/**
	 * Roll surprise for both sides.
	 */
	static async _onRollSurprise() {
		await rollSurprise()
	}

	/**
	 * Roll encounter distance via context menu with environment choice.
	 */
	static _onRollEncounterDistance() {
		const environments = [
			{ key: 'dungeon', labelKey: 'DOLMEN.Combat.Distance.Dungeon', icon: 'fa-solid fa-dungeon' },
			{ key: 'outdoors', labelKey: 'DOLMEN.Combat.Distance.Outdoors', icon: 'fa-solid fa-tree' }
		]

		const html = environments.map(({ key, labelKey, icon }) =>
			`<div class="tracker-menu-item" data-environment="${key}">
				<i class="${icon}"></i>
				<span>${game.i18n.localize(labelKey)}</span>
			</div>`
		).join('')

		openTrackerMenu(this.element, 'rollEncounterDistance', {
			html,
			itemSelector: '.tracker-menu-item',
			onItemClick: async (item, menu) => {
				menu.remove()
				await rollEncounterDistance(item.dataset.environment)
			}
		})
	}

	/**
	 * Roll reaction with a CHA modifier strip (-4 to +4).
	 */
	static _onRollReaction() {
		const label = `<div class="tracker-menu-label">${game.i18n.localize('DOLMEN.Combat.Reaction.CHAMod')}</div>`
		const html = label + buildModifierStrip([-4, -3, -2, -1, 1, 2, 3, 4]) + buildRollButton()

		const menu = openTrackerMenu(this.element, 'rollReaction', {
			html,
			itemSelector: '.no-match',
			onItemClick: () => {}
		})

		wireModifierStrip(menu)

		menu.querySelector('.tracker-roll-execute')?.addEventListener('click', async () => {
			const chaMod = readModifier(menu)
			menu.remove()
			await rollReaction(chaMod)
		})
	}

	/**
	 * Clear all declarations on all combatants.
	 */
	static async _onClearDeclarations() {
		const combat = this.viewed
		if (!combat) return

		const updates = combat.combatants.map(c => ({
			_id: c.id,
			'flags.dolmenwood.-=declaration': null
		}))
		if (updates.length) {
			await combat.updateEmbeddedDocuments('Combatant', updates)
		}
	}

	/**
	 * Add all party viewer members to combat in the Friendly group.
	 * Uses stored token references directly.
	 */
	static async _onAddParty() {
		let combat = this.viewed
		const scene = canvas.scene
		if (!scene) return

		if (!combat) {
			combat = await Combat.create({ scene: scene.id })
		}

		const partyEntries = game.settings.get('dolmenwood', 'partyMembers') || []
		const existingTokenIds = new Set(combat.combatants.map(c => c.tokenId))

		const toCreate = []
		for (const entry of partyEntries) {
			// Only add tokens from the current scene
			if (entry.sceneId !== scene.id) continue
			if (existingTokenIds.has(entry.tokenId)) continue
			const tokenDoc = scene.tokens.get(entry.tokenId)
			if (!tokenDoc) continue
			toCreate.push({
				tokenId: tokenDoc.id,
				sceneId: scene.id,
				actorId: tokenDoc.actorId
			})
		}

		if (toCreate.length === 0) return

		const created = await combat.createEmbeddedDocuments('Combatant', toCreate)

		// Assign all new combatants to the Friendly group
		for (const c of created) {
			await combat.setGroupFor(c.id, GROUPS.FRIENDLY)
		}
	}

	/**
	 * Remove all combatants from the current combat encounter.
	 */
	static async _onClearParty() {
		const combat = this.viewed
		if (!combat) return
		const ids = combat.combatants.map(c => c.id)
		if (ids.length) await combat.deleteEmbeddedDocuments('Combatant', ids)
	}

	/**
	 * Override the default rollInitiative action to use group initiative.
	 */
	static async rollInitiative() {
		const combat = this.viewed
		if (!combat) return
		await combat.rollGroupInitiative()
	}

	/**
	 * Override context menu to make "Clear Initiative" clear for the whole group.
	 */
	_getEntryContextOptions() {
		const options = super._getEntryContextOptions()
		const clearOpt = options.find(o => o.name === 'COMBAT.CombatantClear')
		if (clearOpt) {
			clearOpt.callback = async (li) => {
				const combat = this.viewed
				if (!combat) return
				const combatant = combat.combatants.get(li.dataset.combatantId)
				if (!combatant) return

				// Clear initiative for all combatants in the same group
				const groupId = combatant.dispositionGroup
				const updates = combat.combatants
					.filter(c => c.dispositionGroup === groupId)
					.map(c => ({ _id: c.id, initiative: null }))
				if (updates.length) {
					await combat.updateEmbeddedDocuments('Combatant', updates)
				}
			}
		}
		return options
	}
}
