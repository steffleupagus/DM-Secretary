const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils = require(`../utilities/utilFuncs.js`)
const chanUtils = require(`../utilities/channelUtils.js`)
const tupperSchema = require(`../database/tupperSchema.js`)

function parseTupperLog(client, message, silent = true)
{
	if (isTupperLogMessage(client, message))
	{
		if (!silent)
			console.log(" +++ Parsing tupper log message (" + message.id + ")");
		const embed = message.embeds[0];
		var tupperName = embed.title;
		var authorId = embed.fields.find(field => field.name == 'Registered by');
			authorId = authorId.value.match(/[0-9]+/g)[0];
		var user = client.users.resolve(authorId);
		var member = message.guild.members.resolve(authorId);
		var name = member ? member.displayName : (user ? user.username : null);
		var content = embed.description;
		if (content.includes("Proxy Edited"))
			content = content.substr(content.indexOf("After:")+9)
		var messageId = embed.footer.text.replace("Message ID ", "");
		var channelId = embed.fields.find(field => field.name == 'Channel');
		channelId = channelId.value.match(/[0-9]+/g)[0];
		if (authorId && content && messageId)
		{
			tupperData = {
			//	logId:message.id,
				cId:channelId,
				mId:messageId,
				aId:authorId,
			//	u:name,
				t:tupperName,
				time:message.createdTimestamp,
				len:content.length,
			};
			return tupperData;
		}
	}
	return null;
}

///
/// Public
///
function isTupperProxyMessage(message)
{
	if (!message) return false;
	const isBot = message.author.bot;
	const isTupper = message.applicationId == config.bots.tupper;
	const isWebhook = message.webhookId;
	return (isBot && isTupper && isWebhook);	
}

function isTupperLogMessage(client, message)
{
	if (!message) return false;
	const author  = message.author.id == client.config.bots.tupper;
	const channel = message.channel.id == client.config.chan.tupperLog;
	const content = (message && message.embeds && message.embeds.length > 0);
	return author && channel && content
}

async function logTupperMessage(client, message)
{
	if (isTupperLogMessage(client, message))
	{
		const tupperData = parseTupperLog(client, message)
		if (tupperData)
		{
			if (process.env.mod == "dev")
				return tupperData;
			
			const channel = message.guild.channels.resolve(tupperData.cId);
			if (channel && (chanUtils.isRoleplayChannel(channel) ||
							chanUtils.isRoleplayThread(channel)))
			{
				const newResult = await tupperSchema.findOneAndUpdate(
					{ mId: tupperData.mId },
					tupperData,
					{
						new: true,
						upsert: true
					})
				await message.react('🛢️');
			}
		}
		return tupperData;
	}
	return null;
}

async function deleteTupperProxyMessage(client, message)
{
	if (isTupperProxyMessage(message))
	{
		const result = await getTupperLog({mId: message.id});
		console.log(result);
		await tupperSchema.deleteMany({mId: message.id});
		return result;
	}
	return null;
}

async function getTupperLogLegacy(search)
{
	const legacyLog = require(`../config/tupperMap.json`);
	const result = legacyLog[search.mId];
	result.aId = result.uid;	
	return result;
}

async function getTupperLog(search)
{
//	return getTupperLogLegacy(search);
	
	const result = await tupperSchema.findOne(search)
	return result;
}

async function getTupperData(message)
{
	const query = {mId:message.id};
	const result = await getTupperLog(query);
	return result;	
}

async function cleanTupperData()
{
	const offset = 360 * 25 * 60 * 60 * 1000
	const timestamp = Date.now() - offset	
	const query = {time:{$lt:timestamp}};	//1672531200000}};
	const result = await tupperSchema.find(query);
	const deleted = await tupperSchema.deleteMany(query);
	console.log(query, result.length, deleted)
	return deleted.deletedCount
}

module.exports = {
	isTupperProxyMessage,
	isTupperLogMessage,
	logTupperMessage,
	parseTupperLog,
	getTupperData,
	deleteTupperProxyMessage,
	cleanTupperData
}

