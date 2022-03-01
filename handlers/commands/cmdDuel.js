const { SlashCommandBuilder } = require('@discordjs/builders');
const StringSimilarity = require("string-similarity");

// const { MessageEmbed, Permissions } = require('discord.js')
// const Embed = require(`${process.cwd()}/utilities/EmbedPaginator.js`)
// const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
// const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
// const index = require(`${process.cwd()}/content/_contentIndex.json`)
// const wait = require('util').promisify(setTimeout);

async function execute(interaction)
{
	interaction.reply("Slash Command")
}

async function run(message, command, args)
{
	message.reply("Legacy Command")
}

const data = new SlashCommandBuilder()
	.setName('duel')
	.setDescription('Conclude a duel')
	.addBooleanOption(option => option.setName('force').setRequired(false)
		.setDescription('[DM Only] Force the duel to conclude ignoring RP limit'))

module.exports = 
{
	data: data,
	execute: execute,
	message: run
};