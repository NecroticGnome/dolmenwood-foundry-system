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
	grimvold: { days: 30, sunrise: 8.0, sunset: 16.0 },
	lymewald: { days: 28, sunrise: 8.0, sunset: 16.5 },
	haggryme: { days: 30, sunrise: 7.5, sunset: 17.0 },
	symswald: { days: 29, sunrise: 6.5, sunset: 18.0 },
	harchment: { days: 29, sunrise: 6.0, sunset: 20.0 },
	iggwyld: { days: 30, sunrise: 5.0, sunset: 21.0 },
	chysting: { days: 31, sunrise: 4.5, sunset: 21.5 },
	lillipythe: { days: 29, sunrise: 5.0, sunset: 21.0 },
	haelhold: { days: 28, sunrise: 6.0, sunset: 20.5 },
	reedwryme: { days: 30, sunrise: 6.5, sunset: 19.5 },
	obthryme: { days: 28, sunrise: 7.5, sunset: 18.0 },
	braghold: { days: 30, sunrise: 7.5, sunset: 16.5 }
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

DOLMENWOOD.seasons = {
	winter: { months: ['grimvold', 'lymewald', 'haggryme'], icon: 'fa-solid fa-snowflake' },
	spring: { months: ['symswald', 'harchment', 'iggwyld'], icon: 'fa-solid fa-seedling' },
	summer: { months: ['chysting', 'lillipythe', 'haelhold'], icon: 'fa-solid fa-sun' },
	autumn: { months: ['reedwryme', 'obthryme', 'braghold'], icon: 'fa-solid fa-leaf' }
}

// Unseasons: rare magical environmental conditions
DOLMENWOOD.unseasons = {
	hitching: { icon: 'fa-solid fa-moon', months: ['grimvold'] },
	vague: { icon: 'fa-solid fa-smog', months: ['lymewald', 'haggryme'] },
	colliggwyld: { icon: 'fa-solid fa-mushroom', months: ['iggwyld'] },
	chame: { icon: 'fa-solid fa-snake', months: ['haelhold'] }
}
DOLMENWOOD.DAYS_PER_YEAR = 352
DOLMENWOOD.SECONDS_PER_DAY = 86400
DOLMENWOOD.monthToSeason = {}
for (const [season, data] of Object.entries(DOLMENWOOD.seasons)) {
	for (const month of data.months) DOLMENWOOD.monthToSeason[month] = season
}

// Days of the week (7-day cycle within each month, days 1-28)
DOLMENWOOD.weekDays = ['colly', 'chime', 'hayme', 'moot', 'frisk', 'eggfast', 'sunning']

// Wysendays: extra days beyond the 28-day cycle at the end of each month
// Each entry is the display name for day 29, 30, 31 respectively
DOLMENWOOD.wysendays = {
	grimvold: ['Hanglemas', "Dyboll's Day"],
	haggryme: ["Yarl's Day", 'The Day of Virgins'],
	symswald: ['Hopfast'],
	harchment: ['Smithing'],
	iggwyld: ['Shortening', "Longshank's Day"],
	chysting: ['Bradging', 'Copsewallow', 'Chalice'],
	lillipythe: ["Old Dobey's Day"],
	reedwryme: ["Shub's Eve", 'Druden Day'],
	braghold: ['The Day of Doors', 'Dolmenday']
}

