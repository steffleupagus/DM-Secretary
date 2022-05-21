const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const levelSchema = require(`${process.cwd()}/database/levelSchema.js`)
const dailyExpSchema = require(`${process.cwd()}/database/dailyExpSchema.js`)

function isLevelMessage(client, message)
{
	if (!message) return false;
	const author  = message.author.id == client.config.avraeId;
	const channel = ((message.channel.id == client.config.xpSpamChannel)||
	 				 (message.channel.id == client.config.dmSpamChannel)||
					 (message.channel.id == client.config.retireChannel));


	const content = (message && message.embeds && message.embeds.length > 0);
	return author && channel && content
}

async function logLevelMessage(client, message, interaction=null, sendResult=true)
{
	const updated = await updateDataFromMessage(client, message)
	if (updated)
	{
		console.log("Update Level Message")
//		var channel = message.guild.channels.resolve(this.config.levelOutputChan);
//		updateLevelMessage(channel);
	}
}

async function getLevelData(search)
{
	//First try a basic find on the exact match
	const result = await levelSchema.findOne(search)
	if (result) return result;

	//If we didn't find a match there, see if we can do a less-precise match and return the first result
	if (search.name)
	{
		const newSearch = {name:search.name}
		const newResult = await levelSchema.find(newSearch)		
		return newResult[0] || null;
	}
	
	return null;
}

function getDuelExp(level)
{
	//Exp table array by level, each entry is an array of [winner, loser]
	var exp = [	[0, 	0],		[0,		0], 	[0,		0],		// 0,  1,  2
				[113, 	37], 	[188,	62], 	[375,	125],	// 3,  4,  5
				[450, 	150],	[563,	187],	[675,	225],	// 6,  7,  8
				[825, 	275],	[900,	300],	[1200,	400],	// 9, 10, 11
				[1500,	500],	[1650,	550],	[1875,	625],	//12, 13, 14
				[2100,	700],	[2400,	800],	[2925,	975],	//15, 16, 17
				[3150,	1050],	[3675,	1125],	[4275,	1425]];	//18, 19, 20		
	return exp[level];
}

/*╔════════════════════════════════════════════════════════╗*\
│ ║ Calculate multiplier from total characters of roleplay ║ │
\*╚════════════════════════════════════════════════════════╝*/
function calculateRoleplayExp(rpData)
{	
	const {length,level} = rpData;
	if (level < 0)
		return 0;
	const total = length;
	const low = 1000;
	const high = 16500;
	const scale = 0.55;
	const round = 0.25;
	const expRound = 25;

	var scaled = (total / high) * 2 * Math.PI; 
		scaled = scaled - (low/high * 2 * Math.PI);
	var raw = Math.max(0, Math.atan(scaled*scale));
	var rounded = Utils.mround(raw, round);
	var mult = rounded;

	var cap = getExpCap(level);	// * 1.5;
	var exp = Utils.mround(cap * mult, expRound);
		exp = Math.min(exp, cap);
	return exp;
}

/*╔═════════════════════════════════════╗*\
│ ║ Calculate exp based on level & mult ║ │
\*╚═════════════════════════════════════╝*/
function getExpCap(level)
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

