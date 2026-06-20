const Utils = require(`./utilFuncs.js`)
const chanUtils = require(`./channelUtils.js`)
const Tupper = require(`./tupperUtils.js`)
const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const { MessageMentions, Collection } = require('discord.js')

const _regex = "[`-]{3}\n? ?(\u200B*|<\:.*\:[0-9]+>|\-+COMBAT ENDED\-+)? ?\n?[`-]{3}"
const BreakRegex = new RegExp(_regex);
const _quote = "^>.*"
const TupperQuote = new RegExp(_quote);
const _ping  = /\@.*\[jump\]\(\<?https:\/\/discord\.com\/channels\/@me\/[0-9]+\/[0-9]+\>?\)/
const TupperPing  = new RegExp(_ping);
const MIN_MESSAGE_LENGTH = 50

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
}

///
/// Delete an array of messages
///
async function deleteMessages(messages)
{
	let delayCount = 0;
	await Utils.asyncArrayForEach(messages, async (message) =>
	{
		if (message.system) return;
		await message.delete();
		await Utils.slowdown(500);
		if (++delayCount >= 5)
			await Utils.slowdown(1500);
	})
}

///
async function fetchAll(channel, options = { reverseArray: false, userOnly: false, botOnly: false, pinnedOnly: false })
{
	const { reverseArray, userOnly, botOnly, pinnedOnly } = options;
	let messages = new Collection();
	let lastID;
	let count = 0;

	while (true)
	{
		const fetchedMessages = await channel.messages.fetch({limit: 100,
			...(lastID && { before: lastID })
		});

		if (fetchedMessages.size === 0) {
			if (reverseArray) {messages = messages.reverse();}
			if (userOnly) {messages = messages.filter(msg => !msg.author.bot);}
			if (botOnly) {messages = messages.filter(msg => msg.author.bot);}
			if (pinnedOnly) {messages = messages.filter(msg => msg.pinned);}
			return messages;
		}
		messages = messages.concat(fetchedMessages);

		// messages = messages.concat(Array.from(fetchedMessages.values()));
		lastID = fetchedMessages.lastKey();

		count = (count + 1) % 5
		if (count == 0)
		{
			console.log(`${channel.name}: ${messages.size}`);
			await Utils.slowdown(1500);
		}
		await Utils.slowdown(250);
	}
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

		if (limit > 500)
			await Utils.slowdown(limit / 5);
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

	let messages = before.messages.concat(after.messages);
	if (!messages.includes(message))
		messages = before.messages.concat([message]).concat(after.messages);

	if (before && !before.id && before.messages && before.messages.length > 0)
		before.id = before.messages[0].id
	console.log(`findFenceposts: ${before.id}->${after.id} | ${messages.length} total messages`)

	return { start: before.id, end: after.id, messages: messages };
}

function isSceneBreak(message)
{
	return BreakRegex.test(message?.content || message)
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

	let users = [];
	roleplay.messages.map( msg => { if (!users.includes(msg.author.id)) users.push(msg.author.id)} );
	const guildMembers = rpChan?.guild?.members;
	try { await guildMembers.fetch({user:users}) }
	catch (err) { console.error(err) }

	const rpData = await scrapeMessages(roleplay.messages);
	if (rpData) rpData.start = roleplay.messages[0].url;
	return rpData;
}