// Holidays: feasts, solstices, equinoxes, and festivals by month and day
DOLMENWOOD.holidays = {
	grimvold: {
		1: 'Feast of St. Vinicus',
		4: 'Feast of St. Albert',
		5: 'Feast of St. Offrid',
		9: 'Feast of St. Choad',
		17: 'Feast of St. Clyde',
		19: 'Winter Solstice & Feast of St. Elsa',
		21: 'Feast of St. Baldric',
		27: 'Feast of St. Cantius',
		29: 'Feast of St. Joane'
	},
	lymewald: {
		2: 'Feast of St. Waylord',
		3: 'Feast of St. Gondyw',
		9: 'Feast of St. Calafredus',
		15: 'Feast of St. Wynne',
		19: 'Feast of St. Albrith',
		23: 'Feast of St. Fredulus',
		28: 'Feast of St. Eggort'
	},
	haggryme: {
		5: 'Feast of St. Clister',
		6: 'Feast of St. Ponch',
		11: 'Feast of St. Flatius',
		12: 'Feast of St. Quister',
		13: 'Feast of St. Aeynid',
		18: 'Feast of St. Visyg',
		22: 'Feast of St. Pannard',
		23: 'Feast of St. Simone',
		25: 'Feast of St. Sortia',
		27: 'Feast of St. Pastery',
		28: 'Feast of St. Bethany',
		29: 'Feast of St. Tumbel',
		30: 'Feast of St. Lillibeth'
	},
	symswald: {
		1: 'Feast of St. Gwigh',
		2: 'The Feast of Cats',
		3: 'Feast of St. Medigor',
		5: 'Feast of St. Ingrid',
		7: 'Feast of St. Neblit',
		8: 'Feast of St. Dullard',
		10: 'Feast of St. Whittery',
		12: 'Feast of St. Pious',
		14: 'Feast of St. Thorm',
		18: 'Feast of St. Goodenough',
		20: 'Vernal Equinox'
	},
	harchment: {
		7: 'Feast of St. Craven',
		9: 'Feast of St. Rhilma',
		10: 'Feast of St. Talambeth',
		16: 'Feast of St. Jorrael',
		19: 'Feast of St. Hoargrime',
		22: 'Feast of St. Abthius',
		24: 'Feast of St. Primace',
		26: 'Feast of St. Knock',
		29: 'Feast of St. Wilbranch'
	},
	iggwyld: {
		3: 'Feast of St. Gripe',
		9: 'Feast of St. Puriphon',
		19: 'Feast of St. Hildace',
		27: 'Feast of St. Maternis',
		30: 'Feast of St. Waylaine'
	},
	chysting: {
		6: 'Feast of St. Nuncy',
		10: 'Feast of St. Apoplect',
		16: 'Feast of St. Cornice',
		18: 'Summer Solstice',
		20: 'Feast of St. Dougan',
		27: 'Feast of St. Sabian',
		31: 'Feast of St. Jubilant'
	},
	lillipythe: {
		4: 'Feast of St. Foggarty',
		5: 'Feast of St. Keye',
		9: 'Feast of St. Primula',
		16: 'Feast of St. Dillage',
		20: 'Feast of St. Torphia',
		25: 'Feast of St. Esther',
		27: 'Feast of St. Philodeus',
		28: 'Feast of St. Lummox',
		29: 'Feast of St. Capernott'
	},
	haelhold: {
		5: 'Feast of St. Willibart',
		8: 'Feast of St. Sanguine',
		10: 'Feast of St. Benester',
		15: 'Feast of St. Faxis',
		25: 'Feast of St. Gretchen',
		28: 'Feast of St. Galaunt'
	},
	reedwryme: {
		1: 'Feast of St. Dextre',
		3: 'Feast of St. Wick',
		4: 'Feast of St. Elephantine',
		8: 'Feast of St. Moribund',
		13: 'Feast of St. Loame',
		18: 'Feast of St. Shank',
		19: 'Autumnal Equinox',
		21: 'Feast of St. Hollyhock',
		22: 'Feast of St. Egbert',
		25: 'Feast of St. Clewyd',
		26: 'Feast of St. Howarth',
		27: 'Feast of St. Howdych',
		29: 'Feast of St. Signis',
		30: 'Festival of the Green Man'
	},
	obthryme: {
		7: 'Feast of St. Horace',
		9: 'Feast of St. Hamfast',
		13: 'Feast of St. Woad',
		22: 'Feast of St. Hodwich',
		24: 'Feast of St. Wort',
		27: 'Feast of St. Godfrey',
		28: 'Feast of St. Dank'
	},
	braghold: {
		9: 'Feast of St. Poltry',
		10: 'Feast of St. Sedge',
		15: 'Feast of St. Clyve',
		21: 'Feast of St. Gawain',
		25: 'Feast of St. Thridgold',
		28: 'Feast of St. Therese',
		29: 'Feast of St. Habicus',
		30: 'The Hunting of the Winter Hart & Feast of St. Willofrith'
	}
}

export default DOLMENWOOD
