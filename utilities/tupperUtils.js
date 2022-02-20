const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const tupperSchema = require(`${process.cwd()}/database/tupperSchema.js`)

///
/// Private
///
function parseTupperLog(client, message)
{
	if (isTupperLogMessage(client, message))
	{
		console.log(" +++ Parsing tupper log message (" + message.id + ")");
		const embed = message.embeds[0];
		var tupperName = embed.title;
		var authorId = embed.fields.find(field => field.name == 'Registered by');
			authorId = authorId.value.match(/[0-9]+/g)[0];
		var user = client.users.resolve(authorId);
		var member = message.guild.members.resolve(authorId);
		var name = member ? member.displayName : (user ? user.username : null);
		var content = embed.description;
		var messageId = embed.footer.text.replace("Message ID ", "");
		var channelId = embed.fields.find(field => field.name == 'Channel');
		channelId = channelId.value.match(/[0-9]+/g)[0];
		if (authorId && content && messageId)
		{
			tupperData = {
				logId:message.id,
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
///
///
function isRoleplayChannel(channel)
{
	const isRPChannel = channel.name.includes("🗣")
	return isRPChannel;
}


///
/// Public
///
function isTupperProxyMessage(message)
{
	if (!message) return false;
	const isBot = message.author.bot;
	const isTupper = message.applicationId == config.tupperId;
	const isWebhool = message.webhookId;
	return (isBot && isTupper && isWebhook);	
}

function isTupperLogMessage(client, message)
{
	if (!message) return false;
	const author  = message.author.id == client.config.tupperId;
	const channel = message.channel.id == client.config.tupperLogChannel;
	const content = (message && message.embeds && message.embeds.length > 0);
	return author && channel && content
}

async function logTupperMessage(client, message, interaction=null, sendResult=true)
{
	if (isTupperLogMessage(client, message))
	{
		const logged = await getTupperLog({logId:message.id});
		if (!logged)
		{
			const tupperData = parseTupperLog(client, message)
			if (tupperData)
			{
				const channel = message.guild.channels.resolve(tupperData.cId);
				if (channel && isRoleplayChannel(channel))
				{
					console.log(tupperData)
					await new tupperSchema(tupperData).save()
				}
			}
		}
	}
}

async function getTupperLog(search)
{
	const result = await tupperSchema.findOne(search)
	return result;
}



module.exports = {
	isTupperProxyMessage,
	isTupperLogMessage,
	logTupperMessage
}

