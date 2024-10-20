const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js')
const mod			= process.env.mod || "";
const config		= require(`../../config/${mod}_config.json`)
const Utils			= require(`../../utilities/utilFuncs.js`)
const Embed			= require(`../../utilities/EmbedPaginator.js`)
const Profile		= require(`../../utilities/profileUtils.js`)
const MsgUtils		= require(`../../utilities/messageUtils.js`)
const CharMeta		= require(`../../database/charMetaSchema.js`)
const CharUtils		= require(`../../utilities/charUtils.js`)
const Prompt		= require(`../../utilities/promptUtils.js`)
const StrComp		= require("string-similarity");	
const Levenshtein 	= require('fast-levenshtein');	//Levenshtein distance implementation
const Munkres 		= require('munkres-js');		//Munkres algorithm implementation
const util			= require("util");
const { profile } = require('console');
const URLRegex		= /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi
//const simplifyName	= (name) => name.replace(/[\"\(].*[\"\)]\s?/,'').toLowerCase();
const simplifyName	= (name) => name.replace(/[^a-zA-Z0-9\s]/g,'').trim().toLowerCase();

/// Error messages
const errNoCharName	= (recType) => `This ${recType} has no name. How did we get here?`
const errNoProfiles	= () => `No profiles to match sheet against - Delete?`
const errNoSheets	= (type) => `No sheets to match profile against - ${type} Profile`
const errNPCSheet	= () => `NPC profile has a matching sheet record - Delete!`
const errNoSheetMatch	= () => `Sheet has no matching profile - Purge sheet?`
const errNoProfileMatch	= (type) => `Profile has no matching sheet - ${type} Profile`

///
const messageCache = {};
const THRESHOLD = 0.5;
const ICON = {OK:'✅',WARN:'⚠️',ERR:'❌'}

/// Process all profiles in a batch and post the results into a debug channel
async function execute(interaction) {
	//Prep args and handle initial response
	await interaction.deferReply({ephemeral: true})
	const targetUserArg	= interaction.options.getMember('user') || null
	const allowAll		= targetUserArg ? false : (interaction.options.getBoolean('batch') ?? true);
	const targetMember	= allowAll ? null : (targetUserArg ?? interaction.member);
	const content		= (allowAll?"Batch ":"") + "Processing" + (targetMember?` <@${targetMember.id}>`:"")
	await interaction.editReply({content: content, ephemeral: true})
	console.log(`${'\n'.repeat(69)}Batch: ${allowAll}\nTargetMember: ${targetMember}`)

	const charsByUser	= {}
	const charRecords	= []
	const charErrors	= []
	const chaffPosts	= []
	let totalPosts 		= 0

	//Loop through the profile channels
	const channels = [config.chan.pcProfile, config.chan.npcProfile];
	await Utils.asyncArrayForEach(channels, async channelId => {
		//Get all the messages for this given channel
		const allMsgs = await fetchAllMessages(interaction.guild, channelId);
		const count = allMsgs.size;
		const output= `<#${channelId}>: ${allMsgs.size} messages.\n${allMsgs.first().url}\n${allMsgs.last().url}`
		await interaction.followUp({ content: output, ephemeral: true });
		totalPosts += count;

		let lastProfile = null;
		//Loop over all the profiles and process them
		await Utils.asyncCollectionForEach(allMsgs, async (message) => {
			const followUp = lastProfile?.user == message.author.id
			const profile = processSingleProfileMessage(message, followUp, targetMember);
			if (profile?.name) {	//If this profile has a name, push it
				charRecords.push(profile);
				charsByUser[profile.user] = [...(charsByUser[profile.user] || []), profile];
			}
			else {
				chaffPosts.push(message.id);
				if (profile) {
					const lastIndex	= charsByUser[profile.user].length - 1;
					const lastType	= charsByUser[profile.user][lastIndex].type || ""
					const lastUrl	= charsByUser[profile.user][lastIndex].url || ""
					if (followUp && profile?.type == lastType && profile?.url)
						charsByUser[profile.user][lastIndex].url = (lastUrl + "\n" + profile.url).trim()
					else if (!followUp) charErrors.push(profile)
				}
			}
			lastProfile = profile
		});
	});

	//Output the data. 
	const userCount = Object.keys(charsByUser).length
	const total = charRecords.length + chaffPosts.length
	console.log(`${charRecords.length} chars + ${chaffPosts.length} chaff = ${total} posts (expected ${totalPosts})`)
	console.log(`Profiles: ${charRecords.length} chars across ${userCount} users. (${charErrors.length} Errors)`)
	await batchProcessUserProfiles(interaction, charRecords, charsByUser, charErrors)
}

