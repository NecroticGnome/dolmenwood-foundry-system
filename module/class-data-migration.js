/* global game, ui, CONFIG */

/**
 * Class and Kindred items are copied onto each Adventurer, so corrections to the compendium rules
 * data (progression tables, traits, uses per day) never reach existing characters. When the
 * compendium data changes, bump CLASS_DATA_VERSION: the GM's next login replaces each embedded
 * Class and Kindred item's rules data from the compendium and moves attack, saves and class skills
 * that still match the old tables onto the new ones. Hand-edited values are left alone.
 */
export const CLASS_DATA_VERSION = 1
const SETTING = 'classDataVersion'
const SAVES = ['doom', 'ray', 'hold', 'blast', 'spell']

export function registerClassDataSetting() {
	game.settings.register('dolmenwood', SETTING, {
		scope: 'world',
		config: false,
		type: Number,
		default: 0
	})
}

export async function migrateClassData() {
	if ((game.settings.get('dolmenwood', SETTING) || 0) >= CLASS_DATA_VERSION) return
	const load = async id => (await game.packs.get(id)?.getDocuments()) ?? []
	const classes = new Map((await load('dolmenwood.classes')).map(c => [c.system.classId, c]))
	const kindreds = new Map((await load('dolmenwood.kindreds')).map(k => [k.system.kindredId, k]))
	if (!classes.size && !kindreds.size) return

	let count = 0
	for (const actor of game.actors.filter(a => a.type === 'Adventurer')) {
		try {
			if (await refreshActor(actor, classes, kindreds)) count++
		} catch (err) {
			console.error(`Dolmenwood | Could not refresh class data for "${actor.name}"`, err)
		}
	}
	await game.settings.set('dolmenwood', SETTING, CLASS_DATA_VERSION)
	console.log(`Dolmenwood | Refreshed class and kindred data on ${count} character(s)`)
	if (count) ui.notifications.info(game.i18n.format('DOLMEN.Notifications.ClassDataRefreshed', { count }))
}

/**
 * Replace a source item's system data with the compendium version, keeping its codex link
 * @returns {object|null} Embedded item update, or null when nothing changed
 */
function itemRefresh(item, compendiumItem) {
	if (!item || !compendiumItem) return null
	const fresh = compendiumItem.toObject().system
	fresh.codexUuid = item.system.codexUuid || fresh.codexUuid
	const current = item.toObject().system
	if (JSON.stringify(current) === JSON.stringify(fresh)) return null
	return { _id: item.id, system: fresh }
}

async function refreshActor(actor, classes, kindreds) {
	const classItem = actor.getClassItem()
	const kindredItem = actor.getKindredItem()
	const classUpdate = itemRefresh(classItem, classes.get(classItem?.system.classId))
	const kindredUpdate = itemRefresh(kindredItem, kindreds.get(kindredItem?.system.kindredId))
	const itemUpdates = [classUpdate, kindredUpdate].filter(Boolean)
	if (!itemUpdates.length) return false

	const actorUpdates = classUpdate ? progressionUpdates(actor, classItem.system, classUpdate.system) : {}
	// Replace the whole system object so traits and tables removed from the compendium go too
	await actor.updateEmbeddedDocuments('Item', itemUpdates, { recursive: false })
	if (Object.keys(actorUpdates).length) await actor.update(actorUpdates)
	return true
}

/**
 * Attack, saves and class skills for the actor's level under the new tables, for values that
 * still match the old tables
 */
function progressionUpdates(actor, oldClass, newClass) {
	const level = Math.min(Math.max(actor.system.level || 1, 1), CONFIG.DOLMENWOOD.maxLevel)
	const updates = {}
	const moved = (current, oldTable, newTable) => {
		const oldValue = oldTable?.[level - 1]
		const newValue = newTable?.[level - 1]
		return newValue !== undefined && newValue !== oldValue && current === oldValue ? newValue : undefined
	}

	const attack = moved(actor.system.attack, oldClass.attackProgression, newClass.attackProgression)
	if (attack !== undefined) updates['system.attack'] = attack
	for (const save of SAVES) {
		const value = moved(actor.system.saves?.[save], oldClass.saveProgressions?.[save], newClass.saveProgressions?.[save])
		if (value !== undefined) updates[`system.saves.${save}`] = value
	}

	// Class skills the old item lacked (e.g. the Elf's Detect Magic)
	const skills = actor.system.extraSkills || []
	const missing = (newClass.classSkills || []).filter(id => !(oldClass.classSkills || []).includes(id)
		&& !skills.some(s => s.id === id))
	const room = (CONFIG.DOLMENWOOD.maxExtraSkills || 6) - skills.length
	if (missing.length && room > 0) {
		const added = missing.slice(0, room).map(id => ({
			id,
			target: actor.system.customizeSkills ? 6 : (newClass.skillProgressions?.[id]?.[level - 1] ?? 6)
		}))
		updates['system.extraSkills'] = [...skills, ...added]
	}
	return updates
}
