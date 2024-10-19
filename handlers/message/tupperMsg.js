/*-------------------------------------------------*\
| Detect Tupper messages and log them in a database |
\*-------------------------------------------------*/
const Tupper = require(`../../utilities/tupperUtils.js`)
const RPP = require(`../../database/rppTrackerSchema.js`)

async function shouldHandle(client, message)
{
	if (process.env.mod == "dev")
		return false;
	return Tupper.isTupperLogMessage(client, message) ||
		Tupper.isTupperProxyMessage(message)
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const tupperData = await Tupper.logTupperMessage(client, message)
	if (tupperData)
	{
		const record = await updateRPPFromTupperProxy({
			user: tupperData.aId,
			posts: 1,
			proxy: 1,			
			chars: tupperData.len,
			scene: tupperData.cId,
			last: tupperData.mId
		});
		if (record)
			console.log(`Proxy (logged (${record.user}): ${record.posts} posts | ${record.chars} chars `)		
	}
}

async function handleDelete(client, message)
{
	const tupperData = await Tupper.deleteTupperProxyMessage(client, message)
	if (tupperData)
	{
		const record = await updateRPPFromTupperProxy({
			user: tupperData.aId,
			posts: -1,
			proxy: -1,			
			chars: -tupperData.len,
			scene: tupperData.cId,
			last: tupperData.mId
		});
		if (record)
			console.log(`Proxy deleted ${record.user}: ${record.posts} posts | ${record.chars} chars `)		
	}
}

async function handleUpdate(client, oldMessage, newMessage)
{
	if (!Tupper.isTupperProxyMessage(newMessage)) return;
	const tupperData = await Tupper.getTupperData(newMessage)
	if (tupperData)
	{
		const newLen = newMessage?.content?.length || 0
		const oldLen = oldMessage?.content?.length || 0
		const record = await updateRPPFromTupperProxy({
			user: tupperData.aId,
			posts: 0,
			proxy: 0,
			chars: newLen - oldLen,
			scene: tupperData.cId,
			last: tupperData.mId
		});
		if (record)
			console.log(`Proxy updated ${record.user}: ${record.posts} posts | ${record.chars} chars `)			
	}
}

async function updateRPPFromTupperProxy(record)
{
	const query = { user: record.user };
	const update = {
		$set: { user: record.user, last: record.last },
		$inc: { posts: record.posts, proxy: record.proxy, chars: record.chars },
		$addToSet: {scene: record.scene}	
	};
	const options = { new: true, upsert: true }
	
	record = await RPP.findOneAndUpdate(query, update, options);	
	return record;
}

module.exports = {
	name: 'tupperMsg',
	bot: true,	
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	handleUpdate: handleUpdate,
	handleDelete: handleDelete
};