async function getAllRoleplayData(rpChan)
{
	const roleplay = await getMessageRange(rpChan);
	let users = [];
	roleplay.forEach( msg => { if (!users.includes(msg.author.id)) users.push(msg.author.id)} );
	const guildMembers = rpChan?.guild?.members;
	try { await guildMembers.fetch({user:users}) }
	catch (err) { console.error(err) }

	const rpData = await scrapeMessages(roleplay);

	if (rpData)
		rpData.start = roleplay[0].url;
	return rpData;
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


function checkForBullshit(message)
{
	const content = message.content
	//We don't care if it isn't an RP channel
	if (!chanUtils.isRoleplayChannel(message.channel)) return
	//We don't care if the initial message is too short to even be factored into exp awards
	if (content.length < MIN_MESSAGE_LENGTH) return
	//Strip non-ascii characters and check if more than half the length was stripped out
	const stripped = content.replaceAll(/[^\x00-\x7F]/g,'')
	if (content.length - stripped.length > (content.length / 2))
	{
		const guild = message.guild
		const debug = guild.channels.fetch(config.debugLogParent).then( chan =>
		{	//If it was, flag it for closer inspection
			chan.send(`<@659069077872181248> [Message](${message.url}) warrants a closer look: ${message}`)
		})
	}
}

function cleanMessageContent(message)
{
	const mention = new RegExp(MessageMentions.UsersPattern,"gi")
	const spaces  = /\s+/g;
	let content = message.content
	if (Tupper.isTupperProxyMessage(message))
	{
		content = content.replace(TupperQuote,"")
		content = content.replace(TupperPing,"")
	}
	content = content.replaceAll(mention,"")
	content = content.replaceAll(spaces," ")

	checkForBullshit(message)

	return content.trim()
}



///
/// Given a message, extract metadata and update the message stats
///
async function scrapeMessageMetadata(stats, message)
{
	if (!chanUtils.isRoleplayChannel(message.channel) &&
		!chanUtils.isRoleplayThread(message.channel))
		return false

	let user = message.author;
	let authorId = user.id;
	let guildMembers = message.guild?.members;
	let member = message.member;

	const content = cleanMessageContent(message)
	if (content.length < MIN_MESSAGE_LENGTH)
	{
		debug (`Skipping short message from ${user.username} (${content.length})`)
		return false
	}

	stats = stats || { tupperMap: {} }	//Assign the stats if they don't already exist

	// if (!user.bot && !member)
	// {
	// 	try { member = await guildMembers.fetch(authorId); }
	// 	catch (err) { member = null; }
	// }

	let name = member?.nickname ?? user?.username;
	let tupperData = null

	if (user.bot)
	{
		//If the message is a bot, we only care if it's a tupper webhook message
		const tupperKey = name + "" + user.avatar
		if (stats ?.tupperMap ?.[tupperKey] ?.aId)
		{
			authorId = stats ?.tupperMap ?.[tupperKey] ?.aId
			debug(`Reading tupper map: ${authorId}`)
		}
		else if (Tupper.isTupperProxyMessage(message))
		{
			tupperData = await Tupper.getTupperData(message);
			authorId = tupperData ? tupperData.aId : 0
			stats.tupperMap = stats.tupperMap || {}
			stats.tupperMap[tupperKey] = { aId: authorId, char: name }
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
			stats = assignUnknown(stats, authorId, name, tupperData)
		}
		else if (unknown.uId && authorId && (unknown.uId != authorId))
		{
			//Can we use Tupper Key to differentiate different users by the same char name?
			throw `<@${config.OWNERID}> Unhandled edge case: Multiple chars named \`${name}\`, attributed to <@${unknown.uId}> and <@${authorId}>\n`;
		}
	}
	else if (authorId)
	{
		stats[0].char[name] = stats[0].char[name] || { uId: authorId, t: user.bot ? true : false }
	}

	stats[authorId] = incrementStats(stats[authorId], authorId, name, message, user.bot);

	return stats;
}

function assignUnknown(stats, authorId, name, tupperData)
{
	const unknown = stats ?.[0] ?.char ?.[name];

	stats[authorId] = stats ?.[authorId] || { char: {} }
	stats[authorId].char[name] = stats ?.[authorId] ?.char ?.[name] || { length: 0, posts: 0 }
	stats[authorId].char[name].length += unknown.length || 0;
	stats[authorId].char[name].posts += unknown.posts || 0;
	if (unknown.chan)
	{
		stats[authorId].chan = stats[authorId].chan ?? [];
		unknown.chan.forEach(chan =>
		{
			if (stats[authorId] ?.chan &&
				!stats[authorId] ?.chan ?.includes(chan))
				stats[authorId].chan.push(chan)
		});
		delete unknown.chan;
	}

	if (unknown.dates)
	{
		stats[authorId].char[name].dates = stats[authorId].char[name].dates ?? {};
		Object.keys(unknown.dates).forEach( date =>
		{
			if (!stats[authorId]?.char?.[name]?.dates?.[date])
				stats[authorId].char[name].dates[date] = { length:0, posts:0 }
			stats[authorId].char[name].dates[date].length += unknown.dates[date].length
			stats[authorId].char[name].dates[date].posts += unknown.dates[date].posts
		});
		delete unknown.dates
	}

	stats[0].char[name] = { uId: authorId, t: tupperData ? true : false }

	debug(stats[authorId].char[name]);

	return stats;
}

function incrementStats(data, id, name, message, tupperData)
{
	const channel = message.channel.id;
	const content = cleanMessageContent(message)

	const length  = content.length;
	let   date    = message.createdAt;
		  date    = `${date.getDate()}.${date.getMonth()+1}.${date.getFullYear()}`

	data = data ?? { length: 0, posts: 0, char: {}, chan: [] };
	data.length += length;
	data.posts += 1;
	data.chan = data.chan || [];
	if (!data.chan.includes(channel))
		data.chan.push(channel)

	data.char[name] = data.char[name] ?? { length: 0, posts: 0, t: tupperData ? true : false, chan: [], dates: {} }
	data.char[name].length += length;
	data.char[name].posts += 1;

	data.char[name].chan = data.char[name].chan ?? []
	if (!data.char[name].chan.includes(channel))
		data.char[name].chan.push(channel)

	data.char[name].dates = data.char[name].dates ?? {}
	data.char[name].dates[date] = data.char[name].dates[date] ?? { length: 0, posts: 0 }
	data.char[name].dates[date].length += length;
	data.char[name].dates[date].posts += 1;
	debug(`--- ${name}: ${date} [${data.char[name].dates[date].posts}]: [${data.char[name].dates[date].length}]\n`,
		  data.char[name].dates)

	return data;
}

/// Given a guild and a string containing a discord URL,
/// return the message that URL points to
async function getMessageFromURL(guild, url) {
	const discordLinkReg = /https?:(?:www\.)?\/\/discord(?:app)?\.com\/channels\/(\d*)\/(\d*)\/(\d*)/;
	const match = url.match(discordLinkReg) || null
	if (!match) return
	const [, guildId, channelId, messageId] = match
	const channel = await guild?.channels?.fetch(channelId).catch(e => null) || null;
	const message = await channel?.messages?.fetch(messageId).catch(e => null) || null;
	return message || null
}

/// Post the approved exp message to the Exp Log channel
/// @interaction	- The interaction of the button press
/// @url			- The url of the message to react to
/// @emoji			- The emoji to react
async function reactToMessageURL(guild, url, emoji) {
	if (!guild || !url || !emoji) return;
	const message = await getMessageFromURL(guild, url)
	if (emoji) await message?.react(emoji)
	else await message?.reactions?.removeAll()
}

module.exports =
{
	channelCleanup,
	deleteMessages,
	getMessageRange,
	getMessageFromURL,
	findLastBreak,
	findNextBreak,
	findFenceposts,
	cleanMessageContent,
	scrapeMessages,
	scrapeMessageMetadata,
	getRoleplayData,
	getAllRoleplayData,
	isSceneBreak,
	fetchAll,
	reactToMessageURL
}