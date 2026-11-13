/* global game, Hooks, foundry, Roll, ChatMessage, CONFIG */

import { TERRAIN_CHANCE, losingDirectionChance, inSix, encounterDistance } from './travel-rules.js'
import { findRollTable } from '../utils/roll-tables.js'

const { DialogV2 } = foundry.applications.api
const { escapeHTML } = foundry.utils

/** Chances to find the path again once lost: hunter (DCB p113), guide's Wayfinding (Specialist Services, DPB). */
const FIND_PATH_CHANCE = { hunter: 3, guide: 4 }

/** Unseasons in which an encounter is with special creatures on 2-in-6 (DCB p111). */
const UNSEASON_ENCOUNTER_CHANCE = { chame: 2, vague: 2 }

const t = (key, data) => data ? game.i18n.format(`DOLMEN.Travel.${key}`, data) : game.i18n.localize(`DOLMEN.Travel.${key}`)

/**
 * Whether a party member (from the party viewer) has the hunter class.
 * @returns {boolean}
 */
function partyHasHunter() {
	const entries = game.settings.get('dolmenwood', 'partyMembers') ?? []
	return entries.some(({ sceneId, tokenId }) => {
		const actor = game.scenes.get(sceneId)?.tokens.get(tokenId)?.actor
		if (!actor) return false
		const classItem = actor.items.find(i => i.type === 'Class')
		return (classItem?.system?.classId || actor.system?.class) === 'hunter'
	})
}

/** Whether today's weather has the poor visibility (V) effect. */
function weatherHasPoorVisibility() {
	return (game.settings.get('dolmenwood', 'currentWeather')?.effects ?? '').includes('V')
}

/**
 * Roll 1d6 against an X-in-6 chance.
 * @returns {Promise<{roll: Roll, success: boolean}>}
 */
async function rollInSix(chance) {
	const roll = await new Roll('1d6').evaluate()
	return { roll, success: inSix(roll.total, chance) }
}

/**
 * The selected hex's Lost/Encounters chance from a module's wilderness encounter roll.
 * @param {'day'|'night'} time
 * @returns {Promise<number|null>}
 */
async function hexChance(time) {
	const chance = await game.dolmenwood.getWildernessEncounterChance({ time })
	return Number.isInteger(chance) ? chance : null
}

/** Inline roll HTML for a chat card. */
async function anchor(roll) {
	return (await roll.toAnchor({ classes: ['encounter-inline-roll'] })).outerHTML
}

/** One result row, in the dungeon tracker's card style. */
function section(rollHtml, target, label, cls = '') {
	return `
		<div class="roll-section ${cls}">
			<div class="roll-result force-d6-icon">${rollHtml}</div>
			${target ? `<span class="roll-target">${target}</span>` : ''}
			<span class="roll-label ${cls}">${label}</span>
		</div>`
}

/** A heading row inside the card. */
function heading(text) {
	return `<div class="roll-section travel-heading"><span class="roll-label">${text}</span></div>`
}

/** A plain text row inside the card. */
function note(text) {
	return `<div class="roll-section travel-note"><span class="roll-label">${text}</span></div>`
}

/**
 * Roll a Random Encounter check, and when one occurs, the unseason check and distance.
 * @returns {Promise<{html: string, rolls: Roll[]}>}
 */
async function encounterCheck(title, chance, poorVisibility, unseason) {
	const rolls = []
	let html = heading(title)
	const check = await rollInSix(chance)
	rolls.push(check.roll)
	const label = game.i18n.localize(check.success ? 'DOLMEN.DungeonTracker.EncounterYes' : 'DOLMEN.DungeonTracker.EncounterNo')
	html += section(await anchor(check.roll), `${chance}-in-6`, label, check.success ? 'failure' : 'success')
	if (!check.success) return { html, rolls }

	const unseasonChance = UNSEASON_ENCOUNTER_CHANCE[unseason]
	if (unseasonChance) {
		const special = await rollInSix(unseasonChance)
		rolls.push(special.roll)
		const specialLabel = special.success ? t(`Unseason.${unseason}`) : t('Unseason.Normal')
		html += section(await anchor(special.roll), `${unseasonChance}-in-6`, specialLabel)
	}

	const distanceRoll = await new Roll('2d6').evaluate()
	rolls.push(distanceRoll)
	const feet = encounterDistance(distanceRoll.total, poorVisibility)
	const distanceLabel = t(poorVisibility ? 'DistanceHalved' : 'Distance', { feet })
	html += `
		<div class="roll-section">
			<div class="roll-result">${await anchor(distanceRoll)}</div>
			<span class="roll-label">${distanceLabel}</span>
		</div>`
	return { html, rolls }
}

