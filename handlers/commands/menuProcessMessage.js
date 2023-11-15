const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)

const requiredRoles = [ config.ModeratorRole ];

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	if (!message)
		return interaction.reply({ 	content: 'No message found', ephemeral: true });

	const author = await interaction.guild.members.fetch(message.author)
	
	let reply = `Processing [message](${message.url})\n`
	await interaction.reply({ 	content: reply, 
								ephemeral: true });

	Utils.asyncArrayForEach(client.messageHandlers, async (handler) => 
	{
		if (!handler.menu) 
			return;

		const roles = handler.menuRoles;
		if (roles && !Utils.hasAnyRole(interaction.member, roles))
			return;

		const shouldHandle = await handler.shouldHandle(client, message);
		if (shouldHandle)
		{
			reply += `Matched Handler: ${handler.name}\n`
			await interaction.editReply({ content: reply });
			await handler.handleCreate(client, message)			
		}		
	});
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Process message')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION// || config.DEV
};