/**
 * Script to generate Kindred and Class compendium items from existing configuration data.
 * Run this script to populate the packs/kindreds/ and packs/classes/ directories.
 *
 * Usage: node scripts/generate-compendiums.mjs
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

// Configuration data
const DOLMENWOOD = {
	kindredAgeFormulas: {
		human: '15 + 2d10',
		breggle: '15 + 2d10',
		mossling: '50 + 3d6',
		woodgrue: '50 + 3d6',
		elf: '1d100 * 9 + 1d10',
		grimalkin: '1d100 * 9 + 1d10'
	},
	kindredLifespanFormulas: {
		human: '50 + 2d20',
		breggle: '50 + 2d20',
		mossling: '200 + 5d8 * 10',
		woodgrue: '300 + 2d100',
		elf: '0',
		grimalkin: '0'
	},
	kindredHeightFormulas: {
		human: '64 + 2d6',
		breggle: '64 + 2d6',
		elf: '60 + 2d6',
		grimalkin: '30 + 2d6',
		mossling: '42 + 2d6',
		woodgrue: '36 + 2d6'
	},
	kindredWeightFormulas: {
		human: '120 + 6d10',
		breggle: '120 + 6d10',
		elf: '100 + 3d10',
		grimalkin: '50 + 3d10',
		mossling: '150 + 2d20',
		woodgrue: '60 + 2d10'
	},
	primeAbilities: {
		fighter: ['strength'],
		thief: ['dexterity'],
		cleric: ['wisdom'],
		magician: ['intelligence'],
		knight: ['charisma', 'strength'],
		hunter: ['constitution', 'dexterity'],
		bard: ['charisma', 'dexterity'],
		friar: ['intelligence', 'wisdom'],
		enchanter: ['charisma', 'intelligence'],
		breggle: ['strength', 'intelligence'],
		elf: ['charisma', 'strength'],
		grimalkin: ['dexterity'],
		mossling: ['constitution', 'wisdom'],
		woodgrue: ['charisma', 'dexterity']
	},
	spellProgression: {
		magician: [
			[],
			[1, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0], [2, 2, 0, 0, 0, 0],
			[2, 2, 1, 0, 0, 0], [3, 2, 2, 0, 0, 0], [3, 2, 2, 1, 0, 0], [3, 3, 2, 2, 0, 0],
			[3, 3, 2, 2, 1, 0], [4, 3, 3, 2, 2, 0], [4, 3, 3, 2, 2, 1], [4, 4, 3, 3, 2, 2],
			[4, 4, 3, 3, 3, 2], [5, 4, 4, 3, 3, 2], [5, 4, 4, 3, 3, 3]
		],
		cleric: [
			[],
			[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [2, 0, 0, 0, 0], [2, 1, 0, 0, 0],
			[2, 2, 0, 0, 0], [2, 2, 1, 0, 0], [3, 2, 2, 0, 0], [3, 2, 2, 0, 0],
			[3, 3, 2, 1, 0], [3, 3, 2, 2, 0], [4, 3, 3, 2, 0], [4, 3, 3, 2, 1],
			[4, 4, 3, 2, 2], [4, 4, 3, 3, 2], [5, 4, 4, 3, 2]
		],
		friar: [
			[],
			[1, 0, 0, 0, 0], [2, 0, 0, 0, 0], [2, 1, 0, 0, 0], [2, 2, 0, 0, 0],
			[3, 2, 1, 0, 0], [3, 2, 2, 0, 0], [3, 3, 2, 1, 0], [4, 3, 2, 2, 0],
			[4, 3, 3, 2, 1], [4, 4, 3, 2, 2], [5, 4, 3, 3, 2], [5, 4, 4, 3, 2],
			[5, 5, 4, 3, 3], [6, 5, 4, 4, 3], [6, 5, 5, 4, 3]
		]
	},
	xpThresholds: {
		fighter: [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000],
		thief: [0, 0, 1200, 2400, 4800, 9600, 19200, 38400, 76800, 150000, 270000, 390000, 510000, 630000, 750000, 870000],
		cleric: [0, 0, 1500, 3000, 6000, 12000, 24000, 48000, 96000, 190000, 290000, 390000, 490000, 590000, 690000, 790000],
		magician: [0, 0, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000, 470000, 620000, 770000, 920000, 1070000, 1220000],
		knight: [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
		hunter: [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
		bard: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		friar: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		enchanter: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		breggle: [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000],
		elf: [0, 0, 3500, 7000, 14000, 28000, 56000, 112000, 224000, 450000, 620000, 790000, 960000, 1130000, 1300000, 1470000],
		grimalkin: [0, 0, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000, 450000, 580000, 710000, 840000, 970000, 1100000],
		mossling: [0, 0, 2200, 4400, 8800, 17600, 35200, 70400, 140800, 280000, 400000, 520000, 640000, 760000, 880000, 1000000],
		woodgrue: [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000]
	},
	hitDice: {
		fighter: { die: '1d8', flat: 2 },
		thief: { die: '1d4', flat: 1 },
		cleric: { die: '1d6', flat: 1 },
		magician: { die: '1d4', flat: 1 },
		knight: { die: '1d8', flat: 2 },
		hunter: { die: '1d8', flat: 2 },
		bard: { die: '1d6', flat: 1 },
		friar: { die: '1d4', flat: 1 },
		enchanter: { die: '1d6', flat: 1 },
		breggle: { die: '1d6', flat: 2 },
		elf: { die: '1d6', flat: 1 },
		grimalkin: { die: '1d6', flat: 1 },
		mossling: { die: '1d6', flat: 2 },
		woodgrue: { die: '1d6', flat: 1 }
	},
	attackProgression: {
		fighter: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		knight: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		hunter: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		cleric: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		thief: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		bard: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		enchanter: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		magician: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
		friar: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
		breggle: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		elf: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		grimalkin: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		mossling: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		woodgrue: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]
	},
	saveProgressions: {
		fighter: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		},
		knight: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6]
		},
		hunter: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		},
		cleric: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		},
		thief: {
			doom: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			ray: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8],
			spell: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
		},
		bard: {
			doom: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			ray: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8],
			spell: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
		},
		magician: {
			doom: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10],
			ray: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10],
			hold: [0, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9],
			blast: [0, 16, 16, 16, 15, 15, 15, 14, 14, 14, 13, 13, 13, 12, 12, 12],
			spell: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10]
		},
		friar: {
			doom: [0, 11, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8, 7, 7, 7],
			ray: [0, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8],
			hold: [0, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9],
			blast: [0, 16, 16, 16, 15, 15, 15, 14, 14, 14, 13, 13, 13, 12, 12, 12],
			spell: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10]
		},
		enchanter: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		},
		breggle: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		},
		elf: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		},
		grimalkin: {
			doom: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			ray: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8],
			spell: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
		},
		mossling: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		},
		woodgrue: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		}
	},
	skillProgressions: {
		thief: {
			listen: [0, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2, 2],
			search: [0, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2],
			climbWall: [0, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2],
			decipherDocument: [0, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2],
			disarmMechanism: [0, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2],
			legerdemain: [0, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2],
			pickLock: [0, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2],
			stealth: [0, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2]
		},
		hunter: {
			survival: [0, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
			alertness: [0, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 2],
			stalking: [0, 6, 6, 6, 5, 5, 5, 5, 4, 4, 3, 3, 3, 3, 2, 2],
			tracking: [0, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2]
		},
		bard: {
			listen: [0, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2],
			decipherDocument: [0, 6, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 2, 2, 2],
			legerdemain: [0, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 2],
			monsterLore: [0, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2]
		},
		magician: {
			detectMagic: [0, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3]
		}
	}
}

// Kindred metadata
const KINDRED_DATA = {
	human: { size: 'medium', creatureType: 'mortal', languages: ['woldish'] },
	breggle: { size: 'medium', creatureType: 'mortal', languages: ['woldish'] },
	elf: { size: 'medium', creatureType: 'fairy', languages: ['woldish', 'elvish'] },
	grimalkin: { size: 'small', creatureType: 'fairy', languages: ['woldish', 'grimalkin'] },
	mossling: { size: 'small', creatureType: 'mortal', languages: ['woldish', 'mossling'] },
	woodgrue: { size: 'small', creatureType: 'demi-fey', languages: ['woldish', 'woodgrue'] }
}

const KINDRED_CLASS_NAMES = ['breggle', 'elf', 'grimalkin', 'mossling', 'woodgrue']

// Trait definitions
const KINDRED_TRAITS = {
	breggle: {
		active: [
			{
				id: 'longhornGaze',
				nameKey: 'DOLMEN.Traits.LonghornGaze',
				descKey: 'DOLMEN.Traits.LonghornGazeDesc',
				traitType: 'active',
				minLevel: 4,
				getMaxUses: (level) => level >= 10 ? 4 : level >= 8 ? 3 : level >= 6 ? 2 : 1,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			},
			{
				id: 'hornAttack',
				nameKey: 'DOLMEN.Traits.HornAttack',
				descKey: 'DOLMEN.Traits.HornAttackDesc',
				traitType: 'naturalWeapon',
				damageProgression: [
					{ minLevel: 1, damage: '1d4' },
					{ minLevel: 3, damage: '1d4+1' },
					{ minLevel: 6, damage: '1d6' },
					{ minLevel: 9, damage: '1d6+1' },
					{ minLevel: 10, damage: '1d6+2' }
				]
			}
		],
		passive: [
			{
				id: 'furDefense',
				nameKey: 'DOLMEN.Traits.FurDefense',
				descKey: 'DOLMEN.Traits.FurDefenseDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: 1,
				requiresNoHeavyArmor: true,
				hideFromTraitTab: false
			}
		],
		info: [
			{
				id: 'hornLength',
				nameKey: 'DOLMEN.Traits.HornLength',
				descKey: 'DOLMEN.Traits.HornLengthDesc',
				traitType: 'info',
				getValue: (actor, level) => {
					const hornLengths = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16]
					const index = Math.min(level - 1, 9)
					const inches = hornLengths[index]
					const isMetric = actor.system?.physical?.unitSystem === 'metric'
					if (isMetric) {
						const cm = inches * 2.5
						return cm + ' cm'
					}
					return inches + '"'
				}
			}
		]
	},
	elf: {
		passive: [
			{
				id: 'unearthlyBeauty',
				nameKey: 'DOLMEN.Traits.UnearthlyBeauty',
				descKey: 'DOLMEN.Traits.UnearthlyBeautyDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'abilities.charisma',
				adjustmentValue: 2
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSenses',
				descKey: 'DOLMEN.Traits.KeenSensesDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen', 'skills.search'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'magicResistance',
				nameKey: 'DOLMEN.Traits.MagicResistance',
				descKey: 'DOLMEN.Traits.MagicResistanceDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'magicResistance',
				adjustmentValue: 2
			}
		]
	},
	grimalkin: {
		active: [
			{
				id: 'shapeShiftChester',
				nameKey: 'DOLMEN.Traits.ShapeShiftChester',
				descKey: 'DOLMEN.Traits.ShapeShiftChesterDesc',
				traitType: 'active'
			},
			{
				id: 'shapeShiftWilder',
				nameKey: 'DOLMEN.Traits.ShapeShiftWilder',
				descKey: 'DOLMEN.Traits.ShapeShiftWilderDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			},
			{
				id: 'healRodent',
				nameKey: 'DOLMEN.Traits.HealRodent',
				descKey: 'DOLMEN.Traits.HealRodentDesc',
				traitType: 'active'
			}
		],
		passive: [
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'magicResistance',
				nameKey: 'DOLMEN.Traits.MagicResistance',
				descKey: 'DOLMEN.Traits.MagicResistanceDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'magicResistance',
				adjustmentValue: 2
			}
		]
	},
	human: {
		passive: [
			{
				id: 'decisiveness',
				nameKey: 'DOLMEN.Traits.Decisiveness',
				descKey: 'DOLMEN.Traits.DecisivenessDesc',
				traitType: 'info'
			},
			{
				id: 'leadership',
				nameKey: 'DOLMEN.Traits.Leadership',
				descKey: 'DOLMEN.Traits.LeadershipDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'spirited',
				nameKey: 'DOLMEN.Traits.Spirited',
				descKey: 'DOLMEN.Traits.SpiritedDesc',
				traitType: 'info'
			}
		]
	},
	mossling: {
		passive: [
			{
				id: 'resilience',
				nameKey: 'DOLMEN.Traits.Resilience',
				descKey: 'DOLMEN.Traits.ResilienceDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 1
			},
			{
				id: 'keenSurvival',
				nameKey: 'DOLMEN.Traits.KeenSurvival',
				descKey: 'DOLMEN.Traits.KeenSurvivalDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.survival'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'symbioticFlesh',
				nameKey: 'DOLMEN.Traits.SymbioticFlesh',
				descKey: 'DOLMEN.Traits.SymbioticFleshDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	},
	woodgrue: {
		active: [
			{
				id: 'enchantedMelody',
				nameKey: 'DOLMEN.Traits.EnchantedMelody',
				descKey: 'DOLMEN.Traits.EnchantedMelodyDesc',
				traitType: 'active',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'fairyResistance',
				nameKey: 'DOLMEN.Traits.FairyResistance',
				descKey: 'DOLMEN.Traits.FairyResistanceDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'moonSight',
				nameKey: 'DOLMEN.Traits.MoonSight',
				descKey: 'DOLMEN.Traits.MoonSightDesc',
				traitType: 'info'
			},
			{
				id: 'instrumentsAsWeapons',
				nameKey: 'DOLMEN.Traits.InstrumentsAsWeapons',
				descKey: 'DOLMEN.Traits.InstrumentsAsWeaponsDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	}
}

const CLASS_TRAITS = {
	bard: {
		active: [
			{
				id: 'counterCharm',
				nameKey: 'DOLMEN.Traits.CounterCharm',
				descKey: 'DOLMEN.Traits.CounterCharmDesc',
				traitType: 'active'
			},
			{
				id: 'enchantment',
				nameKey: 'DOLMEN.Traits.Enchantment',
				descKey: 'DOLMEN.Traits.EnchantmentDesc',
				traitType: 'active',
				getMaxUses: (level) => level,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			}
		],
		info: [
			{
				id: 'bardSkills',
				nameKey: 'DOLMEN.Traits.BardSkills',
				descKey: 'DOLMEN.Traits.BardSkillsDesc',
				traitType: 'info'
			}
		]
	},
	cleric: {
		active: [
			{
				id: 'turnUndead',
				nameKey: 'DOLMEN.Traits.TurnUndead',
				descKey: 'DOLMEN.Traits.TurnUndeadDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6'
			},
			{
				id: 'detectHolyMagic',
				nameKey: 'DOLMEN.Traits.DetectHolyMagic',
				descKey: 'DOLMEN.Traits.DetectHolyMagicDesc',
				traitType: 'active'
			},
			{
				id: 'orderPower',
				nameKey: 'DOLMEN.Traits.OrderPower',
				descKey: '',
				traitType: 'active',
				requiresSelection: 'holyOrder',
				minLevel: 2
			}
		],
		restrictions: [
			{
				id: 'clericTenets',
				nameKey: 'DOLMEN.Traits.ClericTenets',
				descKey: 'DOLMEN.Traits.ClericTenetsDesc',
				traitType: 'info'
			},
			{
				id: 'noMagicEquipment',
				nameKey: 'DOLMEN.Traits.NoMagicEquipment',
				descKey: 'DOLMEN.Traits.NoMagicEquipmentDesc',
				traitType: 'info'
			}
		]
	},
	enchanter: {
		passive: [
			{
				id: 'holySpellFailure',
				nameKey: 'DOLMEN.Traits.HolySpellFailure',
				descKey: 'DOLMEN.Traits.HolySpellFailureDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 2
			}
		]
	},
	fighter: {
		active: [
			{
				id: 'combatTalents',
				nameKey: 'DOLMEN.Traits.CombatTalents',
				descKey: 'DOLMEN.Traits.CombatTalentsDesc',
				traitType: 'active',
				requiresSelection: 'combatTalents'
			}
		]
	},
	friar: {
		active: [
			{
				id: 'turnUndead',
				nameKey: 'DOLMEN.Traits.TurnUndead',
				descKey: 'DOLMEN.Traits.TurnUndeadDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6'
			}
		],
		passive: [
			{
				id: 'armorOfFaith',
				nameKey: 'DOLMEN.Traits.ArmorOfFaith',
				descKey: 'DOLMEN.Traits.ArmorOfFaithDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: (level) => level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2,
				getValue: (actor, level) => level >= 13 ? "+5" : level >= 9 ? "+4" : level >= 5 ? "+3" : "+2"
			},
			{
				id: 'herbalism',
				nameKey: 'DOLMEN.Traits.Herbalism',
				descKey: 'DOLMEN.Traits.HerbalismDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'culinaryImplements',
				nameKey: 'DOLMEN.Traits.CulinaryImplements',
				descKey: 'DOLMEN.Traits.CulinaryImplementsDesc',
				traitType: 'info'
			},
			{
				id: 'forageSkill',
				nameKey: 'DOLMEN.Traits.ForageSkill',
				descKey: 'DOLMEN.Traits.ForageSkillDesc',
				traitType: 'info'
			}
		],
		restrictions: [
			{
				id: 'friarTenets',
				nameKey: 'DOLMEN.Traits.FriarTenets',
				descKey: 'DOLMEN.Traits.FriarTenetsDesc',
				traitType: 'info'
			},
			{
				id: 'povertyVows',
				nameKey: 'DOLMEN.Traits.PovertyVows',
				descKey: 'DOLMEN.Traits.PovertyVowsDesc',
				traitType: 'info'
			}
		]
	},
	hunter: {
		active: [
			{
				id: 'bindCompanion',
				nameKey: 'DOLMEN.Traits.BindCompanion',
				descKey: 'DOLMEN.Traits.BindCompanionDesc',
				traitType: 'active'
			},
			{
				id: 'trophies',
				nameKey: 'DOLMEN.Traits.Trophies',
				descKey: 'DOLMEN.Traits.TrophiesDesc',
				traitType: 'active'
			}
		],
		passive: [
			{
				id: 'wayfinding',
				nameKey: 'DOLMEN.Traits.Wayfinding',
				descKey: 'DOLMEN.Traits.WayfindingDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 3
			},
			{
				id: 'missileBonus',
				nameKey: 'DOLMEN.Traits.MissileBonus',
				descKey: 'DOLMEN.Traits.MissileBonusDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'attack.missile',
				adjustmentValue: 1
			}
		],
		info: [
			{
				id: 'hunterSkills',
				nameKey: 'DOLMEN.Traits.HunterSkills',
				descKey: 'DOLMEN.Traits.HunterSkillsDesc',
				traitType: 'info'
			}
		]
	},
	knight: {
		active: [
			{
				id: 'assessSteed',
				nameKey: 'DOLMEN.Traits.AssessSteed',
				descKey: 'DOLMEN.Traits.AssessSteedDesc',
				traitType: 'active'
			},
			{
				id: 'urgeSteed',
				nameKey: 'DOLMEN.Traits.UrgeSteed',
				descKey: 'DOLMEN.Traits.UrgeSteedDesc',
				traitType: 'active',
				minLevel: 5,
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'monsterSlayer',
				nameKey: 'DOLMEN.Traits.MonsterSlayer',
				descKey: 'DOLMEN.Traits.MonsterSlayerDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'attack',
				adjustmentValue: 2,
				minLevel: 5
			},
			{
				id: 'mountedCombat',
				nameKey: 'DOLMEN.Traits.MountedCombat',
				descKey: 'DOLMEN.Traits.MountedCombatDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'attack',
				adjustmentValue: 1
			},
			{
				id: 'strengthOfWill',
				nameKey: 'DOLMEN.Traits.StrengthOfWill',
				descKey: 'DOLMEN.Traits.StrengthOfWillDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 2
			}
		],
		info: [
			{
				id: 'hospitality',
				nameKey: 'DOLMEN.Traits.Hospitality',
				descKey: 'DOLMEN.Traits.HospitalityDesc',
				traitType: 'info',
				minLevel: 3
			}
		],
		restrictions: [
			{
				id: 'knightAlignment',
				nameKey: 'DOLMEN.Traits.KnightAlignment',
				descKey: 'DOLMEN.Traits.KnightAlignmentDesc',
				traitType: 'alignmentRestriction',
				allowedAlignments: ['lawful'],
				hideFromTraitTab: true
			},
			{
				id: 'liegeAlignment',
				nameKey: 'DOLMEN.Traits.LiegeAlignment',
				descKey: 'DOLMEN.Traits.LiegeAlignmentDesc',
				traitType: 'info'
			},
			{
				id: 'noMissile',
				nameKey: 'DOLMEN.Traits.NoMissile',
				descKey: 'DOLMEN.Traits.NoMissileDesc',
				traitType: 'info'
			},
			{
				id: 'noLightArmor',
				nameKey: 'DOLMEN.Traits.NoLightArmor',
				descKey: 'DOLMEN.Traits.NoLightArmorDesc',
				traitType: 'info'
			},
			{
				id: 'codeOfChivalry',
				nameKey: 'DOLMEN.Traits.CodeOfChivalry',
				descKey: 'DOLMEN.Traits.CodeOfChivalryDesc',
				traitType: 'info'
			}
		]
	},
	magician: {},
	thief: {
		active: [
			{
				id: 'backstab',
				nameKey: 'DOLMEN.Traits.Backstab',
				descKey: 'DOLMEN.Traits.BackstabDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '3d4'
			}
		],
		info: [
			{
				id: 'thiefSkills',
				nameKey: 'DOLMEN.Traits.ThiefSkills',
				descKey: 'DOLMEN.Traits.ThiefSkillsDesc',
				traitType: 'info'
			}
		]
	}
}

const KINDRED_CLASS_TRAITS = {
	breggle: {
		active: [
			{
				id: 'longhornGaze',
				nameKey: 'DOLMEN.Traits.LonghornGaze',
				descKey: 'DOLMEN.Traits.LonghornGazeDesc',
				traitType: 'active',
				minLevel: 4,
				getMaxUses: (level) => level >= 10 ? 4 : level >= 8 ? 3 : level >= 6 ? 2 : 1,
				usageFrequency: 'DOLMEN.Traits.UsesPerDay'
			},
			{
				id: 'hornAttack',
				nameKey: 'DOLMEN.Traits.HornAttack',
				descKey: 'DOLMEN.Traits.HornAttackDesc',
				traitType: 'naturalWeapon',
				damageProgression: [
					{ minLevel: 1, damage: '1d4' },
					{ minLevel: 3, damage: '1d4+1' },
					{ minLevel: 6, damage: '1d6' },
					{ minLevel: 9, damage: '1d6+1' },
					{ minLevel: 10, damage: '1d6+2' }
				]
			}
		],
		passive: [
			{
				id: 'furDefense',
				nameKey: 'DOLMEN.Traits.FurDefense',
				descKey: 'DOLMEN.Traits.FurDefenseDesc',
				traitType: 'adjustment',
				adjustmentType: 'static',
				adjustmentTarget: 'ac',
				adjustmentValue: 1,
				requiresNoHeavyArmor: true,
				hideFromTraitTab: false
			}
		],
		info: [
			{
				id: 'hornLength',
				nameKey: 'DOLMEN.Traits.HornLength',
				descKey: 'DOLMEN.Traits.HornLengthDesc',
				traitType: 'info',
				getValue: (actor, level) => {
					const hornLengths = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16]
					const index = Math.min(level - 1, 9)
					const inches = hornLengths[index]
					const isMetric = actor.system?.physical?.unitSystem === 'metric'
					if (isMetric) {
						const cm = Math.round(inches * 2.54)
						return cm + ' cm'
					}
					return inches + '"'
				}
			}
		]
	},
	elf: {
		passive: [
			{
				id: 'unearthlyBeauty',
				nameKey: 'DOLMEN.Traits.UnearthlyBeauty',
				descKey: 'DOLMEN.Traits.UnearthlyBeautyDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'abilities.charisma',
				adjustmentValue: 2
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'holySpellFailure',
				nameKey: 'DOLMEN.Traits.HolySpellFailure',
				descKey: 'DOLMEN.Traits.HolySpellFailureDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				rollTarget: 2
			},
			{
				id: 'keenSenses',
				nameKey: 'DOLMEN.Traits.KeenSenses',
				descKey: 'DOLMEN.Traits.KeenSensesDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen', 'skills.search'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			}
		]
	},
	grimalkin: {
		active: [
			{
				id: 'shapeShiftChester',
				nameKey: 'DOLMEN.Traits.ShapeShiftChester',
				descKey: 'DOLMEN.Traits.ShapeShiftChesterDesc',
				traitType: 'active'
			},
			{
				id: 'shapeShiftWilder',
				nameKey: 'DOLMEN.Traits.ShapeShiftWilder',
				descKey: 'DOLMEN.Traits.ShapeShiftWilderDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '2d6',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			},
			{
				id: 'furBall',
				nameKey: 'DOLMEN.Traits.FurBall',
				descKey: 'DOLMEN.Traits.FurBallDesc',
				traitType: 'active',
				rollable: true,
				rollFormula: '1d6',
				maxUses: 3,
				usageFrequency: 'DOLMEN.Traits.ThreePerDay'
			}
		],
		passive: [
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'immortal',
				nameKey: 'DOLMEN.Traits.Immortal',
				descKey: 'DOLMEN.Traits.ImmortalDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			},
			{
				id: 'lockPickingSkill',
				nameKey: 'DOLMEN.Traits.LockPickingSkill',
				descKey: 'DOLMEN.Traits.LockPickingSkillDesc',
				traitType: 'info'
			}
		]
	},
	mossling: {
		passive: [
			{
				id: 'resilience',
				nameKey: 'DOLMEN.Traits.Resilience',
				descKey: 'DOLMEN.Traits.ResilienceDesc',
				traitType: 'adjustment',
				adjustmentType: 'rollOption',
				adjustmentTarget: 'saves.all',
				adjustmentValue: 1
			},
			{
				id: 'keenSurvival',
				nameKey: 'DOLMEN.Traits.KeenSurvival',
				descKey: 'DOLMEN.Traits.KeenSurvivalDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.survival'],
				adjustmentValue: 5
			}
		],
		info: [
			{
				id: 'symbioticFlesh',
				nameKey: 'DOLMEN.Traits.SymbioticFlesh',
				descKey: 'DOLMEN.Traits.SymbioticFleshDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	},
	woodgrue: {
		active: [
			{
				id: 'enchantedMelody',
				nameKey: 'DOLMEN.Traits.EnchantedMelody',
				descKey: 'DOLMEN.Traits.EnchantedMelodyDesc',
				traitType: 'active',
				maxUses: 1,
				usageFrequency: 'DOLMEN.Traits.OncePerDay'
			}
		],
		passive: [
			{
				id: 'keenSensesListen',
				nameKey: 'DOLMEN.Traits.KeenSensesListen',
				descKey: 'DOLMEN.Traits.KeenSensesListenDesc',
				traitType: 'adjustment',
				adjustmentType: 'skillOverride',
				adjustmentTargets: ['skills.listen'],
				adjustmentValue: 5
			},
			{
				id: 'acVsLarge',
				nameKey: 'DOLMEN.Traits.ACVsLarge',
				descKey: 'DOLMEN.Traits.ACVsLargeDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'coldIronVuln',
				nameKey: 'DOLMEN.Traits.ColdIronVuln',
				descKey: 'DOLMEN.Traits.ColdIronVulnDesc',
				traitType: 'adjustment',
				adjustmentType: 'info'
			},
			{
				id: 'fairyResistance',
				nameKey: 'DOLMEN.Traits.FairyResistance',
				descKey: 'DOLMEN.Traits.FairyResistanceDesc',
				traitType: 'info'
			}
		],
		info: [
			{
				id: 'moonSight',
				nameKey: 'DOLMEN.Traits.MoonSight',
				descKey: 'DOLMEN.Traits.MoonSightDesc',
				traitType: 'info'
			},
			{
				id: 'instrumentsAsWeapons',
				nameKey: 'DOLMEN.Traits.InstrumentsAsWeapons',
				descKey: 'DOLMEN.Traits.InstrumentsAsWeaponsDesc',
				traitType: 'info'
			},
			{
				id: 'smallSize',
				nameKey: 'DOLMEN.Traits.SmallSize',
				descKey: 'DOLMEN.Traits.SmallSizeDesc',
				traitType: 'sizeRestriction',
				sizeRestriction: 'small',
				hideFromTraitTab: false
			}
		]
	}
}

// Helper to generate a deterministic ID from type + name
// This ensures the same item always gets the same ID across regenerations
function generateId(type, name) {
	return crypto.createHash('md5').update(`${type}:${name}`).digest('hex').slice(0, 16)
}

// Helper to create _stats object for Foundry v13
// Uses a fixed timestamp so regeneration produces identical output
function createStats() {
	return {
		compendiumSource: null,
		duplicateSource: null,
		coreVersion: "13.351",
		systemId: "dolmenwood",
		systemVersion: "0.2.0",
		createdTime: 0,
		modifiedTime: 0,
		lastModifiedBy: null
	}
}

// Create kindred compendium items
function generateKindredItems() {
	const items = []

	for (const [kindredId, metadata] of Object.entries(KINDRED_DATA)) {
		const name = kindredId.charAt(0).toUpperCase() + kindredId.slice(1)
		const itemId = generateId('Kindred', name)
		const item = {
			name,
			type: 'Kindred',
			_id: itemId,
			img: `systems/dolmenwood/assets/kindreds/${kindredId}.webp`,
			system: {
				codexUuid: "",
				kindredId,
				size: metadata.size,
				creatureType: metadata.creatureType,
				ageFormula: DOLMENWOOD.kindredAgeFormulas[kindredId],
				lifespanFormula: DOLMENWOOD.kindredLifespanFormulas[kindredId],
				heightFormula: DOLMENWOOD.kindredHeightFormulas[kindredId],
				weightFormula: DOLMENWOOD.kindredWeightFormulas[kindredId],
				languages: metadata.languages,
				traits: KINDRED_TRAITS[kindredId] || {}
			},
			effects: [],
			folder: null,
			sort: 0,
			ownership: {
				default: 0
			},
			flags: {},
			_stats: createStats(),
			_key: `!items!${itemId}`
		}

		items.push(item)
	}

	return items
}

// Create class compendium items
function generateClassItems() {
	const items = []

	// Standard classes
	const standardClasses = ['bard', 'cleric', 'enchanter', 'fighter', 'friar', 'hunter', 'knight', 'magician', 'thief']

	for (const classId of standardClasses) {
		const name = classId.charAt(0).toUpperCase() + classId.slice(1)
		const itemId = generateId('Class', name)
		const item = {
			name,
			type: 'Class',
			_id: itemId,
			img: `systems/dolmenwood/assets/classes/${classId}.webp`,
			system: {
				codexUuid: "",
				classId,
				requiredKindred: '',
				primeAbilities: DOLMENWOOD.primeAbilities[classId] || [],
				hitDice: DOLMENWOOD.hitDice[classId] || { die: '1d6', flat: 1 },
				xpThresholds: DOLMENWOOD.xpThresholds[classId] || [],
				attackProgression: DOLMENWOOD.attackProgression[classId] || [],
				saveProgressions: DOLMENWOOD.saveProgressions[classId] || {},
				skillProgressions: DOLMENWOOD.skillProgressions[classId] || {},
				spellProgression: DOLMENWOOD.spellProgression[classId] || [],
				spellType: ['magician'].includes(classId) ? 'arcane' : ['cleric', 'friar'].includes(classId) ? 'holy' : 'none',
				combatAptitude: ['fighter', 'knight', 'hunter'].includes(classId) ? 'martial' : ['bard', 'cleric', 'enchanter', 'thief'].includes(classId) ? 'semi-martial' : 'non-martial',
				hasCombatTalents: classId === 'fighter',
				hasHolyOrder: ['cleric', 'friar'].includes(classId),
				canTwoWeaponFight: ['fighter', 'hunter', 'knight', 'thief'].includes(classId),
				hasBackstab: classId === 'thief',
				traits: CLASS_TRAITS[classId] || {}
			},
			effects: [],
			folder: null,
			sort: 0,
			ownership: {
				default: 0
			},
			flags: {},
			_stats: createStats(),
			_key: `!items!${itemId}`
		}

		items.push(item)
	}

	// Kindred-classes
	for (const kindredClassId of KINDRED_CLASS_NAMES) {
		const name = kindredClassId.charAt(0).toUpperCase() + kindredClassId.slice(1)
		const itemId = generateId('Class', name)
		const item = {
			name,
			type: 'Class',
			_id: itemId,
			img: `systems/dolmenwood/assets/classes/${kindredClassId}.webp`,
			system: {
				codexUuid: "",
				classId: kindredClassId,
				requiredKindred: kindredClassId,
				primeAbilities: DOLMENWOOD.primeAbilities[kindredClassId] || [],
				hitDice: DOLMENWOOD.hitDice[kindredClassId] || { die: '1d6', flat: 1 },
				xpThresholds: DOLMENWOOD.xpThresholds[kindredClassId] || [],
				attackProgression: DOLMENWOOD.attackProgression[kindredClassId] || [],
				saveProgressions: DOLMENWOOD.saveProgressions[kindredClassId] || {},
				skillProgressions: DOLMENWOOD.skillProgressions[kindredClassId] || {},
				spellProgression: DOLMENWOOD.spellProgression[kindredClassId] || [],
				spellType: ['magician', 'breggle'].includes(kindredClassId) ? 'arcane' : 'none',
				combatAptitude: ['breggle', 'elf'].includes(kindredClassId) ? 'martial' : 'semi-martial',
				hasCombatTalents: false,
				hasHolyOrder: false,
				canTwoWeaponFight: ['breggle', 'elf', 'grimalkin', 'woodgrue'].includes(kindredClassId),
				hasBackstab: false,
				traits: KINDRED_CLASS_TRAITS[kindredClassId] || {}
			},
			effects: [],
			folder: null,
			sort: 0,
			ownership: {
				default: 0
			},
			flags: {},
			_stats: createStats(),
			_key: `!items!${itemId}`
		}

		items.push(item)
	}

	return items
}

// Write items to compendium directories
function writeCompendium(packName, items) {
	const packDir = path.join(rootDir, 'packs', packName)
	const sourceDir = path.join(packDir, '_source')

	// Create directories if they don't exist
	if (!fs.existsSync(packDir)) {
		fs.mkdirSync(packDir, { recursive: true })
	}
	if (!fs.existsSync(sourceDir)) {
		fs.mkdirSync(sourceDir, { recursive: true })
	}

	// Remove old source files before creating new ones
	if (fs.existsSync(sourceDir)) {
		const existingFiles = fs.readdirSync(sourceDir)
		for (const file of existingFiles) {
			if (file.endsWith('.json')) {
				const filepath = path.join(sourceDir, file)
				fs.unlinkSync(filepath)
				console.log(`Removed: ${filepath}`)
			}
		}
	}

	// Write each item as a separate JSON file (Foundry v13 format: filename is just the _id)
	for (const item of items) {
		const filename = `${item._id}.json`
		const filepath = path.join(sourceDir, filename)
		fs.writeFileSync(filepath, JSON.stringify(item, null, 2))
		console.log(`Created: ${filepath}`)
	}
}

// Main execution
console.log('Generating compendium items...')

const kindredItems = generateKindredItems()
const classItems = generateClassItems()

writeCompendium('kindreds', kindredItems)
writeCompendium('classes', classItems)

console.log(`\nGenerated ${kindredItems.length} kindred items`)
console.log(`Generated ${classItems.length} class items`)
console.log('\nDone! Now run pack-compendiums.bat to compile the compendiums.')
