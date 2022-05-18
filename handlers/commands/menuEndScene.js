const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const requiredRoles = [ config.ModeratorRole, config.DMRole ];

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	client.commands.get('scene').execute(interaction, message)
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Scene')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.DEV
};