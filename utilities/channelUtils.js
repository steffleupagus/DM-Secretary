const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const ChannelMeta = require(`../database/chanMetaSchema.js`)
const TableMeta = require(`../database/tableSchema.js`)
const AreaMeta = require(`../database/areaMetaSchema.js`)
const Utils   = require(`../utilities/utilFuncs.js`)

/// Identify if a channel is an RP channel
function isRoleplayChannel(channel) {
	if (channel.id == config.chan.rpTest) return false;
	return channel.name.includes("🗣");
}

function isRoleplayThread(channel) {
	if (!channel.isThread()) return false;
	if (channel.name.includes("⚙")) return false;

	return	isRoleplayChannel(channel) ||
			isRoleplayChannel(channel.parent);
}

/// Check if this channel is an RP exp channel
async function isRPExpChannel(channel) {
	const result = await ChannelMeta.findOne({ channelId: channel.id });
	return result && result.awardsExp;
}

async function isTrackedChannel(channel) {
	if (channel.isThread())
		return await isTrackedChannel(channel.parent)
	const result = await ChannelMeta.findOne({ channelId: channel.id })
	return result && result.trackActivity
}

async function isRPExpThread(channel) {
	if (!channel.isThread()) return false
	const result = await isRPExpChannel(channel.parent);
	return result
}

async function isRPExpEligible(channel) {
	if (channel.isThread())
		return await isRPExpThread(channel)
	return await isRPExpChannel(channel)
}

/// Check if this channel is a table thread
async function isTableRPThread(channel) {
	const result = await TableMeta.findOne({ rpThread: channel.id })
	return result;
}

/// Check if this channel is a table thread
async function isTableMechanicsThread(channel) {
	const result = await TableMeta.findOne({ oocThread: channel.id })
	return result;
}

/// Duel chanels come in pairs of an RP channel and a Mechanics channel
/// Given one, find the pair
function getDuelChannelPair(channel) {
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

function isDuelRPChannel(channel) {
	const pair = getDuelChannelPair(channel)
	if (!pair) return false;
	return (pair.RP == channel.id)
}

async function fetchThreads(channel) {
	const activeThreads = await channel.threads.fetchActive();
	const archivedThreads = await channel.threads.fetchArchived();
	const allThreads = activeThreads.threads.concat(archivedThreads.threads)
	allThreads.sort((a,b) => a.createdTimestamp - b.createdTimestamp)
	return {active:activeThreads, archive:archivedThreads, all:allThreads};
}

async function getChannelOwner(channel) {
	const channelId = channel.isThread() ? channel.parent.id : channel.id;
	const chanMeta = await ChannelMeta.findOne({channelId:channelId})
	return chanMeta?.userOwner
}


const ROLE_REQUIREMENTS = {
	"742107921835360376":"702348143752118372",	//@Arcanum Inner Sanctum       @Arcanum Guild
	"742107953577984110":"697848468986921030",	//@Black Hand Guild Hall       @Black Hand Guild
	"766031999864668191":"766031516038987786",	//@Temple Sanctuary            @Council of Faith
	"742107924255735849":"702481674344071178",	//@Guardian Guild Barracks     @Guardian Guild
	"853362003691438101":"853346385545920522"	//@Outrider's Lodge Guild Hall @Outrider's Lodge
}

const LocationRoles = {
	public:[],
	guild:[],
	user:[]
}

async function refreshLocationRoles(guild) {
	const openRP = {value:"1001640103841632306",label:"OpenRP"}

	LocationRoles.public = [openRP]
	LocationRoles.guild = []
	LocationRoles.user = []

	let areas = await AreaMeta.find({});
	await Utils.asyncArrayForEach( areas, async (area, i) => {
		let cat = guild.channels.resolve(area.catId) || await guild.channels.fetch(area.catId)
		area.pos = cat.position
	})
	areas.sort((a,b) => a.pos - b.pos)

	areas.forEach(area => {
		const isGuild = (area.guild && area.guild != "")

		area.roleId.forEach(role => {
			role = guild.roles.resolve(role)
			role = {value:role.id, label:role.name, emoji:area.icon}
			const isRestricted = (ROLE_REQUIREMENTS[role.value])

			if (isGuild)
				LocationRoles.guild.push(role)
			else
				LocationRoles.public.push(role)
			if (!isRestricted)
				LocationRoles.user.push(role)
		})
	})
}

async function getChannelLocationRoles(channel) {
	if (channel.isThread()) channel = channel.parent;
	const result = await ChannelMeta.findOne({ channelId: channel.id });
	return result?.locations
}

module.exports =
{
	isRoleplayChannel,
	isRoleplayThread,
	isRPExpChannel,
	isRPExpThread,
	isRPExpEligible,
	isTableRPThread,
	isTableMechanicsThread,
	isTrackedChannel,
	isDuelRPChannel,
	getChannelOwner,
	getDuelChannelPair,
	fetchThreads,
	LocationRoles,
	refreshLocationRoles,
	getChannelLocationRoles,
	ROLE_REQUIREMENTS
}