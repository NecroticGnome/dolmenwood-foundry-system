/* global foundry, game, FilePicker, Roll, ChatMessage, CONST, CONFIG */

const { DialogV2 } = foundry.applications.api
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { onSaveRoll } from './sheet/roll-handlers.js'
import { createChatMessage } from './sheet/chat-helpers.js'
import { createContextMenu } from './sheet/context-menu.js'
import { getDieIconFromFormula, getAttackTarget, buildDamageFlags } from './sheet/attack-rolls.js'
import { parseSaveLinks } from './chat-save.js'
import { prepareItemData, groupItemsByType, computeEncumbrance, calcItemWeight } from './sheet/data-context.js'
import { setupAdjustableInputListeners } from './sheet/listeners.js'
import { onOpenItem, onDeleteItem, onIncreaseQty, onDecreaseQty, onToggleContainer, onDropItemSimple } from './sheet/inventory-actions.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenHorseSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'creature', 'horse'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 700,
			height: 550,
		},
		window: {
			resizable: true
		},
		actions: {
			addAttack: DolmenHorseSheet._onAddAttack,
			removeAttack: DolmenHorseSheet._onRemoveAttack,
			openItem: onOpenItem,
			deleteItem: onDeleteItem,
			increaseQty: onIncreaseQty,
			decreaseQty: onDecreaseQty,
			toggleContainer: onToggleContainer,
			moveToRider: DolmenHorseSheet._onMoveToRider
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/horse/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/horse/parts/tab-stats.html',
			scrollable: ['']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/horse/parts/tab-inventory.html',
			scrollable: ['']
		},
		description: {
			template: 'systems/dolmenwood/templates/horse/parts/tab-description.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-horse', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'inventory', icon: 'fas fa-box', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'description', icon: 'fas fa-book-open', label: 'DOLMEN.Tabs.Description' }
			],
			initial: 'stats'
		}
	}

	tabGroups = {
		primary: 'stats'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
			const group = {}
			for (const t of config.tabs) {
				group[t.id] = {
					id: t.id,
					group: groupId,
					icon: t.icon,
					label: game.i18n.localize(t.label),
					active: this.tabGroups[groupId] === t.id,
					cssClass: this.tabGroups[groupId] === t.id ? 'active' : ''
				}
			}
			tabs[groupId] = group
		}
		return tabs
	}

	_hasStorage() {
		const saddle = this.actor.system.saddle
		return saddle === 'ridingBags' || saddle === 'pack'
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const actor = this.actor

		context.actor = actor
		context.system = actor.system
		context.final = actor.system.final || {}
		context.isGM = game.user.isGM
		context.isToken = actor.isToken
		context.isLinked = actor.isToken ? actor.token.actorLink : actor.prototypeToken.actorLink
		context.tabs = this._getTabs()

		// Dropdown choices
		context.horseTypeChoices = buildChoices('DOLMEN.Horse.Types', CHOICE_KEYS.horseTypes)
		context.saddleChoices = buildChoices('DOLMEN.Horse.Saddles', CHOICE_KEYS.saddleTypes)
		context.riderTypeChoices = buildChoices('DOLMEN.Horse.RiderTypes', CHOICE_KEYS.riderTypes)
		context.costDenomChoices = buildChoices('DOLMEN.Item.Denomination', CHOICE_KEYS.costDenominations)

		// Barding select (boolean stored, but displayed as dropdown)
		context.bardingChoices = {
			false: game.i18n.localize('DOLMEN.Horse.ArmorNone'),
			true: game.i18n.localize('DOLMEN.Horse.ArmorBarding')
		}
		context.bardingValue = String(actor.system.barding)

		// Compute rider's carried weight using adventurer encumbrance calculation
		if (actor.system.riderType === 'actor' && actor.system.riderActorId) {
			const rider = game.actors.get(actor.system.riderActorId)
			if (rider?.type === 'Adventurer') {
				const riderEnc = computeEncumbrance(rider)
				// Slot mode returns {equipped, stowed} objects; weight mode returns flat {current}
				if (riderEnc.equipped) {
					actor.system._riderEncumbrance = (riderEnc.equipped.current || 0) + (riderEnc.stowed.current || 0)
				} else {
					actor.system._riderEncumbrance = riderEnc.current || 0
				}
			}
		}

		// Compute encumbrance (must run here, after all actors are prepared)
		actor.system.computeEncumbrance()

		// Speed: base vs adjusted (encumbrance halves speed, or 0 if over 2x load)
		const totalWeight = actor.system.totalWeight || 0
		const loadCapacity = context.loadCapacity
		const overloaded = loadCapacity > 0 && totalWeight > loadCapacity
		context.overloaded = overloaded
		context.totalWeight = totalWeight

		// Base speeds from source (pre-derivation), adjusted from system (post-derivation)
		const sourceSystem = actor._source.system
		context.baseSpeed = sourceSystem.speed
		context.adjustedSpeed = actor.system.speed
		context.speedHasAdj = context.baseSpeed !== context.adjustedSpeed

		// Movement types: base vs adjusted for each
		context.movementSpeeds = {}
		const sourceMovement = sourceSystem.movement || {}
		for (const key of Object.keys(actor.system.movement || {})) {
			const base = sourceMovement[key] || 0
			const adjusted = actor.system.movement[key] || 0
			context.movementSpeeds[key] = { base, adjusted, hasAdj: base !== adjusted }
		}

		// Rider actor choices (Adventurer actors in the world)
		context.actorChoices = game.actors
			.filter(a => a.type === 'Adventurer')
			.map(a => ({ id: a.id, name: a.name, selected: a.id === actor.system.riderActorId }))

		// Get linked rider actor (must be Adventurer)
		if (actor.system.riderActorId) {
			const rider = game.actors.get(actor.system.riderActorId)
			context.riderActor = rider?.type === 'Adventurer' ? rider : null
		}

		// Enrich attack effects for inline save links
		context.enrichedAttacks = await Promise.all(
			(actor.system.attacks || []).map(async (attack) => ({
				...attack,
				enrichedEffect: attack.attackEffect
					? await foundry.applications.ux.TextEditor.implementation.enrichHTML(attack.attackEffect, { async: true, secrets: game.user.isGM })
					: '',
				tooltipEffect: (attack.attackEffect || '')
					.replace(/\[([^\]]+)\]\(save:\w+\)/g, '$1')
					.replace(/\[\[\/r (\d+d\d+(?:[+-]\d+)?)\]\]/g, '$1')
			}))
		)

		// Encumbrance method
		const encumbranceMethod = game.settings.get('dolmenwood', 'encumbranceMethod')
		context.encumbranceMethod = encumbranceMethod
		const isSlots = encumbranceMethod === 'slots'
		const divisor = isSlots ? 100 : 1

		// Rider display info for non-actor types
		const riderWeights = { none: 0, small: 1200, medium: 1700 }
		const riderType = actor.system.riderType
		if (riderType !== 'actor') {
			context.riderLabel = game.i18n.localize(`DOLMEN.Horse.RiderTypes.${riderType}`)
			context.riderWeight = isSlots ? 0 : (riderWeights[riderType] || 0)
		}

		// Prepare inventory data
		context.hasStorage = this._hasStorage()
		context.loadCapacity = actor.system.load / divisor
		context.loadDisplay = actor.system.load / divisor
		context.loadDivisor = divisor
		context.loadUnit = isSlots
			? game.i18n.localize('DOLMEN.Encumbrance.UnitSlots')
			: game.i18n.localize('DOLMEN.Encumbrance.UnitCoins')
		if (actor.system.saddle === 'ridingBags') {
			context.saddleStorageName = game.i18n.localize('DOLMEN.Horse.SaddleBags')
			context.saddleStorageMax = 500 / divisor
		} else if (actor.system.saddle === 'pack') {
			context.saddleStorageName = game.i18n.localize('DOLMEN.Horse.PackSaddle')
			context.saddleStorageMax = 0
		}
		this._prepareInventoryContext(context, actor)
		if (context.saddleStorageMax && context.unsortedWeight > context.saddleStorageMax) {
			context.saddleOverweight = true
		}

		return context
	}

	_prepareInventoryContext(context, actor) {
		const isSlots = context.encumbranceMethod === 'slots'
		const weightKey = isSlots ? 'weightSlots' : 'weightCoins'

		const excludedTypes = ['Kindred', 'Class', 'Spell', 'HolySpell', 'Glamour', 'Rune']
		const items = actor.items.contents.filter(i => !excludedTypes.includes(i.type))
		const allStowedItems = items.filter(i => i.type !== 'Container').map(i => prepareItemData(i))

		// Build container data
		const containerItems = items.filter(i => i.type === 'Container')
		context.containers = containerItems.map(c => {
			const prepared = prepareItemData(c)
			const contents = allStowedItems.filter(i => i.system.containerId === c.id)
			const coinsUsed = contents.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
			return {
				...prepared,
				contents: groupItemsByType(contents),
				hasContents: contents.length > 0,
				coinsUsed,
				coinsMax: isSlots ? c.system.capacitySlots : c.system.capacityCoins,
				infiniteCapacity: c.system.infiniteCapacity,
				ignoreEncumbrance: c.system.ignoreEncumbrance
			}
		})
		context.hasContainers = context.containers.length > 0

		// Loose stowed items (not in any container)
		const containerIds = new Set(containerItems.map(c => c.id))
		const looseStowedItems = allStowedItems.filter(i => !i.system.containerId || !containerIds.has(i.system.containerId))

		context.stowedByType = groupItemsByType(looseStowedItems)
		context.hasLooseStowedItems = looseStowedItems.length > 0
		const itemWeight = looseStowedItems.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
		const totalCoins = (actor.system.coins.copper || 0) + (actor.system.coins.silver || 0)
			+ (actor.system.coins.gold || 0) + (actor.system.coins.pellucidium || 0)
		const coinsWeight = isSlots ? Math.ceil(totalCoins / 100) : totalCoins
		context.unsortedWeight = itemWeight + coinsWeight
		context.hasStowedItems = context.hasLooseStowedItems || context.hasContainers

		// Total load from data model (includes rider, saddle, barding, equipment)
		context.currentLoad = actor.system.totalWeight || 0
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		const tabIds = ['stats', 'inventory', 'description']
		if (tabIds.includes(partId)) {
			context.tab = context.tabs?.primary?.[partId] || {
				id: partId,
				cssClass: this.tabGroups.primary === partId ? 'active' : ''
			}
		}
		if (partId === 'description') {
			context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
				this.actor.system.description || '', { async: true, secrets: game.user.isGM }
			)
		}
		return context
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	/* -------------------------------------------- */
	/*  Event Listeners                             */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

		// Actor link toggle (only interactive on base actors, not placed tokens)
		if (!this.actor.isToken) {
			this.element.querySelector('.actor-link-icon')?.addEventListener('click', async () => {
				const linked = !this.actor.prototypeToken.actorLink
				await this.actor.update({'prototypeToken.actorLink': linked})
			})
		}

		// Adjustable input listeners (AC with barding bonus)
		setupAdjustableInputListeners(this)

		// Tab listeners
		this.element.querySelectorAll('.tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

		// Portrait picker
		const portrait = this.element.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.actor.img,
					callback: (path) => this.actor.update({ img: path })
				}).browse()
			})
		}

		// Save roll listeners
		this.element.querySelectorAll('.save-roll').forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const saveKey = event.currentTarget.dataset.save
				if (saveKey) onSaveRoll(this, saveKey, event)
			})
		})

		// Morale roll listener
		const moraleIcon = this.element.querySelector('.morale-roll')
		if (moraleIcon) {
			moraleIcon.addEventListener('click', (event) => {
				event.preventDefault()
				this._rollMorale()
			})
		}

		// Attack roll listener
		const swordsIcon = this.element.querySelector('.combat .fa-swords')
		if (swordsIcon) {
			swordsIcon.addEventListener('click', (event) => {
				event.preventDefault()
				this._openAttackSelectionMenu(event)
			})
		}

		// Rider open button
		const riderBtn = this.element.querySelector('.rider-open-btn')
		if (riderBtn) {
			riderBtn.addEventListener('click', () => {
				const riderId = this.actor.system.riderActorId
				if (riderId) {
					const rider = game.actors.get(riderId)
					rider?.sheet?.render(true)
				}
			})
		}

		// Attack drag listeners
		this.element.querySelectorAll('.attack-row[draggable]').forEach(el => {
			el.addEventListener('dragstart', (event) => {
				const index = parseInt(el.dataset.attackIndex)
				const attack = this.actor.system.attacks[index]
				if (!attack) return
				event.dataTransfer.setData('text/plain', JSON.stringify({
					type: 'CreatureAttack',
					actorId: this.actor.id,
					attack: foundry.utils.deepClone(attack)
				}))
			})
		})

		// Attack edit listeners
		this.element.querySelectorAll('.attack-row').forEach(el => {
			el.addEventListener('click', (event) => {
				if (event.target.closest('[data-action]')) return
				event.preventDefault()
				const index = parseInt(el.dataset.attackIndex)
				this._openAttackDialog(index)
			})
		})

		// Load display ↔ hidden coins conversion
		this.element.querySelectorAll('.load-display').forEach(input => {
			input.addEventListener('change', (event) => {
				event.preventDefault()
				event.stopPropagation()
				const divisor = parseInt(input.dataset.divisor) || 1
				const target = input.dataset.target
				const coinsValue = Math.round(parseFloat(input.value) * divisor)
				const hidden = this.element.querySelector(`input[name="${target}"]`)
				if (hidden) {
					hidden.value = coinsValue
					hidden.dispatchEvent(new Event('change', { bubbles: true }))
				}
			})
		})

		// Drag & drop for inventory items
		this.element.querySelectorAll('.item-row.draggable').forEach(el => {
			el.setAttribute('draggable', true)
			el.addEventListener('dragstart', (event) => {
				const itemId = el.dataset.itemId
				const item = this.actor.items.get(itemId)
				if (!item) return
				event.dataTransfer.setData('text/plain', JSON.stringify({
					type: 'Item',
					uuid: item.uuid
				}))
			})
		})
	}

	/* -------------------------------------------- */
	/*  Drag & Drop                                 */
	/* -------------------------------------------- */

	async _onDrop(event) {
		let data
		try {
			data = JSON.parse(event.dataTransfer.getData('text/plain'))
		} catch {
			return super._onDrop(event)
		}

		if (data.type === 'CreatureAttack') {
			const attacks = foundry.utils.deepClone(this.actor.system.attacks)
			attacks.push(data.attack)
			await this.actor.update({ 'system.attacks': attacks })
			return
		}

		return super._onDrop(event)
	}

	async _onDropItem(event, data) {
		if (!this._hasStorage()) return
		return onDropItemSimple(this, event, data)
	}

	/* -------------------------------------------- */
	/*  Static Action Handlers                      */
	/* -------------------------------------------- */

	static _onAddAttack() {
		const attacks = foundry.utils.deepClone(this.actor.system.attacks)
		attacks.push({
			numAttacks: 1,
			attackName: "Attack",
			attackBonus: 0,
			attackDamage: "1d6",
			attackEffect: "",
			attackType: "attack",
			rangeShort: 0,
			rangeMedium: 0,
			rangeLong: 0
		})
		this.actor.update({ 'system.attacks': attacks })
	}

	static _onRemoveAttack(_event, target) {
		const index = parseInt(target.dataset.attackIndex ?? target.closest('[data-attack-index]')?.dataset.attackIndex)
		if (isNaN(index)) return
		const attacks = foundry.utils.deepClone(this.actor.system.attacks)
		attacks.splice(index, 1)
		this.actor.update({ 'system.attacks': attacks })
	}

	static async _onMoveToRider(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (!item) return

		const riderId = this.actor.system.riderActorId
		if (!riderId) return
		const rider = game.actors.get(riderId)
		if (!rider || rider.type !== 'Adventurer') return

		// Create the item on the rider as stowed (unequipped)
		const itemData = item.toObject()
		itemData.system.equipped = false
		itemData.system.containerId = ''
		await rider.createEmbeddedDocuments('Item', [itemData])

		// Delete from horse
		await item.delete()
	}

	/* -------------------------------------------- */
	/*  Attack Dialog                               */
	/* -------------------------------------------- */

	_openAttackDialog(index) {
		const attack = this.actor.system.attacks[index]
		if (!attack) return

		const isAttack = attack.attackType !== 'save'

		const content = `
			<div class="attack-edit-modal">
				<div class="form-group full-width">
					<label>${game.i18n.localize('DOLMEN.Creature.AttackTypeLabel')}</label>
					<div class="type-radios">
						<input type="radio" name="attackType" id="type-attack" value="attack" ${isAttack ? 'checked' : ''}>
						<label for="type-attack">${game.i18n.localize('DOLMEN.Creature.AttackTypeAttack')}</label>
						<input type="radio" name="attackType" id="type-save" value="save" ${!isAttack ? 'checked' : ''}>
						<label for="type-save">${game.i18n.localize('DOLMEN.Creature.AttackTypeSave')}</label>
					</div>
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Creature.AttackName')}</label>
					<input type="text" id="attack-name" value="${attack.attackName}">
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Creature.NumAttacks')}</label>
					<input type="number" id="attack-num" value="${attack.numAttacks}" min="1">
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Creature.AttackBonus')}</label>
					<input type="number" id="attack-bonus" value="${attack.attackBonus}" ${!isAttack ? 'disabled' : ''}>
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Creature.AttackDamage')}</label>
					<input type="text" id="attack-damage" value="${attack.attackDamage}" ${!isAttack ? 'disabled' : ''}>
				</div>
				<div class="form-group full-width">
					<label>${game.i18n.localize('DOLMEN.Creature.SaveEffect')}</label>
					<textarea id="attack-effect">${attack.attackEffect || ''}</textarea>
				</div>
			</div>
		`

		DialogV2.wait({
			window: { title: game.i18n.localize('DOLMEN.Creature.EditAttack') },
			position: { width: 380 },
			content,
			buttons: [
				{
					action: 'save',
					icon: 'fas fa-check',
					label: game.i18n.localize('DOLMEN.Save'),
					default: true,
					callback: (event, button, html) => {
						const el = html.element
						const attacks = foundry.utils.deepClone(this.actor.system.attacks)
						attacks[index] = {
							attackName: el.querySelector('#attack-name').value || 'Attack',
							numAttacks: parseInt(el.querySelector('#attack-num').value) || 1,
							attackBonus: parseInt(el.querySelector('#attack-bonus').value) || 0,
							attackDamage: el.querySelector('#attack-damage').value || '1d6',
							attackEffect: el.querySelector('#attack-effect').value || '',
							attackType: el.querySelector('input[name="attackType"]:checked')?.value || 'attack',
							rangeShort: 0,
							rangeMedium: 0,
							rangeLong: 0,
							attackGroup: ''
						}
						this.actor.update({ 'system.attacks': attacks })
					}
				}
			],
			render: (event) => {
				const el = event.target.element
				el.querySelectorAll('input[name="attackType"]').forEach(radio => {
					radio.addEventListener('change', (e) => {
						const isSave = e.target.value === 'save'
						el.querySelector('#attack-bonus').disabled = isSave
						el.querySelector('#attack-damage').disabled = isSave
					})
				})
			},
			rejectClose: false
		})
	}

	/* -------------------------------------------- */
	/*  Morale Roll                                 */
	/* -------------------------------------------- */

	async _rollMorale() {
		const actor = this.actor
		const morale = actor.system.morale

		const roll = new Roll('2d6')
		await roll.evaluate()

		const isSuccess = roll.total <= morale
		const resultClass = isSuccess ? 'success' : 'failure'
		const resultLabel = isSuccess
			? game.i18n.localize('DOLMEN.Creature.MoraleHolds')
			: game.i18n.localize('DOLMEN.Creature.MoraleFlees')

		const anchor = await roll.toAnchor({ classes: ['morale-inline-roll', 'inline-dsn-hidden'] })

		const chatContent = `
			<div class="dolmen skill-roll">
				<div class="roll-header skill">
					<i class="fa-solid fa-flag"></i>
					<div class="roll-info">
						<h3>${game.i18n.localize('DOLMEN.Creature.MoraleCheck')}</h3>
						<span class="roll-type">${actor.name}</span>
					</div>
				</div>
				<div class="roll-body">
					<div class="roll-section ${resultClass}">
						<div class="roll-result">
							${anchor.outerHTML}
						</div>
						<span class="roll-target">${game.i18n.localize('DOLMEN.Roll.Target')}: ${morale}-</span>
						<span class="roll-label ${resultClass}">${resultLabel}</span>
					</div>
				</div>
			</div>
		`

		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor }),
			content: chatContent,
			rolls: [roll],
			sound: CONFIG.sounds.dice,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/* -------------------------------------------- */
	/*  Attack Rolls                                */
	/* -------------------------------------------- */

	_openAttackSelectionMenu(event) {
		const attacks = this.actor.system.attacks
		if (!attacks.length) return

		if (attacks.length === 1) {
			this._rollCreatureAttack(attacks[0], { top: event.clientY, left: event.clientX })
			return
		}

		const position = { top: event.clientY, left: event.clientX }
		const html = attacks.map((atk, i) => {
			const bonus = atk.attackType === 'save' ? '' : `${atk.attackBonus >= 0 ? '+' : ''}${atk.attackBonus}`
			return `
			<div class="weapon-menu-item" data-attack-index="${i}">
				<span class="weapon-name">${atk.attackName}${atk.numAttacks > 1 ? ` (x${atk.numAttacks})` : ''}</span>
				<span class="weapon-damage">${bonus}</span>
			</div>
		`
		}).join('')

		createContextMenu(this, {
			html,
			position,
			onItemClick: (item, menu) => {
				const index = parseInt(item.dataset.attackIndex)
				menu.remove()
				this._rollCreatureAttack(attacks[index], position)
			}
		})
	}

	_rollCreatureAttack(attack, position) {
		if (!attack) return
		if (attack.attackType === 'save') {
			this._executeCreatureAttack(attack, 0, null)
			return
		}
		this._openCreatureModifierPanel(attack, 0, null, position)
	}

	_openCreatureModifierPanel(attack, rangeMod, rangeName, position) {
		const rollLabel = game.i18n.localize('DOLMEN.Attack.Roll')

		let html = `<div class="roll-btn"><i class="fas fa-dice-d20"></i> ${rollLabel}</div>`
		html += '<div class="menu-separator"></div>'
		html += '<div class="numeric-grid">'
		for (const val of [-4, -3, -2, -1]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">${val}</div>`
		}
		for (const val of [1, 2, 3, 4]) {
			html += `<div class="numeric-btn" data-num-mod="${val}">+${val}</div>`
		}
		html += '</div>'

		const panel = createContextMenu(this, {
			html,
			position,
			menuClass: 'dolmen-weapon-context-menu modifier-panel',
			onItemClick: () => {}
		})

		panel.querySelectorAll('.numeric-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const wasSelected = btn.classList.contains('selected')
				panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
				if (!wasSelected) btn.classList.add('selected')
			})
		})

		panel.querySelector('.roll-btn').addEventListener('click', () => {
			const selectedNumBtn = panel.querySelector('.numeric-btn.selected')
			const numericMod = selectedNumBtn ? parseInt(selectedNumBtn.dataset.numMod) : 0
			panel.remove()
			this._executeCreatureAttack(attack, rangeMod + numericMod, rangeName)
		})
	}

	async _executeCreatureAttack(attack, rangeMod = 0, rangeName = null) {
		const effectSection = attack.attackEffect
			? `<div class="roll-section special-section" style="grid-column-end: span 2;"><span class="roll-breakdown">${parseSaveLinks(attack.attackEffect)}</span></div>`
			: ''
		const rangeBadge = rangeName
			? `<span class="trait-badge">${rangeName}</span>`
			: ''

		if (attack.attackType === 'save') {
			const content = `
				<div class="dolmen attack-roll">
					<div class="attack-header">
						<div class="attack-info">
							<h3>${attack.attackName}${rangeBadge}</h3>
						</div>
					</div>
					<div class="roll-results">
						${effectSection}
					</div>
				</div>
			`
			await createChatMessage({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
			return
		}

		const totalBonus = attack.attackBonus + rangeMod
		const modSign = totalBonus >= 0 ? '+' : ''
		const atkFormula = `1d20${modSign}${totalBonus}`
		const atkRoll = new Roll(atkFormula)
		await atkRoll.evaluate()

		const dmgRoll = new Roll(attack.attackDamage)
		await dmgRoll.evaluate()
		if (dmgRoll.total < 1) dmgRoll._total = 1

		const atkAnchor = await atkRoll.toAnchor({ classes: ['attack-inline-roll', 'inline-dsn-hidden'] })
		const dmgAnchor = await dmgRoll.toAnchor({ classes: ['damage-inline-roll', 'inline-dsn-hidden'] })

		const diceIcon = getDieIconFromFormula(attack.attackDamage)

		// Compare against targeted token's AC, if any
		const targetData = getAttackTarget()
		const hitResult = targetData ? (atkRoll.total >= targetData.ac ? 'hit' : 'miss') : null
		const hitClass = hitResult === 'hit' ? ' success' : hitResult === 'miss' ? ' failure' : ''
		const targetInfo = targetData
			? `<span class="roll-target">${game.i18n.format('DOLMEN.Attack.VsAC', { ac: targetData.ac, name: targetData.name })}</span>`
			: ''
		const hitLabel = hitResult === 'hit'
			? `<span class="roll-label success">${game.i18n.localize('DOLMEN.Attack.Hit')}</span>`
			: hitResult === 'miss'
				? `<span class="roll-label failure">${game.i18n.localize('DOLMEN.Attack.Miss')}</span>`
				: ''

		const content = `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<div class="attack-info">
						<h3>${attack.attackName}${rangeBadge}</h3>
					</div>
				</div>
				<div class="roll-results">
					<div class="roll-section attack-section${hitClass}">
						<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
						<div class="roll-result">${atkAnchor.outerHTML}</div>
						<span class="roll-breakdown">${atkFormula}</span>
						${targetInfo}
						${hitLabel}
					</div>
					<div class="roll-section damage-section">
						<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
						<div class="roll-result ${diceIcon}">${dmgAnchor.outerHTML}</div>
						<span class="roll-breakdown">${attack.attackDamage}</span>
					</div>
					${effectSection}
				</div>
			</div>
		`

		await createChatMessage({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content,
			rolls: [atkRoll, dmgRoll],
			sound: CONFIG.sounds.dice,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			flags: buildDamageFlags({ targetData, hitResult, total: dmgRoll.total })
		})
	}
}

export default DolmenHorseSheet
