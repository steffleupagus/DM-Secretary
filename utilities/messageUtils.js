const Utils = require(`./utilFuncs.js`)
const Tupper = require(`./tupperUtils.js`)
const ChannelMeta = require(`../database/chanMetaSchema.js`)
const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const _regex = "[`-]{3}\n? ?(<\:.*\:[0-9]+>|\-+COMBAT ENDED\-+)? ?\n?[`-]{3}"
const BreakRegex = new RegExp(_regex);
const DEBUG = false;

function debug(msg)
{
	if (DEBUG)
		console.log(msg)
}

//Use with caution
async function channelCleanup(channel)
{
	const messages = await getMessageRange(channel);
	console.log(`Channel cleanup: Deleting ${messages.length} messages.`)
	deleteMessages(messages);

	// let messages = await channel.messages.fetch({limit: 100});
	// console.log(`Channel cleanup: Deleting ${messages.size} messages.`)
	// 	await channel.bulkDelete(messages);
	// if (messages.size >= 2)
	// 	await channelCleanup(channel);
}

///
/// Delete an array of messages
///
async function deleteMessages(messages)
{
	await Utils.asyncArrayForEach(messages, async (message) =>
	{
		await message.delete();
		await Utils.slowdown(100);
	})
}

///
/// Get all messages between the specified bookends (excludes bookends)
///
async function getMessageRange(channel, start_id = null, end_id = null, limit = 10000)
{
	const iterLimit = Math.min(limit, 100);
	let allMessages = [];
	let prevMessages = null;
	let count = 0;
	while (true)
	{
		let options = { limit: iterLimit };
		if (start_id) options.after = start_id;
		let messages = await channel.messages.fetch(options);

		if (end_id)
		{
			console.log({ "TESTING": "INTERSECTION" })
			options = { limit: iterLimit, before: end_id };
			var msgBefore = await channel.messages.fetch(options);
			messages = messages.intersect(msgBefore);
		}

		messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
		allMessages.push(...messages.values());

		if (messages != null && messages.size > 0)
		{
			start_id = messages.last().id;
			if (end_id)
				end_id = false;
		}

		if (messages.size != iterLimit)
			break;
		if (allMessages.length >= limit)
		{
			console.log("!!! " + channel.name + ": REACHED MESSAGE LIMIT OF " + limit);
			break;
		}

		if (prevMessages)
		{
			const sanity = messages.intersect(prevMessages);
			if (sanity.size > 0)
			{
				console.log("\n\n\n\n\n" + sanity.size + " DUPLICATES\n\n\n\n\n");
				break;
			}
		}
		prevMessages = messages;

		count = (count + 1) % 5
		if (count == 0)
		{
			console.log(`${channel.name}: ${messages.size}`);
			await Utils.slowdown(1500);
		}
		await Utils.slowdown(250);
	}
	return allMessages;
}


///
/// Find messages and stop at a given regex.
/// By default: searches backwards from a given endpoint (most recent messages)
///
async function findRegexBreak(channel, regex, limit = 500, bookend = null, forward = false)
{
	var breakId = null;
	let options = {};
	let remaining = limit;
	let retMsgs = [];

	while (remaining > 0)
	{
		options.limit = remaining > 100 ? 100 : remaining;
		remaining = remaining > 100 ? remaining - 100 : 0;
		if (bookend)
		{
			if (forward)
				options.after = bookend;
			else
				options.before = bookend;
		}
		let messages = await channel.messages.fetch(options);
		if (!messages.last())
			break;

		bookend = forward ? messages.first().id : messages.last().id;

		messages = [...messages.values()];
		if (forward) messages = messages.reverse()

		for (var m = 0; m < messages.length; ++m)
		{
			var msg = messages[m];
			var id = msg.id;
			var author = msg.author;
			var content = msg.content.trim();

			if (forward)
				retMsgs.push(msg);
			else
				retMsgs.unshift(msg);
			if (regex.test(content))
			{
				breakId = id;
				break;
			}
		}

		if (breakId)
			break;
	}

	return { id: breakId, messages: retMsgs };
}

//Find the most recent scene break (optionally most recent before a given message)
async function findLastBreak(channel, message = null, limit = 500)
{
	console.log(`findLastBreak (${message ? message.id : null})`)
	let data = message
		? await findRegexBreak(channel, BreakRegex, limit, message.id)
		: await findRegexBreak(channel, BreakRegex, limit);
	data.start = data.id;
	return data;
}