/// Fetch all the messages for a given channel, either from cache or pull them fresh
async function fetchAllMessages(guild, channelId) {
	//Fetch the channel object from the ID & collect all the profiles in it		
	const channel = await guild.channels.fetch(channelId);
	if (messageCache[channelId])
	{
		const messages = await channel.messages.fetch({limit: 1})
		if (messages.first().id == messageCache[channelId].last().id)
			return messageCache[channelId];
	}
	messageCache[channelId] = await MsgUtils.fetchAll(channel, { reverseArray: true, userOnly: true });	
	return messageCache[channelId];
}

/// Process a single profile message
function processSingleProfileMessage(message, followUp = false, targetMember = null) {
	if (targetMember && targetMember.id != message.author.id)
		return null;
	//Parse the profile	
	const profile = Profile.parseProfile(message, !followUp);
	return profile;
}

/// Process all the profiles on a per-member basis
async function batchProcessUserProfiles(interaction, charRecords, charsByUser, charErrors) {
	const debugChan		= await interaction.guild.channels.fetch(config.debug.profile);
	const targetUserArg	= interaction.options.getMember('user') || null
	const allowAll		= targetUserArg ? false : (interaction.options.getBoolean('batch') ?? true);
	const targetMember	= allowAll ? null : (targetUserArg ?? interaction.member);
	const userList		= allowAll ? Object.keys(charsByUser) : (targetMember ? [targetMember.user.id] : [])
	const showSheets	= interaction.options.getBoolean('sheets') ?? true;
	const showProfiles	= interaction.options.getBoolean('profiles') ?? true;
	const showErrors	= interaction.options.getBoolean('errors') ?? true;
	const showParams	= { showSheets, showProfiles, showErrors, channel:debugChan }

	//Loop over each user to process their profiles/sheets
	await Utils.asyncArrayForEach(userList, async user => {
		//Fetch the member
		const member 			= await interaction.guild.members.fetch(user)
											.catch(x=>console.log(`Unknown Member: ${user}`))
		//Filter the errors and profiles by the user
		const errorRecords		= charErrors.filter(item => item.user == user)
		const profileRecords	= charRecords.filter(item => item.user == user)
		// TODO - Wrap this into a method to get the sheet records
		const sheetRecords		= CharUtils.charCache.filter(item => item.user == user);
		// TODO - Wrap this into a method to get the sheet records
		const duplicateRecords	= generateDuplicates(profileRecords, sheetRecords)
		errorRecords.push(...duplicateRecords);
		const desc				= getMatchEmbedDesc(member, profileRecords, false) +
								  getMatchEmbedDesc(member, sheetRecords, true)

		//// Generate all character matches
		const matches = generateAllCharMatches(profileRecords, sheetRecords);
		const unMatched = generateUnmatched(profileRecords, sheetRecords, matches);
		const matchEmbeds = generateMatchEmbeds(user, member, matches, unMatched, errorRecords);
		await outputMemberEmbeds(user, member, desc, matchEmbeds, showParams);

		//// Old-style embed: Calculate all matches within this method
		const recordEmbeds = generateUserRecordEmbeds(member, profileRecords, sheetRecords, errorRecords)
		await outputMemberEmbeds(user, member, desc, recordEmbeds, showParams);

		await Utils.slowdown(500)
	})
}

