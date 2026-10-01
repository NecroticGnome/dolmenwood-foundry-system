/* global foundry, game, ui, FilePicker, Roll, ChatMessage, CONST, CONFIG, fromUuid, Item */

const { DialogV2 } = foundry.applications.api
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { onSaveRoll } from './sheet/roll-handlers.js'
import { createChatMessage } from './sheet/chat-helpers.js'
import { createContextMenu } from './sheet/context-menu.js'
import { getDieIconFromFormula, getAttackTarget, buildDamageFlags } from './sheet/attack-rolls.js'
import { parseSaveLinks } from './chat-save.js'
import { getEffectTargetLabel, getEffectFieldsForActor } from './effect-fields.js'
import { prepareItemData, groupItemsByType, calcItemWeight } from './sheet/data-context.js'
import { onOpenItem, onDeleteItem, onIncreaseQty, onDecreaseQty, onToggleContainer, onDropItemSimple } from './sheet/inventory-actions.js'
import { setupAdjustableInputListeners } from './sheet/listeners.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenCreatureSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'creature'],
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
			addAttack: DolmenCreatureSheet._onAddAttack,
			removeAttack: DolmenCreatureSheet._onRemoveAttack,
			addAbility: DolmenCreatureSheet._onAddAbility,
			removeAbility: DolmenCreatureSheet._onRemoveAbility,
			openItem: onOpenItem,
			deleteItem: onDeleteItem,
			increaseQty: onIncreaseQty,
			decreaseQty: onDecreaseQty,
			toggleContainer: onToggleContainer,
			addEffect: DolmenCreatureSheet._onAddEffect,
			deleteEffect: DolmenCreatureSheet._onDeleteEffect,
			toggleEffect: DolmenCreatureSheet._onToggleEffect
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-stats.html',
			scrollable: ['']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-inventory.html',
			scrollable: ['']
		},
		description: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-description.html',
			scrollable: ['']
		},
		notes: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-notes.html',
			scrollable: ['']
		},
		effects: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-effects.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-dragon', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'notes', icon: 'fas fa-eye', label: 'DOLMEN.Tabs.Details' },
				{ id: 'effects', icon: 'fas fa-bolt', label: 'DOLMEN.Tabs.Effects' },
				{ id: 'inventory', icon: 'fas fa-box', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'description', icon: 'fas fa-note-sticky', label: 'DOLMEN.Tabs.Description' }
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
		context.sizeChoices = buildChoices('DOLMEN.Sizes', CHOICE_KEYS.sizes)
		context.monsterTypeChoices = buildChoices('DOLMEN.MonsterTypes', CHOICE_KEYS.monsterTypes)
		context.intelligenceChoices = buildChoices('DOLMEN.IntelligenceTypes', CHOICE_KEYS.intelligenceTypes)
		context.alignmentChoices = buildChoices('DOLMEN.Alignments', CHOICE_KEYS.alignments)

		// Active movement types (non-zero)
		context.activeMovement = []
		for (const [key, value] of Object.entries(actor.system.movement || {})) {
			if (value > 0) {
				context.activeMovement.push({
					key,
					label: game.i18n.localize(`DOLMEN.Creature.Movement.${key}`),
					value
				})
			}
		}

		// Enrich special ability descriptions for inline save links
		context.enrichedAbilities = await Promise.all(
			(actor.system.specialAbilities || []).map(async (ability) => ({
				name: ability.name,
				description: ability.description,
				enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(ability.description, { async: true, secrets: game.user.isGM })
			}))
		)

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

		// Prepare effects tab data
		const effectItems = actor.items.filter(i => i.type === 'Effect')
		context.effectItems = effectItems.map(e => {
			const dur = e.system.duration || 'permanent'
			let durationLabel = null
			if (dur === 'untilRest' || dur === 'untilNextDay') {
				durationLabel = game.i18n.localize(`DOLMEN.Effects.Duration${dur.charAt(0).toUpperCase() + dur.slice(1)}`)
			} else if (dur !== 'permanent') {
				durationLabel = `${e.system.durationValue} ${game.i18n.localize(`DOLMEN.Effects.Duration${dur.charAt(0).toUpperCase() + dur.slice(1)}`)}`
			}
			return {
				id: e.id,
				name: e.name,
				img: e.img,
				enabled: e.system.enabled,
				target: e.system.target,
				value: e.system.value,
				effectType: e.system.effectType,
				targetLabel: getEffectTargetLabel(e.system.target),
				durationLabel
			}
		}).sort((a, b) => a.name.localeCompare(b.name))

		// Prepare inventory data (stowed items only)
		context.encumbranceMethod = game.settings.get('dolmenwood', 'encumbranceMethod')
		this._prepareInventoryContext(context, actor)

		return context
	}

	_prepareInventoryContext(context, actor) {
		const weightKey = context.encumbranceMethod === 'slots' ? 'weightSlots' : 'weightCoins'

		const gearTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Consumable']
		const allStowedItems = actor.items.contents
			.filter(i => gearTypes.includes(i.type))
			.map(i => prepareItemData(i))

		// Build container data
		const containerItems = actor.items.contents.filter(i => i.type === 'Container')
		context.containers = containerItems.map(c => {
			const prepared = prepareItemData(c)
			const contents = allStowedItems.filter(i => i.system.containerId === c.id)
			return {
				...prepared,
				contents: groupItemsByType(contents),
				hasContents: contents.length > 0,
				coinsUsed: contents.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0),
				coinsMax: weightKey === 'weightSlots' ? c.system.capacitySlots : c.system.capacityCoins,
				infiniteCapacity: c.system.infiniteCapacity
			}
		})
		context.hasContainers = context.containers.length > 0

		// Loose stowed items (not in any container)
		const containerIds = new Set(containerItems.map(c => c.id))
		const looseStowedItems = allStowedItems.filter(i => !i.system.containerId || !containerIds.has(i.system.containerId))

		context.stowedByType = groupItemsByType(looseStowedItems)
		context.hasLooseStowedItems = looseStowedItems.length > 0
		context.unsortedWeight = looseStowedItems.reduce((sum, i) => sum + calcItemWeight(i, weightKey), 0)
		context.hasStowedItems = context.hasLooseStowedItems || context.hasContainers
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		const tabIds = ['stats', 'description', 'notes', 'effects', 'inventory']
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

		// Adjustable input listeners (effect-modified values)
		setupAdjustableInputListeners(this)

		// Actor link toggle
		if (!this.actor.isToken) {
			this.element.querySelector('.actor-link-icon')?.addEventListener('click', async () => {
				const linked = !this.actor.prototypeToken.actorLink
				await this.actor.update({'prototypeToken.actorLink': linked})
			})
		}

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

		// Attack roll listener (swords icon opens attack selection menu)
		const swordsIcon = this.element.querySelector('.combat .fa-swords')
		if (swordsIcon) {
			swordsIcon.addEventListener('click', (event) => {
				event.preventDefault()
				this._openAttackSelectionMenu(event)
			})
		}

		// Codex link button in notes tab
		const codexBtn = this.element.querySelector('.codex-link-btn')
		if (codexBtn) {
			codexBtn.addEventListener('click', async () => {
				const uuid = this.actor.system.codexUuid
				if (uuid) {
					const doc = await fromUuid(uuid)
					doc?.sheet?.render(true)
				}
			})
		}

		// Codex icon in navbar (only if UUID is set)
		const codexUuid = this.actor.system.codexUuid
		if (codexUuid) {
			const nav = this.element.querySelector('.tabs[data-group="primary"]')
			if (nav) {
				const codexLink = document.createElement('a')
				codexLink.className = 'item codex-nav-btn'
				codexLink.title = game.i18n.localize('DOLMEN.Item.CodexOpen')
				codexLink.innerHTML = '<i class="fas fa-book-open"></i>'
				codexLink.addEventListener('click', async (event) => {
					event.preventDefault()
					const doc = await fromUuid(codexUuid)
					doc?.sheet?.render(true)
				})
				nav.appendChild(codexLink)
			}
		}

		// Attack edit listeners (click row to open edit dialog)
		this.element.querySelectorAll('.attack-row').forEach(el => {
			el.addEventListener('click', (event) => {
				if (event.target.closest('[data-action]')) return
				event.preventDefault()
				const index = parseInt(el.dataset.attackIndex)
				this._openAttackDialog(index)
			})
		})

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

		// Ability drag listeners
		this.element.querySelectorAll('.ability-row[draggable]').forEach(el => {
			el.addEventListener('dragstart', (event) => {
				const index = parseInt(el.dataset.abilityIndex)
				const ability = this.actor.system.specialAbilities[index]
				if (!ability) return
				event.dataTransfer.setData('text/plain', JSON.stringify({
					type: 'CreatureAbility',
					actorId: this.actor.id,
					ability: foundry.utils.deepClone(ability)
				}))
			})
		})

		// Ability edit listeners (click row to open edit dialog)
		this.element.querySelectorAll('.ability-row').forEach(el => {
			el.addEventListener('click', (event) => {
				if (event.target.closest('[data-action]')) return
				event.preventDefault()
				const index = parseInt(el.dataset.abilityIndex)
				this._openAbilityDialog(index)
			})
		})

		// Inventory item drag listeners
		this.element.querySelectorAll('.item-row.draggable').forEach(el => {
			el.setAttribute('draggable', true)
			el.addEventListener('dragstart', (event) => {
				const item = this.actor.items.get(el.dataset.itemId)
				if (!item) return
				event.dataTransfer.setData('text/plain', JSON.stringify({
					type: 'Item',
					uuid: item.uuid
				}))
			})
		})
	}

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

		if (data.type === 'CreatureAbility') {
			const abilities = foundry.utils.deepClone(this.actor.system.specialAbilities)
			abilities.push(data.ability)
			await this.actor.update({ 'system.specialAbilities': abilities })
			return
		}

		if (data.type === 'Item' && data.uuid) {
			const item = await fromUuid(data.uuid)

			// Items dropped on the inventory tab are stored as gear
			if (event.target?.closest('.tab-inventory')) {
				return onDropItemSimple(this, event, data)
			}

			// Translate a dropped Weapon into a creature attack
			if (item?.type === 'Weapon') {
				const w = item.system
				const attacks = foundry.utils.deepClone(this.actor.system.attacks)
				attacks.push({
					numAttacks: 1,
					attackName: item.name,
					attackBonus: w.toHitBonus || 0,
					attackDamage: w.damage || '1d6',
					attackEffect: '',
					attackType: 'attack',
					rangeShort: w.rangeShort || 0,
					rangeMedium: w.rangeMedium || 0,
					rangeLong: w.rangeLong || 0,
					attackGroup: ''
				})
				await this.actor.update({ 'system.attacks': attacks })
				ui.notifications.info(game.i18n.format('DOLMEN.Creature.WeaponAddedAsAttack', { name: item.name }))
				return
			}

			// Check Effect items for unsupported targets
			if (item?.type === 'Effect') {
				const creatureFields = getEffectFieldsForActor('Creature')
				const validTargets = new Set()
				for (const group of Object.values(creatureFields)) {
					for (const key of Object.keys(group.fields)) validTargets.add(key)
				}
				if (!validTargets.has(item.system.target)) {
					ui.notifications.warn(game.i18n.localize('DOLMEN.Effects.UnsupportedTarget'))
					return
				}
			}
		}

		return super._onDrop(event)
	}

	async _onDropItem(event, data) {
		const item = await Item.implementation.fromDropData(data)
		const gearTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Consumable', 'Container']
		if (gearTypes.includes(item?.type)) return onDropItemSimple(this, event, data)
		return super._onDropItem(event, data)
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

	static _onAddAbility() {
		const abilities = foundry.utils.deepClone(this.actor.system.specialAbilities)
		abilities.push({ name: "Ability", description: "" })
		this.actor.update({ 'system.specialAbilities': abilities })
	}

	static _onRemoveAbility(_event, target) {
		const index = parseInt(target.dataset.abilityIndex ?? target.closest('[data-ability-index]')?.dataset.abilityIndex)
		if (isNaN(index)) return
		const abilities = foundry.utils.deepClone(this.actor.system.specialAbilities)
		abilities.splice(index, 1)
		this.actor.update({ 'system.specialAbilities': abilities })
	}

	static async _onAddEffect() {
		const itemData = {
			name: game.i18n.localize('DOLMEN.Effects.NewEffect'),
			type: 'Effect'
		}
		const created = await this.actor.createEmbeddedDocuments('Item', [itemData])
		if (created?.[0]) created[0].sheet.render(true)
	}

	static async _onDeleteEffect(_event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item) await item.delete()
	}

	static async _onToggleEffect(_event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item) await item.update({ 'system.enabled': !item.system.enabled })
	}

	/* -------------------------------------------- */
	/*  Attack Edit Dialog                          */
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
				<div class="range-group">
					<div class="form-group">
						<label>${game.i18n.localize('DOLMEN.Creature.RangeShort')}</label>
						<input type="number" id="range-short" value="${attack.rangeShort || 0}" min="0">
					</div>
					<div class="form-group">
						<label>${game.i18n.localize('DOLMEN.Creature.RangeMedium')}</label>
						<input type="number" id="range-medium" value="${attack.rangeMedium || 0}" min="0">
					</div>
					<div class="form-group">
						<label>${game.i18n.localize('DOLMEN.Creature.RangeLong')}</label>
						<input type="number" id="range-long" value="${attack.rangeLong || 0}" min="0">
					</div>
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.Creature.AttackGroup')}</label>
					<select id="attack-group">
						<option value="" ${!attack.attackGroup ? 'selected' : ''}>${game.i18n.localize('DOLMEN.None')}</option>
						<option value="a" ${attack.attackGroup === 'a' ? 'selected' : ''} style="color:var(--dolmen-group-a)">A</option>
						<option value="b" ${attack.attackGroup === 'b' ? 'selected' : ''} style="color:var(--dolmen-group-b)">B</option>
						<option value="c" ${attack.attackGroup === 'c' ? 'selected' : ''} style="color:var(--dolmen-group-c)">C</option>
						<option value="d" ${attack.attackGroup === 'd' ? 'selected' : ''} style="color:var(--dolmen-group-d)">D</option>
						<option value="e" ${attack.attackGroup === 'e' ? 'selected' : ''} style="color:var(--dolmen-group-e)">E</option>
						<option value="f" ${attack.attackGroup === 'f' ? 'selected' : ''} style="color:var(--dolmen-group-f)">F</option>
					</select>
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
							rangeShort: parseInt(el.querySelector('#range-short').value) || 0,
							rangeMedium: parseInt(el.querySelector('#range-medium').value) || 0,
							rangeLong: parseInt(el.querySelector('#range-long').value) || 0,
							attackGroup: el.querySelector('#attack-group').value || ''
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
	/*  Ability Edit Dialog                         */
	/* -------------------------------------------- */

	_openAbilityDialog(index) {
		const ability = this.actor.system.specialAbilities[index]
		if (!ability) return

		const content = `
			<div class="ability-edit-modal">
				<div class="form-group full-width">
					<label>${game.i18n.localize('DOLMEN.Creature.AbilityName')}</label>
					<input type="text" id="ability-name" value="${ability.name}">
				</div>
				<div class="form-group full-width">
					<label>${game.i18n.localize('DOLMEN.Creature.AbilityDescription')}</label>
					<textarea id="ability-description">${ability.description || ''}</textarea>
				</div>
			</div>
		`

		DialogV2.wait({
			window: { title: game.i18n.localize('DOLMEN.Creature.EditAbility') },
			position: { width: 500 },
			content,
			buttons: [
				{
					action: 'save',
					icon: 'fas fa-check',
					label: game.i18n.localize('DOLMEN.Save'),
					default: true,
					callback: (event, button, html) => {
						const el = html.element
						const abilities = foundry.utils.deepClone(this.actor.system.specialAbilities)
						abilities[index] = {
							name: el.querySelector('#ability-name').value || 'Ability',
							description: el.querySelector('#ability-description').value || ''
						}
						this.actor.update({ 'system.specialAbilities': abilities })
					}
				}
			],
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
	/*  Creature Attack Rolls                       */
	/* -------------------------------------------- */

	_openAttackSelectionMenu(event) {
		const attacks = this.actor.system.attacks
		if (!attacks.length) return

		// Single attack: skip menu, roll directly
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

		const hasRanges = (attack.rangeShort || 0) > 0 || (attack.rangeMedium || 0) > 0 || (attack.rangeLong || 0) > 0

		// If attack has ranges, open range selection menu first
		if (hasRanges) {
			this._openRangeMenu(attack, position)
			return
		}

		// No ranges: open modifier panel
		this._openCreatureModifierPanel(attack, 0, null, position)
	}

	_openRangeMenu(attack, position) {
		const ranges = [
			{ id: 'short', mod: 1, nameKey: 'DOLMEN.Attack.Range.Close', badgeKey: 'DOLMEN.Item.Range.short', dist: attack.rangeShort },
			{ id: 'medium', mod: 0, nameKey: 'DOLMEN.Attack.Range.Medium', badgeKey: 'DOLMEN.Item.Range.medium', dist: attack.rangeMedium },
			{ id: 'long', mod: -1, nameKey: 'DOLMEN.Attack.Range.Long', badgeKey: 'DOLMEN.Item.Range.long', dist: attack.rangeLong }
		]

		const html = ranges.map(r => {
			const modStr = r.mod > 0 ? `(+${r.mod})` : r.mod === 0 ? '(0)' : `(${r.mod})`
			return `
			<div class="weapon-menu-item" data-range-mod="${r.mod}" data-range-name="${game.i18n.localize(r.badgeKey)}">
				<span class="weapon-name">${game.i18n.localize(r.nameKey)} (${r.dist}')</span>
				<span class="weapon-damage">${modStr}</span>
			</div>
		`
		}).join('')

		createContextMenu(this, {
			html,
			position,
			onItemClick: (item, menu) => {
				const rangeMod = parseInt(item.dataset.rangeMod)
				const rangeName = item.dataset.rangeName
				menu.remove()
				this._openCreatureModifierPanel(attack, rangeMod, rangeName, position)
			}
		})
	}

	_openCreatureModifierPanel(attack, rangeMod, rangeName, position) {
		// Save-type attacks skip the modifier panel
		if (attack.attackType === 'save') {
			this._executeCreatureAttack(attack, rangeMod, rangeName)
			return
		}

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

		// Numeric button behavior (single-select toggle)
		panel.querySelectorAll('.numeric-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const wasSelected = btn.classList.contains('selected')
				panel.querySelectorAll('.numeric-btn').forEach(b => b.classList.remove('selected'))
				if (!wasSelected) btn.classList.add('selected')
			})
		})

		// ROLL button
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

		// Save type: no dice rolls, just display effect
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

		// Attack type: roll attack and damage dice
		const effectAtk = this.actor.system.final?.attack || 0
		const effectDmg = this.actor.system.final?.damage || 0
		const totalBonus = attack.attackBonus + rangeMod + effectAtk
		const modSign = totalBonus >= 0 ? '+' : ''
		const atkFormula = `1d20${modSign}${totalBonus}`
		const atkRoll = new Roll(atkFormula)
		await atkRoll.evaluate()

		let dmgFormula = attack.attackDamage
		if (effectDmg !== 0) {
			dmgFormula = effectDmg > 0
				? `${dmgFormula} + ${effectDmg}`
				: `${dmgFormula} - ${Math.abs(effectDmg)}`
		}
		const dmgRoll = new Roll(dmgFormula)
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

export default DolmenCreatureSheet
