/* global game, ui */
/**
 * Script to populate class items with progression data from the Dolmenwood SRD.
 * Run this in the Foundry console:
 *
 * const module = await import('./scripts/populate-class-progressions.mjs')
 * await module.populateClassProgressions()
 */

export const CLASS_PROGRESSIONS = {
	fighter: {
		xpThresholds: [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000],
		attackProgression: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		saveProgressions: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		}
	},
	cleric: {
		xpThresholds: [0, 0, 1500, 3000, 6000, 12000, 24000, 48000, 96000, 190000, 290000, 390000, 490000, 590000, 690000, 790000],
		attackProgression: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		saveProgressions: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		}
	},
	thief: {
		xpThresholds: [0, 0, 1200, 2400, 4800, 9600, 19200, 38400, 76800, 150000, 270000, 390000, 510000, 630000, 750000, 870000],
		attackProgression: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		saveProgressions: {
			doom: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			ray: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8],
			spell: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
		}
	},
	magician: {
		xpThresholds: [0, 0, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000, 470000, 620000, 770000, 920000, 1070000, 1220000],
		attackProgression: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
		saveProgressions: {
			doom: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10],
			ray: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10],
			hold: [0, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9],
			blast: [0, 16, 16, 16, 15, 15, 15, 14, 14, 14, 13, 13, 13, 12, 12, 12],
			spell: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10]
		}
	},
	knight: {
		xpThresholds: [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
		attackProgression: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		saveProgressions: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6]
		}
	},
	hunter: {
		xpThresholds: [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
		attackProgression: [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7, 8, 9, 9, 10],
		saveProgressions: {
			doom: [0, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3],
			ray: [0, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6, 5, 5, 4],
			hold: [0, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5],
			blast: [0, 15, 15, 14, 13, 13, 12, 11, 11, 10, 9, 9, 8, 7, 7, 6],
			spell: [0, 16, 16, 15, 14, 14, 13, 12, 12, 11, 10, 10, 9, 8, 8, 7]
		}
	},
	bard: {
		xpThresholds: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		attackProgression: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		saveProgressions: {
			doom: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			ray: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8],
			spell: [0, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8]
		}
	},
	friar: {
		xpThresholds: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		attackProgression: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
		saveProgressions: {
			doom: [0, 11, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8, 7, 7, 7],
			ray: [0, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8],
			hold: [0, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9],
			blast: [0, 16, 16, 16, 15, 15, 15, 14, 14, 14, 13, 13, 13, 12, 12, 12],
			spell: [0, 14, 14, 14, 13, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10]
		}
	},
	enchanter: {
		xpThresholds: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
		attackProgression: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
		saveProgressions: {
			doom: [0, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4],
			ray: [0, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5],
			hold: [0, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6],
			blast: [0, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9],
			spell: [0, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7]
		}
	}
}

/**
 * Populate all class items in the dolmenwood.classes compendium with progression data.
 */
export async function populateClassProgressions() {
	const pack = game.packs.get('dolmenwood.classes')
	if (!pack) {
		ui.notifications.error('Classes compendium not found!')
		return
	}

	const documents = await pack.getDocuments()
	let updated = 0

	for (const doc of documents) {
		const classId = doc.system.classId
		const progression = CLASS_PROGRESSIONS[classId]

		if (!progression) {
			console.log(`No progression data for class: ${classId}`)
			continue
		}

		await doc.update({
			'system.xpThresholds': progression.xpThresholds,
			'system.attackProgression': progression.attackProgression,
			'system.saveProgressions': progression.saveProgressions
		})

		console.log(`Updated progression for: ${doc.name}`)
		updated++
	}

	ui.notifications.info(`Updated progression data for ${updated} classes!`)
}

/**
 * Populate a single class item with progression data.
 * @param {string} className - The name of the class item to update
 */
export async function populateSingleClass(className) {
	const pack = game.packs.get('dolmenwood.classes')
	if (!pack) {
		ui.notifications.error('Classes compendium not found!')
		return
	}

	const index = await pack.getIndex()
	const entry = index.find(e => e.name.toLowerCase() === className.toLowerCase())

	if (!entry) {
		ui.notifications.error(`Class "${className}" not found!`)
		return
	}

	const doc = await pack.getDocument(entry._id)
	const classId = doc.system.classId
	const progression = CLASS_PROGRESSIONS[classId]

	if (!progression) {
		ui.notifications.error(`No progression data for class ID: ${classId}`)
		return
	}

	await doc.update({
		'system.xpThresholds': progression.xpThresholds,
		'system.attackProgression': progression.attackProgression,
		'system.saveProgressions': progression.saveProgressions
	})

	ui.notifications.info(`Updated progression for: ${doc.name}`)
	console.log('Progression data:', progression)
}
