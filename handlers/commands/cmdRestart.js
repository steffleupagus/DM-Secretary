const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActivityType, PermissionsBitField } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(interaction)
{
	//await interaction.client.user.setActivity("Restart...", { type: ActivityType.Streaming });
	await interaction.reply({content:"Restarting...", ephemeral:true});
	process.kill(1)
}

const data = new SlashCommandBuilder()
			.setName('restart')
			.setDescription('Force restart the bot if possible')
const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [ config.BuilderRole, config._BuilderRole ],
	userPermissions: userPermissions,
	execute: execute,
	build:config.PRODUCTION || config.DEV
};