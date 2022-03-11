const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)

const requiredRoles = [ config.ModeratorRole, config.DMRole ];

// const { MessageEmbed, Permissions } = require('discord.js')
// const Embed = require(`${process.cwd()}/utilities/EmbedPaginator.js`)

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	client.commands.get('scene').execute(interaction, message)

	//await interaction.deferReply({ephemeral:true})

	// const roleplay = message 
	// 	? await MsgUtils.findFenceposts(channel, message)
	// 	: await MsgUtils.findLastBreak(channel);	
	// const rpData = await MsgUtils.scrapeMessages(roleplay.messages);
	// console.log(rpData);

	// await interaction.editReply(JSON.stringify(rpData));

	// const ephemeral = false
	
	// await interaction.deferReply({ephemeral:ephemeral});
	// const transcript = await DuelUtils.generateTranscript(channel, message);
	// await interaction.editReply({embeds:[transcript[0]]});
	// for (let i=1; i < transcript.length; ++i)
	// {
	// 	await interaction.followUp({embeds:[transcript[i]], ephemeral:ephemeral})
	// }
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Scene')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute
};