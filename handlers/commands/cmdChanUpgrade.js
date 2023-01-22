const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction)
{
	const client = interaction.client
	client.commands.get('chanmeta').execute(interaction, true)	
}

async function run(client, message, command, args)
{
	client.commands.get('chanmeta').run(client, message, command, args)
}

const data = new SlashCommandBuilder()
	.setName('upgrade')
	.setDescription('Upgrade the given channel to make it eligible for RP exp via the /scene cmd')
	.setDefaultPermission(false)
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))
	.addBooleanOption(option => option.setName('xp').setRequired(false)
									  .setDescription('Specify if channel is exp eligible'))
	.addBooleanOption(option => option.setName('notify').setRequired(false)
									  .setDescription('Should send channel update notification'))

const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole
	],
	userPermissions: userPermissions,
	botPermissions: userPermissions,
	execute: execute,
	message: run,

	build:config.PRODUCTION //||config.DEV
};