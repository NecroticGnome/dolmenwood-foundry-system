/* global game, Hooks */
// "Hide Journal Art": each user can hide the books' artwork (class dolmenwood-art) in the journals
// for a more data-oriented view. Crests, maps and diagrams stay; the CSS is in styles/journal.css.
const HIDE_ART = 'hideJournalArt'

function applyHideArt(hide) {
	document.body.classList.toggle('dolmenwood-hide-art', hide)
}

export function registerJournalArt() {
	game.settings.register('dolmenwood', HIDE_ART, {
		name: 'DOLMEN.HideArt.Name',
		hint: 'DOLMEN.HideArt.Hint',
		scope: 'user',
		config: true,
		type: Boolean,
		default: false,
		onChange: applyHideArt
	})
	Hooks.once('ready', () => applyHideArt(game.settings.get('dolmenwood', HIDE_ART)))
}
