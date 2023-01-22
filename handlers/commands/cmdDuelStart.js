const { SlashCommandBuilder } = require('discord.js');
const ChanUtils = require(`${process.cwd()}/utilities/channelUtils.js`)
const DuelUtils = require(`${process.cwd()}/utilities/funcsDuel.js`)
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const channel = interaction.channel;
	const guildId = interaction.guildId;
	const opponent = interaction.options?.getUser('opponent') || null

	if (!DuelUtils.isDuelRPChannel(channel))
	{
		interaction.reply({ephemeral:true, 
						   content:"Cannot start a duel in this channel"})
		return
	}

	await interaction.reply("Starting duel...");
	if (interaction.message)
		await interaction.message.edit({content:"``` ```",components:[]})
	
	let thread = null;
	let threads = await channel.threads.fetchActive()
	thread = threads?.threads?.first()
	if (!thread)
	{
		threads = await channel.threads.fetchArchived();
		thread = threads?.threads?.first()
	}

	if (!thread)
	{
		const name = channel.name.replace("🗣","⚙").replace("_rp","_mechanics")	
		thread = await channel.threads?.create({name:name});

		//Add the bots we'll need
		if (thread.joinable) await thread.join();
		await thread.members.add(client.config.avraeId);		
	}
	
	if (thread)
	{
		if (thread.archived)
			await thread.setArchived(false)

		await thread.members.add(user.id);
		if (opponent)
			await thread.members.add(opponent.id);
	
		//Inform the user about the channel split
		thread.send(`@ping your opponent here. Roleplay in <#${channel.id}>`)
		await interaction.editReply(`Duel Started (Mechanics in <#${thread.id}>)`);	
	}	
	else
	{
		interaction.editReply(`Something went wrong creating the thread`);	
	}
}

async function run(client, message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName('startduel')
	.setDescription('Start a thread for a duel')
	.addUserOption(option => option.setName('opponent')
			.setDescription('The opponent to invite to the thread')
			.setRequired(false));
module.exports = 
{
	data: data,
	execute: execute,
	message: run,
	
	build:config.PRODUCTION// || config.DEV
};