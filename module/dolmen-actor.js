/*global Actor, ui, game, Roll, ChatMessage, CONST, CONFIG */
import { drawFromTableSilent } from './utils/roll-tables.js'

class DolmenActor extends Actor {

	/** @override */
	async _preCreate(data, options, user) {
		await super._preCreate(data, options, user)
		if (data.type === 'Adventurer') {
			this.updateSource({
				'prototypeToken.actorLink': true,
				'prototypeToken.bar1.attribute': 'hp',
				'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
			})
		} else if (data.type === 'Creature') {
			this.updateSource({
				'prototypeToken.bar1.attribute': 'hp',
				'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
			})
		}
	}

	/** @override */
	async _preUpdate(changed, options, user) {
		await super._preUpdate(changed, options, user)

		// Handle customizeSkills toggle for Adventurers
		if (this.type === 'Adventurer' && changed.system?.customizeSkills !== undefined) {
			const newValue = changed.system.customizeSkills
			const oldValue = this.system.customizeSkills

			// Only reset if the value actually changed
			if (newValue !== oldValue) {
				await this._resetSkillsForCustomizeToggle(newValue, changed)
			}
		}

		// Handle level changes for Adventurers
		if (this.type === 'Adventurer' && changed.system?.level !== undefined) {
			const newLevel = changed.system.level
			const oldLevel = this.system.level

			// Only apply class progression if level actually changed
			if (newLevel !== oldLevel && newLevel >= 1 && newLevel <= 15) {
				await this._applyClassProgression(newLevel, changed)
			}
		}
	}

	/**
	 * Apply class progression bonuses when level changes.
	 * Updates attack bonus, saving throws, and skill targets based on class progression tables.
	 * @param {number} newLevel - The new character level
	 * @param {object} changed - The update object being modified
	 * @private
	 */
	async _applyClassProgression(newLevel, changed) {
		const classItem = this.getClassItem()
		if (!classItem) return

		const progression = classItem.system

		// Apply attack bonus from progression table
		if (progression.attackProgression?.[newLevel - 1] !== undefined) {
			changed.system = changed.system || {}
			changed.system.attack = progression.attackProgression[newLevel - 1]
		}

		// Apply saving throws from progression tables
		if (progression.saveProgressions) {
			changed.system = changed.system || {}
			changed.system.saves = changed.system.saves || {}

			for (const save of ['doom', 'ray', 'hold', 'blast', 'spell']) {
				if (progression.saveProgressions[save]?.[newLevel - 1] !== undefined) {
					changed.system.saves[save] = progression.saveProgressions[save][newLevel - 1]
				}
			}
		}

		// Apply skill targets from progression tables (unless customizing skills)
		if (progression.skillProgressions && !this.system.customizeSkills) {
			changed.system = changed.system || {}

			// Update base skills (listen, search, survival)
			const baseSkills = ['listen', 'search', 'survival']
			for (const skill of baseSkills) {
				if (progression.skillProgressions[skill]?.[newLevel - 1] !== undefined) {
					changed.system.skills = changed.system.skills || {}
					changed.system.skills[skill] = progression.skillProgressions[skill][newLevel - 1]
				}
			}

			// Update extra skills (stored in extraSkills array)
			const currentExtraSkills = this.system.extraSkills || []
			if (currentExtraSkills.length > 0) {
				// Map through all extra skills and update targets if progression exists
				const updatedExtraSkills = currentExtraSkills.map(skill => {
					const progressionTarget = progression.skillProgressions[skill.id]?.[newLevel - 1]
					if (progressionTarget !== undefined) {
						return { ...skill, target: progressionTarget }
					}
					return skill
				})

				// Only update if something actually changed
				const hasChanges = updatedExtraSkills.some((skill, i) =>
					skill.target !== currentExtraSkills[i].target
				)
				if (hasChanges) {
					changed.system.extraSkills = updatedExtraSkills
				}
			}
		}
	}

