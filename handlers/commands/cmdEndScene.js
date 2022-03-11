const { SlashCommandBuilder } = require('@discordjs/builders');
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)

// const { MessageEmbed, Permissions } = require('discord.js')

// const index = require(`${process.cwd()}/content/_contentIndex.json`)
// const wait = require('util').promisify(setTimeout);

async function execute(interaction, message=null)
{
	const client = interaction.client;
	const channel = interaction.channel;
	const user  = interaction.user;

	await interaction.deferReply({ephemeral:true})

	const roleplay = message 
		? await MsgUtils.findFenceposts(channel, message)
		: await MsgUtils.findLastBreak(channel);
	console.log(roleplay);
	const rpData = await MsgUtils.scrapeMessages(roleplay.messages);
	console.log(rpData);

	await interaction.editReply(JSON.stringify(rpData));
	const type = message ? "Menu Command" : "Slash Command";
	await interaction.followUp({content:type,ephemeral:true});	
}

async function run(message, command, args)
{
	return;
	const channel = message.channel;
	const user = message.author;
	const response = await DuelUtils.processDuel(channel, user, null);
	await message.channel.send(response);
}

async function button(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}`, ephemeral: true})
}

async function select(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, ephemeral: true})
}

const data = new SlashCommandBuilder()
	.setName('scene')
	.setDescription('Conclude a scene')

module.exports = 
{
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select
};