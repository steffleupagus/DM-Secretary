const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
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

///
/// Duel chanels come in pairs of an RP channel and a Mechanics channel
/// Given one, find the pair.
/// 
function getDuelChannelPair(channel)
{
	for (let pair of config.duelChannels)
	{
		if (channel.isThread && channel.parent.id == pair.RP)
			pair.MECHANICS = channel.id;
	
		if ((channel.id == pair.RP)||(channel.id == pair.MECHANICS))
			return pair;
	}
	return null;
}

function isDuelRPChannel(channel)
{
	const pair = getDuelChannelPair(channel)
	if (!pair) return false;
	return (pair.RP == channel.id)
}

//TODO - Remove duelChannels from config; make it a field in the channel meta database.

module.exports =
{
	isRoleplayChannel,
	isRoleplayThread,
	isRPExpChannel,
	isRPExpThread,
	isRPExpEligible,
	isDuelRPChannel,
	getDuelChannelPair
}	