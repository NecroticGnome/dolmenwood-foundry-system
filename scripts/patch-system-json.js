/* global require, process */
const fs = require('fs')
const p = process.argv[2]
const j = JSON.parse(fs.readFileSync(p, 'utf8'))
j.styles = [{ src: 'styles/dolmenwood.min.css' }]
fs.writeFileSync(p, JSON.stringify(j, null, 2))
console.log('Patched system.json to use combined CSS')