/// Generate the embed for a single member's characters
async function outputMemberEmbeds(userId, member, desc, embeds, showParams) {
	// console.log(util.inspect(embeds, false, null, true /* enable colors */))
	const { profiles:profEmbed, sheets:sheetEmbed, errors } = embeds
	const { showSheets, showProfiles, showErrors, channel } = showParams
	const memberID		= member?.user?.id || userId;
	const memberName	= member?.displayName || member?.user?.username || userId
	const memberPing	= `<@${memberID}>`
	const slotInfo		= getMemberSlotInfo(member)
	const userOutput 	= [];
	//Prep the embeds for sheets / profiles / errors
	desc				= `\`${' '.repeat(69)}\`\n${memberPing} ${slotInfo.pcRole}${slotInfo.npcRole}\n`+desc
	if (!member) desc 	= "# UNKNOWN MEMBER\n" + desc
	let content = (showErrors && errors.length) ? "** **\n\n\n** **" : null;
	let embed = new EmbedBuilder().setTitle(`Character Data: ${memberName}`).setDescription(desc);
	const totalFields = 1 + (showSheets ? sheetEmbed.data.fields.length : 0) + 
						1 + (showProfiles ? profEmbed.data.fields.length : 0)
	// Between 1 and 25 fields, they'll all fit into one embed
	if (totalFields > 0 && totalFields <= 25) {
		if (showSheets && sheetEmbed)	//Generate a map of sheets -> profiles
			embed = mergeEmbed("Sheets", sheetEmbed, embed)
		if (showProfiles && profEmbed)	//Generate a map of profiles -> sheets
			embed = mergeEmbed("Profiles", profEmbed, embed)
		userOutput.push({content, embeds:[embed]})
	}
	// More than 25 fields, split it into two embeds
	else if (totalFields > 25) {
		if (showSheets && sheetEmbed)	//Generate a map of sheets -> profiles
			userOutput.push({content, embeds:[sheetEmbed]})
		content = (userOutput.length > 0) ? null : content;
		if (showProfiles && profEmbed)	//Generate a map of profiles -> sheets
			userOutput.push({content, embeds:[profEmbed]})
	}
	//Generate an embed with error matches
	if (showErrors && errors && errors.length > 0) {
		title = `Error Data: ${memberName}`
		desc  = `<@${memberID}>\n\`                                                                     \`\n`
		console.log(errors)
		embed = new EmbedBuilder().setTitle(title).setDescription(desc).addFields(errors)
		userOutput.push({embeds:[embed]}, {content:"** **\n\n\n** **"})
	}
	await Utils.asyncArrayForEach(userOutput, async embed => { await channel.send(embed) });
}

/// Generate the embeds for a single member's profiles and sheets
function generateUserRecordEmbeds(member, profileRecords, sheetRecords, errors) {
	const {embed:sheetEmbed, errors:sheetErrors} = generateRecordEmbed(member, sheetRecords, profileRecords, true)
	const {embed:profEmbed, errors:profErrors} = generateRecordEmbed(member, profileRecords, sheetRecords, false)
	errors = [...errors, ...sheetErrors, ...profErrors]
	errors = errors.map(error => { return {	name:error.name || "**[Unnamed Profile]**",
		   									value:error.value || "**[Unknown Error]**" } })
	return {profiles:profEmbed, sheets:sheetEmbed, errors}
}