	/**
	 * Reset skill targets when toggling the customizeSkills option.
	 * When enabling: Reset all skills to 6 (base value for spending expertise points).
	 * When disabling: Reset all skills to class progression defaults for current level.
	 * @param {boolean} newValue - The new customizeSkills value
	 * @param {object} changed - The update object being modified
	 * @private
	 */
	async _resetSkillsForCustomizeToggle(newValue, changed) {
		const classItem = this.getClassItem()
		if (!classItem) return

		const progression = classItem.system
		const level = this.system.level || 1

		changed.system = changed.system || {}

		if (newValue) {
			// Enabling customize skills: Reset all skills to 6
			changed.system.skills = changed.system.skills || {}
			changed.system.skills.listen = 6
			changed.system.skills.search = 6
			changed.system.skills.survival = 6

			// Reset extra skills to 6
			const currentExtraSkills = this.system.extraSkills || []
			if (currentExtraSkills.length > 0) {
				changed.system.extraSkills = currentExtraSkills.map(skill => ({
					...skill,
					target: 6
				}))
			}
		} else {
			// Disabling customize skills: Reset to class progression defaults (or 6 if no progression)
			changed.system.skills = changed.system.skills || {}

			// Reset base skills to progression values or default 6
			const baseSkills = ['listen', 'search', 'survival']
			for (const skill of baseSkills) {
				const progressionValue = progression.skillProgressions?.[skill]?.[level - 1]
				changed.system.skills[skill] = progressionValue !== undefined ? progressionValue : 6
			}

			// Reset extra skills to progression values or default 6
			const currentExtraSkills = this.system.extraSkills || []
			if (currentExtraSkills.length > 0) {
				changed.system.extraSkills = currentExtraSkills.map(skill => {
					const progressionTarget = progression.skillProgressions?.[skill.id]?.[level - 1]
					return {
						...skill,
						target: progressionTarget !== undefined ? progressionTarget : 6
					}
				})
			}
		}
	}

