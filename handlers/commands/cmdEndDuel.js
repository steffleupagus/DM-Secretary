const { SlashCommandBuilder } = require('@discordjs/builders');
const DuelUtils = require(`${process.cwd()}/utilities/funcsDuel.js`)
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

// const { MessageEmbed, Permissions } = require('discord.js')
// const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
// const index = require(`${process.cwd()}/content/_contentIndex.json`)
// const wait = require('util').promisify(setTimeout);

async function execute(interaction, message=null)
{
	const channel = interaction.channel;
	const user  = interaction.user;
	const reply = await interaction.deferReply({fetchReply:true})//,ephemeral:true})
	const response = await DuelUtils.processDuel(channel, user, message);
	//const type = message ? "Menu Command" : "Slash Command";
	//await interaction.followUp({content:type,ephemeral:true});
	if (response !== true)
		await interaction.editReply(response);
	else if (interaction.ephemeral)
		await interaction.editReply("Done")
	else
		await interaction.deleteReply();
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
	const subCommand = interaction.customId;

	if ("duel.transcript" == subCommand)
	{
		await interaction.deferReply({ephemeral:true});
		const transcript = await DuelUtils.generateTranscriptFromLog(interaction.message);
		await interaction.editReply({embeds:[...transcript]});
		return;
	}

	if ("duel.undo" == subCommand)
	{
		await interaction.deferReply();
		await DuelUtils.undoApproval(interaction.message, interaction.client)
		await interaction.deleteReply();
		return;
	}
	
	await interaction.deferReply();
	const confirmResult = await DuelUtils.approveDuel(interaction.message, 
													  interaction.user,
													  subCommand)
	await interaction.deleteReply();
}

async function select(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, ephemeral: true})
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
	message: run,
	button: button,
	select: select,

	build:config.PRODUCTION 
};