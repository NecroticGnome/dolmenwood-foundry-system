/* global foundry, game */

/**
 * Ask how many of a stack to take or move, with a slider and a number box kept in step.
 * @param {Item} item - The stacked item
 * @param {number} available - How many there are
 * @param {object} [options]
 * @param {string} [options.title] - Title localization key (formatted with the item's name)
 * @param {string} [options.button] - Button label localization key
 * @param {string} [options.icon] - Button icon class
 * @returns {Promise<number|null>} The quantity (1 to available), or null when cancelled
 */
export async function promptItemQuantity(item, available, {
	title = 'DOLMEN.Inventory.MoveTitle',
	button = 'DOLMEN.Inventory.Move',
	icon = 'fa-solid fa-right-left'
} = {}) {
	const clamp = value => Math.min(Math.max(Math.floor(value), 1), available)
	const value = await foundry.applications.api.DialogV2.prompt({
		classes: ['dolmen-quantity-dialog'],
		window: { title: game.i18n.format(title, { name: item.name }) },
		position: { width: 340 },
		content: `
			<p class="quantity-label">${game.i18n.format('DOLMEN.Inventory.QuantityLabel', { max: available })}</p>
			<div class="quantity-fields">
				<input type="range" name="quantitySlider" value="${available}" min="1" max="${available}" step="1">
				<input type="number" name="quantity" value="${available}" min="1" max="${available}" step="1" autofocus>
			</div>`,
		render: (event, dialog) => {
			const { quantitySlider: slider, quantity: box } = dialog.element.querySelector('form').elements
			slider.addEventListener('input', () => {
				box.value = slider.value 
			})
			box.addEventListener('input', () => {
				if (Number.isFinite(box.valueAsNumber)) slider.value = clamp(box.valueAsNumber)
			})
			box.addEventListener('change', () => {
				box.value = clamp(box.valueAsNumber || available) 
			})
			box.select()
		},
		ok: {
			label: game.i18n.localize(button),
			icon,
			callback: (event, btn) => btn.form.elements.quantity.valueAsNumber
		},
		rejectClose: false
	})
	if (!Number.isFinite(value)) return null
	return clamp(value)
}
