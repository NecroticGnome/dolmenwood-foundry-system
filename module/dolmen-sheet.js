/* global foundry, game, Dialog, FilePicker, CONFIG, ui */
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
			removeSkill: DolmenSheet._onRemoveSkill
		}
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

		return context
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

	static _onAddSkill(_event, _target) {
		this._openAddSkillDialog()
	}

	static _onRemoveSkill(_event, target) {
		const index = parseInt(target.dataset.skillIndex)
		this._removeSkill(index)
	}
}

export default DolmenSheet
