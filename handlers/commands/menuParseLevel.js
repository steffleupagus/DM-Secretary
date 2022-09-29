const { ContextMenuCommandBuilder } = require('discord.js')
const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const LevelData = require(`../../utilities/levelUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)

const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)

function shouldHandle(client, message)
{
	return LevelData.isLevelMessage(client, message)
}

async function handle(client, message, interaction=null, sendResult=true)
{
	await LevelData.logLevelMessage(client, message, interaction, sendResult)
	await CharUtils.RefreshCache()
}

async function execute(interaction)
{
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);
	
	if (!message.author.bot)
		interaction.guild.members.fetch(message.author)
	
	if (message && shouldHandle(client, message))
	{
		await interaction.reply({ 	content: 'Parsing for level/exp message', 
									ephemeral: true });		
		handle(client, message, interaction);
	}else{	
		await interaction.reply({ 	content: 'This is not a level or exp message.', 
									ephemeral: true });
	}
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Parse Level')
		.setType(ApplicationCommandType.Message),
	execute: execute,
	build:config.PRODUCTION// || config.DEV
};