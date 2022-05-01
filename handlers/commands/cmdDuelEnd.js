const { SlashCommandBuilder } = require('@discordjs/builders');
const DuelUtils = require(`${process.cwd()}/utilities/funcsDuel.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction, message=null)
{
	const channel = interaction.channel;
	const user  = interaction.user;
	const reply = await interaction.deferReply({fetchReply:true})//,ephemeral:true})
	const response = await DuelUtils.processDuel(channel, user, message);
	if (response !== true)
		await interaction.editReply(response);
	else if (interaction.ephemeral)
		await interaction.editReply("Done")
	else
		await interaction.deleteReply();
}

async function run(client, message, command, args)
{
	const channel = message.channel;
	const user = message.author;

	const reply = await channel.send(`●●● ${client.user.username} is thinking...`)
	const response = await DuelUtils.processDuel(channel, user, null);
	if (response !== true)
	{
		if (!response.content)
			response.content = null
		await reply.edit(response);
	}
	else
	{
		reply.delete()
	}
	message.delete()
}

async function button(interaction)
{
	const subCommand = interaction.customId;

	if ("duel.startDuel" == subCommand)
	{
		const client = interaction.client;
		client.commands.get('startduel').execute(interaction)
		return;
	}
	else if ("duel.transcript" == subCommand)
	{
		await interaction.deferReply({ephemeral:true});
		const transcript = await DuelUtils.generateTranscriptFromLog(interaction.message);
		await interaction.editReply({embeds:[...transcript]});
		return;
	}
	else if ("duel.undo" == subCommand)
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

module.exports = 
{
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select,

	build:config.PRODUCTION// || config.DEV
};