//Find the next scene break forward from a given message
async function findNextBreak(channel, message, limit = 500)
{
	console.log(`findNextBreak (${message.id})`)
	let data = await findRegexBreak(channel, BreakRegex, limit, message.id, true);

	//Include the starting point for this one
	{
		data.messages.unshift(message)
		data.id = message.id
	}
	return data
}

//Find the scene break fenceposts in both directions from a given message
async function findFenceposts(channel, message, limit = 500) 
{
	console.log(`findFenceposts (${message.id})`)
	const before = await findLastBreak(channel, message, limit)
	const after = await findNextBreak(channel, message, limit)
	const messages = before.messages.concat([message]).concat(after.messages);
	return { start: before.id, end: after.id, messages: messages };
}

///
/// Get the roleplay data
///
async function getRoleplayData(rpChan, message = null) 
{
	//Get the RP data
	const roleplay = message
		? await findFenceposts(rpChan, message)
		: await findLastBreak(rpChan);
	const rpData = await scrapeMessages(roleplay.messages);
	if (rpData)
		rpData.start = roleplay.messages[0].url;
	return rpData;
}







///
/// Identify if a channel is an RP channel
///
function isRoleplayChannel(channel)
{
	return channel.name.includes("🗣");
}

function isRoleplayThread(channel)
{
	return channel.isThread() &&
		isRoleplayChannel(channel.parent) &&
		!channel.name.includes("⚙");
}

async function isRPExpChannel(channel)
{
	const result = await ChannelMeta.findOne({ channelId: channel.id });
	return result && result.awardsExp;
}

async function isRPExpThread(channel)
{
	if (!channel.isThread()) return false
	const result = await isRPExpChannel(channel.parent);
	return result
}

async function isRPExpEligible(channel)
{
	if (channel.isThread())
		return await isRPExpThread(channel)
	return await isRPExpChannel(channel)
}

///
/// Scrape the entire guild for new messages
///
async function scrapeAll(guild, startMsg, stats = null)
{
	return await scrapeGuildChannels(guild, startMsg, stats);
}

async function scrapeGuild(guild, startMsg, stats = null)
{
	return await scrapeGuildChannels(guild, startMsg, stats);
}

async function scrapeGuildChannels(guild, startMsg, stats = null)
{
	//Loop over all channels
	await Utils.asyncArrayForEach(guild.channels.cache.values(), async (channel) =>
	{
		//If it is an RP channel (includes talking head) process it.
		if (isRoleplayChannel(channel))
		{
			var out = await scrapeChannelMessages(channel, startMsg, null, null, stats);
			stats = out || stats;
			await Utils.slowdown(100);
		}
	});
	return stats;
}

///
/// Scrape all the messages in a given channel and update the stats with the data
///
async function scrapeChannelMessages(channel, startMsg, endMsg, limit, stats)
{
	limit = limit || 5000;
	endMsg = endMsg || null;

	//Skip channels with no messages
	if (channel.messages === undefined || channel.messages === null)
	{
		console.log("Skipping channel " + channel.name + " because it has no messages.");
		return false;
	}

	//Get all the messages
	await getMessageRange(channel, startMsg, endMsg, limit).then(async allMsgs =>
	{
		await scrapeMessages(allMsgs, stats)
	})
		.catch(err => { throw err; })
	return stats;
}

///
/// Given a list of messages, scrape them for metadata
///
async function scrapeMessages(messages, stats = null)
{
	if (!messages || !messages.length) return null;
	//Update the message stats with the data from an array of messages
	await Utils.asyncArrayForEach(messages, async (message) =>
	{
		var out = await scrapeMessageMetadata(stats, message);
		stats = out || stats;
	});
	return stats;
}

