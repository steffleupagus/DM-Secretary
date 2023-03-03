const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)


const requiredRoles = [ config.ModeratorRole, config._ModeratorRole,
					    config.BuilderRole, config._BuilderRole];

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);
	let responses = [];

	if (!message)
		return interaction.reply({ 	content: 'No message found', ephemeral: true });

	await interaction.reply({ 	content: "```\n" + message.content + "\n```",
								ephemeral: true });

	let stats = await MsgUtils.scrapeMessageMetadata(null, message)
	responses.push( "```\n" + MsgUtils.cleanMessageContent(message) + "\n```" )
//	responses.push( "```\n" + JSON.stringify(stats, null, 2) + "\n```");

	
	Utils.asyncArrayForEach(responses, async (response) => 
	{
		await interaction.followUp({ content: response, ephemeral: true });
//		await user.send({ content: response })
	});

}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Message Metadata')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.DEV
};