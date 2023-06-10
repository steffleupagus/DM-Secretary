
const ChanActivity = require(`../database/chanActivitySchema.js`)
const MsgUtils  = require(`../utilities/messageUtils.js`);
const minute=60      	//seconds per Minute
const hour=60*minute  	//Seconds per Hour
const day=24*hour  		//Seconds per Day
const msps=1000	  		//Milliseconds per second

function getRecordFromMessage(message)
{
	const channel = message.channel
	const scene   = MsgUtils.isSceneBreak(message);
	const author  = getAuthorData(message);
	const time    = message.createdTimestamp;
	const thread  = channel.isThread();
	
	return {
		chan:	channel.id,
		user:	author,
		thread: thread,
		time:	time,
		scene: 	scene,
		update: time
	}
}

async function updateActivity(message)
{
	let record = getRecordFromMessage(message)
		record = await updateActivityRecord( record );
	return record;
}

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









async function getChannelStatus(channel)
{
	const now = Date.now()
	let messageData = await ChanActivity.findOne({ chan: channel.id });
	if (messageData)
	{
		console.log(`Database Record: <#${messageData.chan}> - ${messageData.user}`);		

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
	return getChannelStatusFromMessageData(messageData);
}

function getChannelStatusFromMessageData(messageData)
{
	let status  = "🟢";
	let lastMsg = "( Unused Channel )"
	let author  = ""
	let elapsed = ""
	if (messageData)
	{	
		//Time data
		let created = messageData.time;
		let now = Date.now();
		let time = Math.floor((now - created) / msps); // elapsed time in seconds
		elapsed = `<t:${Math.round(created / msps)}:R>`
				
		//Author data
		author  = messageData.user
		lastMsg = `Last post`;
		
		//Figure out what status icon to apply to it.
		if (messageData.scene)
		{
			lastMsg = `Scene ended`
			author  = ''
		}
		else
		{
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
	return {status,lastMsg,elapsed,author}
}

module.exports = {
	getAuthorData,
	updateActivity,
	getChannelStatus
};