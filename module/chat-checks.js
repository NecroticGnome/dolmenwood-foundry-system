/* global game, canvas, ui */
/**
 * Inline ability and skill check links: [text](ability:strength), [text](skill:listen).
 * Clicking a link rolls the check for every controlled adventurer token.
 */
import { createContextMenu } from './sheet/context-menu.js'
import { getTraitRollOptions } from './sheet/trait-helpers.js'
import { performAbilityCheck, performSkillCheck } from './sheet/roll-handlers.js'

const ABILITY_ALIASES = {
	str: 'strength',
	int: 'intelligence',
	wis: 'wisdom',
	dex: 'dexterity',
	con: 'constitution',
	cha: 'charisma'
}

/**
 * Resolve a link key to an ability key (accepts full names and str/int/wis/dex/con/cha).
 * @param {string} key
 * @returns {string}
 */
function resolveAbilityKey(key) {
	const lower = key.toLowerCase()
	return ABILITY_ALIASES[lower] || lower
}

/**
 * Get an adventurer's skill target: base skills from system.final, extra skills
 * from system.extraSkills plus their adjustment (as shown on the Stats tab).
 * @param {Actor} actor
 * @param {string} skillKey
 * @returns {number|null}
 */
function getSkillTarget(actor, skillKey) {
	const base = actor.system.final?.skills?.[skillKey]
	if (base !== undefined) return base
	const extra = actor.system.extraSkills?.find(s => s.id === skillKey && !s.customName)
	if (!extra) return null
	return extra.target + (actor.system.adjustments?.skills?.[skillKey] || 0)
}

/**
 * Controlled token actors that can make the check.
 * @param {string} type - 'ability' or 'skill'
 * @param {string} key
 * @returns {Actor[]|null} null when no token is controlled
 */
function getCheckActors(type, key) {
	const controlled = canvas.tokens?.controlled || []
	if (controlled.length === 0) return null
	return controlled
		.map(token => token.actor)
		.filter(actor => actor?.type === 'Adventurer')
		.filter(actor => type === 'ability'
			? actor.system.final?.abilities?.[key]?.score !== undefined
			: getSkillTarget(actor, key) !== null)
}

/**
 * Roll the check for one actor, applying the chosen trait option if the actor has it.
 * @param {Actor} actor
 * @param {string} type - 'ability' or 'skill'
 * @param {string} key
 * @param {string|null} optionId - Selected trait roll option
 */
function rollCheckForActor(actor, type, key, optionId) {
	const option = optionId
		? getTraitRollOptions(actor, `${type === 'ability' ? 'abilities' : 'skills'}.${key}`).find(o => o.id === optionId)
		: null
	const bonus = option?.bonus || 0
	const name = option?.name || null
	if (type === 'ability') return performAbilityCheck(actor, key, bonus, name)
	return performSkillCheck(actor, key, getSkillTarget(actor, key), bonus, name)
}

/**
 * Handle a click on an inline ability or skill link. Rolls straight away, or first
 * offers the trait roll options of the controlled adventurers.
 * @param {string} type - 'ability' or 'skill'
 * @param {string} rawKey - Key from the link
 * @param {object} position - Screen position {top, left}
 */
export function onInlineCheckClick(type, rawKey, position) {
	const key = type === 'ability' ? resolveAbilityKey(rawKey) : rawKey
	const actors = getCheckActors(type, key)
	if (actors === null) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.SaveRoll.NoCheckTokens'))
		return
	}
	if (actors.length === 0) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.SaveRoll.NoCheckActors'))
		return
	}

	// Trait roll options across the actors; the bonus is shown only when it is
	// the same for every actor that has the option
	const options = new Map()
	const target = `${type === 'ability' ? 'abilities' : 'skills'}.${key}`
	for (const actor of actors) {
		for (const option of getTraitRollOptions(actor, target)) {
			const existing = options.get(option.id)
			if (!existing) options.set(option.id, { ...option })
			else if (existing.bonus !== option.bonus) existing.bonus = null
		}
	}

	const rollAll = (optionId) => {
		for (const actor of actors) rollCheckForActor(actor, type, key, optionId)
	}

	if (options.size === 0) {
		rollAll(null)
		return
	}

	let html = `
		<div class="weapon-menu-item" data-option-id="">
			<i class="fas fa-dice"></i>
			<span class="weapon-name">${game.i18n.localize('DOLMEN.Roll.NormalRoll')}</span>
		</div>
	`
	for (const option of options.values()) {
		const bonusStr = option.bonus === null ? '' : option.bonus >= 0 ? `+${option.bonus}` : `${option.bonus}`
		html += `
			<div class="weapon-menu-item" data-option-id="${option.id}">
				<i class="fas fa-sparkles"></i>
				<span class="weapon-name">${option.name}</span>
				<span class="weapon-damage">${bonusStr}</span>
			</div>
		`
	}

	createContextMenu(document.body, {
		html,
		position,
		onItemClick: (item, menu) => {
			menu.remove()
			rollAll(item.dataset.optionId || null)
		}
	})
}

/**
 * TextEditor enricher factory for inline check links.
 * @param {string} type - 'ability' or 'skill'
 * @returns {Function} Enricher receiving a match with [1]=label, [2]=key
 */
function createCheckLinkEnricher(type) {
	return (match) => {
		const a = document.createElement('a')
		a.classList.add(`inline-${type}-link`)
		a.dataset[type] = match[2]
		a.textContent = match[1]
		return a
	}
}

export const createAbilityLinkEnricher = createCheckLinkEnricher('ability')
export const createSkillLinkEnricher = createCheckLinkEnricher('skill')
