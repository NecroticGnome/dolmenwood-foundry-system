/* global foundry, game, Dialog, FilePicker, CONFIG, ui, Item, Roll, ChatMessage, CONST */
const TextEditor = foundry.applications.ux.TextEditor
const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'actor'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 880,
			height: 660,
		},
		window: {
			resizable: true,
			controls: [
				{
					action: 'configureActor',
					icon: 'fas fa-trees',
					label: 'DOLMEN.ConfigureSheet',
					ownership: 'OWNER'
				}
			]
		},
		actions: {
			addSkill: DolmenSheet._onAddSkill,
			removeSkill: DolmenSheet._onRemoveSkill,
			openItem: DolmenSheet._onOpenItem,
			equipItem: DolmenSheet._onEquipItem,
			stowItem: DolmenSheet._onStowItem,
			deleteItem: DolmenSheet._onDeleteItem
		},
		dragDrop: [{ dropSelector: '.item-list' }]
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-stats.html',
			scrollable: ['.tab-stats']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-inventory.html',
			scrollable: ['.tab-inventory']
		},
		magic: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-magic.html',
			scrollable: ['.tab-magic']
		},
		details: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-details.html',
			scrollable: ['.tab-details']
		},
		notes: {
			template: 'systems/dolmenwood/templates/adventurer/parts/tab-notes.html',
			scrollable: ['.tab-notes']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-user', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'inventory', icon: 'fas fa-backpack', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'magic', icon: 'fas fa-book-sparkles', label: 'DOLMEN.Tabs.Magic' },
				{ id: 'details', icon: 'fas fa-eye', label: 'DOLMEN.Tabs.Details' },
				{ id: 'notes', icon: 'fas fa-note-sticky', label: 'DOLMEN.Tabs.Notes' }
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

		// Add actor and system data
		context.actor = this.actor
		context.system = this.actor.system

		// Prepare tabs for the tabs part
		context.tabs = this._getTabs()

		// Prepare dropdown choices with localized labels
		context.kindredChoices = {
			breggle: game.i18n.localize('DOLMEN.Kindreds.breggle'),
			elf: game.i18n.localize('DOLMEN.Kindreds.elf'),
			grimalkin: game.i18n.localize('DOLMEN.Kindreds.grimalkin'),
			human: game.i18n.localize('DOLMEN.Kindreds.human'),
			mossling: game.i18n.localize('DOLMEN.Kindreds.mossling'),
			woodgrue: game.i18n.localize('DOLMEN.Kindreds.woodgrue')
		}

		context.classChoices = {
			bard: game.i18n.localize('DOLMEN.Classes.bard'),
			cleric: game.i18n.localize('DOLMEN.Classes.cleric'),
			enchanter: game.i18n.localize('DOLMEN.Classes.enchanter'),
			fighter: game.i18n.localize('DOLMEN.Classes.fighter'),
			friar: game.i18n.localize('DOLMEN.Classes.friar'),
			hunter: game.i18n.localize('DOLMEN.Classes.hunter'),
			knight: game.i18n.localize('DOLMEN.Classes.knight'),
			magician: game.i18n.localize('DOLMEN.Classes.magician'),
			thief: game.i18n.localize('DOLMEN.Classes.thief'),
			breggle: game.i18n.localize('DOLMEN.Kindreds.breggle'),
			elf: game.i18n.localize('DOLMEN.Kindreds.elf'),
			grimalkin: game.i18n.localize('DOLMEN.Kindreds.grimalkin'),
			mossling: game.i18n.localize('DOLMEN.Kindreds.mossling'),
			woodgrue: game.i18n.localize('DOLMEN.Kindreds.woodgrue')
		}

		context.alignmentChoices = {
			lawful: game.i18n.localize('DOLMEN.Alignments.lawful'),
			neutral: game.i18n.localize('DOLMEN.Alignments.neutral'),
			chaotic: game.i18n.localize('DOLMEN.Alignments.chaotic')
		}

		context.encumbranceChoices = {
			weight: game.i18n.localize('DOLMEN.Encumbrance.Weight'),
			treasure: game.i18n.localize('DOLMEN.Encumbrance.Treasure'),
			slots: game.i18n.localize('DOLMEN.Encumbrance.Slots')
		}

		context.moonNameChoices = {
			none: " ",
			grinning: game.i18n.localize('DOLMEN.MoonNames.grinning'),
			dead: game.i18n.localize('DOLMEN.MoonNames.dead'),
			beast: game.i18n.localize('DOLMEN.MoonNames.beast'),
			squamous: game.i18n.localize('DOLMEN.MoonNames.squamous'),
			knights: game.i18n.localize('DOLMEN.MoonNames.knights'),
			rotting: game.i18n.localize('DOLMEN.MoonNames.rotting'),
			maidens: game.i18n.localize('DOLMEN.MoonNames.maidens'),
			witch: game.i18n.localize('DOLMEN.MoonNames.witch'),
			robbers: game.i18n.localize('DOLMEN.MoonNames.robbers'),
			goat: game.i18n.localize('DOLMEN.MoonNames.goat'),
			narrow: game.i18n.localize('DOLMEN.MoonNames.narrow'),
			black: game.i18n.localize('DOLMEN.MoonNames.black')
		}
		context.moonPhaseChoices = {
			none: " ",
			waxing: game.i18n.localize('DOLMEN.MoonPhases.waxing'),
			full: game.i18n.localize('DOLMEN.MoonPhases.full'),
			waning: game.i18n.localize('DOLMEN.MoonPhases.waning')
		}
		
		// Max extra skills for template conditional
		context.maxExtraSkills = CONFIG.DOLMENWOOD.maxExtraSkills

		// Prepare inventory items grouped by type
		const items = this.actor.items.contents.filter(i => i.type !== 'Spell')
		const equippedItems = items.filter(i => i.system.equipped).map(i => this._prepareItemData(i))
		const stowedItems = items.filter(i => !i.system.equipped).map(i => this._prepareItemData(i))

		// Group items by type
		context.equippedByType = this._groupItemsByType(equippedItems)
		context.stowedByType = this._groupItemsByType(stowedItems)
		context.hasEquippedItems = equippedItems.length > 0
		context.hasStowedItems = stowedItems.length > 0

		return context
	}

	/**
	 * Group items by their type for display.
	 * @param {object[]} items - Array of prepared item data
	 * @returns {object[]} Array of type groups with items
	 */
	_groupItemsByType(items) {
		const typeOrder = ['Weapon', 'Armor', 'Item', 'Treasure', 'Foraged']
		const groups = {}

		for (const item of items) {
			if (!groups[item.type]) {
				groups[item.type] = {
					type: item.type,
					typeLower: item.type.toLowerCase(),
					label: game.i18n.localize(`TYPES.Item.${item.type}`),
					items: [],
					isWeapon: item.type === 'Weapon',
					isArmor: item.type === 'Armor',
					isItem: item.type === 'Item',
					isTreasure: item.type === 'Treasure',
					isForaged: item.type === 'Foraged'
				}
			}
			groups[item.type].items.push(item)
		}

		// Sort groups by type order
		return typeOrder
			.filter(type => groups[type])
			.map(type => groups[type])
	}

	_getFaSymbol(quality, item){
		const ranges = `${item.system.rangeShort}/${item.system.rangeMedium}/${item.system.rangeLong}`
		const title = game.i18n.localize(`DOLMEN.Item.Quality.${quality}`)
		if (quality === "melee") return '<i class="fas fa-sword tooltip"><span class="tooltiptext">' + title + '</span></i>'
		if (quality === "missile") return '<i class="fas fa-bow-arrow tooltip"><span class="tooltiptext">'+title+' ('+ranges+')'+'</span></i>'
		if (quality === "armor-piercing") return '<i class="fas fa-bore-hole tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "brace") return '<i class="fas fa-shield-halved tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "reach") return '<i class="fas fa-arrows-left-right tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "reload") return '<i class="fas fa-arrows-rotate tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if(quality === "two-handed") return '<i class="fas fa-handshake-angle tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "charge") return '<i class="fas fa-horse-saddle tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "splash") return '<i class="fas fa-droplet tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "cold-iron") return '<i class="fas fa-snowflake tooltip"><span class="tooltiptext">'+title+'</span></i>'
		if (quality === "silver") return '<i class="fas fa-star-christmas tooltip"><span class="tooltiptext">'+title+'</span></i>'
		return quality
	}

	/**
	 * Prepare item data for display in the inventory.
	 * @param {Item} item - The item to prepare
	 * @returns {object} Prepared item data
	 */
	_prepareItemData(item) {
		const data = {
			id: item.id,
			name: item.name,
			img: item.img,
			type: item.type,
			system: item.system,
			isWeapon: item.type === 'Weapon',
			isArmor: item.type === 'Armor',
			cssClass: item.type.toLowerCase(),
			hasNotes: (item.system?.notes || "") === "" ? false : true
		}

		// Add weapon qualities display
		if (data.isWeapon && item.system.qualities?.length) {
			data.qualitiesDisplay = item.system.qualities
				//.map(q => game.i18n.localize(`DOLMEN.Item.Quality.${q}`))
				.map(q => this._getFaSymbol(q, item))
				.join(', ')
		}
		// Add armor bulk display
		if (data.isArmor) {
			data.bulkDisplay = game.i18n.localize(`DOLMEN.Item.Bulk.${item.system.bulk}`)
			//data.faBulk = (item.system.bulk === 'light' ? 'fa-circle-quarter-stroke' : (item.system.bulk === 'medium' ? 'fa-circle-half-stroke' : 'fa-circle'))
		}

		return data
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)

		// For tab content parts, add the tab object
		const tabIds = ['stats', 'inventory', 'magic', 'details', 'notes']
		if (tabIds.includes(partId)) {
			context.tab = context.tabs?.primary?.[partId] || {
				id: partId,
				cssClass: this.tabGroups.primary === partId ? 'active' : ''
			}
		}

		return context
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	_onRender(context, options) {
		super._onRender(context, options)

		// Add tab click listeners
		const tabItems = this.element.querySelectorAll('.tabs .item')
		tabItems.forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const tabId = event.currentTarget.dataset.tab
				const group = event.currentTarget.dataset.group
				this._onChangeTab(tabId, group)
			})
		})

		// Add XP button click listener
		const xpBtn = this.element.querySelector('.xp-add-btn')
		if (xpBtn) {
			xpBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._openXPDialog()
			})
		}

		// Add portrait click listener for file picker
		const portrait = this.element.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				const fp = new FilePicker({
					type: 'image',
					current: this.actor.img,
					callback: (path) => {
						this.actor.update({ img: path })
					}
				})
				fp.browse()
			})
		}

		// Add skill button listener
		const addSkillBtn = this.element.querySelector('.add-skill-btn')
		if (addSkillBtn) {
			addSkillBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._openAddSkillDialog()
			})
		}

		// Remove skill button listeners
		const removeSkillBtns = this.element.querySelectorAll('.remove-skill-btn')
		removeSkillBtns.forEach(btn => {
			btn.addEventListener('click', (event) => {
				event.preventDefault()
				const index = parseInt(event.currentTarget.dataset.skillIndex)
				this._removeSkill(index)
			})
		})

		// Melee attack icon listener
		const meleeBtn = this.element.querySelector('.fa-swords.rollable')
		if (meleeBtn) {
			meleeBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._onAttackRoll('melee', event)
			})
			meleeBtn.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				this._onAttackRollContextMenu('melee', event)
			})
		}

		// Missile attack icon listener
		const missileBtn = this.element.querySelector('.combat .fa-bow-arrow.rollable')
		if (missileBtn) {
			missileBtn.addEventListener('click', (event) => {
				event.preventDefault()
				this._onAttackRoll('missile', event)
			})
			missileBtn.addEventListener('contextmenu', (event) => {
				event.preventDefault()
				this._onAttackRollContextMenu('missile', event)
			})
		}
	}

	_openXPDialog() {
		const currentXP = this.actor.system.xp.value || 0
		const modifier = this.actor.system.xp.modifier || 0

		const content = `
			<div class="xp-modal-content">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.XPGained')}</label>
					<input type="number" id="xp-gained" value="0" min="0" autofocus>
				</div>
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.XPBonus')}</label>
					<input type="number" id="xp-bonus" value="${modifier}">
					<span class="unit">%</span>
				</div>
				<div class="xp-calculation">
					<div>${game.i18n.localize('DOLMEN.XPCurrent')}: <strong>${currentXP}</strong></div>
					<div class="xp-total">${game.i18n.localize('DOLMEN.XPTotal')}: <span id="xp-total">${currentXP}</span></div>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.XPAddTitle'),
			content: content,
			buttons: {
				add: {
					icon: '<i class="fas fa-plus"></i>',
					label: game.i18n.localize('DOLMEN.XPAddButton'),
					callback: (html) => {
						const gained = parseInt(html.find('#xp-gained').val()) || 0
						const bonus = parseInt(html.find('#xp-bonus').val()) || 0
						const adjustedXP = Math.floor(gained * (1 + bonus / 100))
						const newXP = currentXP + adjustedXP
						this.actor.update({
							'system.xp.value': newXP,
							'system.xp.modifier': bonus
						})
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'add',
			render: (html) => {
				const gainedInput = html.find('#xp-gained')
				const bonusInput = html.find('#xp-bonus')
				const totalSpan = html.find('#xp-total')

				const updateTotal = () => {
					const gained = parseInt(gainedInput.val()) || 0
					const bonus = parseInt(bonusInput.val()) || 0
					const adjustedXP = Math.floor(gained * (1 + bonus / 100))
					totalSpan.text(currentXP + adjustedXP)
				}

				gainedInput.on('input', updateTotal)
				bonusInput.on('input', updateTotal)
			}
		})

		dialog.render(true)
	}

	_openAddSkillDialog() {
		const currentSkills = this.actor.system.extraSkills || []
		const currentSkillIds = currentSkills.map(s => s.id)
		const availableSkills = CONFIG.DOLMENWOOD.extraSkills.filter(id => !currentSkillIds.includes(id))

		if (availableSkills.length === 0 || currentSkills.length >= CONFIG.DOLMENWOOD.maxExtraSkills) {
			ui.notifications.warn(game.i18n.localize('DOLMEN.NoSkillsAvailable') || 'No more skills available to add.')
			return
		}

		const options = availableSkills.map(id => {
			const label = game.i18n.localize(`DOLMEN.Skills.${id}`)
			return `<option value="${id}">${label}</option>`
		}).join('')

		const content = `
			<div class="add-skill-modal">
				<div class="form-group">
					<label>${game.i18n.localize('DOLMEN.SelectSkill')}</label>
					<select id="skill-select">${options}</select>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.AddSkillTitle'),
			content: content,
			buttons: {
				add: {
					icon: '<i class="fas fa-plus"></i>',
					label: game.i18n.localize('DOLMEN.AddSkill'),
					callback: (html) => {
						const selectedSkill = html.find('#skill-select').val()
						this._addSkill(selectedSkill)
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize('DOLMEN.Cancel')
				}
			},
			default: 'add'
		})

		dialog.render(true)
	}

	_addSkill(skillId) {
		const currentSkills = foundry.utils.deepClone(this.actor.system.extraSkills || [])
		currentSkills.push({ id: skillId, target: 6 })
		this.actor.update({ 'system.extraSkills': currentSkills })
	}

	_removeSkill(index) {
		const currentSkills = foundry.utils.deepClone(this.actor.system.extraSkills || [])
		currentSkills.splice(index, 1)
		this.actor.update({ 'system.extraSkills': currentSkills })
	}

	/**
	 * Get equipped weapons that have a specific quality.
	 * @param {string} quality - The weapon quality to filter by ('melee' or 'missile')
	 * @returns {Item[]} Array of equipped weapons with the specified quality
	 */
	_getEquippedWeaponsByQuality(quality) {
		return this.actor.items.filter(item =>
			item.type === 'Weapon' &&
			item.system.equipped &&
			item.system.qualities?.includes(quality)
		)
	}

	/**
	 * Handle click on melee or missile attack icons.
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {Event} event - The click event
	 */
	_onAttackRoll(attackType, event) {
		const weapons = this._getEquippedWeaponsByQuality(attackType)

		if (weapons.length === 0) {
			const typeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
			ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
			return
		}

		if (weapons.length === 1) {
			this._rollAttack(weapons[0], attackType)
		} else {
			this._openWeaponContextMenu(weapons, attackType, event)
		}
	}

	/**
	 * Handle right-click on melee or missile attack icons.
	 * Opens a context menu to choose between attack-only or damage-only rolls.
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {Event} event - The contextmenu event
	 */
	_onAttackRollContextMenu(attackType, event) {
		const weapons = this._getEquippedWeaponsByQuality(attackType)

		if (weapons.length === 0) {
			const typeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
			ui.notifications.warn(game.i18n.format('DOLMEN.Attack.NoWeapon', { type: typeName }))
			return
		}

		// Store position from event before it becomes stale
		const iconRect = event.currentTarget.getBoundingClientRect()
		const position = { top: iconRect.top, left: iconRect.left }

		// Always show roll type menu first
		this._openRollTypeContextMenu(weapons, attackType, position)
	}

	/**
	 * Open a context menu to choose roll type (attack only or damage only).
	 * @param {Item[]} weapons - Array of weapons to potentially roll with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {object} position - Position object with top and left properties
	 */
	_openRollTypeContextMenu(weapons, attackType, position) {
		// Remove any existing context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		// Create the context menu element
		const menu = document.createElement('div')
		menu.className = 'dolmen-weapon-context-menu'

		const attackOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollAttackOnly')
		const damageOnlyLabel = game.i18n.localize('DOLMEN.Attack.RollDamageOnly')

		menu.innerHTML = `
			<div class="weapon-menu-item" data-roll-type="attack">
				<i class="fas fa-dice-d20"></i>
				<span class="weapon-name">${attackOnlyLabel}</span>
			</div>
			<div class="weapon-menu-item" data-roll-type="damage">
				<i class="fas fa-burst"></i>
				<span class="weapon-name">${damageOnlyLabel}</span>
			</div>
		`

		// Position the menu
		menu.style.position = 'fixed'
		menu.style.top = `${position.top}px`
		menu.style.left = `${position.left}px`

		// Add to document
		document.getElementsByClassName('dolmen sheet')[0].appendChild(menu)

		// Adjust position after rendering
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${position.left - menuRect.width - 5}px`

		// Add click handlers
		menu.querySelectorAll('.weapon-menu-item').forEach(item => {
			item.addEventListener('click', () => {
				const rollType = item.dataset.rollType
				menu.remove()

				if (weapons.length === 1) {
					// Single weapon - roll immediately
					if (rollType === 'attack') {
						this._rollAttackOnly(weapons[0], attackType)
					} else if (rollType === 'damage') {
						this._rollDamageOnly(weapons[0], attackType)
					}
				} else {
					// Multiple weapons - show weapon selection
					setTimeout(() => this._openWeaponSelectionMenu(weapons, attackType, rollType, position), 0)
				}
			})
		})

		// Close menu when clicking outside
		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}

	/**
	 * Open weapon selection menu after roll type has been chosen.
	 * @param {Item[]} weapons - Array of available weapons
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {string} rollType - Either 'attack' or 'damage'
	 * @param {object} position - Position object with top and left properties
	 */
	_openWeaponSelectionMenu(weapons, attackType, rollType, position) {
		// Remove any existing context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		// Create the context menu element
		const menu = document.createElement('div')
		menu.className = 'dolmen-weapon-context-menu'

		// Build menu items
		const menuItems = weapons.map(w => `
			<div class="weapon-menu-item" data-weapon-id="${w.id}">
				<img src="${w.img}" alt="${w.name}" class="weapon-icon">
				<span class="weapon-name">${w.name}</span>
				<span class="weapon-damage">${w.system.damage}</span>
			</div>
		`).join('')

		menu.innerHTML = menuItems

		// Position the menu
		menu.style.position = 'fixed'
		menu.style.top = `${position.top}px`
		menu.style.left = `${position.left}px`

		// Add to document
		document.getElementsByClassName('dolmen sheet')[0].appendChild(menu)

		// Adjust position after rendering
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${position.left - menuRect.width - 5}px`

		// Add click handlers to weapon items
		menu.querySelectorAll('.weapon-menu-item').forEach(item => {
			item.addEventListener('click', () => {
				const weaponId = item.dataset.weaponId
				const weapon = this.actor.items.get(weaponId)
				if (weapon) {
					if (rollType === 'attack') {
						this._rollAttackOnly(weapon, attackType)
					} else if (rollType === 'damage') {
						this._rollDamageOnly(weapon, attackType)
					}
				}
				menu.remove()
			})
		})

		// Close menu when clicking outside
		const closeMenu = (e) => {
			if (!menu.contains(e.target)) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}

	/**
	 * Open a context menu to select which weapon to attack with.
	 * @param {Item[]} weapons - Array of available weapons
	 * @param {string} attackType - Either 'melee' or 'missile'
	 * @param {Event} event - The click event for positioning
	 */
	_openWeaponContextMenu(weapons, attackType, event) {
		// Remove any existing weapon context menu
		document.querySelector('.dolmen-weapon-context-menu')?.remove()

		// Create the context menu element
		const menu = document.createElement('div')
		menu.className = 'dolmen-weapon-context-menu'

		// Build menu items
		const menuItems = weapons.map(w => `
			<div class="weapon-menu-item" data-weapon-id="${w.id}">
				<img src="${w.img}" alt="${w.name}" class="weapon-icon">
				<span class="weapon-name">${w.name}</span>
				<span class="weapon-damage">${w.system.damage}</span>
			</div>
		`).join('')

		menu.innerHTML = menuItems

		// Position the menu to the left of the clicked icon
		const iconRect = event.currentTarget.getBoundingClientRect()
		menu.style.position = 'fixed'
		menu.style.top = `${iconRect.top}px`
		menu.style.left = `${iconRect.left}px`

		// Add to document
		document.getElementsByClassName('dolmen sheet')[0].appendChild(menu)

		// Adjust position after rendering to account for menu width
		const menuRect = menu.getBoundingClientRect()
		menu.style.left = `${iconRect.left - menuRect.width - 5}px`

		// Add click handlers to menu items
		menu.querySelectorAll('.weapon-menu-item').forEach(item => {
			item.addEventListener('click', () => {
				const weaponId = item.dataset.weaponId
				const weapon = this.actor.items.get(weaponId)
				if (weapon) {
					this._rollAttack(weapon, attackType)
				}
				menu.remove()
			})
		})

		// Close menu when clicking outside
		const closeMenu = (e) => {
			if (!menu.contains(e.target) && e.target !== event.currentTarget) {
				menu.remove()
				document.removeEventListener('click', closeMenu)
			}
		}
		setTimeout(() => document.addEventListener('click', closeMenu), 0)
	}

	/**
	 * Perform an attack roll with a weapon.
	 * @param {Item} weapon - The weapon to attack with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 */
	async _rollAttack(weapon, attackType) {
		const system = this.actor.system
		const attackMod = system.attack || 0
		const abilityMod = attackType === 'melee'
			? system.abilities.strength.mod
			: system.abilities.dexterity.mod
		const abilityName = attackType === 'melee'
			? game.i18n.localize('DOLMEN.Abilities.StrengthShort')
			: game.i18n.localize('DOLMEN.Abilities.DexterityShort')

		const totalMod = attackMod + abilityMod

		// Build attack roll formula
		const attackFormula = totalMod >= 0 ? `1d20 + ${totalMod}` : `1d20 - ${Math.abs(totalMod)}`
		const attackRoll = new Roll(attackFormula)
		await attackRoll.evaluate()

		// Build damage roll
		const damageRoll = new Roll(weapon.system.damage)
		await damageRoll.evaluate()

		// Determine if this is a natural 20 (critical) or natural 1 (fumble)
		const d20Result = attackRoll.dice[0].results[0].result
		const isCritical = d20Result === 20
		const isFumble = d20Result === 1

		// Build chat message content
		const attackTypeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)
		const modBreakdown = `${game.i18n.localize('DOLMEN.Combat.AttackShort')}: ${attackMod >= 0 ? '+' : ''}${attackMod}, ${abilityName}: ${abilityMod >= 0 ? '+' : ''}${abilityMod}`

		// Create inline roll anchors using Foundry's built-in method
		const attackRollAnchor = await attackRoll.toAnchor({ classes: ['attack-inline-roll'] })
		const damageRollAnchor = await damageRoll.toAnchor({ classes: ['damage-inline-roll'] })
		let resultClass = ''
		let resultLabel = ''
		if (isCritical) {
			resultClass = 'critical'
			resultLabel = `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Critical')}</span>`
		} else if (isFumble) {
			resultClass = 'fumble'
			resultLabel = `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Fumble')}</span>`
		}

		const chatContent = `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<img src="${weapon.img}" alt="${weapon.name}" class="weapon-icon">
					<div class="attack-info">
						<h3>${weapon.name}</h3>
						<span class="attack-type">${attackTypeName}</span>
					</div>
				</div>
				<div class="roll-results">
					<div class="roll-section attack-section ${resultClass}">
						<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
						<div class="roll-result">
							${attackRollAnchor.outerHTML}
							${resultLabel}
						</div>
						<span class="roll-breakdown">${attackFormula}</span>
					</div>
					<div class="roll-section damage-section">
						<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
						<div class="roll-result">
							${damageRollAnchor.outerHTML}
						</div>
						<span class="roll-breakdown">${weapon.system.damage}</span>
					</div>
				</div>
			</div>
		`

		// Create chat message
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [attackRoll, damageRoll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/**
	 * Perform an attack roll only (no damage).
	 * @param {Item} weapon - The weapon to attack with
	 * @param {string} attackType - Either 'melee' or 'missile'
	 */
	async _rollAttackOnly(weapon, attackType) {
		const system = this.actor.system
		const attackMod = system.attack || 0
		const abilityMod = attackType === 'melee'
			? system.abilities.strength.mod
			: system.abilities.dexterity.mod

		const totalMod = attackMod + abilityMod

		// Build attack roll formula
		const attackFormula = totalMod >= 0 ? `1d20 + ${totalMod}` : `1d20 - ${Math.abs(totalMod)}`
		const attackRoll = new Roll(attackFormula)
		await attackRoll.evaluate()

		// Determine if this is a natural 20 (critical) or natural 1 (fumble)
		const d20Result = attackRoll.dice[0].results[0].result
		const isCritical = d20Result === 20
		const isFumble = d20Result === 1

		// Build chat message content
		const attackTypeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)

		// Create inline roll anchor
		const attackRollAnchor = await attackRoll.toAnchor({ classes: ['attack-inline-roll'] })
		let resultClass = ''
		let resultLabel = ''
		if (isCritical) {
			resultClass = 'critical'
			resultLabel = `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Critical')}</span>`
		} else if (isFumble) {
			resultClass = 'fumble'
			resultLabel = `<span class="roll-label">${game.i18n.localize('DOLMEN.Attack.Fumble')}</span>`
		}

		const chatContent = `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<img src="${weapon.img}" alt="${weapon.name}" class="weapon-icon">
					<div class="attack-info">
						<h3>${weapon.name}</h3>
						<span class="attack-type">${attackTypeName}</span>
					</div>
				</div>
				<div class="roll-results">
					<div class="roll-section attack-section ${resultClass}">
						<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
						<div class="roll-result">
							${attackRollAnchor.outerHTML}
							${resultLabel}
						</div>
						<span class="roll-breakdown">${attackFormula}</span>
					</div>
				</div>
			</div>
		`

		// Create chat message
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [attackRoll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/**
	 * Perform a damage roll only (no attack).
	 * @param {Item} weapon - The weapon to roll damage for
	 * @param {string} attackType - Either 'melee' or 'missile'
	 */
	async _rollDamageOnly(weapon, attackType) {
		// Build damage roll
		const damageRoll = new Roll(weapon.system.damage)
		await damageRoll.evaluate()

		// Build chat message content
		const attackTypeName = game.i18n.localize(`DOLMEN.Item.Quality.${attackType}`)

		// Create inline roll anchor
		const damageRollAnchor = await damageRoll.toAnchor({ classes: ['damage-inline-roll'] })

		const chatContent = `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<img src="${weapon.img}" alt="${weapon.name}" class="weapon-icon">
					<div class="attack-info">
						<h3>${weapon.name}</h3>
						<span class="attack-type">${attackTypeName}</span>
					</div>
				</div>
				<div class="roll-results">
					<div class="roll-section damage-section">
						<label>${game.i18n.localize('DOLMEN.Attack.DamageRoll')}</label>
						<div class="roll-result">
							${damageRollAnchor.outerHTML}
						</div>
						<span class="roll-breakdown">${weapon.system.damage}</span>
					</div>
				</div>
			</div>
		`

		// Create chat message
		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: chatContent,
			rolls: [damageRoll],
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	static _onAddSkill(_event, _target) {
		this._openAddSkillDialog()
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		this._removeSkill(index)
	}

	static _onOpenItem(_event, target) {
		const itemId = target.closest('[data-item-id]')?.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			item?.sheet.render(true)
		}
	}

	static async _onEquipItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			await item?.update({ 'system.equipped': true })
		}
	}

	static async _onStowItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			await item?.update({ 'system.equipped': false })
		}
	}

	static async _onDeleteItem(_event, target) {
		const itemId = target.dataset.itemId
		if (itemId) {
			const item = this.actor.items.get(itemId)
			if (item) {
				const confirmed = await Dialog.confirm({
					title: game.i18n.localize('DOLMEN.Inventory.DeleteConfirmTitle'),
					content: game.i18n.format('DOLMEN.Inventory.DeleteConfirmContent', { name: item.name })
				})
				if (confirmed) {
					await item.delete()
				}
			}
		}
	}

	async _onDrop(event) {
		const data = TextEditor.getDragEventData(event)

		// Handle item drops
		if (data.type === 'Item') {
			const targetList = event.target.closest('[data-item-list]')?.dataset.itemList
			const item = await Item.fromDropData(data)

			// If dropped from another actor or compendium, create a copy
			if (item.parent !== this.actor) {
				const itemData = item.toObject()
				itemData.system.equipped = targetList === 'equipped'
				await this.actor.createEmbeddedDocuments('Item', [itemData])
			} else {
				// If dropped within the same actor, toggle equipped state
				const equipped = targetList === 'equipped'
				if (item.system.equipped !== equipped) {
					await item.update({ 'system.equipped': equipped })
				}
			}
		}
	}
}

export default DolmenSheet
