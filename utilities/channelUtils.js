const ChannelMeta = require(`../database/chanMetaSchema.js`)

///
/// Identify if a channel is an RP channel
///
function isRoleplayChannel(channel)
{
	return channel.name.includes("🗣");
}

function isRoleplayThread(channel)
{
	return channel.isThread() &&
		isRoleplayChannel(channel.parent) &&
		!channel.name.includes("⚙");
}

///
/// Check if this channel is an RP exp channel
///
async function isRPExpChannel(channel)
{
	const result = await ChannelMeta.findOne({ channelId: channel.id });
	return result && result.awardsExp;
}

async function isRPExpThread(channel)
{
	if (!channel.isThread()) return false
	const result = await isRPExpChannel(channel.parent);
	return result
}

async function isRPExpEligible(channel)
{
	if (channel.isThread())
		return await isRPExpThread(channel)
	return await isRPExpChannel(channel)
}



module.exports =
{
	isRoleplayChannel,
	isRoleplayThread,
	isRPExpChannel,
	isRPExpThread,
	isRPExpEligible
}	