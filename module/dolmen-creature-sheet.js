/* global foundry, game, Dialog, FilePicker, Item, Roll, ChatMessage, CONST, fromUuid */
import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { onSaveRoll } from './sheet/roll-handlers.js'
import { createContextMenu } from './sheet/context-menu.js'
import { getDieIconFromFormula } from './sheet/attack-rolls.js'
import { parseSaveLinks } from './chat-save.js'

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
			removeAbility: DolmenCreatureSheet._onRemoveAbility
		},
		dragDrop: [{ dropSelector: '.item-list' }]
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-stats.html',
			scrollable: ['']
		},
		notes: {
			template: 'systems/dolmenwood/templates/creature/parts/tab-notes.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-dragon', label: 'DOLMEN.Tabs.Stats' },
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
		const actor = this.actor

		context.actor = actor
		context.system = actor.system
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

		return context
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		const tabIds = ['stats', 'notes']
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

	/* -------------------------------------------- */
	/*  Event Listeners                             */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

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

		// Ability edit listeners (click row to open edit dialog)
		this.element.querySelectorAll('.ability-row').forEach(el => {
			el.addEventListener('click', (event) => {
				if (event.target.closest('[data-action]')) return
				event.preventDefault()
				const index = parseInt(el.dataset.abilityIndex)
				this._openAbilityDialog(index)
			})
		})
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
				<div class="form-group full-width">
					<label>${game.i18n.localize('DOLMEN.Creature.SaveEffect')}</label>
					<textarea id="attack-effect">${attack.attackEffect || ''}</textarea>
				</div>
			</div>
		`

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.Creature.EditAttack'),
			content,
			buttons: {
				save: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize('DOLMEN.Save'),
					callback: (html) => {
						const attacks = foundry.utils.deepClone(this.actor.system.attacks)
						attacks[index] = {
							attackName: html.find('#attack-name').val() || 'Attack',
							numAttacks: parseInt(html.find('#attack-num').val()) || 1,
							attackBonus: parseInt(html.find('#attack-bonus').val()) || 0,
							attackDamage: html.find('#attack-damage').val() || '1d6',
							attackEffect: html.find('#attack-effect').val() || '',
							attackType: html.find('input[name="attackType"]:checked').val() || 'attack',
							rangeShort: parseInt(html.find('#range-short').val()) || 0,
							rangeMedium: parseInt(html.find('#range-medium').val()) || 0,
							rangeLong: parseInt(html.find('#range-long').val()) || 0
						}
						this.actor.update({ 'system.attacks': attacks })
					}
				}
			},
			default: 'save',
			render: (html) => {
				// Toggle bonus/damage disabled state based on attack type radio
				html.find('input[name="attackType"]').on('change', (event) => {
					const isSave = event.target.value === 'save'
					html.find('#attack-bonus').prop('disabled', isSave)
					html.find('#attack-damage').prop('disabled', isSave)
				})
			}
		})
		dialog.render(true)
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

		const dialog = new Dialog({
			title: game.i18n.localize('DOLMEN.Creature.EditAbility'),
			content,
			buttons: {
				save: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize('DOLMEN.Save'),
					callback: (html) => {
						const abilities = foundry.utils.deepClone(this.actor.system.specialAbilities)
						abilities[index] = {
							name: html.find('#ability-name').val() || 'Ability',
							description: html.find('#ability-description').val() || ''
						}
						this.actor.update({ 'system.specialAbilities': abilities })
					}
				}
			},
			default: 'save'
		})
		dialog.render(true)
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

		const anchor = await roll.toAnchor({ classes: ['morale-inline-roll'] })

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

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor }),
			content: chatContent,
			rolls: [roll],
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

		// No ranges: execute immediately
		this._executeCreatureAttack(attack, 0, null)
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
				this._executeCreatureAttack(attack, rangeMod, rangeName)
			}
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
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER
			})
			return
		}

		// Attack type: roll attack and damage dice
		const rolls = []
		const totalBonus = attack.attackBonus + rangeMod
		const modSign = totalBonus >= 0 ? '+' : ''
		const atkFormula = `1d20${modSign}${totalBonus}`
		const atkRoll = new Roll(atkFormula)
		await atkRoll.evaluate()
		rolls.push(atkRoll)

		const dmgRoll = new Roll(attack.attackDamage)
		await dmgRoll.evaluate()
		if (dmgRoll.total < 1) dmgRoll._total = 1
		rolls.push(dmgRoll)

		const atkAnchor = await atkRoll.toAnchor({ classes: ['attack-inline-roll'] })
		const dmgAnchor = await dmgRoll.toAnchor({ classes: ['damage-inline-roll'] })

		const diceIcon = getDieIconFromFormula(attack.attackDamage)

		const content = `
			<div class="dolmen attack-roll">
				<div class="attack-header">
					<div class="attack-info">
						<h3>${attack.attackName}${rangeBadge}</h3>
					</div>
				</div>
				<div class="roll-results">
					<div class="roll-section attack-section">
						<label>${game.i18n.localize('DOLMEN.Attack.AttackRoll')}</label>
						<div class="roll-result">${atkAnchor.outerHTML}</div>
						<span class="roll-breakdown">${atkFormula}</span>
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

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content,
			rolls,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/* -------------------------------------------- */
	/*  Drag and Drop                               */
	/* -------------------------------------------- */

	async _onDrop(event) {
		const data = TextEditor.getDragEventData(event)
		if (data.type === 'Item') {
			const item = await Item.implementation.fromDropData(data)
			if (!item) return
			// Prevent dropping spells onto creatures
			const spellTypes = ['Spell', 'HolySpell', 'Glamour', 'Rune']
			if (spellTypes.includes(item.type)) return
			return this.actor.createEmbeddedDocuments('Item', [item.toObject()])
		}
	}
}

const TextEditor = foundry.applications.ux.TextEditor

export default DolmenCreatureSheet
