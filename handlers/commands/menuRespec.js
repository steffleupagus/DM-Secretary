const ApplicationCommandType = require(`${process.cwd()}/utilities/enums.js`);
const { ContextMenuCommandBuilder } = require('@discordjs/builders');

const respec = require(`${process.cwd()}/utilities/respecFuncs.js`)

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const channelId = interaction.channelId;
	const messageId = interaction.targetId;
	const guilds = client.guilds.cache;
	const guild = guilds.get(guildId);
	const channel = await guild?.channels.fetch(channelId);
	const message = await channel?.messages.fetch(messageId);

	if (interaction.user.id != client.config.OWNERID)
	{
		interaction.reply(`This menu can only be used by <@${client.config.OWNERID}>`);
		return;
	}

	if (message && respec.shouldHandle(client, message))
	{
		await interaction.reply({ 	content: 'Parsing for Respec message', 
									ephemeral: true });
		respec.handle(client, message)
	}else{
		await interaction.reply({ 	content: 'This is not a respec message.', 
									ephemeral: true });
	}
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Respec')
		.setType(ApplicationCommandType.Message),
	execute: execute
};