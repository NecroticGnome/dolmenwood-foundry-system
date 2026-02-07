/**
 * Context Menu Utility
 * Generic factory for creating positioned context menus in the sheet.
 */

/**
 * Create and display a context menu.
 * @param {DolmenSheet} sheet - The sheet instance (for appending to sheet element)
 * @param {object} config - Menu configuration
 * @param {string} config.html - HTML content for the menu
 * @param {object} config.position - Position {top, left}
 * @param {Function} config.onItemClick - Callback when menu item clicked, receives (menuItem, menu)
 * @param {Element} [config.excludeFromClose] - Element to exclude from close detection
 * @returns {HTMLElement} The menu element
 */
export function createContextMenu(sheet, { html, position, onItemClick, excludeFromClose = null }) {
	// Remove any existing context menu
	document.querySelector('.dolmen-weapon-context-menu')?.remove()

	// Create the menu element
	const menu = document.createElement('div')
	menu.className = 'dolmen-weapon-context-menu'
	menu.innerHTML = html

	// Position the menu
	menu.style.position = 'fixed'
	menu.style.top = `${position.top}px`
	menu.style.left = `${position.left}px`

	// Add to sheet
	sheet.element.appendChild(menu)

	// Adjust position after rendering (menu appears to left of click point)
	const menuRect = menu.getBoundingClientRect()
	menu.style.left = `${position.left - menuRect.width - 5}px`

	// Add click handlers to menu items
	menu.querySelectorAll('.weapon-menu-item').forEach(item => {
		item.addEventListener('click', () => onItemClick(item, menu))
	})

	// Close menu when clicking outside
	const closeMenu = (e) => {
		const clickedOutside = !menu.contains(e.target)
		const clickedExcluded = excludeFromClose && e.target === excludeFromClose
		if (clickedOutside && !clickedExcluded) {
			menu.remove()
			document.removeEventListener('click', closeMenu)
		}
	}
	setTimeout(() => document.addEventListener('click', closeMenu), 0)

	return menu
}