/// Generate the embed with record matches
function generateRecordEmbed(member, records, compareRecords, isSheet) {
	const memberName= member?.displayName || member?.user?.username || "UNKNOWN USER"
	const slotInfo	= getMemberSlotInfo(member)
	const dataType	= isSheet ? "Sheet" : "Profile"

	const matches	= {}
	const errors	= []
	// const redFlags	= getRedFlags(isSheet, records, slotInfo)
	const embed		= new EmbedBuilder();
	const title		= `${dataType} Data: ${memberName}`
	const desc		= getMatchEmbedDesc(member, records, isSheet)
	embed.setTitle(title).setDescription(desc).setFooter({text:title});
	records.forEach(char => {
		if (char && char.name) {
			const matches	= generateSingleCharMatches(char, compareRecords)
			const result	= generateMatchOutput(char, matches, compareRecords, isSheet)
			let {icon, match, value} = outputMatches(char, result)

			const type	= ((char.type ?? '') + " " + dataType).trim()
			const name	= `\`${icon}\` [${type}] ${char.name}`
			embed.addFields({name,value})
			// capture any values containing the error icon as an error
			if (name.includes(ICON.ERR) || value.includes(ICON.ERR)) 
				errors.push({name, value, user:char.user})
		}
		else errors.push({ name:`${ICON.ERR} ${memberName} [Unknown Character]`, 
						   value:errNoCharName(dataType) })
	});
	return {embed,errors}
}

/// Generate field value for matches of a single character
function outputMatches(char, result){//records, isSheet) {
	const {icon, match, matchList, value, error} = result
	let message = ""
		+ (char?.url ? char.url.trim() : "") + "\n"
		+ (match ? `\`${match.target} [${Math.floor(match.rating * 1000)/10}%]\`\n` : "")
		+ (value ? `\`${value.trim()}\`\n` : "")
		+ (error ? `\`${error.trim()}\`\n` : "")
		+ (matchList ? `${matchList}\n` : "")
	message = message.replaceAll(/\`\`/g,' ').replaceAll(/\n+/g,'\n').trim()
	return {icon:  icon,
			match: match?.target,
			value: message }
}

function generateMatchOutput(char, matches, records, isSheet) {
	const isNPC		= char?.type == "NPC"
	const type		= isNPC ? "NPC" : "RP"
	const icon		= (isSheet ? ICON.ERR : (isNPC ? ICON.OK : ICON.WARN))
	const results	= { icon, value: "", error: "", match: null, matchList: [] }
	const best		= matches.bestMatch ?? null;
	if (best)
	{
		results.match = best;
		if (best.rating >= THRESHOLD) results.icon = '✅'
		if (best.partial) Object.assign(results, {icon:'❓', value:`⚠️ Partial Match [\`${best.partial.join("\`,\`")}\`]`})
		if (isNPC || (best.index && records[best.index].type == "NPC"))
			Object.assign(results, {icon: '❌', error: errNPCSheet()})
	}
	else
	{
		if (isSheet) results.error = errNoSheetMatch()
		else results.value = errNoProfileMatch(type)
	}
	if (false && !isNPC && !best && matches.rawRatings.length > 1) {
		const ratings = (matches.ratings.length > 1) ? matches.ratings : matches.rawRatings;
		results.matchList = ratings.map( x => {
			const flag = x.partial ? " [`Partial`]" : "";
			return `- \`${x.target}\` [\`${Math.floor(x.rating * 1000)/10}%\`]${flag}`
		}).join("\n");
	}
	return results
}

/// Given a single character and a list of potential matches, score all matches and find the best
function generateSingleCharMatches(char, records) {
	let best = null;
	let ratings = [];
	let rawRatings = [];
	if (records?.length > 0) {
		//Simplify the records into simple names
		const names = records.map(item => item.name);
		const simpleNames = names.map(name => simplifyName(name))
		char = simplifyName(char.name || char)

		//Find the best match or log some info as to why it faled
		const matches = StrComp.findBestMatch(char, simpleNames)
		//Process the results into something more usable
		if (matches.bestMatch && matches.bestMatch.rating >= THRESHOLD) {
			best = matches.bestMatch;
			best.index = matches.bestMatchIndex;
			best.target = names[best.index]
		}
		//Find partial matches separately from string similarity matches
		//This will help identify false negatives. Not 100% accurate, so flag it
		ratings = matches.ratings.map((match, index) => {
			const parts = match.rating >= THRESHOLD ? null : 
				generatePartialCharMatch(char, simplifyName(match.target))
			if (parts)
			{
				match.partial = parts;
				match.rating = Math.max(match.rating, THRESHOLD);
			}
			match.target = records[index].name
			match.index = index;
			return match;
		})
		ratings.sort((a,b) => b.rating - a.rating)
		rawRatings = ratings.filter(x => x.rating > 0)
		ratings = ratings.filter(x => x.rating >= THRESHOLD)

		//If we have any ratings and its the new best, use it
		if (ratings.length > 0 && (best == null || ratings[0].rating > best.rating))
			best = ratings[0];
	}
	return {bestMatch: best, ratings, rawRatings}
}

