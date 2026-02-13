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
		[],                // level 0 (unused)
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
		[],                // level 0 (unused)
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
		[],                // level 0 (unused)
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

// XP thresholds per class — index = level, value = cumulative XP needed for that level
DOLMENWOOD.xpThresholds = {
	fighter:   [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000],
	thief:     [0, 0, 1200, 2400, 4800, 9600, 19200, 38400, 76800, 150000, 270000, 390000, 510000, 630000, 750000, 870000],
	cleric:    [0, 0, 1500, 3000, 6000, 12000, 24000, 48000, 96000, 190000, 290000, 390000, 490000, 590000, 690000, 790000],
	magician:  [0, 0, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000, 470000, 620000, 770000, 920000, 1070000, 1220000],
	knight:    [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
	hunter:    [0, 0, 2250, 4500, 9000, 18000, 36000, 72000, 144000, 290000, 420000, 550000, 680000, 810000, 940000, 1070000],
	bard:      [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
	friar:     [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
	enchanter: [0, 0, 1750, 3500, 7000, 14000, 28000, 56000, 112000, 220000, 340000, 460000, 580000, 700000, 820000, 940000],
	breggle:   [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000],
	elf:       [0, 0, 3500, 7000, 14000, 28000, 56000, 112000, 224000, 450000, 620000, 790000, 960000, 1130000, 1300000, 1470000],
	grimalkin: [0, 0, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000, 450000, 580000, 710000, 840000, 970000, 1100000],
	mossling:  [0, 0, 2200, 4400, 8800, 17600, 35200, 70400, 140800, 280000, 400000, 520000, 640000, 760000, 880000, 1000000],
	woodgrue:  [0, 0, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 260000, 380000, 500000, 620000, 740000, 860000, 980000]
}

// Hit dice per class — die: roll formula for levels 1-10, flat: fixed HP bonus for levels 11+
DOLMENWOOD.hitDice = {
	fighter:   { die: '1d8', flat: 2 },
	thief:     { die: '1d4', flat: 1 },
	cleric:    { die: '1d6', flat: 1 },
	magician:  { die: '1d4', flat: 1 },
	knight:    { die: '1d8', flat: 2 },
	hunter:    { die: '1d8', flat: 2 },
	bard:      { die: '1d6', flat: 1 },
	friar:     { die: '1d4', flat: 1 },
	enchanter: { die: '1d6', flat: 1 },
	breggle:   { die: '1d6', flat: 2 },
	elf:       { die: '1d6', flat: 1 },
	grimalkin: { die: '1d6', flat: 1 },
	mossling:  { die: '1d6', flat: 2 },
	woodgrue:  { die: '1d6', flat: 1 }
}

// Combat talent definitions for Fighter class
DOLMENWOOD.combatTalents = {
	battleRage: {
		nameKey: 'DOLMEN.Traits.Talents.BattleRage',
		descKey: 'DOLMEN.Traits.Talents.BattleRageDesc'
	},
	cleave: {
		nameKey: 'DOLMEN.Traits.Talents.Cleave',
		descKey: 'DOLMEN.Traits.Talents.CleaveDesc'
	},
	defender: {
		nameKey: 'DOLMEN.Traits.Talents.Defender',
		descKey: 'DOLMEN.Traits.Talents.DefenderDesc'
	},
	lastStand: {
		nameKey: 'DOLMEN.Traits.Talents.LastStand',
		descKey: 'DOLMEN.Traits.Talents.LastStandDesc'
	},
	leader: {
		nameKey: 'DOLMEN.Traits.Talents.Leader',
		descKey: 'DOLMEN.Traits.Talents.LeaderDesc'
	},
	mainGauche: {
		nameKey: 'DOLMEN.Traits.Talents.MainGauche',
		descKey: 'DOLMEN.Traits.Talents.MainGaucheDesc'
	},
	slayer: {
		nameKey: 'DOLMEN.Traits.Talents.Slayer',
		descKey: 'DOLMEN.Traits.Talents.SlayerDesc'
	},
	weaponSpecialist: {
		nameKey: 'DOLMEN.Traits.Talents.WeaponSpecialist',
		descKey: 'DOLMEN.Traits.Talents.WeaponSpecialistDesc'
	}
}

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
