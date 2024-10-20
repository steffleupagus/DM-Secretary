const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder, EmbedBuilder } = require('discord.js')
const mod				= process.env.mod || "";
const config		= require(`../../config/${mod}_config.json`)
const Utils			= require(`../../utilities/utilFuncs.js`)
const Embed			= require(`../../utilities/EmbedPaginator.js`)
const Profile		= require(`../../utilities/profileUtils.js`)
const MsgUtils	= require(`../../utilities/messageUtils.js`)
const CharUtils	= require(`../../utilities/charUtils.js`)
const CharMeta	= require(`../../database/charMetaSchema.js`)
const StrComp		= require("string-similarity");
const util			= require("util")
const URLRegex	= /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi

const requiredRoles = [ config.role.Builder	];
const batch = true;

async function execute(interaction) {	
	const message = interaction.targetMessage;
	if (!message) return interaction.reply({ content: 'No message found', ephemeral: true });
	await interaction.deferReply({ephemeral: true})

	/// Process a single profile post and provide the json response

	//TODO - Get previous message to see if this is a follow-up
	let profile = Profile.parseProfile(message);
	if (!profile)
		return

	profile = await findMatchingSheet(profile);
	//TODO - Find an existing sheet or profile record
	//const sheet = await findMatchingSheet(profile)
	const result  = "```json\n" + JSON.stringify(profile,null,2) + "\n```"
	await interaction.editReply({ content: `${profile.url}${result}`, ephemeral: true });	
}

async function findMatchingSheet(profile)
{
	//Try to match the profile name with a character record in the database
	if (profile?.name && profile?.user)
	{
		const match = await CharUtils.findClosestMatch(profile.name, profile.user, true, [], 0.5);
		if (match?.match)
		{
			//console.log(match)
			profile.sheetName = match.match.name
			profile.level = match.match.level
			const rating = Math.floor(match.match.rating * 1000) / 10;
			profile.match = `Match  : ${profile.sheetName} (${profile.level}) \`✅\` (${rating}%)`
		}
		else
		{
			let closest = match?.matches?.[0] || null
			if (closest)
			{
				const rating = Math.floor(closest.rating * 1000) / 10;
				profile.match = `Closest: ${closest.name} (${closest.level}) \`⚠️\` (${rating}%)`
				profile.flag  = true;
			}
			else
				profile.match = `No sheet record match (NPC) \`❌\``
		}
	}
	return profile;
}


module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Parse Profile')
		.setType(ApplicationCommandType.Message),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.DEV
};