/// Group all profiles and sheets by similar records of the same type to find duplicates
function generateDuplicates(profileRecords, sheetRecords) {
	const threshold = 0.7
	const groupSimilar = (source, threshold = THRESHOLD) => {
		let _source, matches, x, y;
		_source = source.slice();
		matches = [];
		for (x = _source.length - 1; x >= 0; x--) {
			let output = _source.splice(x, 1);
			for (y = _source.length - 1; y >= 0; y--) {
				if (computeSimilarity(output[0].name, _source[y].name) >= threshold) {
					output.push(_source[y]);
					_source.splice(y, 1);
					x--;
				}
			}
			matches.push(output);
		}
		return matches.filter(x => x.length > 1);
	}
	const output = (groups, isSheet = false) => {
		const dataType = (isSheet ? "Sheet" : "Profile")
		return groups.map(group => {
			const name = `\`${ICON.WARN}\` ${group.length} similar ${dataType} entries`
			const value = isSheet ? group.map(x => `- \`${x.name}\` (Level \`${x.level}\`)`).join("\n") :
									group.map(x => `- (\`${x.type}\`) [\`${x.name}\`](${x.url})`).join("\n");
			return {name, value}
		});
	}

	let profiles = profileRecords.map(x => ({name:x.name, type:x.type, url:x.url}))
	profiles = groupSimilar(profiles, threshold)
	profiles = output(profiles, false)

	let sheets	 = sheetRecords.map(x => ({name:x.name, level:x.level}))
	sheets = groupSimilar(sheets, threshold)
	sheets = output(sheets, true)

	return [...profiles, ...sheets]
}




function getMatchEmbedDesc(member, records, isSheet) {
	const slotInfo	= getMemberSlotInfo(member)
	const redFlags	= getRedFlags(isSheet, records, slotInfo)
	const slotCount	= isSheet ? slotInfo.pcSlots : slotInfo.totalSlots;
	const dataType	= isSheet ? "Sheet" : "Profile"
	let desc		=	`${((records.length > slotCount) ? `⚠️`:``)}`+
						`${records.length} / ${slotCount} ${dataType}s`
		desc		=	`\`${desc}${' '.repeat(69-desc.length)}\`${redFlags}\n`	
	return desc
}

