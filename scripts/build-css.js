/* global require, __dirname, process */
const fs = require('fs')
const path = require('path')
const CleanCSS = require('clean-css')

const root = path.join(__dirname, '..')

// CSS files grouped by layer, in order
const layers = [
	{
		name: 'variables',
		files: ['variables.css']
	},
	{
		name: 'system',
		files: [
			'base.css',
			'layout.css',
			'stats.css',
			'details.css',
			'inventory.css',
			'items.css',
			'chat.css',
			'components.css',
			'magic.css',
			'traits.css',
			'notes.css',
			'settings.css',
			'creature.css',
			'calendar.css',
			'combat-tracker.css',
			'dungeon-tracker.css',
			'party-viewer.css'
		]
	}
]

// Concatenate with @layer wrappers
let combined = ''
for (const layer of layers) {
	const contents = layer.files
		.map(file => fs.readFileSync(path.join(root, 'styles', file), 'utf8'))
		.join('\n')
	combined += `@layer ${layer.name} {\n${contents}\n}\n`
}

// Minify (level 1 = safe transforms only)
const result = new CleanCSS({ level: 1 }).minify(combined)
if (result.errors.length) {
	console.error('CSS minification errors:', result.errors)
	process.exit(1)
}
if (result.warnings.length) {
	console.warn('CSS warnings:', result.warnings)
}

const outPath = path.join(root, 'styles', 'dolmenwood.min.css')
fs.writeFileSync(outPath, result.styles)

const kb = (result.styles.length / 1024).toFixed(1)
console.log(`Built styles/dolmenwood.min.css (${kb} KB)`)
