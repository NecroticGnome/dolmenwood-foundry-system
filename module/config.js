const DOLMENWOOD = {}
DOLMENWOOD.welcomeMessage = 'Welcome to the Dolmenwood RPG System!'

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

// Roll formulas for kindred age and lifespan
DOLMENWOOD.kindredAgeFormulas = {
	human: '15 + 2d10',
	breggle: '15 + 2d10',
	mossling: '50 + 3d6',
	woodgrue: '50 + 3d6',
	elf: '1d100 * 9 + 1d10',
	grimalkin: '1d100 * 9 + 1d10'
}

DOLMENWOOD.kindredLifespanFormulas = {
	human: '50 + 2d20',
	breggle: '50 + 2d20',
	mossling: '200 + 5d8 * 10',
	woodgrue: '300 + 2d100',
	elf: '0',
	grimalkin: '0'
}

// Roll formulas for kindred height (in total inches) and weight (in lbs)
DOLMENWOOD.kindredHeightFormulas = {
	human: '64 + 2d6',
	breggle: '64 + 2d6',
	elf: '60 + 2d6',
	grimalkin: '30 + 2d6',
	mossling: '42 + 2d6',
	woodgrue: '36 + 2d6'
}

DOLMENWOOD.kindredWeightFormulas = {
	human: '120 + 6d10',
	breggle: '120 + 6d10',
	elf: '100 + 3d10',
	grimalkin: '50 + 3d10',
	mossling: '150 + 2d20',
	woodgrue: '60 + 2d10'
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

DOLMENWOOD.primeAbilities = {
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
}

// Spell slot progression tables by class and level (index = level, value = slots per rank)
// From Dolmenwood SRD class tables. No ability modifier bonuses — slots depend only on class + level.
DOLMENWOOD.spellProgression = {
	// Arcane spells, ranks 1-6
	magician: [
		null,              // level 0 (unused)
		[1, 0, 0, 0, 0, 0], // level 1
		[2, 0, 0, 0, 0, 0], // level 2
		[2, 1, 0, 0, 0, 0], // level 3
		[2, 2, 0, 0, 0, 0], // level 4
		[2, 2, 1, 0, 0, 0], // level 5
		[3, 2, 2, 0, 0, 0], // level 6
		[3, 2, 2, 1, 0, 0], // level 7
		[3, 3, 2, 2, 0, 0], // level 8
		[3, 3, 2, 2, 1, 0], // level 9
		[4, 3, 3, 2, 2, 0], // level 10
		[4, 3, 3, 2, 2, 1], // level 11
		[4, 4, 3, 3, 2, 2], // level 12
		[4, 4, 3, 3, 3, 2], // level 13
		[5, 4, 4, 3, 3, 2], // level 14
		[5, 4, 4, 3, 3, 3]  // level 15
	],
	// Holy spells, ranks 1-5 (no spells at level 1)
	cleric: [
		null,              // level 0 (unused)
		[0, 0, 0, 0, 0],    // level 1
		[1, 0, 0, 0, 0],    // level 2
		[2, 0, 0, 0, 0],    // level 3
		[2, 1, 0, 0, 0],    // level 4
		[2, 2, 0, 0, 0],    // level 5
		[2, 2, 1, 0, 0],    // level 6
		[3, 2, 2, 0, 0],    // level 7
		[3, 2, 2, 0, 0],    // level 8
		[3, 3, 2, 1, 0],    // level 9
		[3, 3, 2, 2, 0],    // level 10
		[4, 3, 3, 2, 0],    // level 11
		[4, 3, 3, 2, 1],    // level 12
		[4, 4, 3, 2, 2],    // level 13
		[4, 4, 3, 3, 2],    // level 14
		[5, 4, 4, 3, 2]     // level 15
	],
	// Holy spells, ranks 1-5 (starts casting at level 1)
	friar: [
		null,              // level 0 (unused)
		[1, 0, 0, 0, 0],    // level 1
		[2, 0, 0, 0, 0],    // level 2
		[2, 1, 0, 0, 0],    // level 3
		[2, 2, 0, 0, 0],    // level 4
		[3, 2, 1, 0, 0],    // level 5
		[3, 2, 2, 0, 0],    // level 6
		[3, 3, 2, 1, 0],    // level 7
		[4, 3, 2, 2, 0],    // level 8
		[4, 3, 3, 2, 1],    // level 9
		[4, 4, 3, 2, 2],    // level 10
		[5, 4, 3, 3, 2],    // level 11
		[5, 4, 4, 3, 2],    // level 12
		[5, 5, 4, 3, 3],    // level 13
		[6, 5, 4, 4, 3],    // level 14
		[6, 5, 5, 4, 3]     // level 15
	]
}

export default DOLMENWOOD
