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
//TODO - Remove duelChannels from config; make it a field in the channel meta database.

function isDuelRPChannel(channel)
{
	const pair = getDuelChannelPair(channel)
	if (!pair) return false;
	return (pair.RP == channel.id)
}



async function fetchThreads(channel)
{
	const activeThreads = await channel.threads.fetchActive();
	const archivedThreads = await channel.threads.fetchArchived();
	const allThreads = activeThreads.threads.concat(archivedThreads.threads)
	allThreads.sort((a,b) => a.createdTimestamp - b.createdTimestamp)
	return {active:activeThreads, archive:archivedThreads, all:allThreads};
}

//Put these in a centralized location so we don't copy/paste them in multiple places
const locations = [
	{value:"1001640103841632306",label:"OpenRP"},
	{value:"694854069684142101",label:"City Square"},
	{value:"695642023037763664",label:"City Administrative District"},
	{value:"695641905811292240",label:"City Entertainment District"},
	{value:"695641963642224750",label:"City Residential Quarter"},
	{value:"696534005671133224",label:"City Inn"},
	{value:"696533919075401788",label:"City Tavern"},
	{value:"699065480165589003",label:"City Gardens"},
	{value:"695641819094188042",label:"City Mercantile Quarter"},
	{value:"711726751549489203",label:"City Cyu'unt Restaurant"},
	{value:"713002635267145758",label:"City Dock"},
	{value:"695238063517073461",label:"Outside City Blessed Gate"},
	{value:"697174243556982816",label:"Outside City Cursed Gate"},
	
	{value:"695808294945816586", label:"City Colosseum"},
	{value:"709376645521342464", label:"City Slum"},
	{value:"699203153274601491", label:"Arcanum Tower Guild Hall"},
	{value:"699205524960313424", label:"Temple District"},
	{value:"833787998150590481", label:"Wilderness"},	
	{value:"696807848117534820", label:"Silver Thorn Brothel"},
	{value:"699064641950842880", label:"Silver Thorn Suites"}

]

const guildLocations = [
	{value:"1001640103841632306", label:"OpenRP"},

	{value:"699203153274601491", label:"Arcanum Tower Guild Hall"},
	{value:"742107921835360376", label:"Arcanum Inner Sanctum"},

	{value:"709376645521342464", label:"City Slum"},
	{value:"742107953577984110", label:"Black Hand Guild Hall"},
	
	{value:"699205524960313424", label:"Temple District"},
	{value:"766031999864668191", label:"Temple Sanctuary"},
	
	{value:"695808294945816586",label:"Colosseum"},
	{value:"742107924255735849", label:"Guardian Guild Barracks	"},

	{value:"833787998150590481", label:"Wilderness"},
	{value:"853362003691438101", label:"Outrider's Lodge Guild Hall"},
	
	{value:"696807848117534820", label:"Silver Thorn Brothel"},
	{value:"699064641950842880", label:"Silver Thorn Suites"},
	{value:"768307340625575977", label:"Brothel Blindfold Room"}
]

module.exports =
{
	isRoleplayChannel,
	isRoleplayThread,
	isRPExpChannel,
	isRPExpThread,
	isRPExpEligible,
	isDuelRPChannel,
	getDuelChannelPair,
	fetchThreads,
	locations,
	guildLocations
}	