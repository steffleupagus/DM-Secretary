const ApplicationCommandType = require(`${process.cwd()}/utilities/enums.js`);
const { ContextMenuCommandBuilder } = require('@discordjs/builders');

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const verify = require(`${process.cwd()}/utilities/verifyFuncs.js`)
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

	if (message && verify.shouldHandle(client, message))
	{
		await interaction.reply({ 	content: 'Parsing for roll message', 
									ephemeral: true });
		verify.handle(client, message)	//, interaction)
	}else{
		await interaction.reply({ 	content: 'This is not a roll message.', 
									ephemeral: true });
	}
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Verify Roll')
		.setType(ApplicationCommandType.Message),
	whitelistRoles: [
		config.ModeratorRole,
		config.DMRole,
	],
	execute: execute
};