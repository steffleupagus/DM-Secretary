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
const util			= require("util")
const URLRegex		= /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi

const __NPC = 0

let cache = {};

/// Run the slash command
async function execute(interaction) {
	console.log('\n'.repeat(69))
	
	await interaction.deferReply({ephemeral: true})
	return await processBatchProfiles(interaction);
}

/// Process all profiles in a batch and post the results into a debug channel
async function processBatchProfiles(interaction) {
	const charRecords = []
	const charErrors  = []
	const charsByUser = {}
	const chaffPosts  = []

	const allowAll     = interaction.options.getBoolean('batch') ?? false;
	const targetMember = allowAll ? null : (interaction.options.getMember('user') ?? interaction.member);
	const content = (allowAll?"Batch ":"") + "Processing" + (targetMember?` <@${targetMember.id}>`:"")
	await interaction.editReply({content: content, ephemeral: true})

	let last = null;
	let pcProfile = null;
	let allMessages = null;
	let totalPosts = 0
	//Loop through the profile channels
	const channels = [config.chan.pcProfile, config.chan.npcProfile];
	await Utils.asyncArrayForEach(channels, async channel => {
		//Fetch the channel object from the ID & collect all the profiles in it		
		channel     = await interaction.guild.channels.fetch(channel);
		if (cache[channel])
		{
			const messages = await channel.messages.fetch({limit: 1})
			if (messages.first().id == cache[channel].last().id)
				allMessages = cache[channel]
		}
		if (!allMessages)
			allMessages = await MsgUtils.fetchAll(channel, { reverseArray: true, userOnly: true });
		cache[channel] = allMessages

		const count = allMessages.size;
		totalPosts += count;
		const output= `${channel}: ${count} messages.\n${allMessages.first().url}\n${allMessages.last().url}`
		await interaction.followUp({ content: output, ephemeral: true });

		last = null;
		//Loop over all the profiles and process them
		await Utils.asyncCollectionForEach(allMessages, async (message) => {
			if (targetMember && targetMember.id != message.author.id)
			{
				last = null;
				chaffPosts.push(message.id);
				return;
			}

			const type = message.channel.id == config.chan.pcProfile ? "PC" : "NPC"
			const followup = last?.user == message.author.id
			//Parse the profile
			const profile = Profile.parseProfile(message, !followup);	
			
			//If we have a name, push it
			if (profile?.name)
			{
				charRecords.push(profile);
				charsByUser[profile.user] = charsByUser[profile.user] || [];
				charsByUser[profile.user].push(profile);
			}
			else
			{
				chaffPosts.push(message.id);
				if (profile)
				{
					const lastIndex = charsByUser[profile.user].length - 1;
					const lastType  = charsByUser[profile.user][lastIndex].type || ""
					const lastUrl = charsByUser[profile.user][lastIndex].url || ""
					// console.log("\n\n\n",profile,"\n",followup," | ",type," == ",lastType)
					if (profile?.url && followup && type == lastType)
						charsByUser[profile.user][lastIndex].url = (lastUrl + "\n" + profile.url).trim()
					else if (!followup) charErrors.push(profile)
				}
			}
			last = profile
		});

		allMessages = null;
	});

	const total = charRecords.length + chaffPosts.length
	console.log(`${charRecords.length} chars + ${chaffPosts.length} chaff = ${total} posts (expected ${totalPosts})`)

	//Output the data. 
	const userCount = Object.keys(charsByUser).length
	console.log(`Profiles: ${charRecords.length} chars across ${userCount} users`)
	await processProfiles(interaction, charRecords, charsByUser, charErrors)
}

