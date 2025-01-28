const { DateTime } = require("luxon");
const Utils = require(`../utilities/utilFuncs.js`)
const dailyExpSchema = require(`../database/dailyExpSchema.js`)

/*╔════════════════════════════╗*\
│ ║ Get exp cap based on level ║ │
\*╚════════════════════════════╝*/
function getDuelExpCap(level)
{
/*	const cap = [	0,				0,				0,				//	0,		1,		2,
					150,			250,			500,			//	3,		4,		5,
					600,			750,			900,			//	6,		7,		8,
					1100,			1200,			1600,			//	9,		10,		11,
					2000,			2200,			2500,			//	12,		13,		14,
					2800,			3200,			3900,			//	15,		16,		17,
					4200,			4900,			5700	];		//	18,		19,		20
*/
	const cap = [	0,				0,				0,				//	0,		1,		2,
					200,			350,			600,			//	3,		4,		5,
					800,			1000,			1200,			//	6,		7,		8,
					1400,			1600,			1800,			//	9,		10,		11,
					2000,			2200,			2500,			//	12,		13,		14,
					2800,			3200,			3900,			//	15,		16,		17,
					4500,			5200,			6000	];		//	18,		19,		20
	return cap[level];
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

/*╔══════════════════════════════════════════════════════════╗*\
│ ║ Update the daily exp log, and cap the exp from this data ║ │
\*╚══════════════════════════════════════════════════════════╝*/
async function applyDuelExp(data, logDate, reset) { return applyDailyExp(data, logDate, reset, "duel") }
async function undoDuelExp(data) {return applyDailyExp(data, 0, 1, "duel", true) }
async function resetDuelExp(data) { return applyDailyExp(data, -1, 0, "duel") }
async function applyDailyExp(data, logDate, reset, type, undo = false) {
	//Generate a query and find the previous record (if any)
	const { name, user, xpCap:cap } = data
	const query = { name, user, type }
	const record = (await dailyExpSchema.findOne(query)) ?? { exp:0, reset:0 }

	if (record) {
		//If the newly logged record is after the reset, clear the current exp and cap
		if (logDate >= record.reset || logDate < 0) record.exp = 0
		//Note if the result has been capped for display purposes
		if ((record.exp + data.xpAmt) > cap) data.capped = true
		//Update the xp amount and cumulative exp total
		if (undo) data.xpMod = Math.min(0, -data?.xpMod ?? -data?.xpAmt ?? 0)
		else data.xpMod = Math.max(0, Math.min(data.xpAmt, cap - record.exp))
		data.xpCum = Math.max(0, record.exp + data.xpMod)
		//console.log(`Updating exp total. ${record.exp} => ${data.xpCum}`)
		if (undo) reset = record.reset
	}

	//Generate an update to push to the database
	const update = { name, user, type, exp:data.xpCum, cap, reset }
	const options = { new: true, upsert: true }
	const newResult = await dailyExpSchema.findOneAndUpdate( query, update, options )

	//Return the modified character data with the capped information
	return data
}

async function updateDailyExp(data, type, logDate) {
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
	if (result) {
		oldReset = new Date(result.reset)
		if (logDate >= result.reset) {
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

	if (data.xp.xp < 0) data.xp.total = Math.max(0, data.xp.total)

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
	getDuelExpCap,
	applyDuelExp,
	resetDuelExp,
	undoDuelExp,

	updateDailyExp,

	getRPExpCap,
	calculateSingleDayRPMult,
	calculateMultiDayRPMult,
	calculateHybridRPMult,
	calculateRoleplayExp
}