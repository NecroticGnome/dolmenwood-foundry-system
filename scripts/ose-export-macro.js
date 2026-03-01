/* global game, foundry, ui */

/**
 * OSE World Export Macro
 *
 * Run this macro in your OSE world (Foundry VTT).
 * It exports all world-level data to a JSON file that can be
 * imported into a Dolmenwood world.
 *
 * Usage:
 *   1. Open your OSE world in Foundry VTT
 *   2. Create a new Script macro and paste this entire file
 *   3. Run the macro — a JSON file will download automatically
 */

// ---------------------------------------------------------------------------
// Collect world-level data
// ---------------------------------------------------------------------------

const _thisMacroId = this?.id

async function exportOSEWorld() {
	const worldId = game.world.id
	const systemId = game.system.id

	// Confirmation dialog
	const actorCount = game.actors.size
	const itemCount = game.items.size
	const sceneCount = game.scenes.size
	const journalCount = game.journal.size
	const tableCount = game.tables.size
	const macroCount = game.macros.size - (_thisMacroId && game.macros.has(_thisMacroId) ? 1 : 0)
	const playlistCount = game.playlists.size
	const cardCount = game.cards?.size ?? 0

	const summary = [
		`<p>This will export all data from world <strong>${worldId}</strong>:</p>`,
		"<ul>",
		`<li>Actors: ${actorCount}</li>`,
		`<li>Items: ${itemCount}</li>`,
		`<li>Scenes: ${sceneCount}</li>`,
		`<li>Journal Entries: ${journalCount}</li>`,
		`<li>Rollable Tables: ${tableCount}</li>`,
		`<li>Macros: ${macroCount}</li>`,
		`<li>Playlists: ${playlistCount}</li>`,
		cardCount > 0 ? `<li>Card Stacks: ${cardCount}</li>` : "",
		"</ul>",
		"<p>A JSON file will be downloaded to your browser.</p>",
	].filter(Boolean).join("\n")

	const proceed = await foundry.applications.api.DialogV2.confirm({
		window: { title: "OSE World Export" },
		content: summary,
		yes: { label: "Export" },
		no: { label: "Cancel" },
	})
	if (!proceed) return

	ui.notifications.info("Exporting OSE world data...")

	// Serialize world-level collections
	const world = {
		folders: game.folders.contents.map(f => f.toObject()),
		actors: game.actors.contents.map(a => a.toObject()),
		items: game.items.contents.map(i => i.toObject()),
		scenes: game.scenes.contents.map(s => s.toObject()),
		journal: game.journal.contents.map(j => j.toObject()),
		tables: game.tables.contents.map(t => t.toObject()),
		macros: game.macros.contents.filter(m => m.id !== _thisMacroId).map(m => m.toObject()),
		playlists: game.playlists.contents.map(p => p.toObject()),
		cards: game.cards?.contents.map(c => c.toObject()) ?? [],
	}

	// Assemble export object
	const exportData = {
		format: "ose-to-dolmenwood-v1",
		exportedAt: new Date().toISOString(),
		systemId,
		worldId,
		world,
		packs: {},
	}

	// Trigger file download
	const json = JSON.stringify(exportData)
	const filename = `ose-export-${worldId}-${new Date().toISOString().slice(0, 10)}.json`
	foundry.utils.saveDataToFile(json, "application/json", filename)

	// Summary notification
	ui.notifications.info(
		`Export complete! ${actorCount} actors, ${itemCount} items, ${sceneCount} scenes, `
		+ `${journalCount} journals, ${tableCount} tables, ${macroCount} macros, `
		+ `${playlistCount} playlists, ${cardCount} cards`
	)
}

exportOSEWorld()
