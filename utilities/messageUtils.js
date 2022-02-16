const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

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
	// 	await this.channelCleanup(channel);
}

async function deleteMessages(messages)
{
	await Utils.asyncArrayForEach(messages, async (message)=>
	{
		await message.delete();
		await Utils.slowdown(100);
	})
}

async function getMessageRange(channel, start_id=null, end_id=null, limit=10000)
{
	const iterLimit = Math.min(limit, 100);
	let allMessages = [];
	let prevMessages = null;
	while (true) 
	{
		let options = { limit: iterLimit };
		if (start_id) options.after = start_id;
		let messages = await channel.messages.fetch(options);

		if (end_id)
		{
			console.log({"TESTING":"INTERSECTION"})
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

		console.log(" ... " + channel.name + ": " + messages.size + 
					" (Start = " + start_id + " End = " + end_id + ")");

		if (messages.size != iterLimit)
			break;
		if (sum_messages.length >= limit) 
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

		await slowdown(500);
	}
	return allMessages;
}


module.exports =
{
	channelCleanup,
	deleteMessages,
	getMessageRange
}