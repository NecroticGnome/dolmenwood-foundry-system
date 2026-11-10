/**
 * Remove unrevealed secret blocks from rich text before it goes into a chat card.
 * Foundry hides chat secrets from non-owners of the speaker, so the owning player would see them.
 * @param {string} html - Rich text from a ProseMirror field
 * @returns {string} The text without unrevealed secrets
 */
export function stripSecrets(html) {
	if (!html?.includes('secret')) return html
	const template = document.createElement('template')
	template.innerHTML = html
	template.content.querySelectorAll('section.secret:not(.revealed)').forEach(s => s.remove())
	return template.innerHTML
}

/**
 * Parse markdown-style roll links into clickable HTML anchors.
 * Syntax: [visible text](save:saveKey), (ability:abilityKey), (skill:skillKey), (chance:target)
 * Example: [Save vs. Hold](save:hold) → <a class="inline-save-link" data-save="hold">Save vs. Hold</a>
 * @param {string} text - Text containing save link markdown
 * @returns {string} Text with save links replaced by HTML anchors
 */
export function parseSaveLinks(text) {
	if (!text) return text
	return text
		.replace(/\[([^\]]+)\]\(save:(\w+)\)/g, '<a class="inline-save-link" data-save="$2">$1</a>')
		.replace(/\[([^\]]+)\]\(ability:(\w+)\)/g, '<a class="inline-ability-link" data-ability="$2">$1</a>')
		.replace(/\[([^\]]+)\]\(skill:(\w+)\)/g, '<a class="inline-skill-link" data-skill="$2">$1</a>')
		.replace(/\[([^\]]+)\]\(chance:(\d+)\)/g, '<a class="inline-chance-link" data-target="$2">$1</a>')
}
