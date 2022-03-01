const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

const mod = process.env.mod || ""
const config = require(`${process.cwd()}/config/${mod}_config.json`)
const verify = require(`${process.cwd()}/utilities/funcsVerify.js`)
async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);

	const roles = [ config.ModeratorRole, config.DMRole ];
	const hasRole = Utils.hasAnyRole(interaction.member, roles);

	if (message && verify.shouldHandle(client, message))
	{
		await interaction.reply({ 	content: 'Parsing for roll message', 
									ephemeral: true });
		verify.handle(client, message, hasRole ? null : interaction);
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
	execute: execute
};