function generateMatchEmbeds(userId, member, matches, unmatched, errorRecords) {
	const memberID		= member?.user?.id || userId;
	const memberName	= member?.displayName || member?.user?.username || userId
	const slotInfo		= getMemberSlotInfo(member)
	const errors 		= errorRecords;
	const outputSheet	= function (x, match)
	{
		console.log(x)
		const name = match ? x.profileName : x.sheetName
		const url = `[${name}](https://discord.com/channels/694275190976413816/${x.profileId})`
		const sheetVal = `\`  Sheet:\` ${x.sheetName} (\`Level:\` ${x.level})`
		const profileVal = `\`Profile:\` ${match ? url : "\`"+errNoSheetMatch()+"\`"}`
		const value = `${match ? '':'-# '}${profileVal}\n${sheetVal}`
		const isNPC = x.profileId?.includes(config.chan.npcProfile) || false
		if (isNPC) { errors.push({name, value:value+"\n"+errNPCSheet()}); return null; }
		return {name:`${match ? config.emoji.xp : "`❌`"} ${name}`, value}
	}
	//Prep the fields for matches
	const allSheets = [...matches, ...unmatched.sheets]
	matches = matches.map(x => outputSheet(x.db, true)).filter(x => x);
	matches.push(... unmatched.sheets.map(x => outputSheet(x, false)).filter(x => x))
	const sheetEmbed = new EmbedBuilder().setTitle(`Sheet Data: ${memberName}`).setFooter({text:userId})//.setDescription(desc);
	if (matches.length > 0) sheetEmbed.addFields(matches);

	//Prep the fields for RP/NPC profiles
	const profiles = unmatched.profiles.map(x => {
		const name = x.profileName
		const url = `https://discord.com/channels/694275190976413816/${x.profileId}`
		const isNPC = x.profileId?.includes(config.chan.npcProfile) || false
		const value = `\`Profile:\` [${name}](${url})\n-# \`  Sheet:\` \`${errNoProfileMatch(isNPC ? "NPC" : "RP")}\``
		return {name:`${config.emoji.rpp} ${name}`, value}
	});
	const profileEmbed = new EmbedBuilder().setTitle(`Character Match Data: ${memberName}`)//.setDescription(desc);
	if (profiles.length > 0) profileEmbed.addFields(profiles);

	//Populate errors: sheets with missing profiles
	unmatchedErr = unmatched.sheets.map(x => `- (\`Sheet\`): \`${x.sheetName}\` (Level: \`${x.level}\`)`).join("\n")
	if (unmatched.sheets.length > 0) errors.push({name:`\`❌\` ${errNoSheetMatch()}`, value:unmatchedErr})
	const errorStr = errors.map( error => `**${error.name}**\n${error.value}\n` ).join("\n").trim();

	return {profiles:profileEmbed, sheets:sheetEmbed, errors}
}






/// Utility function: Flag users that have too many sheets or profiles than their roles allow
function getRedFlags(isSheet, records, slotInfo) {
	if (isSheet)
		return countMemberSheets(records, slotInfo)
	else
		return countMemberProfiles(records, slotInfo)
}

/// Utility function: Compare number of sheets against max from provided slot info
function countMemberSheets(sheets, slotInfo) {
	const pcs  = sheets.map(p => `\`${p.name}\``)
	if (pcs.length > slotInfo.pcSlots)
		return `\n\`❌ Too Many Sheets: ${pcs.length} PCs in ${slotInfo.pcSlots} slots\`\n${pcs.join(" | ")}`
	else if (pcs.length == 0)
		return `\n<@&704013331588972674>`
	return ""
}

/// Utility function: Compare number of profiles against max from provided slot info
function countMemberProfiles(profiles, slotInfo) {
	const  pcs  = profiles.filter(p => p.type == "PC").map(p => `\`${p.name}\``)
	const npcs  = profiles.filter(p => p.type == "NPC").map(p => `\`${p.name}\``)
	const total = pcs.length + npcs.length
	const slots = slotInfo.totalSlots
	let redFlag = `\n\`\`\`❌ Too Many Characters: ${total} profiles in ${slots} total slots\n`+
				  `${pcs.length} PCs in ${slotInfo.pcSlots} slots: ${pcs.join(", ")}\n`+
				  `${npcs.length} NPCs in ${slotInfo.npcSlots} slots: ${npcs.join(", ")}\`\`\``
	if (total > slots || pcs.length > slotInfo.pcSlots)
		return redFlag
	return ""
}

/// Utility function: Calculate the slot info for a member based on their roles
function getMemberSlotInfo(member) {
	const pcRoles = config.role.pcRoles;
	const npcRoles = config.role.npcRoles;
	let pcSlots = 1;
	let npcSlots= 0;
	let pcRole = "";
	let npcRole = "";
	if (member)
	{
		const roles = member.roles.cache.filter(x => pcRoles.includes(x.id) || npcRoles.includes(x.id))
		roles.forEach(role => {
			pcSlots  += pcRoles.findIndex(e => e == role.id) + 1 
			npcSlots += npcRoles.findIndex(e => e == role.id) + 1
		})
		pcRole = pcRoles.filter(id => roles.some(role => role.id === id)).map(id => `<@&${id}>`).join("")
		npcRole = npcRoles.filter(id => roles.some(role => role.id === id)).map(id => `<@&${id}>`).join("")
	}
	return {pcSlots, npcSlots, totalSlots:(pcSlots+npcSlots), pcRole, npcRole}
}

