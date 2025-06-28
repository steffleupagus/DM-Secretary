const Utils = require(`../utilities/utilFuncs.js`)
const dailyExpSchema = require(`../database/dailyExpSchema.js`)

/*╔════════════════════════════╗*\
│ ║ Get exp cap based on level ║ │
\*╚════════════════════════════╝*/
function getDuelExpCap(level)
{
	const cap = [	0,				0,				0,	
					150,			250,			500,	
					600,			750,			900,
					1100,			1200,			1600,
					2000,			2200,			2500,
					2800,			3200,			3900,
					4200,			4900,			5700		];

	//const cap = [	0,				0,				0,	
	// 				200,			350,			700,	
	// 				850,			1000,			1200,
	// 				1400,			1600,			1600,
	// 				2000,			2200,			2500,
	// 				2800,			3500,			4000,
	// 				4500,			5000,			6000		];	
	return cap[level];
}


function getDuelExp(level)
{
	//Exp table array by level, each entry is an array of [winner, loser]
	const exp = [	[0, 	0],		[0,		0], 	[0,		0],		// 0,  1,  2
					[113, 	37], 	[188,	62], 	[375,	125],	// 3,  4,  5
					[450, 	150],	[563,	187],	[675,	225],	// 6,  7,  8
					[825, 	275],	[900,	300],	[1200,	400],	// 9, 10, 11
					[1500,	500],	[1650,	550],	[1875,	625],	//12, 13, 14
					[2100,	700],	[2400,	800],	[2925,	975],	//15, 16, 17
					[3150,	1050],	[3675,	1125],	[4275,	1425]];	//18, 19, 20

	// const exp = [	[0, 	0],		[0,		0], 	[0,		0],		// 0,  1,  2
	// 				[150,	50],	[265,	90],	[525,	175],	// 3,  4,  5
	// 				[640,	215],	[750,	250],	[900,	300],	// 6,  7,  8
	// 				[1050,	350],	[1200,	400],	[1200,	400],	// 9, 10, 11
	// 				[1500,	500],	[1650,	550],	[1875,	625],	//12, 13, 14
	// 				[2100,	700],	[2625,	875],	[3000,	1000],	//15, 16, 17
	// 				[3375,	1125],	[3750,	1250],	[4500,	1500]];	//18, 19, 20

	return exp[level];
}

/*╔════════════════════════════════════════════════════════╗*\
│ ║ Calculate multiplier from total characters of roleplay ║ │
\*╚════════════════════════════════════════════════════════╝*/
function calculateSingleDayRPMult(total)	
{
	const magicA = 1.4
	const magicB = 0.8
	const low    = 500
	const high   = 10000
	const round  = 0.1

	let scaled = ( (total - low) / high) * 2 * Math.PI; 
	let mult   = ( (scaled*magicA) / Math.sqrt(scaled*scaled+magicA*magicA) ) * magicB	
		mult   = Utils.mround(mult, round)
	return mult
}

function calculateMultiDayRPMult(total, dayCap)
{
	const magicA = 10
	const magicB = 3.1
	const cap    = 3
	const high   = 20000
	const round  = 0.1

	let sigma  = magicA * (total / high) - magicB;
	let mult   = (magicB/(1+Math.exp(-1*sigma)))-(magicB-cap)
		mult   = Utils.mround(mult, round)
	return mult
}

function calculateHybridRPMult(total, days)
{
	let mult = 0
	if (days == 1 || total < 5000)
		mult = calculateSingleDayRPMult(total)
	else
		mult = calculateMultiDayRPMult(total);

	mult = Utils.precise(Math.min(Math.max(0, mult), days))
	return mult;
}

/*╔═════════════════════════════════════╗*\
│ ║ Calculate exp based on level & mult ║ │
\*╚═════════════════════════════════════╝*/
function calculateRoleplayExp(level, mult)
{
	const expRound = 10;
	let cap = getRPExpCap(level);
	let exp = Utils.mround(cap * mult, expRound);
	return exp;	
}

/*╔════════════════════════════╗*\
│ ║ Get exp cap based on level ║ │
\*╚════════════════════════════╝*/
function getRPExpCap(level)
{
	var cap = [ 0,				0,				0,	
				150,			250,			500,	
				600,			750,			900,
				1100,			1200,			1600,
				2000,			2200,			2500,
				2800,			3200,			3900,
				4200,			4900,			5700		];
	return cap[level];
}

/*╔════════════════════════════╗*\
│ ║ Get exp cap based on level ║ │
\*╚════════════════════════════╝*/
function getTableExpCap(level)
{
	var cap = [	0,		0,		0,		500,	500,			//3-4
				1000,	1000,	1000,	1000,	1000,	1000,	//5-10
				1500,	1500,	1500,	1500,	1500,	1500,	//11-16
				2000,	2000,	2000,	2000	];				//17-20
	return cap[level];
}

/*╔═══════════════════════════════════════════════╗*\
│ ║ Reset the daily exp log for a given character ║ │
\*╚═══════════════════════════════════════════════╝*/
async function resetDailyExp(char) {
	const records = await dailyExpSchema.deleteMany(char)
	console.log(records)
}


/*╔══════════════════════════════════════════════════════════╗*\
│ ║ Update the daily exp log, and cap the exp from this data ║ │
\*╚══════════════════════════════════════════════════════════╝*/
async function updateDailyExp(data, type, logDate)
{
	data.xp.total = data.xp.xp
	const search = {
		name: data.char,
		user: data.uid || data.user,
		type: type
	}

	let oldReset;
	const logged = new Date(logDate)
	const newReset = new Date(new Date(logDate).setHours(24,0,0,0))

	const result = await dailyExpSchema.findOne(search)
	if (result)
	{
		oldReset = new Date(result.reset)
		if (logDate >= result.reset)
		{
			console.log("Resetting daily cap")
			result.exp = 0
			result.cap = data.xp.cap
		}

		data.xp.xp = Math.min(data.xp.xp, result.cap - result.exp);
		if (data.xp.xp < 0) data.xp.xp = 0
		data.xp.total  = result.exp;
		data.xp.total += data.xp.xp;
		console.log(`Updating exp total. ${result.exp} => ${data.xp.total}`)
	}

	// console.log("Reset:",oldReset)
	// console.log("Logged:",logged)
	// console.log("Now:",Utils.getDate())
	// console.log("New Reset:",newReset)
	if (data.xp.xp < 0)
		data.xp.total = Math.max(0, data.xp.total)

	const newResult = await dailyExpSchema.findOneAndUpdate(
		search,
		{
			name: data.char,
			user: data.uid || data.user,
			type: type,
			exp: data.xp.total,
			cap: data.xp.cap,
			reset: newReset
		},
		{
			new: true,
			upsert: true
		})
	console.log(result, newResult, "\n\n\n")
	return data
}

module.exports = {
	getDuelExp,
	getDuelExpCap,
	updateDailyExp,
	resetDailyExp,
	getRPExpCap,
	calculateSingleDayRPMult,
	calculateMultiDayRPMult,
	calculateHybridRPMult,
	calculateRoleplayExp
}