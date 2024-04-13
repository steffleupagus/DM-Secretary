const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)

const requiredRoles = [ config.role.Moderator,
					    config.role.Builder];

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);
	let responses = [];

	if (!message) return interaction.reply({ 	content: 'No message found', ephemeral: true });

	if (message.content) message.content = message.content.replace('\`','\\`')
	await interaction.reply({ 	content: "```\n" + message.content.substr(0,1989) + "...\n```",
								ephemeral: true });
	await interaction.followUp({ content: `Before: ${message.content.length} chars`, ephemeral: true });
	let stats = await MsgUtils.scrapeMessageMetadata(null, message)
	let content = MsgUtils.cleanMessageContent(message);
	await interaction.followUp({ content: "```\n" + content + "\n```", ephemeral: true });
	await interaction.followUp({ content: `After: ${content.length} chars`, ephemeral: true });

	responses = []
	message.embeds.forEach(embed => {
		responses.push( "```\n" + JSON.stringify(embed.toJSON(),null,"\t") + "```")
	})	
	Utils.asyncArrayForEach(responses, async (response) => 
	{
		await interaction.followUp({ content: response, ephemeral: true });
		await user.send({ content: response })
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