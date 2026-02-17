import { compilePack } from '@foundryvtt/foundryvtt-cli'
import fs from 'fs'

const systemFile = fs.readFileSync('system.json', 'utf8')
const data = JSON.parse(systemFile)
const packs = data.packs || []

for (const pack of packs) {
	const name = pack.name
	if (name) {
		console.log(`Compiling ${name}...`)
		await compilePack(`packs/${name}/src`, `packs/${name}`)
		console.log(`  → packs/${name}/ (LevelDB)`)
	}
}
console.log('Done.')
