const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const requiredRoles = [ config.role.Moderator, config.role.DM, config.role.Builder];

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = interaction.targetMessage;
	//const message = await channel?.messages.fetch(messageId);

	const cmd = `duel${config.DEV ? "dev" : ""}`;
	client.commands.get(cmd).execute(interaction, message)
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Duel')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION || config.DEV
};