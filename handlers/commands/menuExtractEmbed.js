const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)

const requiredRoles = [ config.ModeratorRole, config._ModeratorRole,
					    config.BuilderRole, config._BuilderRole];

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	if (!message)
		return interaction.reply({ 	content: 'No message found', ephemeral: true });

	let responses = [];

	if (message.content)
		message.content = message.content.replace('\`','\\`')

	message.embeds.forEach(embed => {
		responses.push( "```\n" + JSON.stringify(embed.toJSON()) + "```")
	})

	await interaction.reply({ 	content: "```\n" + message.content + "\n```", 							 	
								ephemeral: true });

	Utils.asyncArrayForEach(responses, async (response) => 
	{
		await interaction.followUp({ content: response, ephemeral: true });
		await user.send({ content: response })
	});

}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Extract Embed')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.DEV
};