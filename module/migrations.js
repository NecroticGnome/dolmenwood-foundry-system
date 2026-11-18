/* global game, CONFIG, ui, foundry, Actor */

/**
 * World data migrations, for the system and for modules.
 *
 * Register in your init hook:
 *   CONFIG.DOLMENWOOD.migrations.push({
 *     id: 'my-module.fill-treasure',   // unique; prefix with your package id
 *     package: 'my-module',            // your package id (the system uses 'dolmenwood')
 *     version: '1.4.0',                // the release whose data this migration brings the world up to
 *     run: async () => { ... }         // must do nothing harmful to data that is already current
 *   })
 *
 * The world records, per package, the version its data is at (setting dolmenwood.dataVersions).
 * On the active GM's client after ready, migrations newer than that are run, oldest first; when all
 * of a package's succeed its record moves to the installed version. A brand-new world (no actors,
 * items, scenes or journals) records the installed versions and runs nothing. A world with data but
 * no record for a package (from before it had migrations, or the package newly enabled) runs them all.
 * A migration that throws is logged and reported, its package's record stays put, and it is retried
 * on the next load; finished ids (dolmenwood.migrationsDone) are not run again.
 *
 * Helpers for migrations are on game.dolmenwood.migrations, e.g. fillCreatureTreasure below.
 */

const { isNewerVersion } = foundry.utils

/** The installed version of a package (the system or a module). */
function installedVersion(id) {
	return id === game.system.id ? game.system.version : game.modules.get(id)?.version
}

/** Run the migrations this world's data needs (call in ready). */
export async function runMigrations() {
	if (!game.users.activeGM?.isSelf) return
	const versions = { ...game.settings.get('dolmenwood', 'dataVersions') }
	const done = { ...game.settings.get('dolmenwood', 'migrationsDone') }
	const all = (CONFIG.DOLMENWOOD.migrations ?? []).filter(m => m?.id && m.package && m.version && m.run)
	const packages = [...new Set([game.system.id, ...all.map(m => m.package)])]
	const fresh = !game.actors.size && !game.items.size && !game.scenes.size && !game.journal.size

	const pending = []
	for (const pkg of packages) {
		if (!(pkg in versions) && fresh) continue // new world: nothing to migrate
		const from = versions[pkg] ?? '0.0.0'
		pending.push(...all.filter(m => m.package === pkg && !done[m.id] && isNewerVersion(m.version, from))
			.sort((a, b) => (isNewerVersion(a.version, b.version) ? 1 : isNewerVersion(b.version, a.version) ? -1 : 0)))
	}
	if (pending.length) ui.notifications.info(game.i18n.format('DOLMEN.Migrations.Running', { count: pending.length }))

	const failed = new Set()
	for (const m of pending) {
		if (failed.has(m.package)) continue // keep a package's migrations in order
		try {
			console.log(`Dolmenwood | Running migration ${m.id} (${m.package} ${m.version})`)
			await m.run()
			done[m.id] = Date.now()
			await game.settings.set('dolmenwood', 'migrationsDone', done)
		} catch (err) {
			failed.add(m.package)
			console.error(`Dolmenwood | Migration ${m.id} failed`, err)
			ui.notifications.error(game.i18n.format('DOLMEN.Migrations.Failed', { id: m.id }))
		}
	}

	// Each package that finished is now at its installed version (or its newest migration, if later)
	let changed = false
	for (const pkg of packages) {
		if (failed.has(pkg)) continue
		const newest = all.filter(m => m.package === pkg).reduce((v, m) => (isNewerVersion(m.version, v) ? m.version : v), installedVersion(pkg) ?? '0.0.0')
		if (versions[pkg] !== newest) {
			versions[pkg] = newest
			changed = true
		}
	}
	if (changed) await game.settings.set('dolmenwood', 'dataVersions', versions)
	if (pending.length && !failed.size) ui.notifications.info(game.i18n.localize('DOLMEN.Migrations.Done'))
}

/* -------------------------------------------- */
/*  Filling world creatures from compendiums    */
/* -------------------------------------------- */

/**
 * Copy treasure into world creatures from the compendium creature each was imported from
 * (_stats.compendiumSource, or the older flags.core.sourceId). Only creatures with no treasure
 * entries are filled, so a GM's own entries are never replaced. Safe to run repeatedly: a module
 * that ships treasure data runs it from a migration registered for the release with that data.
 * @returns {Promise<number>} How many world actors were updated
 */
export async function fillCreatureTreasure() {
	const isEmpty = t => !t?.hoard?.length && !t?.carried?.length
	const bySource = new Map() // pack id → [{ actor, id }]
	for (const actor of game.actors) {
		const own = actor._source.system?.treasure
		if (!own || !isEmpty(own)) continue
		const uuid = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId
		const parsed = uuid ? foundry.utils.parseUuid(uuid) : null
		if (!parsed?.collection?.metadata || parsed.documentType !== 'Actor') continue
		const list = bySource.get(parsed.collection.collection) ?? []
		list.push({ actor, id: parsed.id })
		bySource.set(parsed.collection.collection, list)
	}
	const updates = []
	for (const [packId, list] of bySource) {
		const index = await game.packs.get(packId).getIndex({ fields: ['system.treasure'] })
		for (const { actor, id } of list) {
			const treasure = index.get(id)?.system?.treasure
			if (!isEmpty(treasure)) updates.push({ _id: actor.id, 'system.treasure': foundry.utils.deepClone(treasure) })
		}
	}
	if (updates.length) await Actor.implementation.updateDocuments(updates)
	return updates.length
}
