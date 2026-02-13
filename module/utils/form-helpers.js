/**
 * Rewrite a comma-separated string in a flat object as indexed entries.
 * e.g. "system.languages" = "woldish, elvish" → "system.languages.0" = "woldish", "system.languages.1" = "elvish"
 * @param {object} obj - Flat key-value object to modify in-place
 * @param {string} key - The field key to rewrite
 */
export function rewriteCSV(obj, key) {
	if (typeof obj[key] !== 'string') return
	const items = obj[key].split(',').map(s => s.trim()).filter(s => s.length > 0)
	delete obj[key]
	items.forEach((item, i) => {
		obj[`${key}.${i}`] = item
	})
}

/**
 * Extract JSON string fields from a flat object, parse them, and return as an object.
 * Removes the keys from the flat object so expandObject won't corrupt arrays into objects.
 * @param {object} flat - Flat key-value object to modify in-place
 * @param {string[]} fields - Field names (without prefix)
 * @param {string} prefix - Key prefix (e.g. 'system')
 * @returns {object} Parsed values keyed by field name
 */
export function extractJSON(flat, fields, prefix) {
	const result = {}
	for (const field of fields) {
		const key = `${prefix}.${field}`
		if (typeof flat[key] !== 'string') continue
		try {
			result[field] = JSON.parse(flat[key])
			delete flat[key]
		} catch { /* keep original value */ }
	}
	return result
}
