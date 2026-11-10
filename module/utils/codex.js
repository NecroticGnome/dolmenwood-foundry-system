/* global fromUuid, game, ui */
/**
 * Open the codex (journal) entry referenced by a UUID in view mode.
 *
 * A JournalEntryPage UUID is opened through its parent JournalEntry sheet, scrolled to that
 * page, instead of through the page's own sheet (which is the page editor).
 * @param {string} uuid
 */
export async function openCodex(uuid) {
	if (!uuid) return
	const doc = await fromUuid(uuid)
	if (!doc) {
		ui.notifications.warn(game.i18n.format('DOLMEN.Notifications.CodexEntryNotFound', { uuid }))
		return
	}
	if (doc.documentName === 'JournalEntryPage') {
		doc.parent.sheet.render(true, { pageId: doc.id })
		return
	}
	doc.sheet?.render(true)
}
