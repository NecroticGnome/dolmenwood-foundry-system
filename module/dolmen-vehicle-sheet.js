/* global foundry, game */

import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { prepareItemData, groupItemsByType, calcItemWeight } from './sheet/data-context.js'
import { setupAdjustableInputListeners } from './sheet/listeners.js'
import { onOpenItem, onDeleteItem, onIncreaseQty, onDecreaseQty, onToggleContainer, onDropItemSimple } from './sheet/inventory-actions.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'creature', 'vehicle'],
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
			openItem: onOpenItem,
			deleteItem: onDeleteItem,
			increaseQty: onIncreaseQty,
			decreaseQty: onDecreaseQty,
			toggleContainer: onToggleContainer
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-stats.html',
			scrollable: ['']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-inventory.html',
			scrollable: ['']
		},
		description: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-description.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-wagon-covered', label: 'DOLMEN.Tabs.Stats' },
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

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const actor = this.actor

		context.actor = actor
		context.system = actor.system
		context.isGM = game.user.isGM
		context.isToken = actor.isToken
		context.isLinked = actor.isToken ? actor.token.actorLink : actor.prototypeToken.actorLink
		context.tabs = this._getTabs()

		// Dropdown choices
		context.vehicleTypeChoices = buildChoices('DOLMEN.Vehicle.Types', CHOICE_KEYS.vehicleTypes)
		context.costDenomChoices = buildChoices('DOLMEN.Item.Denomination', CHOICE_KEYS.costDenominations)

		// Crew/Animals label depends on vehicle type
		const isLand = actor.system.vehicleType === 'land'
		context.isLand = isLand
		context.crewAnimalsLabel = isLand
			? game.i18n.localize('DOLMEN.Vehicle.Animals')
			: game.i18n.localize('DOLMEN.Vehicle.Crew')
		context.crewAnimalsPlaceholder = isLand
			? game.i18n.localize('DOLMEN.Vehicle.AnimalsPlaceholder')
			: game.i18n.localize('DOLMEN.Vehicle.CrewPlaceholder')
		if (isLand) {
			context.animalCountChoices = buildChoices('DOLMEN.Vehicle.AnimalCounts', CHOICE_KEYS.animalCounts)
		} else {
			context.crewPercentChoices = buildChoices('DOLMEN.Vehicle.CrewPercents', CHOICE_KEYS.crewPercents)
		}

		// Speed adjustment: HP damage (all vehicles) + crew % (water/air only)
		// Each 10% missing HP or crew reduces speed by that percentage, additive
		const hpMax = actor.system.hp.max || 1
		const hpValue = actor.system.hp.value || 0
		const hpPenalty = (1 - Math.floor(Math.min(hpValue / hpMax, 1) * 10) / 10) * 100

		let crewPenalty = 0
		if (!isLand) {
			crewPenalty = 100 - (parseInt(actor.system.crewPercent) || 100)
		}

		const totalPenalty = Math.min(hpPenalty + crewPenalty, 100)
		context.baseSpeed = actor.system.speed
		context.adjustedSpeed = Math.max(0, Math.round(actor.system.speed * (1 - totalPenalty / 100)))
		context.speedHasAdj = context.baseSpeed !== context.adjustedSpeed

		// Encumbrance method
		const encumbranceMethod = game.settings.get('dolmenwood', 'encumbranceMethod')
		context.encumbranceMethod = encumbranceMethod
		const isSlots = encumbranceMethod === 'slots'
		const divisor = isSlots ? 100 : 1
		const cargoMultiplier = (isLand && actor.system.animalCount === 'double') ? 2 : 1
		context.cargoDisplay = actor.system.cargo / divisor
		context.cargoCapacity = context.cargoDisplay * cargoMultiplier
		context.cargoHasAdj = cargoMultiplier > 1
		context.cargoDivisor = divisor
		context.cargoUnit = isSlots
			? game.i18n.localize('DOLMEN.Encumbrance.UnitSlots')
			: game.i18n.localize('DOLMEN.Encumbrance.UnitCoins')

		// Passengers (1 passenger = 5000 coins / 50 slots)
		const passengerWeight = isSlots ? 50 : 5000
		context.passengerWeight = (actor.system.passengers || 0) * passengerWeight

		// Prepare inventory data
		this._prepareInventoryContext(context, actor)

		// Load status (include passenger weight)
		const currentLoad = (context.currentLoad || 0) + context.passengerWeight
		context.totalLoad = currentLoad
		context.overloaded = context.cargoCapacity > 0 && currentLoad > context.cargoCapacity

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

		// Total load: items in containers (excluding ignored) + loose items + coins
		const containerWeight = context.containers
			.filter(c => !c.ignoreEncumbrance)
			.reduce((sum, c) => sum + c.coinsUsed, 0)
		context.currentLoad = containerWeight + itemWeight + coinsWeight

		// Cargo overweight indicator
		if (context.cargoCapacity && context.unsortedWeight > context.cargoCapacity) {
			context.cargoOverweight = true
		}
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

		// Adjustable input listeners (speed with crew % penalty)
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
				new foundry.applications.apps.FilePicker.implementation({
					type: 'image',
					current: this.actor.img,
					callback: (path) => this.actor.update({ img: path })
				}).browse()
			})
		}

		// Cargo display ↔ hidden coins conversion
		this.element.querySelectorAll('.load-display').forEach(input => {
			const baseValue = input.dataset.base
			const displayValue = input.value
			const hasAdj = baseValue !== undefined && baseValue !== displayValue

			if (hasAdj) {
				input.addEventListener('focus', () => {
					input.value = baseValue 
				})
				input.addEventListener('blur', () => {
					input.value = displayValue 
				})
			}

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

	async _onDropItem(event, data) {
		return onDropItemSimple(this, event, data)
	}

}

export default DolmenVehicleSheet