///
/// Given a message, extract metadata and update the message stats
///
async function scrapeMessageMetadata(stats, message)
{
	var user = message.author
	var authorId = user.id
	var name = user ?.username
	var tupperData = null

	if (!isRoleplayChannel(message.channel) &&
		!isRoleplayThread(message.channel))
		return false

	stats = stats || {}	//Assign the stats if they don't already exist

	if (user.bot)
	{
		//If the message is a bot, we only care if it's a tupper webhook message
		const tupperKey = name + user.avatar
		if (stats ?.tupperMap ?.[tupperKey])
		{
			authorId = stats ?.tupperMap ?.[tupperKey]
			debug(`Reading tupper map: ${authorId}`)
		}
		else if (Tupper.isTupperProxyMessage(message))
		{
			tupperData = await Tupper.getTupperData(message);
			authorId = tupperData ? tupperData.aId : 0
			stats.tupperMap = stats.tupperMap || {}
			stats.tupperMap[tupperKey] = authorId
			debug(`Polling tupper db (${message.id}): ${authorId}`)
		}
		else
		{	//If it's a bot and not tupper, SKIP IT
			debug(`Skipping bot ${user.username} (${message.applicationId})`)
			return false
		}
	}

	//Get the name from the member/user
	name = name || tupperData ?.t || null
	debug(`- Message from ${name} (${authorId})`);

	stats[0] = stats[0] || { char: {} }
	const unknown = stats ?.[0] ?.char ?.[name];
	if (unknown)
	{
		if (unknown.uId && !authorId)
		{
			authorId = unknown.uId;
			debug(` ... apply unknown message from ${name} to ${authorId}`)
		}
		else if (!unknown.uId && authorId)
		{
			debug(` ... matched unknown char ${name} to ${authorId}`)
			stats = assignUnknown(stats, authorId, name)
		}
		else if (unknown.uId && authorId && (unknown.uId != authorId))
		{
			throw "Multiple chars by the same name?\n" + JSON.stringify(stats);
		}
	}
	else if (authorId)
	{
		stats[0].char[name] = { uId: authorId }
	}

	stats[authorId] = incrementStats(stats[authorId], authorId, name, message);

	return stats;
}

function assignUnknown(stats, authorId, name)
{
	const unknown = stats ?.[0] ?.char ?.[name];

	stats[authorId] = stats ?.[authorId] || { char: {} }
	stats[authorId].char[name] = stats ?.[authorId] ?.char ?.[name]
		|| { length: 0, posts: 0 } 
	stats[authorId].char[name].length += unknown.length || 0;
	stats[authorId].char[name].posts += unknown.posts || 0;
	if (unknown.chan)
	{
		unknown.chan.map(chan =>
		{
			if (stats[authorId] ?.chan &&
				!stats[authorId] ?.chan ?.includes(chan))
				stats[authorId].chan.push(chan)
		});
	}
	stats[0].char[name] = { uId: authorId }

	console.log(stats[0]);

	return stats;
}

function incrementStats(data, id, name, message)
{
	const channel = message.channel.id;
	const length = message.content.length

	if (!data)
		data = { length: 0, posts: 0, char: {}, chan: [] }
	data.length += length;
	data.posts += 1;
	data.chan = data.chan || [];
	if (!data.chan.includes(channel))
		data.chan.push(channel)

	if (!data.char.hasOwnProperty(name))
		data.char[name] = { length: 0, posts: 0, chan: [] }
	data.char[name].length += length;
	data.char[name].posts += 1;
	data.char[name].chan = data.char[name].chan || []
	if (!data.char[name].chan.includes(channel))
		data.char[name].chan.push(channel)

	// if (!data.chan.hasOwnProperty(channel))
	// 	data.chan[channel] = { length: 0, posts: 0 }
	// data.chan[channel].length += length;
	// data.chan[channel].posts += 1;

	return data;
}








// //Defualt Stats
// function createStats(guild, history)
// {
// 	var stats = 
// 	{
// 		charStats: {},
// 		unknown: {}
// 	};
// 	return stats;
// }

function createAuthorData(name)
{
	var authorData =
	{
		name: name,
		posts: 0,
		length: 0,
		avg: 0,
		charStats: {},
		chanStats: {}
	};
	return authorData;
}

function createCharData(charName)
{
	var charData =
	{
		name: charName,
		posts: 0,
		length: 0,
		avg: 0,
		isTupper: false
	};
	return charData;
}

function createChanData(chanName)
{
	var chanData =
	{
		name: chanName,
		posts: 0,
		length: 0,
		avg: 0
	};
	return chanData;
}




module.exports =
{
	channelCleanup,
	deleteMessages,
	getMessageRange,
	findLastBreak,
	findNextBreak,
	findFenceposts,
	scrapeMessages,
	getRoleplayData,
	isRoleplayChannel,
	isRoleplayThread,
	isRPExpChannel,
	isRPExpThread,
	isRPExpEligible
}	