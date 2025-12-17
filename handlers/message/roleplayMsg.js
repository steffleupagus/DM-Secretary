/*---------------------------------------------------*\
| Detect Roleplay messages and log them in a database |
\*---------------------------------------------------*/
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const MsgUtils = require(`../../utilities/messageUtils.js`);
const ChanUtils = require(`../../utilities/channelUtils.js`);
const RPP = require(`../../database/rppTrackerSchema.js`)

async function shouldHandle(client, message)
{
	if (ChanUtils.isRoleplayChannel(message.channel) ||
		ChanUtils.isRoleplayThread(message.channel))
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
		console.log(`Post (${record.user}): ${record.posts} posts | ${record.chars} chars `)
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
	if (message.partial) {
		await message.fetch()
			.then((fullMessage) => {
				message = fullMessage;
			})
			.catch((e) => {});
	}

	if (!message.author) return;
	const record = await updateRecord({
		user: message?.author?.id || null,
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
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	handleUpdate: handleUpdate,
	handleDelete: handleDelete,
	updateRecord: updateRecord,
	build: config.PRODUCTION //|| config.DEV
};