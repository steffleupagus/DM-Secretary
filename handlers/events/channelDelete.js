const ChannelMeta = require(`../../database/chanMetaSchema.js`)

async function cleanRecord(channelId)
{
	channelId = {channelId}
	console.log(channelId)
	const result = await ChannelMeta.findOneAndDelete(channelId)

	console.log(result);
}

async function execute(client, channel)
{
	console.log("Channel delete: ", channel.id, channel.name)
	cleanRecord(channel.id);
}

module.exports = {
	name: 'channelDelete',
	execute: execute
};