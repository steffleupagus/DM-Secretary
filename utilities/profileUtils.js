const mod 		= process.env.mod || "";
const config	= require(`../config/${mod}_config.json`);
const Utils     = require(`../utilities/utilFuncs.js`)
const MsgUtils  = require(`../utilities/messageUtils.js`)

const normalize = "NFKC";
const badChars  = /[\[\]\(\)\<\>\{\}\|\`\#\.\!\*\_\:\~]/g
const breakRegex = /[`-]{3}\n?(\s*|\u200B*|<\:.*\:[0-9]*>)?\n?[`-]{3}/
const customEmoji = /\<?\:[a-zA-Z0-9]*\:[0-9]*\>?/;
const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/mg
//const nameRegex  = /^[\[\|\|️\•\⊰\*\`\"\'\>\s_]*name[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const nameRegex = /^[\>\[\|\|️\_\*\`\s\️\"]*(?:normal )?name[\"\`\*\_\]\:\s\(]*([^\n]*)$/mig
//\•\⊰
const raceRegex  = /^[\[\|\|️\*\`\"\'\>\s_]*(?:race|species)[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const classRegex = /^[\[\|\|️\*\`\"\'\>\s_]*(?:class(\(es\))?)[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const genderReg  = /^[\[\|\|️\*\`\"\'\>\s_]*(?:gender|sex(?!ual))[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const baseRegex  = (key) => `^[\[\|\|️\•\⊰\*\`\"\'\>\s_]*(?:${key})[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?`

/// Identify if the message is a profile
function isProfileMessage(client, message) {
	if (!message) return false;
	const channel = (	(message.channel.id == client.config.chan.npcProfile)	||
						(message.channel.id == client.config.chan.pcProfile)	||
						(message.channel.id == client.config.debug.profile)		);
	const author  = !message.author?.bot;
	return channel && author
}

/// Fetch all the messages for a given channel, either from cache or pull them fresh
let profileCache = {};
async function fetchAllMessages(guild, channelId) {
	//Fetch the channel object from the ID & collect all the profiles in it
	const channel = await guild.channels.fetch(channelId);
	if (profileCache[channelId]) 
	{
		//Sanity check the cache to see if it is still valid
		const messages = await channel.messages.fetch({limit: 1})
		if (messages.first().id == profileCache[channelId].last().id)
			return profileCache[channelId];
	}
	//If cache not valid, re-pull all profiles and cache them
	profileCache[channelId] = await MsgUtils.fetchAll(channel, { reverseArray: true, userOnly: true });
	return profileCache[channelId];
}

///If we have a target member specified, skip any messages not by that author
function processProfileMessage(message, followUp, targetMember) {
	if (targetMember && targetMember.id != message.author.id)
		return null;
	//Parse the profile
	const profile = parseProfile(message, !followUp);
	return profile;
}

/// Process all profiles in a batch and post the results into a debug channel
async function batchProfiles(interaction) {
	const charsByUser	= {}
	const charRecords	= []
	const charErrors	= []
	const chaffPosts	= []

	// Determine if we should assemble all profiles or those of a specific user
	const targetUserArg	= interaction.options.getMember('user') || null
	const allowAll		= targetUserArg ? false : (interaction.options.getBoolean('batch') ?? true);
	const targetMember	= allowAll ? null : (targetUserArg ?? interaction.member);
	const content		= (allowAll?"Batch ":"") + "Processing" + (targetMember?` <@${targetMember.id}>`:"")
	await interaction.editReply({content})
	console.log(`Batch: ${allowAll}\nTargetMember: ${targetMember}`)

	let lastProfile		= null;
	let totalPosts		= 0
	//Loop through the profile channels
	const channels		= [config.chan.pcProfile, config.chan.npcProfile];
	await Utils.asyncArrayForEach(channels, async channelId => {
		//Get all the messages for this given channel
		const allMsgs	= await fetchAllMessages(interaction.guild, channelId);
		const count		= allMsgs.size;
		totalPosts 		+= count;
		const type 		= channelId == config.chan.pcProfile ? "PC" : "NPC"
		const output	= `${type} (${channelId}): ${count} messages.\n${allMsgs.first().url}\n${allMsgs.last().url}`
		await interaction.followUp({ content: output, ephemeral: true });
		
		lastProfile		= null;
		//Loop over all the profiles and process them
		await Utils.asyncCollectionForEach(allMsgs, async (message) => {
			const followUp = lastProfile?.user == message.author.id
			//Parse the profile
			const profile = processProfileMessage(message, followUp, targetMember);

			//If we have a name, push it
			if (profile?.name)
			{
				charRecords.push(profile);
				charsByUser[profile.user] = [...(charsByUser[profile.user] || []), profile];
				//charsByUser[profile.user].push(profile);
			}
			else
			{
				chaffPosts.push(message.id);
				if (profile)
				{
					const lastIndex	= charsByUser[profile.user].length - 1;
					const lastType	= charsByUser[profile.user][lastIndex].type || ""
					const lastUrl	= charsByUser[profile.user][lastIndex].url || ""
					// console.log("\n\n\n",profile,"\n",followUp," | ",type," == ",lastType)
					if (profile?.url && followUp && type == lastType)
						charsByUser[profile.user][lastIndex].url = (lastUrl + "\n" + profile.url).trim()
					else if (!followUp) charErrors.push(profile)
				}
			}
			lastProfile = profile
		});
	});

	//Output data summary
	const total = charRecords.length + chaffPosts.length
	const userCount = Object.keys(charsByUser).length
	console.log(`${charRecords.length} chars + ${chaffPosts.length} chaff = ${total} posts (expected ${totalPosts})`)
	console.log(`Profiles: ${charRecords.length} chars across ${userCount} users`)
	return {charRecords, charsByUser, charErrors}
}

/// Process the profile message into usable data
function parseProfile(message, fallback = true) {
	message.content = message?.content ?? "";
	message.content = message.content.replace(breakRegex,"")
									 .replace(emojiRegex,"")
									 .replace(customEmoji,"")
									 .normalize(normalize).trim();

	//Parse the profile
	const profile = parseProfileFields(message);
	if (profile)
	{
		//If we didn't find a name, try a fallback test.
		if (!profile.name && fallback)
		{
			const fallback = fallbackParse(message)
			for (const [key, value] of Object.entries(fallback))
				profile[key] = profile[key] || fallback[key]
		}
		console.log(`${profile.profileId}: ${profile.name}`)
	}

	//console.log(profile)
	return profile
}

///
function parseProfileFields(message) {
	if (!message || 0 == message.length)
		return null
	if (message.content.includes("Character Profile Template") && message.author.id == config.OWNERID)
		return null

	const chan = message.channel.id;
	const type = chan == config.debug.profile ? "Test" :
				 chan == config.chan.npcProfile ? "NPC" :
				 chan == config.chan.pcProfile ? "PC" : "???"
	const profile =
	{
		name:null,
		user:message.author.id,
		profileId:message.id,
		url:message.url,
		type:type,
		level:0
	}

	const fields = {
		"name":nameRegex,
		"gender":/.*\b(?:gender|sex(?!ual))\b.*/mig,	//genderReg,
		"race":/.*\b(?:race|species)\b.*/mig,			//raceRegex,
		"class":/.*\bclass(?:\(es\))?\b.*/mig			//classRegex
	}

	for (var[field,regex] of Object.entries(fields))
	{
		var matches = [...message.content.matchAll(regex)];
		profile[field] = matches.length ? matches[0][1] ?? matches[0][0] : null;

		// try {
		// 	profile[field] = null;
		// 	if (matches.length)
		// 		profile[field] = matches[0][1] || matches[0][2]
		// 	profile[field] = profile[field]?.trim()
		// } catch (e) {
		// 	console.log(matches[0])
		// }
	}

	if (profile.name)
		profile.name = profile.name	.replace(/[\(\[\<\{].*[\}\>\]\)]/g,"")	//Trim out parentheticals
									.replace(badChars,"")					//Trim out "bad" chars
									.replace(/\s+/g," ").trim()				//Trim excess whitespace
	return profile
}

function fallbackParse(message)
{
	message.content = message.content.split("\n")[0].replace(/.*name\:?/i,"").trim() || null
	if (!message.content || message.content.length == 0) 
		return {}

	//Fallback test is to try to treat the first line as the name
	message.content = `name: ${message.content}`
	const profile = parseProfile(message,false)
	if (!profile.name) return {}
	return profile
}





module.exports = {
	parseProfile,
	batchProfiles,
	isProfileMessage
}