const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChannelLook = require(`../../database/chanLookSchema.js`)
const ChanActivity = require(`../../database/chanActivitySchema.js`)

async function cleanRecord(channelId)
{
	const activityRecord = await ChanActivity.findOneAndDelete({chan:channelId})
	console.log("Activity: ", activityRecord);

	const metaRecord = await ChannelMeta.findOneAndDelete({channelId:channelId})
	console.log("Meta: ", metaRecord);

	const lookRecord = await ChannelLook.findOneAndDelete({channelId:channelId})
	console.log("Look: ", lookRecord);
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