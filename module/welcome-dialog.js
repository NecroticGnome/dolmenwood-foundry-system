/* global foundry, game */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
const TextEditor = foundry.applications.ux.TextEditor.implementation

class WelcomeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'dolmenwood-welcome',
		classes: ['dolmen', 'welcome-dialog'],
		tag: 'div',
		position: {
			width: 440,
			height: 'auto'
		},
		window: {
			title: 'DOLMEN.Welcome.Title',
			resizable: false
		},
		actions: {
			doNotShow: WelcomeDialog.#onDoNotShow
		}
	}

	static PARTS = {
		content: {
			template: 'systems/dolmenwood/templates/dialog-welcome.html'
		}
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		context.heading = await TextEditor.enrichHTML(game.i18n.localize('DOLMEN.Welcome.Title'))
		context.info = await TextEditor.enrichHTML(game.i18n.localize('DOLMEN.Welcome.Info'))
		context.credits = await TextEditor.enrichHTML(game.i18n.localize('DOLMEN.Welcome.Credits'))
		context.copyright = await TextEditor.enrichHTML(game.i18n.localize('DOLMEN.Welcome.Copyright'))
		context.doNotShowLabel = game.i18n.localize('DOLMEN.Welcome.DoNotShow')
		context.closeLabel = game.i18n.localize('DOLMEN.Welcome.Close')
		return context
	}

	static #onDoNotShow(event) {
		const checked = event.target.checked
		game.settings.set('dolmenwood', 'showWelcomeDialog', !checked)
	}

	_onRender(context, options) {
		super._onRender(context, options)
		const closeBtn = this.element.querySelector('.welcome-close-btn')
		if (closeBtn) {
			closeBtn.addEventListener('click', () => this.close())
		}
	}
}

export default WelcomeDialog
