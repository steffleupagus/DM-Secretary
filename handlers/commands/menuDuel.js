const ApplicationCommandType = require(`${process.cwd()}/utilities/enums.js`);
const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const respec = require(`${process.cwd()}/utilities/funcsRespec.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

// const { MessageEmbed, Permissions } = require('discord.js')
// const Embed = require(`${process.cwd()}/utilities/EmbedPaginator.js`)
// const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
// const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
// const index = require(`${process.cwd()}/content/_contentIndex.json`)
// const wait = require('util').promisify(setTimeout);

async function execute(interaction)
{
	interaction.reply("Menu Command")
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Duel')
		.setType(ApplicationCommandType.Message),
	execute: execute
};