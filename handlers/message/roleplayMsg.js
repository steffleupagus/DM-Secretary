/*---------------------------------------------------*\
| Detect Roleplay messages and log them in a database |
\*---------------------------------------------------*/

const MsgUtils = require(`../../utilities/messageUtils.js`);
const RPP = require(`../../database/rppTrackerSchema.js`)

async function shouldHandle(client, message)
{
	if (process.env.mod == "dev")
		return false;
	if (message.author.bot) return false;
	if (MsgUtils.isRoleplayChannel(message.channel) ||
	   	MsgUtils.isRoleplayThread(message.channel))
		return true;
	return false;
}

async function updateRecord(record)
{
	const query = { user: record.user };
	const update = {
		$set: { user: record.user, last: record.last },
		$inc: { posts: record.posts, chars: record.chars },
		$addToSet: {scene: record.scene}
	};
	const options = { new: true, upsert: true }
	
	record = await RPP.findOneAndUpdate(query, update, options);
	return record;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const record = await updateRecord({
		user: message.author.id,
		posts: 1,
		chars: message.content.length,
		scene: message.channel.id,
		last: message.id
	});

	if (record)
		console.log(`Post logged ${record.user}: ${record.posts} posts | ${record.chars} chars `)	
	
}

async function handleUpdate(client, oldMessage, newMessage)
{
	const record = await updateRecord({
		user: newMessage.author.id,
		posts: 0,
		chars: (newMessage.content.length - oldMessage.content.length),
		scene: newMessage.channel.id,
		last: newMessage.id
	});

	if (record)
		console.log(`Post edited ${record.user}: ${record.posts} posts | ${record.chars} chars `)	
	
}

async function handleDelete(client, message, interaction=null, sendResult=true)
{
	const record = await updateRecord({
		user: message.author.id,
		posts: -1,
		chars: -message.content.length,
		scene: message.channel.id,
		last: message.id
	});	

	if (record)
		console.log(`Post deleted ${record.user}: ${record.posts} posts | ${record.chars} chars `)	
	
}

module.exports = {
	name: 'roleplayMsg',
	bot: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	handleUpdate: handleUpdate,
	handleDelete: handleDelete,
	updateRecord: updateRecord
};