/// Update the daily exp log, and cap the exp from this data
async function updateDailyExp(data, type, logDate)
{
	data.xp.total = data.xp.xp
	const search = {
		name: data.char,
		user: data.uid,
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
		data.xp.total  = result.exp;
		data.xp.total += data.xp.xp;
		console.log(`Updating exp total. ${result.exp} => ${data.xp.total}`)
	}

	// console.log("Reset:",oldReset)
	// console.log("Logged:",logged)
	// console.log("Now:",Utils.getDate())
	// console.log("New Reset:",newReset)
	
	const newResult = await dailyExpSchema.findOneAndUpdate(
		search,
		{
			name: data.char,
			user: data.uid,
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
	isLevelMessage,
	logLevelMessage,
	getLevelData,
	getDuelExp,
	getExpCap,
	updateDailyExp,
	calculateRoleplayExp,	
}

async function updateLevelData(search, level)
{
	if (search.user == null)
		throw "levelUtils.updateLevelData: User is null"
	
	const timestamp = Date.now();
	const result = await levelSchema.findOneAndUpdate(
		search,
		{
			name: search.name,
			user: search.user,
			level: level,
			update: timestamp
		},
		{
			upsert: true
		})
	return result;
}

async function updateDataFromMessage(client, message)
{
	if (!isLevelMessage(client, message))
		return null;

	const config = client.config;
	const guild  = message.guild;
	const embed = message.embeds[0];
	const title = embed.title;
	const desc = embed.description;

	let data = [];
	let updateLevelMessage = false;

	//Parse data from the title
	if (title)
	{
		data.push(parseExpMessage(title));
		data.push(parseCurrentLevelMessage(title));
		data.push(parseLevelSummaryMessage(title, embed.fields));
		data.push(parseSetupMessage(title));
		data.push(parseDMAwardMessage(title,desc));
		data.push(parseRetireMessage(title));
	}

	//Parse the Author
	if (embed.author)
		data.push(parseAuthor(guild, embed.author));

	//Look for the Next Level field
	data.push(parseNextLevelField(embed.fields));

	//Churn that into some final data
	var finalData = {};
	data.forEach(d=>{
		finalData = Object.assign(finalData, d);
	});
	if (finalData.hasOwnProperty('name') && finalData.name != "")
	{
		if (finalData.hasOwnProperty('delete'))
		{
			console.log("DELETE: ", finalData.delete);

			// message.react("💀")
			// updateLevelMessage = true;
			// levelData.removeItem(finalData.delete);
		}
		else
		{
			console.log("UPDATE: ", finalData);

			const query = {name: finalData.name, user: finalData.user}
			const oldRecord = await updateLevelData(query, finalData.level);
			message.react(config.xpemoji)

			console.log("PREVIOUS: ", oldRecord)
			updateLevelMessage = (!oldRecord || finalData.level != oldRecord.level)
		}
	}
	return updateLevelMessage;
}





function parseExpMessage(title)
{
	var pattern = "(.*) (?:gains|loses) ([0-9,]*) Experience";
		pattern+= "(?: and levels up to )?([0-9]+)?(?:..)?(?: level)?!";
	var regex = new RegExp(pattern,"gi");

	var data = {};
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.level = matches[0][3];
		console.log("Experience:", data);
	}
	return data;
}	
 
function parseCurrentLevelMessage(title)
{
	var pattern = "(.*) is currently ([0-9]+).. level!";
	var regex = new RegExp(pattern,"gi");

	var data = {};
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		// console.log(matches);
		data.name = matches[0][1];
		data.level = parseInt(matches[0][2]);
		console.log("Level:", data);
	}
	return data;
}

function parseLevelSummaryMessage(title, fields)
{
	var pattern = "Level Summary for (.*):";
	var regex = new RegExp(pattern,"gi");

	var data = {};
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		// console.log(matches);
		data.name = matches[0][1];
	}

	fields.forEach(field=>
	{
		if (field.name=="Total Level")
		{
			var value = field.value.replace(/[^\d]/g, "");
			data.level = parseInt(value);
			console.log("Level:", data);
		}
	});
	return data;
}

function parseSetupMessage(title)
{
	var pattern = "Initial Setup for: (.*)";
	var regex = new RegExp(pattern,"gi");

	var data = {};
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		console.log("Setup:", data);
	}
	return data;
}	

function parseDMAwardMessage(title,desc)
{
	var data = {};

	var tPattern = "(.*) gains .*"
	var tRegex = new RegExp(tPattern,"gi");
	var tMatches = [...title.matchAll(tRegex)];
	if (tMatches.length > 0)
		data.name = tMatches[0][1];

	var dPattern = "You advance to Level ([0-9]+)!"
	var dRegex = new RegExp(dPattern,"gi");	
	var dMatches = [...title.matchAll(dRegex)];
	if (dMatches.length > 0)
	{
		data.level = dMatches[0][1];
	}

	dPattern = "(.*) gains [0-9,xp]* \(([0-9,])xp total)"
	dRegex = new RegExp(dPattern,"gi");	
	dMatches = [...title.matchAll(dRegex)];
	if (dMatches.length > 0)
	{
		data.exp = dMatches[0][1];
	}

	if (data.level || data.exp)
		console.log("DM Award:", data);
	return data;
}

function parseRetireMessage(title)
{
	var pattern = "(.*) has (?:retired from adventuring|perished)...";
	var regex = new RegExp(pattern,"gi");

	var data = {};
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.delete = matches[0][1];
		console.log("Retire:", data);
	}
	return data;
}

function parseAuthor(guild, author)
{
	var data = {}
	var displayName = author.name;
	let serverMembers = guild.members
	
	let matchedMember = serverMembers.cache.find(m => m.displayName === displayName);
	if (matchedMember)
	{
		data.user = matchedMember.user.id;
		console.log("Author:", data);
	}
	return data;
}

function parseNextLevelField(fields)
{
	var data = {};
	fields.forEach(field=>
	{
		if (field.name=="Current Experience")
		{
			var value = field.value.replace(/[^\d]/g, "");
			data.exp = parseInt(value);
		}
		if (field.name.startsWith("Next Level: "))
		{
			var level = field.name.replace("Next Level: ","");
			data.level = parseInt(level) - 1;
		}
	});

	if (data.level || data.exp)
		console.log("Next Level:", data);
	return data;
}