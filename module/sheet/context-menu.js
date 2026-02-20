/* global game */

/**
 * Context Menu Utility
 * Generic factory for creating positioned context menus.
 */

/**
 * Create and display a context menu.
 * @param {HTMLElement|object} target - Target element to append to, or sheet with .element property
 * @param {object} config - Menu configuration
 * @param {string} config.html - HTML content for the menu
 * @param {object} config.position - Position {top, left}
 * @param {Function} config.onItemClick - Callback when menu item clicked, receives (menuItem, menu)
 * @param {string} [config.menuClass='dolmen-weapon-context-menu'] - CSS class for menu container
 * @param {string} [config.itemSelector='.weapon-menu-item'] - Selector for clickable items
 * @param {Element} [config.excludeFromClose] - Element to exclude from close detection
 * @returns {HTMLElement} The menu element
 */
export function createContextMenu(target, { html, position, onItemClick, menuClass = 'dolmen-weapon-context-menu', itemSelector = '.weapon-menu-item', excludeFromClose = null }) {
	// Dismiss any active Foundry tooltip so it doesn't overlap the menu
	if (typeof game !== 'undefined') game.tooltip?.deactivate()

	// Get target element (support both sheet objects and raw elements)
	const targetElement = target.element || target

	// Remove any existing context menu
	document.querySelector(`.${menuClass}`)?.remove()

	// Create the menu element
	const menu = document.createElement('div')
	menu.className = `dolmen ${menuClass}`
	menu.innerHTML = html

	// Position the menu
	menu.style.position = 'fixed'
	menu.style.top = `${position.top}px`
	menu.style.left = `${position.left}px`

	// Add to target
	targetElement.appendChild(menu)

	// Adjust position after rendering (menu appears to left of click point)
	const menuRect = menu.getBoundingClientRect()
	menu.style.left = `${position.left - menuRect.width - 5}px`

	// Add click handlers to menu items
	menu.querySelectorAll(itemSelector).forEach(item => {
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
