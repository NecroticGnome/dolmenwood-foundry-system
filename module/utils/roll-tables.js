/* global game */

/**
 * Find a RollTable by name, checking world tables first, then compendium packs.
 * @param {string} name - The table name to search for
 * @returns {Promise<RollTable|null>}
 */
export async function findRollTable(name) {
	const table = game.tables.getName(name)
	if (table) return table
	for (const pack of game.packs.filter(p => p.documentName === 'RollTable')) {
		const index = await pack.getIndex()
		const entry = index.find(e => e.name === name)
		if (entry) return pack.getDocument(entry._id)
	}
	return null
}

/**
 * Draw from a named RollTable silently (no chat message).
 * Returns both the result object and the Roll for custom chat messages.
 * @param {string} tableName - The table name to find and draw from
 * @returns {Promise<{result: object, roll: Roll}|null>}
 */
export async function drawFromTableRaw(tableName) {
	const table = await findRollTable(tableName)
	if (!table) return null
	const draw = await table.draw({ displayChat: false })
	const result = draw.results[0]
	if (!result) return null
	return { result, roll: draw.roll }
}

/**
 * Draw from a named RollTable and return the result text.
 * Posts the draw to chat via Foundry's standard table draw message.
 * @param {string} tableName - The table name to find and draw from
 * @returns {Promise<string|null>} The result text, or null if table not found
 */
export async function drawFromTable(tableName) {
	const table = await findRollTable(tableName)
	if (!table) return null
	const draw = await table.draw({ displayChat: true })
	const result = draw.results[0]
	if (!result) return null
	return result.description || result.name || null
}

/**
 * Draw from a named RollTable silently and return just the result text.
 * @param {string} tableName - The table name to find and draw from
 * @returns {Promise<string|null>} The result text, or null if table not found
 */
export async function drawFromTableSilent(tableName) {
	const draw = await drawFromTableRaw(tableName)
	if (!draw) return null
	return draw.result.description || draw.result.name || null
}
