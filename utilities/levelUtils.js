const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const levelSchema = require(`${process.cwd()}/database/levelSchema.js`)


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
	const result = await levelSchema.findOne(search)
	return result;
}

module.exports = {
	isLevelMessage,
	logLevelMessage,
	getLevelData
}

async function updateLevelData(search, level)
{
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
			message.react("<:xp:858887927899226112>")

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