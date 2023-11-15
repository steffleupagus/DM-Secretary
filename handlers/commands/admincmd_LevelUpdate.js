const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const LevelData = require(`../../utilities/levelUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)

async function execute(interaction)
{
	interaction.reply({content:"Update Level Message", ephemeral:true})

	const channel = interaction.guild.channels.resolve(config.levelOutputChan)
	await LevelData.updateLevelMessage(channel);
}

const data = new SlashCommandBuilder()
			.setName('levels')
			.setDescription('Force update of the levels data')
const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [ config.BuilderRole ],
	userPermissions: userPermissions,
	execute: execute,
	build:config.PRODUCTION //|| config.DEV
};