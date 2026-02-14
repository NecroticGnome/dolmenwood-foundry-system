const DOLMENWOOD = {}

// Available extra skills that can be added to adventurers
DOLMENWOOD.extraSkills = [
	'detectMagic',
	'alertness',
	'stalking',
	'tracking',
	'pickLock',
	'stealth',
	'decipherDocument',
	'climbWall',
	'disarmMechanism',
	'legerdemain',
	'monsterLore'
]
DOLMENWOOD.maxExtraSkills = 6


DOLMENWOOD.months = {
	grimvold: { days: 30 },
	lymewald: { days: 28 },
	haggryme: { days: 30 },
	symswald: { days: 29 },
	harchment: { days: 29 },
	iggwyld: { days: 30 },
	chysting: { days: 31 },
	lillipythe: { days: 29 },
	haelhold: { days: 28 },
	reedwryme: { days: 30 },
	obthryme: { days: 28 },
	braghold: { days: 30 }
}

// Day-of-year offset for each month (cumulative days before that month)
DOLMENWOOD.monthOffsets = {
	grimvold: 0,
	lymewald: 30,
	haggryme: 58,
	symswald: 88,
	harchment: 117,
	iggwyld: 146,
	chysting: 176,
	lillipythe: 207,
	haelhold: 236,
	reedwryme: 264,
	obthryme: 294,
	braghold: 322
}

// Moon sign lookup table: [startDayOfYear, endDayOfYear, moonName, phase]
// Sorted by startDayOfYear. Total year = 352 days.
DOLMENWOOD.moonSignTable = [
	[1, 3, 'black', 'waning'],
	[4, 17, 'grinning', 'waxing'],
	[18, 20, 'grinning', 'full'],
	[21, 33, 'grinning', 'waning'],
	[34, 46, 'dead', 'waxing'],
	[47, 49, 'dead', 'full'],
	[50, 62, 'dead', 'waning'],
	[63, 76, 'beast', 'waxing'],
	[77, 79, 'beast', 'full'],
	[80, 91, 'beast', 'waning'],
	[92, 105, 'squamous', 'waxing'],
	[106, 108, 'squamous', 'full'],
	[109, 121, 'squamous', 'waning'],
	[122, 134, 'knights', 'waxing'],
	[135, 137, 'knights', 'full'],
	[138, 150, 'knights', 'waning'],
	[151, 164, 'rotting', 'waxing'],
	[165, 167, 'rotting', 'full'],
	[168, 179, 'rotting', 'waning'],
	[180, 193, 'maidens', 'waxing'],
	[194, 196, 'maidens', 'full'],
	[197, 209, 'maidens', 'waning'],
	[210, 222, 'witch', 'waxing'],
	[223, 225, 'witch', 'full'],
	[226, 238, 'witch', 'waning'],
	[239, 252, 'robbers', 'waxing'],
	[253, 255, 'robbers', 'full'],
	[256, 267, 'robbers', 'waning'],
	[268, 281, 'goat', 'waxing'],
	[282, 284, 'goat', 'full'],
	[285, 297, 'goat', 'waning'],
	[298, 311, 'narrow', 'waxing'],
	[312, 314, 'narrow', 'full'],
	[315, 326, 'narrow', 'waning'],
	[327, 340, 'black', 'waxing'],
	[341, 343, 'black', 'full'],
	[344, 352, 'black', 'waning']
]

// Holy order definitions for Cleric and Friar classes
DOLMENWOOD.holyOrders = {
	stFaxis: {
		nameKey: 'DOLMEN.Traits.Orders.stFaxis',
		descKey: 'DOLMEN.Traits.Orders.stFaxisDesc'
	},
	stSedge: {
		nameKey: 'DOLMEN.Traits.Orders.stSedge',
		descKey: 'DOLMEN.Traits.Orders.stSedgeDesc'
	},
	stSignis: {
		nameKey: 'DOLMEN.Traits.Orders.stSignis',
		descKey: 'DOLMEN.Traits.Orders.stSignisDesc'
	}
}

export default DOLMENWOOD
