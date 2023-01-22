const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)

const requiredRoles = [ config.ModeratorRole, config.DMRole,
					  	config._ModeratorRole, config._BuilderRole];

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

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