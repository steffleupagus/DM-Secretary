const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')

const mod = process.env.mod || ""
const config = require(`${process.cwd()}/config/${mod}_config.json`)
const respec = require(`${process.cwd()}/utilities/funcsRespec.js`)

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	if (message && respec.shouldHandle(client, message))
	{
		await interaction.reply({ 	content: 'Parsing for Respec message', 
									ephemeral: true });
		respec.handleCreate(client, message)
	}else{
		await interaction.reply({ 	content: 'This is not a respec message.', 
									ephemeral: true });
	}
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Respec')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: [
		config.ModeratorRole,
	],
	execute: execute,

	build:config.PRODUCTION 
};