const mod       = process.env.mod || "";
const config    = require(`../config/${mod}_config.json`);

const Embed     = require(`../utilities/EmbedPaginator.js`)
const Utils     = require(`../utilities/utilFuncs.js`)
const MsgUtils  = require(`../utilities/messageUtils.js`)
const CharUtils = require(`../utilities/charUtils.js`)

//const levelSchema = require(`../database/levelSchema.js`)
// const dailyExpSchema = require(`../database/dailyExpSchema.js`)

/// Identify if the message argument could potentially belong to a level message
function isLevelMessage(client, message) {
	if (!message) return false;
	const channel = ((message.channel.id == client.config.chan.xpSpam)||
					 (message.channel.id == client.config.chan.dmSpam)||
					 (message.channel.id == client.config.chan.retire)||
					 (message.channel.id == client.config.chan.builder)||
					 (message.channel.id == client.config.chan.dragonspeaker)||
					 (message.channel.id == client.config.debug.profile));
	const content = (message && message.embeds && message.embeds.length > 0);
	const author  = channel ? message.author?.id == client.config.bots.avrae : false;
	return author && channel && content
}

/// Parse relevant level message data
async function parseLevelMessage(client, message) {
	if (!isLevelMessage(client, message))
		return null;

	const config = client.config;
	const guild  = message.guild;
	const embed  = message.embeds[0];
	const author = embed.author;
	const title  = embed.title;
	const desc   = embed.description;
	const fields = embed.fields;
	const data   = [];

	//Parse the Author
	const authorData = author ? await parseAuthor(guild, author) : null
	if (authorData) data.push(authorData);

	//Parse data from the title
	if (title)
	{		
		data.push(parseExpMessage(title));							//gains|loses Experience
		data.push(parseCurrentLevelMessage(title));					//is currently X level!
		data.push(parseLevelSummaryMessage(title, embed.fields));	//Level Summary for (.*):
		data.push(parseSetupMessage(title));						//Initial Setup for: (.*)
		data.push(parseDMAwardMessage(title,desc));					//gains xp (xp total)
		data.push(parseRetireMessage(title));						//has retired from adventuring
		data.push(parseRespecMessage(title));						//is being respecced
	}

	//Look for the Next Level field
	if (embed.fields)
	{
		data.push(parseNextLevelField(embed.fields));				//Current Experience // Next Level
		data.push(parseMetaDataField(embed.fields));				//Char Data // metadata link
	}

	//Churn that into some final data
	var finalData = {};
	data.forEach(d => { finalData = Object.assign(finalData, d) });
	if (finalData && Object.keys(finalData).length > 1)
		console.log("FinalData:", finalData)
	return finalData;
}

/// Get the user for whom this command was run from embed author
async function parseAuthor(guild, author) {
	var data = {}
	var displayName = author.name.toLowerCase();
	let serverMembers = guild.members
	let matchedMember = serverMembers.cache.find(m => ((m.displayName.toLowerCase() === displayName) || 
													   (m.user.username.toLowerCase() === displayName)));
		matchedMember = matchedMember || (await guild.members.fetch({ query: author.name, limit: 1 })).first()		
	if (matchedMember)
	{
		data.user = matchedMember.user.id;
		//console.log("Author:", data);
	}
	return data;
}

/// Parse data from the `!xp` command response
function parseExpMessage(title) {
	var data = {};
	var pattern = "(.*) (?:gains|loses) ([0-9,]*) Experience";
		pattern+= "(?: and levels up to )?([0-9]+)?(?:..)?(?: level)?!";
	var regex = new RegExp(pattern,"gi");
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.level = matches[0][3];
		console.log("Experience:", data);
	}
	return data;
}	

/// Parse data from the `!level` command response
function parseCurrentLevelMessage(title) {
	var data = {};
	var pattern = "(.*) is currently ([0-9]+).. level!";
	var regex = new RegExp(pattern,"gi");
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

/// Parse data from the `!level` command response
function parseLevelSummaryMessage(title, fields) {
	var data = {};
	var pattern = "Level Summary for (.*):";
	var regex = new RegExp(pattern,"gi");
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
		data.name = matches[0][1];

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

/// Parse data from the `!setup` command response
function parseSetupMessage(title) {
	var data = {};
	var pattern = "Initial Setup for: (.*)";
	var regex = new RegExp(pattern,"gi");
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.upsert = true;
		console.log("Setup:", data);
	}
	return data;
}	

/// Parse data from the `!dmaward` command response
function parseDMAwardMessage(title,desc) {
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
		data.level = dMatches[0][1];

	dPattern = "(.*) gains [0-9,xp]* \(([0-9,])xp total)"
	dRegex = new RegExp(dPattern,"gi");	
	dMatches = [...title.matchAll(dRegex)];
	if (dMatches.length > 0)
		data.exp = dMatches[0][1];

	if (data.level || data.exp)
		console.log("DM Award:", data);
	return data;
}

/// Parse data from the `!retire` command response
function parseRetireMessage(title) {
	var data = {};
	var pattern = "(.*) has (?:retired from adventuring|perished)...";
	var regex = new RegExp(pattern,"gi");
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.delete = matches[0][1];
		console.log("Retire:", data);
	}
	return data;
}