/**
 * Run the day's Travel Procedure checks and whisper the results to the Referee.
 * Order follows Travel Procedure Per Day (DPB): weather, losing direction, daytime Random
 * Encounter, then the nighttime Random Encounter if the party sets camp.
 *
 * When a module provides the wilderness encounter roll (CONFIG.DOLMENWOOD.wildernessEncounter), it
 * rolls the encounters and posts its own cards after this one; otherwise a bare check is rolled here.
 * The chance defaults to the selected hex's daytime chance. If it is not changed from that, the
 * module's nighttime roll uses the hex's own nighttime chance.
 *
 * Modules can adjust the options in the `dolmenwood.preTravelProcedure` hook, or return false
 * from it to cancel.
 *
 * @param {object} [options]
 * @param {'road'|'track'|'wild'} [options.route='wild']
 * @param {number} [options.chance] - The Lost/Encounters X-in-6 chance (default: the hex's, else 1)
 * @param {boolean} [options.noRisk] - No risk of getting lost (reliable guide, road or river, obvious landmark)
 * @param {boolean} [options.poorVisibility] - Defaults to today's weather
 * @param {boolean} [options.darkness]
 * @param {boolean} [options.hunter] - Defaults to whether the party viewer has a hunter
 * @param {boolean} [options.guide] - A hired guide's Wayfinding
 * @param {boolean} [options.camp] - Also roll the nighttime Random Encounter
 * @param {boolean} [options.fire] - A campfire at night (the module's Encounter Type: Fire / No Fire)
 * @returns {Promise<object|null>} The results, or null if not run. dayEncounter and nightEncounter
 *   are booleans for the bare check, or whatever the module's roll returned.
 */
export async function rollTravelProcedure(options = {}) {
	if (!game.user.isGM) return null
	const hexDay = await hexChance('day')
	const opts = {
		route: 'wild',
		chance: hexDay ?? TERRAIN_CHANCE.light,
		noRisk: false,
		poorVisibility: weatherHasPoorVisibility(),
		darkness: false,
		hunter: partyHasHunter(),
		guide: false,
		camp: false,
		fire: false,
		...options
	}
	if (Hooks.call('dolmenwood.preTravelProcedure', opts) === false) return null

	const unseason = game.settings.get('dolmenwood', 'activeUnseason') || null
	const visibilityOnTracks = game.settings.get('dolmenwood', 'poorVisibilityOnTracks')
	const rolls = []
	const results = { lost: false, foundPath: false, consequence: null, dayEncounter: false, nightEncounter: false }
	let body = ''

	// Weather
	const weather = game.settings.get('dolmenwood', 'currentWeather')
	body += heading(game.i18n.localize('DOLMEN.Calendar.Weather.ChatTitle'))
	body += note(weather?.text ? escapeHTML(weather.text) + (weather.effects ? ` (${escapeHTML(weather.effects)})` : '') : t('NoWeather'))

	// Losing direction
	body += heading(t('LosingDirection'))
	const lostChance = losingDirectionChance({ ...opts, visibilityOnTracks })
	if (lostChance === 0) {
		body += note(t(opts.route === 'road' ? 'NoRiskRoad' : 'NoRiskNoted'))
	} else {
		const lost = await rollInSix(lostChance)
		rolls.push(lost.roll)
		results.lost = lost.success
		body += section(await anchor(lost.roll), `${lostChance}-in-6`, t(lost.success ? 'Lost' : 'NotLost'), lost.success ? 'failure' : 'success')

		if (lost.success) {
			for (const who of ['hunter', 'guide']) {
				if (!opts[who]) continue
				const find = await rollInSix(FIND_PATH_CHANCE[who])
				rolls.push(find.roll)
				if (find.success) results.foundPath = true
				body += section(await anchor(find.roll), `${FIND_PATH_CHANCE[who]}-in-6`,
					t(find.success ? `FindPath.${who}` : `NoPath.${who}`), find.success ? 'success' : 'failure')
			}
			if (!results.foundPath) {
				const table = await findRollTable(CONFIG.DOLMENWOOD.gettingLostTableName, { quiet: true })
				if (table) {
					const draw = await table.draw({ displayChat: false })
					const result = draw.results[0]
					if (draw.roll) rolls.push(draw.roll)
					if (result) {
						results.consequence = result.description || result.name || ''
						body += note(`<strong>${escapeHTML(table.name)} (${draw.roll?.total ?? ''}):</strong> ${results.consequence}`)
					}
				}
			}
		}
	}

	// Daytime and nighttime Random Encounters
	const moduleRoll = game.dolmenwood.hasWildernessEncounter()
	const times = opts.camp ? ['day', 'night'] : ['day']
	for (const time of times) {
		const title = t(time === 'day' ? 'DaytimeEncounter' : 'NighttimeEncounter')
		if (moduleRoll) {
			body += heading(title) + note(t('RolledSeparately'))
			continue
		}
		const check = await encounterCheck(title, opts.chance, opts.poorVisibility, unseason)
		body += check.html
		rolls.push(...check.rolls)
		results[`${time}Encounter`] = inSix(check.rolls[0].total, opts.chance)
	}

	const routeLabel = t(`Route.${opts.route}`)
	await ChatMessage.create({
		content: `
		<div class="dolmen encounter-roll travel-procedure">
			<div class="roll-header">
				<i class="fa-solid fa-route"></i>
				<div class="roll-info">
					<h3>${t('Title')}</h3>
					<span class="roll-type">${routeLabel}, ${t('ChanceLabel', { chance: opts.chance })}</span>
				</div>
			</div>
			<div class="roll-body">${body}</div>
		</div>`,
		rolls,
		sound: CONFIG.sounds.dice,
		speaker: { alias: t('Title') },
		whisper: game.users.filter(u => u.isGM).map(u => u.id)
	})

	// The module posts its own cards, after this one so the day reads in order
	if (moduleRoll) {
		const travel = opts.route === 'wild' ? 'wild' : 'road'
		const chanceChanged = opts.chance !== hexDay
		for (const time of times) {
			const rollOptions = { time, travel, poorVisibility: opts.poorVisibility }
			if (time === 'day' || chanceChanged) rollOptions.chance = opts.chance
			if (time === 'night') rollOptions.fire = opts.fire
			results[`${time}Encounter`] = await game.dolmenwood.rollWildernessEncounter(rollOptions)
		}
	}
	return { ...results, lostChance, options: opts }
}

