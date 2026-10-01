/**
 * Parse markdown-style save links into clickable HTML anchors.
 * Syntax: [visible text](save:saveKey)
 * Example: [Save vs. Hold](save:hold) → <a class="inline-save-link" data-save="hold">Save vs. Hold</a>
 * @param {string} text - Text containing save link markdown
 * @returns {string} Text with save links replaced by HTML anchors
 */
export function parseSaveLinks(text) {
	if (!text) return text
	return text
		.replace(/\[([^\]]+)\]\(save:(\w+)\)/g, '<a class="inline-save-link" data-save="$2">$1</a>')
		.replace(/\[([^\]]+)\]\(chance:(\d+)\)/g, '<a class="inline-chance-link" data-target="$2">$1</a>')
}
