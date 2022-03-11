const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const DuelUtils = require(`${process.cwd()}/utilities/funcsDuel.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)

const requiredRoles = [ config.ModeratorRole, config.DMRole, 
					    config._ModeratorRole, config._DMRole ];

// const { MessageEmbed, Permissions } = require('discord.js')
// const Embed = require(`${process.cwd()}/utilities/EmbedPaginator.js`)
// const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
// const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
// const index = require(`${process.cwd()}/content/_contentIndex.json`)
// const wait = require('util').promisify(setTimeout);

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

//	client.commands.get('duel').execute(interaction, message)
	const ephemeral = false
	
	await interaction.deferReply({ephemeral:ephemeral});
	const transcript = await DuelUtils.generateTranscript(channel, message);
	await interaction.editReply({embeds:[transcript[0]]});
	for (let i=1; i < transcript.length; ++i)
	{
		await interaction.followUp({embeds:[transcript[i]], ephemeral:ephemeral})
	}
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Duel Transcript')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute
};