/// Utility function: Merge a source embed into fields of another one
function mergeEmbed(name, srcEmbed, embed) {
	if (srcEmbed.data.description)
		embed.addFields({name, value: srcEmbed.data.description})
	if (srcEmbed.data.fields) embed.addFields(srcEmbed.data.fields)
	if (srcEmbed.data.footer) embed.setFooter(srcEmbed.data.footer)
	return embed
}

/// Utility function: compute similarity scores between two names
function computeSimilarity(name1, name2) {
	const similarity = StrComp.compareTwoStrings(name1, name2);
	const distance = Levenshtein.get(name1, name2);
	// Determine the maximum length between both strings
	const maxLength = Math.max(name1.length, name2.length); 
	// Handle edge case where both strings are empty
	if (maxLength === 0) return 1.0; 
	// Compute normalized similarity score
	const normalizedLevenshtein = 1 - (distance / maxLength);
	return Math.max(similarity, normalizedLevenshtein);
}

/// Utility function: generate partial word matches between two names
function generatePartialCharMatch(profileName, sheetName) {
	const commonWords = ["the","in","on","of"]
	const splitToParts = (name) => name.split(/\s/g).filter(x => !commonWords.includes(x))
	const partMatch = (parts, name) => parts.map(part => name.match(new RegExp("\\b"+part,"i")) ? part : "")

	const profileParts = splitToParts(profileName)
	const sheetParts = splitToParts(sheetName)

	const sPartMatch = partMatch(sheetParts, profileName)
	const pPartMatch = partMatch(profileParts, sheetName)			

	const partialMatches = [...sPartMatch,...pPartMatch].filter( n => n);
	const parts = [...new Set(partialMatches)];

	const contains = 	sheetName.includes(profileName) || 
						profileName.includes(sheetName) || 			
						partialMatches.length > 0

	if (contains) return parts;
	return null;
}

/// Utility function: given a profile / sheet pair, generate a DB record
function generateCharMetaRecord(profile, sheet) {
	// console.log(profile)
	return {
		user: profile?.user	?? sheet.user,
		profileName: profile?.name		?? "",
		profileId: profile?.profileId	?? "",
		sheetName: sheet?.name			?? "",
		sheetId: sheet?.sheetId			?? "",
		level: sheet?.level				?? 0,
		type: profile?.type				?? "",
	}
}

/// Generate matches between two lists of profiles and sheets
function generateAllCharMatches(profileRecords, sheetRecords, threshold = THRESHOLD) {
	const similarityMatrix = [];	// similarity matrix between all pairs in the two lists
	let allMatches = [];			// all matches in a single-dimensional list
	sheetRecords.forEach((sheet, s) => {
		const row = [];
		const sheetName = simplifyName(sheet.name)
		profileRecords.forEach((profile, p) => {
			const profileName = simplifyName(profile.name);
			const score = computeSimilarity(profileName, sheetName)
			const dbRec = generateCharMetaRecord(profile, sheet)
			const match = { profile:profile.name, sheet:sheet.name, p, s, score, db:dbRec }
			if (score < threshold) {
				const parts = generatePartialCharMatch(profileName, sheetName)
				if (parts) {
					match.partial = parts;
					match.score = THRESHOLD;
				}
			}
			row.push(match);
			if (match.score >= threshold) allMatches.push(match);
		})
		similarityMatrix.push(row);
	})

	//// Optimal matching via Munkres algorithm
	// Convert similarity matrix to cost matrix (higher score = lower cost)
	const costMatrix = similarityMatrix.map(row => row.map(cell => 1 - cell.score));
	const indices = Munkres(costMatrix);
	// Extract matching results
	const optimalMatches = indices.map(([s, p]) => ( similarityMatrix[s][p] ))
								  .filter(match => match.score >= threshold)

	//// Greedy matching by sorting all and taking the the highest rated
	const greedyMatches = [];
	allMatches.sort((a,b) => b.score - a.score);
	while (allMatches.length > 0)
	{
		const match = allMatches.shift();
		greedyMatches.push(match)
		//remove all lower matches containing either profile or sheet
		allMatches = allMatches.filter(x => x.profile.name != match.profile.name && 
											x.sheet.name != match.sheet.name)
	}

	consohes
	return optimalMatches;
}

