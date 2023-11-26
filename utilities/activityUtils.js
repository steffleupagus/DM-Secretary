
const ChanActivity = require(`../database/chanActivitySchema.js`)
const MsgUtils  = require(`../utilities/messageUtils.js`);
const Utils = require(`../utilities/utilFuncs.js`)
const minute=60      	//seconds per Minute
const hour=60*minute  	//Seconds per Hour
const day=24*hour  		//Seconds per Day
const msps=1000	  		//Milliseconds per second

///
/// Given a message, generate an update record for its channel/thread
///
function getRecordFromMessage(message)
{
	const channel = message.channel
	const scene   = MsgUtils.isSceneBreak(message);
	const author  = getAuthorData(message);
	const time    = message.createdTimestamp;
	const thread  = channel.isThread() ? channel.parentId : null;
	
	return {
		chan:	channel.id,
		user:	author,
		thread: thread,
		time:	time,
		scene: 	scene,
		update: time
	}
}

///
/// Update the activity record when a new message is posted
/// 
async function updateActivity(message)
{
	let record = getRecordFromMessage(message)
		record = await updateActivityRecord( record );
	return record;
}

///
/// Update the DB record
///
async function updateActivityRecord(record)
{
	const query = { chan: record.chan }
	const update = {
		$set: { 
			chan:	record.chan,
			user: 	record.user,
			thread: record.thread,
			time:	record.time,
			scene: 	record.scene,
			update: Date.now()
		}
	};
	const options = { new: true, upsert: true }
	
	record = await ChanActivity.findOneAndUpdate(query, update, options);

	console.log(`Update: <#${record.chan}> - ${record.user}`);
	return record;	
}

///
/// Get the author data from a message
///
function getAuthorData(message)
{
	const channel = message.channel
	let    author = message.author;
	const  tupper = "Tupper (" + author.username + ")";
	
	if 	 (author.bot && message.webhookId) author = tupper
	else  author = "<@" + author.id + ">";
	if   (channel.name.includes("gloryhole")) author = "<Anonymous>";
	
	return author
}

///
/// Get the status for a given channel from the database, refreshing it if necessary
///
async function getChannelStatus(channel)
{
	const now = Date.now()
	let messageData = await ChanActivity.findOne({ chan: channel.id });
	if (messageData)
	{
		console.log(`Activity: <#${messageData.chan}> - ${messageData.user}`);		

		const updated = messageData.update || 0;
		const timePassed = (now - updated) / 1000;
		if (timePassed >= (3 * day))
			messageData = null;
	}
	
	if (!messageData)
	{
		messageData = null;
		console.log(`Record for <#${channel.id}> missing or expired. Polling message.`);
		await channel.messages.fetch({ limit: 1 }).then(async messages => 
		{
			const message = messages.first()
			if (message)
			{
				messageData = await updateActivity(message);
				messageData.fetch = true;
			}
		});
	}
	return getChannelStatusFromMessageData(channel, messageData);
}

/// 
/// Get the status of all threads from a given channel
/// 
async function getAllThreadsStatus(channel, allThreads)
{
	const threadStatus = {}
	let messagesData   = await ChanActivity.find({ thread: channel.id })
	messagesData.map(x => threadStatus[x.chan] = getChannelStatusFromMessageData(channel, x));

	//Find any threads that weren't in the database
	await Utils.asyncCollectionForEach(allThreads, async thread => 
	{
		if (!threadStatus[thread.id])
			threadStatus[thread.id] = await getChannelStatus(thread);
	});

	//Sort threads alphabetically by name
	const threadKeys = Object.keys(threadStatus)
	threadKeys.sort((a,b) => 
	{
		const names = {a:allThreads?.get(a)?.name, b:allThreads?.get(b)?.name}
		return (names['a'] > names['b']) ? 1 : ((names['b'] > names['a']) ? -1 : 0)
	});

	const threads = [];
	threadKeys.forEach(id => {
		threads.push({id, ...threadStatus[id]})
	});

	return threads
}

///
/// Get some thread status info from a given message data record
///
function getChannelStatusFromMessageData(channel, messageData)
{
	let openRP  = "🌐";
	let status  = "🟢";
	let lastMsg = "( Unused Channel )"
	let author  = ""
	let elapsed = ""
	let scene   = false
	if (messageData)
	{	
		//Time data
		let created = messageData.time;
		let now = Date.now();
		let time = Math.floor((now - created) / msps); // elapsed time in seconds
		elapsed = `<t:${Math.round(created / msps)}:R>`
		
		//Figure out what status icon to apply to it.
		if (channel.name.includes(openRP))
		{
			status  = openRP
			lastMsg = `Open RP Channel`
			elapsed = ''
		}
		else if (messageData.scene)
		{
			lastMsg = `Scene ended`
		}
		else
		{
			//Author data
			author  = messageData.user
			lastMsg = `Last post`;
			
			if (time <= (day * 3)) 		status = "⛔"; 
			else if (time < (day * 5))	status = "❓";
			else if (time < (day * 7))	status = "⚠️";
			else if (time > (day * 14))	status += "💀";				
		}
		if (messageData.thread)
			status = "🧵"+status
		if (messageData.fetch)
			status += '.'
	}
	return {status,lastMsg,elapsed,author,scene};
}

module.exports = {
	getAuthorData,
	updateActivity,
	getChannelStatus,
	getAllThreadsStatus
};