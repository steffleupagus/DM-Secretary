const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChanActivity = require(`../../database/chanActivitySchema.js`)

async function cleanRecord(channelId)
{
	const activityRecord = await ChanActivity.findOneAndDelete({chan:channelId})
	console.log("Activity: ", activityRecord);

	const metaRecord = await ChannelMeta.findOneAndDelete({channelId:channelId})
	console.log("Meta: ", metaRecord);
}

async function execute(client, channel)
{
	console.log("Thread delete: ", channel.id, channel.name)
	await cleanRecord(channel.id);
}

module.exports = {
	name: 'threadDelete',
	execute: execute,
	build: config.DEV || config.PRODUCTION
};