/// Generate two lists of unmatched profiles & sheets 
function generateUnmatched(profileRecords, sheetRecords, matches) {	
	const matchedProfiles		= matches.map(match => match.profile)
	const matchedSheets			= matches.map(match => match.sheet)
	const unmatchedProfiles		= profileRecords.filter(x => !matchedProfiles.includes(x.name))
												.map(x => generateCharMetaRecord(x, null))
	const unmatchedSheets		= sheetRecords.filter(x => !matchedSheets.includes(x.name))
												.map(x => generateCharMetaRecord(null, x))
	return {profiles:unmatchedProfiles, sheets:unmatchedSheets}	
}





// async function updateCharMeta(search, data)
// {
// 	const result = await CharMeta.findOneAndUpdate( search, data, { upsert: true } )
// 	return result;
// }
///
const __NPC = 0
function generateDBRecords(interaction, sheetRecords, profileRecords) {
	// sheetRecords = sheetRecords.map(item => item);
	// profileRecords = profileRecords.map(item => item);
	// let sheetNames = sheetRecords.map(item => item.name);
	// let profileNames = profileRecords.map(item => item.name)
	// let sheetMatches = []
	// let profileMatches = []

	const dbRecords = []
	//Profiles should get added as NPCs by default, and we override the level if we have a sheet that matches
	profileRecords = profileRecords.map(char => ({
		user: char.user,
		name: char.name,
		profileId: char.id,
		level: __NPC,
		update: Date.now()		
	}));
		//		dbRecords.add(record)
	const bulkOps = profileRecords.map(char => ({
		updateOne: {
			filter: { 'profileName': char.profileName, 'user': char.user },
			update: { $set: char },
			upsert: true
		}
	}));
	const result = CharMeta.collection.bulkWrite(bulkOps);	
	// throw "DONE"

// The objects in each list contain different fields, but both contain a name field. Items from list P should be added to the destination list. Items from list S should only be added if the name field is similar to a name in list P and its data merged with that object in the destination list. Please present simple pseudocode for this function
}


const data = new SlashCommandBuilder()
	.setName(`parseprofiles${config.DEV ? "dev" : ""}`)
	.setDescription('Parse all the profiles and dump the data into a database')
	.addBooleanOption(option => option
		.setName('batch').setRequired(false)
		.setDescription('Batch? If set will ignore the user setting')
	)
	.addUserOption(option => option
		.setName('user').setRequired(false)
		.setDescription('Target user. If omitted, defaults to the person running the command')
	)
	.addBooleanOption(option => option
		.setName('sheets').setRequired(false)
		.setDescription('Show sheets')
	)
	.addBooleanOption(option => option
		.setName('profiles').setRequired(false)
		.setDescription('Show profiles')
	)
	.addBooleanOption(option => option
		.setName('errors').setRequired(false)
		.setDescription('Show errors')
	)

const userPermissions = [	PermissionsBitField.Flags.ViewChannel,
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.role.Builder	];

module.exports = 
{
	data: data,
	whitelistRoles: whitelistRoles,
	botPermissions: userPermissions,
	execute: execute,

	build:config.DEV //||config.PRODUCTION
};