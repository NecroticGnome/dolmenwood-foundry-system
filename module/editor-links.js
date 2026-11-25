/* global CONFIG, Hooks, foundry, game */

/**
 * A Dolmenwood drop-down in the rich text editor's menu, for inserting the system's roll links:
 * [text](save:key), (ability:key), (skill:key), (chance:target or target/die) and @Treasure[code].
 * The selected text becomes the link's label; with nothing selected, a default label is used.
 */

const SAVES = ['doom', 'ray', 'hold', 'blast', 'spell']
const ABILITIES = ['strength', 'intelligence', 'wisdom', 'dexterity', 'constitution', 'charisma']
const BASE_SKILLS = ['listen', 'search', 'survival']

export function registerEditorLinkMenu() {
	Hooks.on('getProseMirrorMenuDropDowns', (menu, config) => {
		const loc = key => game.i18n.localize(key)
		const entry = (action, title, link) => ({ action: `dolmenwood-${action}`, title, cmd: (state, dispatch, view) => insertLink(view, link) })
		const capital = s => s.charAt(0).toUpperCase() + s.slice(1)
		const skills = [...BASE_SKILLS, ...(CONFIG.DOLMENWOOD.extraSkills || [])]
		config.dolmenwood = {
			title: 'DOLMEN.Editor.Menu',
			cssClass: 'dolmenwood-links',
			icon: '<i class="dolmen-editor-icon" inert></i>',
			entries: [
				{ action: 'dolmenwood-chance', title: loc('DOLMEN.Editor.Chance'), cmd: (state, dispatch, view) => promptChance(view) },
				{
					action: 'dolmenwood-saves', title: loc('DOLMEN.Editor.Save'),
					children: SAVES.map(key => {
						const name = loc(`DOLMEN.Saves.${capital(key)}`)
						return entry(`save-${key}`, name, label => `[${label || game.i18n.format('DOLMEN.Editor.SaveLabel', { name })}](save:${key})`)
					})
				},
				{
					action: 'dolmenwood-abilities', title: loc('DOLMEN.Editor.Ability'),
					children: ABILITIES.map(key => {
						const name = loc(`DOLMEN.Abilities.${capital(key)}`)
						return entry(`ability-${key}`, name, label => `[${label || game.i18n.format('DOLMEN.Editor.CheckLabel', { name })}](ability:${key})`)
					})
				},
				{
					action: 'dolmenwood-skills', title: loc('DOLMEN.Editor.Skill'),
					children: skills.map(key => {
						const name = loc(`DOLMEN.Skills.${key}`)
						return entry(`skill-${key}`, name, label => `[${label || game.i18n.format('DOLMEN.Editor.CheckLabel', { name })}](skill:${key})`)
					})
				},
				{ action: 'dolmenwood-treasure', title: loc('DOLMEN.Editor.Treasure'), cmd: (state, dispatch, view) => promptTreasure(view) }
			]
		}
	})
}

/**
 * Replace the selection with a link built from the selected text
 * @param {EditorView} view
 * @param {function(string): string} link - The selected text (or '') => the link text to insert
 */
function insertLink(view, link) {
	if (view.isDestroyed) return
	const { state } = view
	const { from, to } = state.selection
	const label = state.doc.textBetween(from, to, ' ').trim().replace(/[[\]]/g, '')
	view.dispatch(state.tr.insertText(link(label), from, to))
	view.focus()
}

/** Ask for an X-in-Y chance, then insert [X-in-Y](chance:X) or (chance:X/Y) */
async function promptChance(view) {
	const result = await prompt('DOLMEN.Editor.Chance', `
		<div class="form-group"><label>${game.i18n.localize('DOLMEN.Editor.ChanceTarget')}</label>
			<input type="number" name="target" value="2" min="1" step="1" autofocus></div>
		<div class="form-group"><label>${game.i18n.localize('DOLMEN.Editor.ChanceDie')}</label>
			<input type="number" name="die" value="6" min="2" step="1"></div>`)
	if (!result) return
	const target = Math.max(1, parseInt(result.target) || 1)
	const die = Math.max(2, parseInt(result.die) || 6)
	insertLink(view, label => `[${label || `${target}-in-${die}`}](chance:${die === 6 ? target : `${target}/${die}`})`)
}

/** Ask for a treasure code, then insert @Treasure[code] (with the selection as its label) */
async function promptTreasure(view) {
	const result = await prompt('DOLMEN.Editor.Treasure', `
		<div class="form-group"><label>${game.i18n.localize('DOLMEN.Editor.TreasureCode')}</label>
			<input type="text" name="code" placeholder="C3, 2 magic, 1d6*10 gems" autofocus></div>`)
	const code = result?.code?.trim().replace(/[[\]{}]/g, '')
	if (!code) return
	insertLink(view, label => `@Treasure[${code}]${label ? `{${label.replace(/[{}]/g, '')}}` : ''}`)
}

/** A small form dialog; resolves with its fields, or null if closed */
async function prompt(title, content) {
	try {
		return await foundry.applications.api.DialogV2.prompt({
			window: { title },
			content,
			ok: { callback: (event, button) => Object.fromEntries(new FormData(button.form)) },
			rejectClose: false
		})
	} catch {
		return null
	}
}
