/*global Actor, ui, game, Roll, ChatMessage, CONST, CONFIG */
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
		if (progression.attackProgression?.[newLevel] !== undefined) {
			changed.system = changed.system || {}
			changed.system.attack = progression.attackProgression[newLevel]
		}

		// Apply saving throws from progression tables
		if (progression.saveProgressions) {
			changed.system = changed.system || {}
			changed.system.saves = changed.system.saves || {}

			for (const save of ['doom', 'ray', 'hold', 'blast', 'spell']) {
				if (progression.saveProgressions[save]?.[newLevel] !== undefined) {
					changed.system.saves[save] = progression.saveProgressions[save][newLevel]
				}
			}
		}

		// Apply skill targets from progression tables (unless customizing skills)
		if (progression.skillProgressions && !this.system.customizeSkills) {
			changed.system = changed.system || {}

			// Update base skills (listen, search, survival)
			const baseSkills = ['listen', 'search', 'survival']
			for (const skill of baseSkills) {
				if (progression.skillProgressions[skill]?.[newLevel] !== undefined) {
					changed.system.skills = changed.system.skills || {}
					changed.system.skills[skill] = progression.skillProgressions[skill][newLevel]
				}
			}

			// Update extra skills (stored in extraSkills array)
			const currentExtraSkills = this.system.extraSkills || []
			if (currentExtraSkills.length > 0) {
				// Map through all extra skills and update targets if progression exists
				const updatedExtraSkills = currentExtraSkills.map(skill => {
					const progressionTarget = progression.skillProgressions[skill.id]?.[newLevel]
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
				const progressionValue = progression.skillProgressions?.[skill]?.[level]
				changed.system.skills[skill] = progressionValue !== undefined ? progressionValue : 6
			}

			// Reset extra skills to progression values or default 6
			const currentExtraSkills = this.system.extraSkills || []
			if (currentExtraSkills.length > 0) {
				changed.system.extraSkills = currentExtraSkills.map(skill => {
					const progressionTarget = progression.skillProgressions?.[skill.id]?.[level]
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
	 * @param {string} kindredName - The kindred name to set (e.g., "Grimalkin", "Human")
	 * @returns {Promise<void>}
	 */
	async setKindred(kindredName) {
		if (!kindredName) return

		const existing = this.getKindredItem()
		const pack = game.packs.get('dolmenwood.kindreds')
		if (!pack) {
			ui.notifications.error('Kindreds compendium not found')
			return
		}

		// Find the kindred in the compendium by name
		const index = await pack.getIndex()
		const entry = index.find(e => e.name.toLowerCase() === kindredName.toLowerCase())

		if (!entry) {
			ui.notifications.warn(`Kindred "${kindredName}" not found in compendium`)
			return
		}

		const kindredDoc = await pack.getDocument(entry._id)
		if (!kindredDoc) {
			ui.notifications.error(`Failed to load kindred "${kindredName}"`)
			return
		}

		// Check if current class is a kindred-class and incompatible with new kindred
		const currentClass = this.getClassItem()
		if (currentClass && currentClass.system.requiredKindred) {
			const newKindredId = kindredDoc.system.kindredId
			if (currentClass.system.requiredKindred !== newKindredId) {
				// Incompatible - change class to Fighter
				await this.setClass('Fighter')
				ui.notifications.warn(game.i18n.format('DOLMEN.KindredClassIncompatible', {
					newKindred: kindredName,
					className: currentClass.name
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
	 * @param {string} className - The class name to set (e.g., "Fighter", "Elf")
	 * @returns {Promise<void>}
	 */
	async setClass(className) {
		if (!className) return

		const existing = this.getClassItem()
		const pack = game.packs.get('dolmenwood.classes')
		if (!pack) {
			ui.notifications.error('Classes compendium not found')
			return
		}

		// Find the class in the compendium by name
		const index = await pack.getIndex()
		const entry = index.find(e => e.name.toLowerCase() === className.toLowerCase())

		if (!entry) {
			ui.notifications.warn(`Class "${className}" not found in compendium`)
			return
		}

		const classDoc = await pack.getDocument(entry._id)
		if (!classDoc) {
			ui.notifications.error(`Failed to load class "${className}"`)
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
			// Find the matching kindred by name
			await this.setKindred(classDoc.name)
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
				const progressionValue = progression.skillProgressions?.[skill]?.[level]
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
				const progressionTarget = progression.skillProgressions?.[skillId]?.[level]
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

		const kindredId = kindredItem.system.kindredId
		const kindredName = kindredItem.name
		const results = {}

		// Roll age
		const ageFormula = CONFIG.DOLMENWOOD.kindredAgeFormulas[kindredId]
		if (ageFormula) {
			const ageRoll = await new Roll(ageFormula).evaluate()
			results.age = ageRoll.total
		}

		// Roll lifespan
		const lifespanFormula = CONFIG.DOLMENWOOD.kindredLifespanFormulas[kindredId]
		if (lifespanFormula && lifespanFormula !== '0') {
			const lifespanRoll = await new Roll(lifespanFormula).evaluate()
			results.lifespan = lifespanRoll.total
		} else {
			results.lifespan = 0 // Immortal
		}

		// Roll height (in inches)
		const heightFormula = CONFIG.DOLMENWOOD.kindredHeightFormulas[kindredId]
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
		const weightFormula = CONFIG.DOLMENWOOD.kindredWeightFormulas[kindredId]
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

		// Roll background (d20 table)
		const backgroundRoll = await new Roll('1d20').evaluate()
		results.background = this._getBackground(backgroundRoll.total)

		// Roll appearance traits (d20 for each)
		const headRoll = await new Roll('1d20').evaluate()
		results.head = this._getHead(headRoll.total, kindredId)

		const faceRoll = await new Roll('1d20').evaluate()
		results.face = this._getFace(faceRoll.total)

		const bodyRoll = await new Roll('1d20').evaluate()
		results.body = this._getBody(bodyRoll.total, kindredId)

		const demeanourRoll = await new Roll('1d20').evaluate()
		results.demeanour = this._getDemeanour(demeanourRoll.total)

		const dressRoll = await new Roll('1d20').evaluate()
		results.dress = this._getDress(dressRoll.total)

		const speechRoll = await new Roll('1d20').evaluate()
		results.speech = this._getSpeech(speechRoll.total)

		const beliefsRoll = await new Roll('1d20').evaluate()
		results.beliefs = this._getBeliefs(beliefsRoll.total)

		const desiresRoll = await new Roll('1d20').evaluate()
		results.desires = this._getDesires(desiresRoll.total)

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
		await this._sendCharacteristicsToChat(kindredName, results)
	}

	/**
	 * Send character characteristics to chat.
	 * @param {string} kindredName - Name of the kindred
	 * @param {object} results - Rolled characteristics
	 * @private
	 */
	async _sendCharacteristicsToChat(kindredName, results) {
		const monthName = game.i18n.localize(`DOLMEN.Months.${results.birthMonth}`)
		const lifespanText = results.lifespan === 0
			? game.i18n.localize('DOLMEN.Immortal')
			: `${results.lifespan} years`

		const content = `
			<div class="dolmen-roll-card">
				<div class="card-content">
					<p><strong>${game.i18n.format('DOLMEN.RolledKindredDetails', { kindred: kindredName })}:</strong></p>
					<div class="characteristic-group">
						<h4>Physical Characteristics</h4>
						<p><strong>Age:</strong> ${results.age} years</p>
						<p><strong>Lifespan:</strong> ${lifespanText}</p>
						<p><strong>Height:</strong> ${results.heightFeet} (${results.heightCm} cm)</p>
						<p><strong>Weight:</strong> ${results.weightLbs} lbs (${results.weightKg} kg)</p>
						<p><strong>Birthday:</strong> ${monthName} ${results.birthDay}</p>
					</div>
					<div class="characteristic-group">
						<h4>Background</h4>
						<p>${results.background}</p>
					</div>
					<div class="characteristic-group">
						<h4>Appearance</h4>
						<p><strong>Head:</strong> ${results.head}</p>
						<p><strong>Face:</strong> ${results.face}</p>
						<p><strong>Body:</strong> ${results.body}</p>
						<p><strong>Dress:</strong> ${results.dress}</p>
					</div>
					<div class="characteristic-group">
						<h4>Mannerisms</h4>
						<p><strong>Demeanour:</strong> ${results.demeanour}</p>
						<p><strong>Speech:</strong> ${results.speech}</p>
						<p><strong>Beliefs:</strong> ${results.beliefs}</p>
						<p><strong>Desires:</strong> ${results.desires}</p>
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

	// Background table (d20)
	_getBackground(roll) {
		const backgrounds = [
			'Alchemist', 'Animal Trainer', 'Apothecary', 'Artisan', 'Bandit',
			'Blacksmith', 'Burglar', 'Charlatan', 'Cutpurse', 'Gambler',
			'Grave Robber', 'Herbalist', 'Hunter', 'Innkeeper', 'Merchant',
			'Miner', 'Performer', 'Ratcatcher', 'Sailor', 'Soldier'
		]
		return backgrounds[roll - 1] || backgrounds[0]
	}

	// Head appearance table (d20, kindred-specific)
	_getHead(roll, kindredId) {
		if (kindredId === 'breggle') {
			const options = [
				'Short curved horns', 'Long straight horns', 'Spiral horns', 'Stubby horns', 'Proud horns',
				'Broken horn', 'Polished horns', 'Decorated horns', 'Ridged horns', 'Thick horns',
				'Pointed horns', 'Swept-back horns', 'Wide horns', 'Narrow horns', 'Asymmetric horns',
				'Battle-scarred horns', 'Painted horns', 'Jeweled horns', 'Notched horns', 'Pristine horns'
			]
			return options[roll - 1] || options[0]
		} else {
			const options = [
				'Bald', 'Braided', 'Curly', 'Disheveled', 'Dreadlocks',
				'Greasy', 'Long', 'Messy', 'Ponytail', 'Short',
				'Shaved', 'Tangled', 'Thin', 'Topknot', 'Wild',
				'Unkempt', 'Styled', 'Patchy', 'Receding', 'Flowing'
			]
			return options[roll - 1] || options[0]
		}
	}

	// Face appearance table (d20)
	_getFace(roll) {
		const options = [
			'Angular', 'Asymmetric', 'Bony', 'Chiseled', 'Delicate',
			'Elongated', 'Gaunt', 'Handsome', 'Honest', 'Jowly',
			'Narrow', 'Perfect', 'Pockmarked', 'Round', 'Scarred',
			'Sharp', 'Square', 'Sunken', 'Tattooed', 'Weather-beaten'
		]
		return options[roll - 1] || options[0]
	}

	// Body appearance table (d20, kindred-specific)
	_getBody(roll, kindredId) {
		if (kindredId === 'breggle' || kindredId === 'mossling') {
			const options = [
				'Stout', 'Barrel-chested', 'Stocky', 'Rotund', 'Solid',
				'Thick-set', 'Muscular', 'Burly', 'Heavyset', 'Compact',
				'Sturdy', 'Dense', 'Broad-shouldered', 'Well-built', 'Powerful',
				'Robust', 'Brawny', 'Athletic', 'Portly', 'Imposing'
			]
			return options[roll - 1] || options[0]
		} else {
			const options = [
				'Bony', 'Chubby', 'Flabby', 'Gaunt', 'Lanky',
				'Lithe', 'Muscular', 'Pudgy', 'Ripped', 'Scarred',
				'Scrawny', 'Short', 'Slender', 'Statuesque', 'Stocky',
				'Stout', 'Tall', 'Thin', 'Toned', 'Wiry'
			]
			return options[roll - 1] || options[0]
		}
	}

	// Demeanour table (d20)
	_getDemeanour(roll) {
		const options = [
			'Affable', 'Aggressive', 'Aloof', 'Anxious', 'Arrogant',
			'Cautious', 'Cheerful', 'Curious', 'Dour', 'Friendly',
			'Gruff', 'Honest', 'Nervous', 'Optimistic', 'Pessimistic',
			'Quiet', 'Rude', 'Serious', 'Shy', 'Suspicious'
		]
		return options[roll - 1] || options[0]
	}

	// Dress table (d20)
	_getDress(roll) {
		const options = [
			'Colorful', 'Drab', 'Eccentric', 'Elegant', 'Fashionable',
			'Filthy', 'Formal', 'Garish', 'Immaculate', 'Modest',
			'Outdated', 'Patched', 'Practical', 'Ragged', 'Rich',
			'Simple', 'Stained', 'Threadbare', 'Travel-worn', 'Unusual'
		]
		return options[roll - 1] || options[0]
	}

	// Speech table (d20)
	_getSpeech(roll) {
		const options = [
			'Blunt', 'Booming', 'Breathy', 'Crisp', 'Drawling',
			'Eloquent', 'Fast', 'Flowery', 'Formal', 'Gravelly',
			'High-pitched', 'Hoarse', 'Loud', 'Mumbly', 'Nasal',
			'Precise', 'Quiet', 'Rambling', 'Slow', 'Stuttering'
		]
		return options[roll - 1] || options[0]
	}

	// Beliefs table (d20)
	_getBeliefs(roll) {
		const options = [
			'Ancestor worship', 'Atheism', 'Church devotee', 'Cultist', 'Doom-sayer',
			'Fate believer', 'Fortune seeker', 'Heretic', 'Law upholder', 'Monastery follower',
			'Nature reverent', 'Nihilist', 'Omen reader', 'Philosopher', 'Saint devotee',
			'Skeptic', 'Superstitious', 'Traditionalist', 'Truth seeker', 'Zealot'
		]
		return options[roll - 1] || options[0]
	}

	// Desires table (d20)
	_getDesires(roll) {
		const options = [
			'Adventure', 'Comfort', 'Fame', 'Family', 'Freedom',
			'Glory', 'Gold', 'Honor', 'Knowledge', 'Love',
			'Peace', 'Power', 'Redemption', 'Respect', 'Revenge',
			'Safety', 'Status', 'Strength', 'Survival', 'Wisdom'
		]
		return options[roll - 1] || options[0]
	}
}
export default DolmenActor