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
 * Rewrite a JSON string in a flat object as flattened dot-notation entries.
 * e.g. "system.traits" = '{"a":1}' → "system.traits.a" = 1
 * @param {object} obj - Flat key-value object to modify in-place
 * @param {string} key - The field key to rewrite
 */
export function rewriteJSON(obj, key) {
	if (typeof obj[key] !== 'string') return
	try {
		const parsed = JSON.parse(obj[key])
		delete obj[key]
		flattenToObject(obj, key, parsed)
	} catch { /* keep original value */ }
}

/**
 * Recursively flatten a nested value into dot-notation entries on a plain object.
 * @param {object} obj - The target object to populate
 * @param {string} prefix - The dot-notation prefix
 * @param {*} value - The value to flatten
 */
function flattenToObject(obj, prefix, value) {
	if (Array.isArray(value)) {
		value.forEach((item, i) => flattenToObject(obj, `${prefix}.${i}`, item))
	} else if (value !== null && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			flattenToObject(obj, `${prefix}.${k}`, v)
		}
	} else {
		obj[prefix] = value ?? ''
	}
}
