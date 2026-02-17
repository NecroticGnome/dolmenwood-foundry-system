import { extractPack } from '@foundryvtt/foundryvtt-cli'
import fs from 'fs'

const systemFile = fs.readFileSync('system.json', 'utf8')
const data = JSON.parse(systemFile)
const packs = data.packs || []

for (const pack of packs) {
	const name = pack.name
	if (name) {
		console.log(`Extracting ${name}...`)
		await extractPack(`packs/${name}`, `packs/${name}/src`)
		console.log(`  → packs/${name}/src/ (JSON)`)
	}
}
console.log('Done.')