	/**
	 * Perform a rest, healing HP, resetting trait uses, and clearing spell slots.
	 * @param {'overnight'|'fullDay'} type - Rest type
	 * @returns {object} Summary of what was restored
	 */
	async rest(type) {
		const system = this.system
		const updateData = {}

		// Reset trait usage - null out each key
		const traitUsage = system.traitUsage || {}
		for (const key of Object.keys(traitUsage)) {
			updateData[`system.traitUsage.-=${key}`] = null
		}

		// Reset knack usage - null out each key
		const knackUsage = system.knackUsage || {}
		for (const key of Object.keys(knackUsage)) {
			updateData[`system.knackUsage.-=${key}`] = null
		}

		// Reset daily rune usage (only runes with resetsOnRest)
		if (system.fairyMagic?.enabled) {
			const runeUsage = system.runeUsage || {}
			const level = system.level
			for (const [runeId, data] of Object.entries(runeUsage)) {
				const rune = this.items.get(runeId)
				if (!rune || rune.type !== 'Rune') continue
				const magnitude = rune.system.magnitude || 'lesser'
				const isDaily = (magnitude === 'lesser') ||
					(magnitude === 'greater' && level >= 10)
				if (isDaily && data.used > 0) {
					updateData[`system.runeUsage.-=${runeId}`] = null
				}
			}
		}

		// Heal HP
		let hpHealed = 0
		let healRoll = null
		if (type === 'overnight') {
			hpHealed = 1
		} else {
			healRoll = await new Roll('1d3').evaluate()
			hpHealed = healRoll.total
		}
		if (system.hp.value < system.hp.max) {
			updateData['system.hp.value'] = Math.min(system.hp.max, system.hp.value + hpHealed)
		}

		await this.update(updateData)

		// Build and send chat message
		const restLabel = type === 'overnight'
			? game.i18n.localize('DOLMEN.Rest.Overnight')
			: game.i18n.localize('DOLMEN.Rest.FullDay')
		let hpLine
		if (healRoll) {
			const anchor = await healRoll.toAnchor({ classes: ['rest-inline-roll'] })
			hpLine = `${anchor.outerHTML} ${game.i18n.format('DOLMEN.Rest.HPRestored', { hp: '' })}`
		} else {
			hpLine = game.i18n.format('DOLMEN.Rest.HPRestored', { hp: 1 })
		}

		let details = `<li>${hpLine}</li>`
		details += `<li>${game.i18n.localize('DOLMEN.Rest.TraitsReset')}</li>`

		const hasSpells = system.arcaneMagic?.enabled || system.holyMagic?.enabled
		if (hasSpells) {
			details += `<li>${game.i18n.localize('DOLMEN.Rest.SpellsReminder')}</li>`
		}

		const content = `
			<div class="dolmen rest-card">
				<div class="rest-header">
					<i class="fa-duotone fa-bed-front"></i>
					<h3>${restLabel}</h3>
				</div>
				<ul class="rest-details">${details}</ul>
			</div>`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this }),
			content,
			rolls: healRoll ? [healRoll] : [],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

	/**
	 * Check if item size is compatible with actor size.
	 * @param {Item} item - The item to check
	 * @returns {boolean} True if compatible
	 */
	isItemSizeCompatible(item) {
		if (!['Armor', 'Weapon'].includes(item.type)) return true

		const actorSize = this.system.size
		const itemSize = item.type === 'Armor' ? item.system.fit : item.system.size

		// Small actors can only use small items
		if (actorSize === 'small') return itemSize === 'small'
		// Medium actors can use small or medium items
		if (actorSize === 'medium') return ['small', 'medium'].includes(itemSize)
		// Large actors can use any size
		return true
	}

	/**
	 * Warn if an item is size-incompatible when equipped.
	 * @param {Item} item - The item being equipped
	 */
	warnIfIncompatibleSize(item) {
		if (!this.isItemSizeCompatible(item)) {
			const itemSize = item.type === 'Armor' ? item.system.fit : item.system.size
			ui.notifications.warn(game.i18n.format('DOLMEN.Traits.SizeIncompatible', {
				itemName: item.name,
				itemSize: game.i18n.localize(`DOLMEN.Item.Size.${itemSize}`),
				actorSize: game.i18n.localize(`DOLMEN.Item.Size.${this.system.size}`)
			}))
		}
	}

	/**
	 * Get the embedded Kindred item for this actor.
	 * @returns {Item|null} The Kindred item, or null if not found
	 */
	getKindredItem() {
		return this.items.find(i => i.type === 'Kindred') || null
	}

	/**
	 * Get the embedded Class item for this actor.
	 * @returns {Item|null} The Class item, or null if not found
	 */
	getClassItem() {
		return this.items.find(i => i.type === 'Class') || null
	}

	/**
	 * Set the actor's kindred by creating/replacing the embedded Kindred item.
	 * @param {string} kindredId - The kindred ID to set (e.g., "grimalkin", "human")
	 * @returns {Promise<void>}
	 */
	async setKindred(kindredId) {
		if (!kindredId) return

		const existing = this.getKindredItem()

		// Find the kindred: system compendium > "New Player Options" packs > world items
		let kindredDoc = null
		const pack = game.packs.get('dolmenwood.kindreds')
		if (pack) {
			const index = await pack.getIndex({ fields: ['system.kindredId'] })
			const entry = index.find(e => e.system?.kindredId === kindredId)
			if (entry) kindredDoc = await pack.getDocument(entry._id)
		}
		if (!kindredDoc) {
			for (const p of game.packs.filter(p => p.metadata.label === 'New Player Options' && p.metadata.type === 'Item')) {
				const index = await p.getIndex({ fields: ['system.kindredId'] })
				const entry = index.find(e => e.type === 'Kindred' && e.system?.kindredId === kindredId)
				if (entry) {
					kindredDoc = await p.getDocument(entry._id)
					break
				}
			}
		}
		if (!kindredDoc) {
			kindredDoc = game.items.find(i => i.type === 'Kindred' && i.system?.kindredId === kindredId)
		}
		if (!kindredDoc) {
			ui.notifications.warn(`Kindred "${kindredId}" not found`)
			return
		}

		// Check if current class is a kindred-class and incompatible with new kindred
		const currentClass = this.getClassItem()
		if (currentClass && currentClass.system.requiredKindred) {
			if (currentClass.system.requiredKindred !== kindredId) {
				// Incompatible - change class to Fighter
				await this.setClass('fighter')
				ui.notifications.warn(game.i18n.format('DOLMEN.KindredClassIncompatible', {
					newKindred: game.i18n.localize(`DOLMEN.Kindreds.${kindredId}`),
					className: game.i18n.localize(`DOLMEN.Classes.${currentClass.system.classId}`)
				}))
			}
		}

		// Create new item FIRST, then delete old one
		// This prevents the sheet from showing null during the transition
		await this.createEmbeddedDocuments('Item', [kindredDoc.toObject()])

		if (existing) {
			await existing.delete()
		}

		// Update languages based on new kindred
		const newLanguages = kindredDoc.system.languages || ['woldish']
		await this.update({ 'system.languages': newLanguages })

		// Roll character characteristics and send to chat
		await this._rollCharacteristics()
	}

	/**
	 * Set the actor's class by creating/replacing the embedded Class item.
	 * If the class requires a specific kindred (kindred-class), enforce it.
	 * Automatically adds class-specific skills to the character.
	 * @param {string} classId - The class ID to set (e.g., "fighter", "elf")
	 * @returns {Promise<void>}
	 */
	async setClass(classId) {
		if (!classId) return

		const existing = this.getClassItem()

		// Find the class: system compendium > "New Player Options" packs > world items
		let classDoc = null
		const pack = game.packs.get('dolmenwood.classes')
		if (pack) {
			const index = await pack.getIndex({ fields: ['system.classId'] })
			const entry = index.find(e => e.system?.classId === classId)
			if (entry) classDoc = await pack.getDocument(entry._id)
		}
		if (!classDoc) {
			for (const p of game.packs.filter(p => p.metadata.label === 'New Player Options' && p.metadata.type === 'Item')) {
				const index = await p.getIndex({ fields: ['system.classId'] })
				const entry = index.find(e => e.type === 'Class' && e.system?.classId === classId)
				if (entry) {
					classDoc = await p.getDocument(entry._id)
					break
				}
			}
		}
		if (!classDoc) {
			classDoc = game.items.find(i => i.type === 'Class' && i.system?.classId === classId)
		}
		if (!classDoc) {
			ui.notifications.warn(`Class "${classId}" not found`)
			return
		}

		// Create new item FIRST, then delete old one
		// This prevents the sheet from showing null during the transition
		await this.createEmbeddedDocuments('Item', [classDoc.toObject()])

		if (existing) {
			await existing.delete()
		}

		// If this class requires a specific kindred (kindred-class), enforce it
		if (classDoc.system.requiredKindred) {
			await this.setKindred(classDoc.system.requiredKindred)
		}

		// Reset skills to match new class progression
		await this._resetSkillsForClassChange(classDoc)
	}

	/**
	 * Reset skill targets when changing class.
	 * When customizeSkills is disabled: Reset all skills to class progression defaults (or 6 if no progression).
	 * When customizeSkills is enabled: Reset all skills to 6 (base value for spending expertise points).
	 * @param {Item} classDoc - The new class item document
	 * @private
	 */
	async _resetSkillsForClassChange(classDoc) {
		const progression = classDoc.system
		const level = this.system.level || 1
		const updateData = { 'system.skills': {}, 'system.extraSkills': [] }

		// Reset base skills (listen, search, survival)
		const baseSkills = ['listen', 'search', 'survival']
		for (const skill of baseSkills) {
			if (this.system.customizeSkills) {
				// Customize mode: always reset to 6
				updateData['system.skills'][skill] = 6
			} else {
				// Use progression value or default to 6
				const progressionValue = progression.skillProgressions?.[skill]?.[level - 1]
				updateData['system.skills'][skill] = progressionValue !== undefined ? progressionValue : 6
			}
		}

		// Reset extra skills to match new class
		const newClassSkills = progression.classSkills || []
		const finalSkills = []
		for (const skillId of newClassSkills) {
			if (this.system.customizeSkills) {
				// Customize mode: always reset to 6
				finalSkills.push({ id: skillId, target: 6 })
			} else {
				// Use progression value or default to 6
				const progressionTarget = progression.skillProgressions?.[skillId]?.[level - 1]
				finalSkills.push({
					id: skillId,
					target: progressionTarget !== undefined ? progressionTarget : 6
				})
			}
		}

		const maxSkills = CONFIG.DOLMENWOOD.maxExtraSkills || 6
		updateData['system.extraSkills'] = finalSkills.slice(0, maxSkills)

		await this.update(updateData)
	}

	/**
	 * Roll all character characteristics when kindred is set.
	 * Rolls age, lifespan, height, weight, birthday, background, and appearance traits.
	 * Sends results to chat and updates actor.
	 * @private
	 */
	async _rollCharacteristics() {
		const kindredItem = this.getKindredItem()
		if (!kindredItem) return

		const kindredName = kindredItem.name
		const results = {}

		// Roll age
		const ageFormula = kindredItem.system.ageFormula
		if (ageFormula) {
			const ageRoll = await new Roll(ageFormula).evaluate()
			results.age = ageRoll.total
		}

		// Roll lifespan
		const lifespanFormula = kindredItem.system.lifespanFormula
		if (lifespanFormula && lifespanFormula !== '0') {
			const lifespanRoll = await new Roll(lifespanFormula).evaluate()
			results.lifespan = lifespanRoll.total
		} else {
			results.lifespan = 0 // Immortal
		}

		// Roll height (in inches)
		const heightFormula = kindredItem.system.heightFormula
		if (heightFormula) {
			const heightRoll = await new Roll(heightFormula).evaluate()
			const totalInches = heightRoll.total
			const feet = Math.floor(totalInches / 12)
			const inches = totalInches % 12
			results.heightInches = totalInches
			results.heightFeet = `${feet}'${inches}"`
			results.heightCm = Math.round(totalInches * 2.54)
		}

		// Roll weight
		const weightFormula = kindredItem.system.weightFormula
		if (weightFormula) {
			const weightRoll = await new Roll(weightFormula).evaluate()
			results.weightLbs = weightRoll.total
			results.weightKg = Math.round(weightRoll.total * 0.453592)
		}

		// Roll birthday
		const months = Object.keys(CONFIG.DOLMENWOOD.months)
		const monthRoll = await new Roll('1d12').evaluate()
		const monthIndex = monthRoll.total - 1
		results.birthMonth = months[monthIndex]

		const monthData = CONFIG.DOLMENWOOD.months[results.birthMonth]
		const dayRoll = await new Roll(`1d${monthData.days}`).evaluate()
		results.birthDay = dayRoll.total

		// Roll background and appearance traits from RollTables
		const hasFur = kindredItem.system.hasFur
		const bodyField = hasFur ? 'Fur' : 'Body'
		results.background = await drawFromTableSilent(`${kindredName} Backgrounds`) || ''
		results.head = await drawFromTableSilent(`${kindredName} Head`) || ''
		results.face = await drawFromTableSilent(`${kindredName} Face`) || ''
		results.body = await drawFromTableSilent(`${kindredName} ${bodyField}`) || ''
		results.demeanour = await drawFromTableSilent(`${kindredName} Demeanour`) || ''
		results.dress = await drawFromTableSilent(`${kindredName} Dress`) || ''
		results.speech = await drawFromTableSilent(`${kindredName} Speech`) || ''
		results.beliefs = await drawFromTableSilent(`${kindredName} Beliefs`) || ''
		results.desires = await drawFromTableSilent(`${kindredName} Desires`) || ''

		// Update actor with rolled values
		await this.update({
			'system.physical.age': results.age || 0,
			'system.physical.lifespan': results.lifespan || 0,
			'system.physical.heightFeet': results.heightFeet || "0'0\"",
			'system.physical.heightCm': results.heightCm || 0,
			'system.physical.weightLbs': results.weightLbs || 0,
			'system.physical.weightKg': results.weightKg || 0,
			'system.birthMonth': results.birthMonth || '',
			'system.birthDay': results.birthDay || 0,
			'system.background.profession': results.background || '',
			'system.details.head': results.head || '',
			'system.details.face': results.face || '',
			'system.details.body': results.body || '',
			'system.details.demeanour': results.demeanour || '',
			'system.details.dress': results.dress || '',
			'system.details.speech': results.speech || '',
			'system.details.beliefs': results.beliefs || '',
			'system.details.desires': results.desires || ''
		})

		// Send results to chat
		await this._sendCharacteristicsToChat(kindredName, results, hasFur)
	}

	/**
	 * Send character characteristics to chat.
	 * @param {string} kindredName - Name of the kindred
	 * @param {object} results - Rolled characteristics
	 * @private
	 */
	async _sendCharacteristicsToChat(kindredName, results, hasFur) {
		const loc = (key) => game.i18n.localize(key)
		const fmt = (key, data) => game.i18n.format(key, data)
		const monthName = loc(`DOLMEN.Months.${results.birthMonth}`)
		const lifespanText = results.lifespan === 0
			? loc('DOLMEN.Immortal')
			: fmt('DOLMEN.KindredDetails.ValueYears', { value: results.lifespan })
		const ageText = fmt('DOLMEN.KindredDetails.ValueYears', { value: results.age })
		const heightText = fmt('DOLMEN.KindredDetails.HeightFormat', { feet: results.heightFeet, cm: results.heightCm })
		const weightText = fmt('DOLMEN.KindredDetails.WeightFormat', { lbs: results.weightLbs, kg: results.weightKg })

		const content = `
			<div class="dolmen-roll-card">
				<div class="card-content">
					<p><strong>${fmt('DOLMEN.RolledKindredDetails', { kindred: kindredName })}:</strong></p>
					<div class="characteristic-group">
						<h4>${loc('DOLMEN.Kindred.PhysicalCharacteristics')}</h4>
						<p><strong>${loc('DOLMEN.KindredDetails.CurrentAge')}:</strong> ${ageText}</p>
						<p><strong>${loc('DOLMEN.KindredDetails.Lifespan')}:</strong> ${lifespanText}</p>
						<p><strong>${loc('DOLMEN.KindredDetails.Height')}:</strong> ${heightText}</p>
						<p><strong>${loc('DOLMEN.KindredDetails.Weight')}:</strong> ${weightText}</p>
						<p><strong>${loc('DOLMEN.Birthday')}:</strong> ${monthName} ${results.birthDay}</p>
					</div>
					<div class="characteristic-group">
						<h4>${loc('DOLMEN.Background')}</h4>
						<p>${results.background}</p>
					</div>
					<div class="characteristic-group">
						<h4>${loc('DOLMEN.ExtraDetails.Appearance')}</h4>
						<p><strong>${loc('DOLMEN.ExtraDetails.Head')}:</strong> ${results.head}</p>
						<p><strong>${loc('DOLMEN.ExtraDetails.Face')}:</strong> ${results.face}</p>
						<p><strong>${loc(hasFur ? 'DOLMEN.ExtraDetails.Fur' : 'DOLMEN.ExtraDetails.Body')}:</strong> ${results.body}</p>
						<p><strong>${loc('DOLMEN.ExtraDetails.Dress')}:</strong> ${results.dress}</p>
					</div>
					<div class="characteristic-group">
						<h4>${loc('DOLMEN.ExtraDetails.Mannerisms')}</h4>
						<p><strong>${loc('DOLMEN.ExtraDetails.Demeanour')}:</strong> ${results.demeanour}</p>
						<p><strong>${loc('DOLMEN.ExtraDetails.Speech')}:</strong> ${results.speech}</p>
						<p><strong>${loc('DOLMEN.ExtraDetails.Beliefs')}:</strong> ${results.beliefs}</p>
						<p><strong>${loc('DOLMEN.ExtraDetails.Desires')}:</strong> ${results.desires}</p>
					</div>
				</div>
			</div>
		`

		await ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor: this }),
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER
		})
	}

}
export default DolmenActor