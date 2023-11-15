const { ContextMenuCommandBuilder } = require('discord.js')
const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	const command = `scene${config.DEV ? "dev" : ""}`
	await client.commands.get(command).execute(interaction, message)
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Scene')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	execute: execute,
	build:config.DEV||config.PRODUCTION
};

const requiredRoles = [ config.BuilderRole, 
					    config.DMRole	]

//if (config.DEV)
	module.exports.whitelistRoles = requiredRoles