///
async function processProfiles(interaction, charRecords, charsByUser, charErrors) {
	const debugChan    = await interaction.guild.channels.fetch(config.debug.profile);

	const allowAll     = interaction.options.getBoolean('batch') ?? false;
	const targetMember = allowAll ? null : (interaction.options.getMember('user') ?? interaction.member);
	const userList     = allowAll ? Object.keys(charsByUser) : (targetMember ? [targetMember.user.id] : [])

	const showSheets   = interaction.options.getBoolean('sheets') ?? true;
	const showProfiles = interaction.options.getBoolean('profiles') ?? true;
	const showErrors   = interaction.options.getBoolean('errors') ?? true;

	await Utils.asyncArrayForEach(userList, async user => 
	{
		let member = await interaction.guild.members.fetch(user).catch(x=>console.log(`Unknown Member: ${user}`))
		const memberID   = member?.user?.id || user;
		const memberName = member?.displayName || member?.user?.username || user
		const memberPing = `<@${memberID}>`

		const sheetRecords = CharUtils.charCache.filter(item => item.user == memberID);
		const sheetNames = sheetRecords.map(item => item.name);
		const profileRecords = charsByUser[memberID]
		const profileNames = profileRecords.map(item => item.name)
		const slotInfo = getMemberSlotInfo(member)
		console.log(slotInfo)
		let errors = charErrors.filter(item => item.user == memberID)
		let desc = `\`${' '.repeat(69)}\`\n${memberPing} ${slotInfo.pcRole}${slotInfo.npcRole}\n`

		generateDBRecords(interaction, sheetRecords, profileRecords)

		const {embed:sheetEmbed, errors:sheetErrors} = generateRecordEmbed(member, sheetRecords, profileRecords, true)
		const {embed:profEmbed, errors:profErrors} = generateRecordEmbed(member, profileRecords, sheetRecords, false)
		console.log("Sheet:",sheetErrors,"Prof:",profErrors)
		errors = [...errors, ...sheetErrors, ...profErrors]
		let content = (showErrors && errors.length) ? "** **\n\n\n** **" : null;
		let embed = new EmbedBuilder().setTitle(`Character Data: ${memberName}`).setDescription(desc);
		const msg = {}
		const totalFields = 1 + (showSheets ? sheetRecords.length : 0) + 
							1 + (showProfiles ? profileRecords.length : 0)
		//Generate a map of sheets -> profiles
		if (showSheets && sheetEmbed)	//&& sheetRecords && sheetRecords.length > 0
		{
			if (totalFields > 25)
			{
				await debugChan.send({content, embeds:[sheetEmbed]})
				content = null;
			}
			else
			{
				embed.addFields({name:"Sheets",value:sheetEmbed.data.description})
				if (sheetEmbed.data.fields) embed.addFields(sheetEmbed.data.fields)
				embed.setFooter(sheetEmbed.data.footer)
			}
		}
		//Generate a map of profiles -> sheets
		if (showProfiles && profEmbed)	//&& profileRecords && profileRecords.length > 0
		{
			if (totalFields > 25)
				await debugChan.send({content, embeds:[profEmbed]})
			else
			{
				embed.addFields({name:"Profiles",value:profEmbed.data.description})
				if (profEmbed.data.fields) embed.addFields(profEmbed.data.fields)
				embed.setFooter(profEmbed.data.footer)
			}				
		}

		if (totalFields <= 25 && totalFields > 0)
			await debugChan.send({content, embeds:[embed]})

		//Generate the embed with error matches
		if (showErrors && errors && errors.length > 0)
		{
			console.log(errors)
			errors = errors.map(error => 
			{ 				
				return {name:error.name || "**[Unnamed Profile]**",value:error.note||error.url||"** **\n"} 
			})
			title = `Error Data: ${memberName}`
			desc  = `<@${memberID}>\n\`                                                                     \`\n`
			embed = new EmbedBuilder().setTitle(title).setDescription(desc).addFields(errors)
			await debugChan.send({embeds:[embed]})
			await debugChan.send("** **\n\n\n** **")
		}
		await Utils.slowdown(500)
	})
}

