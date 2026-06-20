const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const ChanUtils = require(`../../utilities/channelUtils.js`)
const DuelUtils = require(`../../utilities/funcsDuel.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const channel = interaction.channel;
	const guildId = interaction.guildId;
	const opponent = interaction.options?.getUser('opponent') || null
	const button = interaction.options?.getBoolean('button') || false
	const ephemeral = {flags: MessageFlags.Ephemeral}

	if (!ChanUtils.isDuelRPChannel(channel))
	{
		interaction.reply({content:"Cannot start a duel in this channel", ...ephemeral})
		return
	}

	const isBuilder= Utils.hasAnyRole(interaction.member, builderRoles);
	if (button)
	{
		interaction.reply({content:"Resetting duel button", ...ephemeral})
		await DuelUtils.resetDuelButton(channel)
		return
	}

	await interaction.reply("Starting duel...");
	if (interaction.message)
		await interaction.message.edit({content:"``` ```",components:[]})

	let thread = null;
	let threads = await channel.threads.fetchActive()
	let threadcount = threads?.threads?.size || 0
	thread = threads?.threads?.first()

	threads = await channel.threads.fetchArchived();
	threadcount += threads?.threads?.size || 0
	if (!thread) thread = threads?.threads?.first()

	if (!thread || config.DEV)
	{
		const suffix = `-` + Utils.toRomanNumeral(threadcount+1).toLowerCase()
		const name = channel.name.replace("🗣","⚙").replace("_rp","_mechanics") + (config.DEV ? suffix : '')
		thread = await channel.threads?.create({name:name});

		//Add the bots we'll need
		if (thread.joinable) await thread.join();
		await thread.members.add(client.config.bots.avrae);
	}

	if (thread)
	{
		if (thread.archived) await thread.setArchived(false)

		await thread.members.add(user.id);
		if (opponent) await thread.members.add(opponent.id);

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

const builderRoles = [	config.role.Builder	];
const data = new SlashCommandBuilder()
	.setName(`startduel${config.DEV ? "dev" : ""}`)
	.setDescription('Start a thread for a duel')
	.addUserOption(option => option.setName('opponent')
			.setDescription('The opponent to invite to the thread')
			.setRequired(false))
	.addBooleanOption(option => option.setName('button')
			.setDescription('Show the start duel button instead of starting the duel')
			.setRequired(false));
module.exports =
{
	data: data,
	execute: execute,
	message: run,
	build:config.PRODUCTION || config.DEV
};

if (config.DEV) module.exports.aliases = ["startduel"]