/// Parse data from the `!respec` command response
function parseRespecMessage(title) {
	var data = {};
	var pattern = "(.*) is being respecced";
	var regex = new RegExp(pattern,"gi");
	var matches = [...title.matchAll(regex)];
	if (matches.length > 0)
	{
		data.name = matches[0][1];
		data.delete = matches[0][1];
		console.log("Respec:", data);
	}
	return data;
}

/// Parse data from the `Current Experience` and `Next Level` field
function parseNextLevelField(fields) {
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

	if (data.level || data.exp) console.log("Next Level:", data);
	return data;
}

/// Parse the metadata link from the `Char Data` field
function parseMetaDataField(fields) {
	var data = {};
	fields.forEach(field=>
	{
		if (field.name=="** **" && field.value.includes("metadata"))
		{		
			var value = field.value.replace(/\-\# \[metadata\]\(http\:\/\/tinyurl\.com\/tjson\?input\=(.*)\)/g, "$1");	
				value = decodeURIComponent(value)
			console.log(value)
				value = value.replace(/"id":([0-9]+)/g,`"id":"$1"`)
			console.log(value)
				value = JSON.parse(value)
			data.user = value.id;
			data.sheetId = value.ch;

			console.log("Metadata Field:", data);
		}
	});

	return data;
}




async function updateLevelData(finalData)
{
	let updateLevelMessage = false;
	if (finalData.hasOwnProperty('name') && finalData.name != "")
	{
		const query = {name: finalData.name, user: finalData.user}

		if (finalData.hasOwnProperty('delete'))
		{
			console.log("DELETE: ", finalData, "\n", query);
			if (query.name && query.user)
			{
				const oldRecord = await PurgeChar(query);	
				if (oldRecord)
				{
					await message.react("💀")
					updateLevelMessage = true;
				}
				else
					await message.react("❓")
			}
		}
		else
		{
			console.log("UPDATE: ", finalData);

			const oldRecord = await updateLevelData(query, finalData.level);	
			await message.react(config.emoji.xp)

			console.log("PREVIOUS: ", oldRecord)
			updateLevelMessage = (!oldRecord || finalData.level != oldRecord.level)
			if (oldRecord && finalData.level != oldRecord.level)
				await message.react("🥳");			
		}
	}
	return updateLevelMessage;
}



async function messageReact(message, finalData)
{
	// let success = false // TODO: Replace this with the result of the DB operation
	// let levelUp = false // TODO: React with this if the level increased from the DB operation
	// if (finalData.delete)
	// {
	// 	if (success)
	// 		await message.react("💀")
	// 	else 
	// 		await message.react("❓")
	// }
	// else
	// {
	// 	await message.react(config.emoji.xp)
	// 	if (levelUp)
	// }
}





module.exports = {
	isLevelMessage,
	parseLevelMessage,




	logLevelMessage,
	getLevelData,
	updateLevelMessage,
	PurgeUser,
	PurgeChar
}





async function logLevelMessage(client, message, interaction=null, sendResult=true)
{
	const updated = await updateDataFromMessage(client, message)
	return updated
}

async function updateLevelMessage(channel)
{
	const levelData = CharUtils.charCache;
	const outputData = {};

	levelData.forEach( char =>
	{
		let key = char.name;
		let level = char.level;
		if (level <= 3) return;

		outputData[level] = outputData[level] ?? [];
		if (key.length > 25) key = key.substring(0, 22) + "...";
		outputData[level].push(key);		
	});

	const embed = new Embed()
		  embed.setTitle('Character Levels')
		  embed.setColor(0x00ff00)
		  embed.setFooter({text:'Procedurally generated by level up messages in #🌐💰-reward-and-loot-spam'});

	for (var [level, list] of Object.entries(outputData))
	{		
		list = list.sort();

		var listSize = 20;
		if (list.length <= 20)
			listSize = list.length
		else if (list.length <= 40)
			listSize = (list.length / 2) + 1
		if (listSize > 20)
			listSize = 20;

		var s = 1;
		var totalList = list.length;
		while (list.length > 0)
		{
			var subList = list.splice(0, listSize);
			var e = s + subList.length - 1;
			var r = s+"-"+e;
			if (totalList <= listSize)
				r = totalList;
			embed.addField("Level "+level+" ("+r+")", subList.join("\n"), true);
			s = e+1;
		}
	}

	await MsgUtils.channelCleanup(channel)
	embed.send(channel)
	return;
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

async function PurgeChar(char)
{
	if (!char) return;
	let records = await levelSchema.findOneAndDelete(char);
	console.log("Chars",records)
	return records
}
		
async function PurgeUser(user)
{
	if (!user) return;
	const query = { user: user };
	let records = await levelSchema.deleteMany(query);
	console.log("Chars",records);
	records = await dailyExpSchema.deleteMany(query);
	console.log("Daily",records);
}



async function updateLevelData_OLD(search, level)
{

//TODO - REPLACE THIS
	
	// if (search.user == null)
	// 	throw "levelUtils.updateLevelData: User is null"
	
	// const timestamp = Date.now();
	// const result = await levelSchema.findOneAndUpdate(
	// 	search,
	// 	{
	// 		name: search.name,
	// 		user: search.user,
	// 		level: level,
	// 		update: timestamp
	// 	},
	// 	{
	// 		upsert: true
	// 	})
	
	// return result;
}
