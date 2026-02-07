/* global require, __dirname, process */
const fs = require('fs')
const path = require('path')
const CleanCSS = require('clean-css')

const root = path.join(__dirname, '..')
const systemJson = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'))

// Group CSS files by layer, preserving order
const layerOrder = []
const layerFiles = {}
for (const style of systemJson.styles) {
	const layer = style.layer || 'default'
	if (!layerFiles[layer]) {
		layerFiles[layer] = []
		layerOrder.push(layer)
	}
	layerFiles[layer].push(style.src)
}

// Concatenate with @layer wrappers
let combined = ''
for (const layer of layerOrder) {
	const contents = layerFiles[layer]
		.map(src => fs.readFileSync(path.join(root, src), 'utf8'))
		.join('\n')
	if (layer === 'default') {
		combined += contents + '\n'
	} else {
		combined += `@layer ${layer} {\n${contents}\n}\n`
	}
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