///
function generateDBRecords(interaction, sheetRecords, profileRecords)
{
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
		profile: char.id,
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

/// Generate the embed with record matches
function generateRecordEmbed(member, records, compareRecords, isSheet, includeDesc = true) {
	const memberID   = member?.user?.id || "MISSING ID";
	const memberName = member?.displayName || member?.user?.username || user
	const memberPing = `<@${memberID}>`
	const slotInfo   = getMemberSlotInfo(member)
	const slotCount  = isSheet ? slotInfo.pcSlots : slotInfo.totalSlots;
	const dataType   = isSheet ? "Sheet" : "Profile"

	const matches = {}
	const errors = []
	let redFlags = isSheet ? countMemberSheets : countMemberProfiles;
		redFlags = redFlags(member, records, slotInfo);
	const title = `${dataType} Data: ${memberName}`
	let desc  = //`\`                                                                     \`\n`+
				  `${((records.length > slotCount) ? `⚠️`:``)}`+
				  `${records.length} / ${slotCount} ${dataType}s`
		desc = `\`${desc}${' '.repeat(69-desc.length)}\`${redFlags}\n`	
	embed = new EmbedBuilder().setTitle(title).setDescription(desc).setFooter({text:title});
	records.forEach(char => {
		const type  = ((char.type ?? '') + " " + dataType).trim()
		const name  = `[${type}] ${char.name}`
		let {icon, match, value} = outputMatches(char, compareRecords, isSheet)
		let multiMatch = ""
		if (match) 
		{
			matches[match] = [...(matches[match] || []), char.name]
			if (matches[match].length > 1)
			{
				multiMatch = `\`⚠️ ${match} has multiple matches: \`\n- ${matches[match].join("\n- ")}`
				errors.push({name:match, note:multiMatch})
			}
		}
		if (value.includes("❌")) 
		{
			if (isSheet) char = {name:char.name, user:char.user}
			char.name = `[${isSheet ? "Sheet" : "Profile"}] ${char.name}`
			char.note = value
			errors.push(char)
		}		
		embed.addFields({name,value:(value + multiMatch)})
		//'✅','⚠️','❌'
	});

	console.log(matches)
	
	return {embed,errors}
}

/// Generate field value matching a single character to a list of records
function outputMatches(char, records, isSheet) {
	const result = generateMatches(char, records, isSheet)
	const {icon, match, matchList, value, error} = result
	let message = ''
	if (!isSheet) message += char.url.trim() + "\n"
	message += `\`${icon}\``
	if (match)
		message+= `\`${match.target} [${Math.floor(match.rating * 1000)/10}%]\`\n`
	if (value) message += `\`${value.trim()}\`\n`
	if (error) message += `\`${error.trim()}\`\n`

	if (matchList) message += `\n${matchList}`
	return {icon:  icon,
			match: match?.target,
			value: message.replaceAll(/\`\`/g,' ').replaceAll(/\n+/g,'\n')}
}

function generateMatches(char, records, isSheet) {
	const isNPC   = char?.type == "NPC"
	const recType = isSheet ? "sheet" : "profile"
	const matType = isSheet ? "Profile" : "Sheet"
	const type    = isNPC ? "NPC" : "RP"
	let icon  = ""
	let value = ""	
	let error = ""
	let match = null
	let matchList = ""

	//If we have no character name to match, early exit
	if (!char || !char.name) return {error: `This ${recType} has no name. How did we get here?`}	
	//If we have no names to match against, early exit
	if (!records || records.length == 0)
	{
		icon = isSheet ? '❌' : isNPC ? '✅' : '⚠️'
		if (isSheet) error = `No profiles to match sheet against - Delete?`
		else value = `No sheets to match profile against - ${type} Profile`
		return {icon, match, value, error}
	}

	const names = records.map(item => item.name);
	const simpleNames = names.map(name => name.replace(/\(.*\)/,''))
			char.name = char.name.replace(/\(.*\)/,'')	

	//Find the best match or log some info as to why it faled
	const matches = StrComp.findBestMatch(char.name, simpleNames) 
	// catch(e) { console.log(char.name, names); return `Match Failed: ${char.name}\n${names.join("\n")}` }
	//Process the results into something more usable
	let best      = matches.bestMatch ?? null;
	if (best) best.target = names[matches.bestMatchIndex]
	const ratings = matches.ratings.filter(opt => opt.rating > 0)
		  ratings.sort((a,b) => b.rating - a.rating)

	//We have a reasonable match
	if (best?.rating >= 0.5)
	{
		icon  = '✅'
		match = best;

		//A sheet-profile match on an NPC is a ❌ problem and the sheet record should be removed
		if (isNPC || records[matches.bestMatchIndex].type == "NPC")
		{
			icon = '❌'
			error = "NPC profile has a matching sheet record - Delete!"
		}
		//value = `\`*Best ${matType} Match:* \`${match.target} [${Math.floor(match.rating * 1000)/10}%]`			
	}	
	else
	{
		//Check for false negatives. Not 100% accurate, so flag with a question mark		
		const commonWords = ["the"]
		const charParts = char.name.toLowerCase().split(/\s/g).filter(x => !commonWords.includes(x))
		ratings.forEach(opt => 
		{
			const optName = opt.target.toLowerCase()
			const optParts = optName.toLowerCase().split(/\s/g).filter(x => !commonWords.includes(x))
			const partialMatches = [...optParts.map(part => char.name.toLowerCase().includes(part) ? part : ""),
								    ...charParts.map(part => optName.includes(part) ? part : "")].filter(n => n)
			const parts = [...new Set(partialMatches)];
			let flag = "";			
			const contains = optName.includes(char.name) || char.name.includes(optName) || partialMatches.length > 0
			if (contains)
			{
				icon = '❓'
				flag = "[**(False Negative\`❓\`)**]"
				match = {target:opt.target, rating:0.69, partial:partialMatches.length > 0} 
				value = `⚠️ Partial Match` + (partialMatches.length > 0 ? ` [${parts.join(",")}]` : ``)
			}
			if (!isNPC || flag)
				matchList += `- ${opt.target} [${Math.floor(opt.rating * 1000)/10}%]${flag}\n`			
		})
		//We don't have a good match, output that status
		if (!match)
		{	
			icon = isSheet ? '❌' : isNPC ? '✅' : '⚠️'
			if (isSheet)
				error = `Sheet has insufficient profile match - Delete?`
			else
				value = `Profile has insufficient sheet Match - ${type} Profile`
		}
	}

	return {icon, match, matchList, value, error}
}

/// Compare the number of sheets a member has against the max from the provided slot info
function countMemberSheets(member, sheets, slotInfo) {
	const pcs  = sheets.map(p => `\`${p.name}\``)
	if (pcs.length > slotInfo.pcSlots)
		return `\n\`❌ Too Many Sheets: ${pcs.length} PCs in ${slotInfo.pcSlots} slots\`\n${pcs.join(" | ")}`
	else if (pcs.length == 0)
		return `\n<@&704013331588972674>`
	return ""
}

/// Compare the number of profiles a member has against the max from the provided slot info
function countMemberProfiles(member, profiles, slotInfo) {
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

/// Calculate the slot info for a member based on their roles
function getMemberSlotInfo(member) {
	const pcRoles = config.role.pcRoles
	const npcRoles = config.role.npcRoles	
	let pcSlots = 1
	let npcSlots= 0
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











// async function updateCharMeta(search, data)
// {
// 	const result = await CharMeta.findOneAndUpdate( search, data, { upsert: true } )
// 	return result;
// }





// async function findMatchingSheet(profile)
// {
// 	//Try to match the profile name with a character record in the database
// 	if (profile?.name && profile?.user && pcProfile)
// 	{
// 		const match = await CharUtils.findClosestMatch(profile.name, profile.user, true, 0.5);
// 		if (match?.match)
// 		{
// 			//console.log(match)
// 			profile.sheetName = match.match.name
// 			profile.level = match.match.level
// 			const rating = Math.floor(match.match.rating * 1000) / 10;
// 			profile.match = `Match  : ${profile.sheetName} (${profile.level}) \`✅\` (${rating}%)`
// 		}
// 		else
// 		{
// 			let closest = match?.matches?.[0] || null
// 			if (closest)
// 			{
// 				const rating = Math.floor(closest.rating * 1000) / 10;
// 				profile.match = `Closest: ${closest.name} (${closest.level}) \`⚠️\` (${rating}%)`
// 				profile.flag  = true;
// 			}
// 			else
// 				profile.match = `No sheet record match (NPC) \`❌\``
// 		}
// 	}
// 	return profile;
// }

// ///
// /// 
// ///
// async function outputCharDataByUser(interaction, charRecords, charsByUser, charErrors)
// {	
// //	console.log(util.inspect(charsByUser, false, null, true))

// 	const debugChan = await interaction.guild.channels.fetch(config.debug.profile);
// 	let count = 0;	//1;

// 	//Create an array of objects of user ID and how many profiles they have
// 	let counts = [];
// 	for (var[user,profiles] of Object.entries(charsByUser))
// 		counts.push({user,count:profiles.length})
// 	//Sort in descending order (most profiles will be first)
// 	counts.sort((a,b) => b.count - a.count);
// 	//Filter the list to only display users with over a certain threshold
// 	const users = counts.filter(x => x.count >= count)

// 	//Convert from raw object to a usable string for debug output
// 	counts = users.map(a => `<@${a.user}>: ${a.count}`)
// 	//console.log(util.inspect(counts, false, null, true /* enable colors */))

// 	//// Generate the embed output with every user in its own field
// 	// const embed = new Embed()
// 	// await Utils.asyncArrayForEach(users, async user => 
// 	// {
// 	// 	const profiles = charsByUser[user.user].map(profile => getProfileDataOutput(profile))
// 	// 	let member = await interaction.guild.members.fetch(user.user).catch(x=>console.log(`Unknown Member: ${user.user}`))
// 	// 	member = member?.displayName || member?.user?.username || user.user
// 	// 	if (profiles.length > 0) embed.addField(`${member} [${profiles.length} Profiles]`)
// 	// 	profiles.forEach(profile => embed.extendField(profile))
// 	// });

// 	// try { embed.send(debugChan) }
// 	// catch(e){ console.log(embed, e) }

// 	// Generate the embed output with every user with their own embed. This might be a lot.
// 	await Utils.asyncArrayForEach(users, async user => 
// 	{
// 		const profiles = charsByUser[user.user]
// 		if (profiles.length > 0)
// 		{
// 			profiles.sort((a,b) => a.name.localeCompare(b.name))
// 			const  pcs  = profiles.filter(p => p.type == "PC").map(p => `\`${p.name}\``)
// 			const npcs  = profiles.filter(p => p.type == "NPC").map(p => `\`${p.name}\``)			

// 			let slots   = 1
// 			let roles   = []
// 			let member  = await interaction.guild.members.fetch(user.user)
// 														 .catch(x=>console.log(`Unknown Member: ${user.user}`))
// 			let pcSlot  = ["734957138908151898","734957366373515326","734957415727890559","734957425815453766"]
// 			let npcSlot = ["806915819128881152","973044953821364224","973045332344733877","973045455816626176","973045799913148426"]
// 			if (member)
// 			{
// 				roles = member.roles.cache.filter(x => pcSlot.includes(x.id) || npcSlot.includes(x.id))
// 				roles.forEach(role => slots += pcSlot.findIndex(e => e == role.id) + npcSlot.findIndex(e => e == role.id) + 2)
// 				pcSlot = pcSlot.filter(id => roles.some(role => role.id === id)).map(id => `<@&${id}>`).join("")
// 				npcSlot = npcSlot.filter(id => roles.some(role => role.id === id)).map(id => `<@&${id}>`).join("")
// 			}
// 			else
// 				pcSlot = npcSlot = ""		
// 			member = member?.displayName || member?.user?.username || user.user
// 			const title = `${member} [${profiles.length} Profiles]`			
// 			const embed = new EmbedBuilder()
// 			embed.setTitle(title)
// 			embed.setDescription(`${slots} total slots [${roles.map(x => `<@&${x.id}>`).join("")}]\n`+
// 								 `${pcSlot}${pcs.length}x PCs: ${pcs.join(", ")}\n`+
// 								 `${npcSlot}${npcs.length}x NPCs: ${npcs.join(", ")}\n`+								 
// 								 `\`                                                                     \``)

// 			const total = pcs.length + npcs.length
// 			if (total > slots || pcs.length > 5)
// 			{
// 				let debug = `\`\`\`${pcs.length}x PCs: ${pcs.join(", ")}\n${npcs.length}x NPCs: ${npcs.join(", ")}\`\`\``
// 				embed.addFields({name:"❌ Too Many Characters",value:debug})
// 			}

// 			let flag = false
// 			profiles.forEach(profile => {
// 				embed.addFields({name: profile.name, value:getProfileDataOutput(profile)})
// 				flag = flag || profile.flag
// 			})
// 			const errors = charErrors.filter(error => error.user == user.user)
// 			errors.forEach(error => {
// 				embed.addFields({name:"❌ Error", value:getProfileDataOutput(error)})
// 			})
// 			//if (total > slots || pcs.length > 5)
// 			if (flag)
// 			{
// 				const message = await debugChan.send({embeds:[embed]})
// 				if (flag)
// 					await message.react("⚠️")
// 			}
// 			await Utils.slowdown(500)
// 		}
// 	});
// }

// ///
// function getProfileDataOutput(profile)
// {
// 	profile.tags = profile.tags || ""
// 	if (!profile.name && !profile.match)
// 		return `<@${profile.user}> ${profile.url} ${profile.tags}\n`

// 	profile = `<@${profile.user}> ${profile.url}\n- ${profile.type} Profile: ${profile.name}` + 
// 			  (profile.match ? `\n- ${profile.match}` : "")	
// 	return profile
// }

// ///
// /// 
// ///
// async function outputErrors(interaction, charErrors)
// {
// 	const debugChan = await interaction.guild.channels.fetch(config.debug.profile);	
// 	const profiles = charErrors.map(prof => getProfileDataOutput(prof))

// 	console.log(charErrors)
// 	if (charErrors.length == 0) return;

// 	const embed = new Embed()
// 	embed.setTitle("Errors")
// 	embed.setColor(0xff0000)
// 	embed.addField("** **")
// 	await Utils.asyncArrayForEach(profiles, async profile => { embed.extendField(profile) });

// 	try { embed.send(debugChan) }
// 	catch(e){ console.log(embed, e) }

// 	// let content = "";
// 	// await Utils.asyncArrayForEach(profiles, async profile => 
// 	// {
// 	// 	if (content.length + profile.length > 2000)
// 	// 	{
// 	// 		await debugChan.send(content)
// 	// 		content = "";
// 	// 	}			
// 	// 	content += profile;
// 	// })
// 	// if (content.length > 0)
// 	// 	await debugChan.send(content)
// 	// await debugChan.send("``` ```")
// }
// */

// /// Process all profiles in a batch and post the results into a debug channel
// /*
// async function processBatchProfiles(interaction) {
// 	//Collect all the profiles in this channel
// 	const allMessages = await MsgUtils.fetchAll(interaction.channel, { reverseArray: true, userOnly: true });
// 	const count = allMessages.size
// 	await interaction.editReply({ 	content: `Channel: ${count} messages.\n${allMessages.first().url}\n${allMessages.last().url}`,
// 									ephemeral: true });

// 	const charRecords = []
// 	const charErrors  = []
// 	const charsByUser = {}

// 	let idx = 0;
// 	let last = null
// 	const includeMatch = interaction.channel.id == config.profileChannel
// //	await allMessages.each( async (message) => 
// 	await Utils.asyncCollectionForEach(allMessages, async (message) => 
// 	{
// 		const followup = last?.author?.id == message.author.id
// 		const profile = await processProfile(message, includeMatch);	//followup);

// 		if (profile.name)
// 		{
// 			charRecords.push(profile);
// 			charsByUser[profile.user] = charsByUser[profile.user] || [];
// 			charsByUser[profile.user].push(profile);
// 		}
// 		else if (!followup)
// 		{	
// 			profile.tags = message.content.split('\n')[0].trim();
// 			charErrors.push(profile);
// 		}
// 		last = message
// 	});

// 	const userCount = Object.keys(charsByUser).length
// 	console.log(`Profiles: ${charRecords.length} chars across ${userCount} users`)
// 	outputCharDataByUser(interaction, charRecords, charsByUser);
// //	outputCharData(interaction, charRecords, charErrors);
// //	outputErrors(interaction, charErrors);
// }


// ///
// ///
// ///
// async function outputCharData(interaction, charRecords, charErrors)
// {
// 	await outputErrors(interaction,charErrors)

// 	const debugChan = await interaction.guild.channels.fetch(config.debug.profile);
// 	const profiles = charRecords.map(prof => getProfileDataOutput(prof))
// 	const embed = new Embed()
// 	embed.addField("** **")
// 	await Utils.asyncArrayForEach(profiles, async profile => { embed.extendField(profile) });

// 	try { embed.send(debugChan) }
// 	catch(e){ console.log(embed) }
// }

// */