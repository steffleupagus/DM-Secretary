const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const LevelData = require(`../../utilities/levelUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)

async function execute(interaction)
{
	const channelId = config.DEV ? config.debug.misc : config.chan.levelOut;
	const channel = interaction.guild.channels.resolve(channelId)
	await LevelData.updateLevelMessage(channel);
	interaction.reply({content:"Update Level Message", ephemeral:true})
}

const data = new SlashCommandBuilder()
	.setName(`levels${config.DEV ? "dev" : ""}`)
	.setDescription('Force update of the levels data')
const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [ config.role.Builder ],
	userPermissions: userPermissions,
	execute: execute,
	build:config.PRODUCTION || config.DEV
};