/**
 * Ask the Referee for today's travel conditions, then run the Travel Procedure.
 * Remembers the last answers, except for weather, the party's hunter and the selected hex's
 * chance, which are read fresh.
 */
export async function openTravelProcedureDialog() {
	if (!game.user.isGM) return
	const last = game.settings.get('dolmenwood', 'travelProcedureLast') ?? {}
	const v = {
		route: last.route ?? 'wild',
		chance: (await hexChance('day')) ?? last.chance ?? TERRAIN_CHANCE.light,
		noRisk: last.noRisk ?? false,
		darkness: last.darkness ?? false,
		guide: last.guide ?? false,
		camp: last.camp ?? false,
		fire: last.fire ?? false,
		poorVisibility: weatherHasPoorVisibility(),
		hunter: partyHasHunter()
	}
	const checked = on => on ? ' checked' : ''
	const routeOptions = ['road', 'track', 'wild']
		.map(r => `<option value="${r}"${r === v.route ? ' selected' : ''}>${t(`Route.${r}`)}</option>`).join('')
	let terrainOptions = Object.entries(TERRAIN_CHANCE)
		.map(([key, chance]) => `<option value="${chance}"${chance === v.chance ? ' selected' : ''}>${t(`Terrain.${key}`, { chance })}</option>`).join('')
	// A hex can have a chance outside the terrain defaults
	if (!Object.values(TERRAIN_CHANCE).includes(v.chance)) {
		terrainOptions += `<option value="${v.chance}" selected>${t('ChanceLabel', { chance: v.chance })}</option>`
	}
	const box = (name, on) => `
		<label class="checkbox"><input type="checkbox" name="${name}"${checked(on)}> ${t(`Field.${name}`)}</label>`

	const content = `
		<div class="dolmen travel-procedure-form">
			<div class="form-group"><label>${t('Field.route')}</label><select name="route">${routeOptions}</select></div>
			<div class="form-group"><label>${t('Field.chance')}</label><select name="chance">${terrainOptions}</select></div>
			${box('noRisk', v.noRisk)}
			${box('poorVisibility', v.poorVisibility)}
			${box('darkness', v.darkness)}
			${box('hunter', v.hunter)}
			${box('guide', v.guide)}
			${box('camp', v.camp)}
			${box('fire', v.fire)}
		</div>`

	const form = await DialogV2.wait({
		window: { title: t('Title') },
		content,
		buttons: [
			{
				action: 'roll',
				label: t('Roll'),
				icon: 'fa-solid fa-dice',
				default: true,
				callback: (event, button) => {
					const el = button.form.elements
					return {
						route: el.route.value,
						chance: Number(el.chance.value),
						noRisk: el.noRisk.checked,
						poorVisibility: el.poorVisibility.checked,
						darkness: el.darkness.checked,
						hunter: el.hunter.checked,
						guide: el.guide.checked,
						camp: el.camp.checked,
						fire: el.fire.checked
					}
				}
			},
			{ action: 'cancel', label: game.i18n.localize('DOLMEN.Cancel'), icon: 'fa-solid fa-times' }
		],
		rejectClose: false
	})
	if (!form || typeof form !== 'object') return
	const { route, chance, noRisk, darkness, guide, camp, fire } = form
	await game.settings.set('dolmenwood', 'travelProcedureLast', { route, chance, noRisk, darkness, guide, camp, fire })
	return rollTravelProcedure(form)
}
