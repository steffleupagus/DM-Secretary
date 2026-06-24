const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const DuelUtils	= require(`../../utilities/funcsDuel.js`)
const Utils		= require(`../../utilities/utilFuncs.js`)
const Log		= require(`../../utilities/loggerUtils.js`)
const mod		= process.env.mod || "";
const config	= require(`../../config/${mod}_config.json`);
const util		= require('util')

async function execute(interaction, message=null) {
	const ephemeral	= (message || config.DEV) ? {flags:MessageFlags.Ephemeral} : {}
	await interaction.deferReply({...ephemeral})

	try {
		const response = await DuelUtils.processDuel(interaction, message);
		if (response !== true)
			await interaction.editReply(response);
		else if (interaction.ephemeral)
			await interaction.editReply({content:"Done",components:[]})
	} catch (error) {
		const embed = embedError(error);
		await interaction.editReply({content:"", embeds:[embed], components:[]});
		Log.TODO("Log error to channel?");
		throw error;
	}
}

function embedError(error)
{
	error = error.error || error
	const embed = new EmbedBuilder().setTitle(`${config.emoji.duel} ${error.name}`)
									.setThumbnail("https://i.imgur.com/2U90DwW.png")
	if (error.message) embed.setDescription(error.message)
	if (error.cause) embed.addFields(error.cause)
	return embed
}

async function handleButton(interaction) {
	//	await interaction.deferReply();
	//	await interaction.deleteReply();

	const subCommand = interaction.customId;
	// Routed to wrong command, early out
	if (!subCommand.startsWith(`duel`)) return;
	const ephemeral = {flags:MessageFlags.Ephemeral}
	const editPerms = interaction?.member && Utils.hasAnyRole(interaction.member, [config.role.DM]);
	const editError = `Only <@&${config.role.DM}> has permissions to edit duel data.`

	switch (subCommand)
	{
		case "duel.startDuel":
			interaction.client.commands.get('startduel').execute(interaction);
			break;
		case "duel.approve": await DuelUtils.approveDuel(interaction); break;
		case "duel.decline": await DuelUtils.rejectDuel(interaction); break;
		case "duel.undo": await DuelUtils.undoResult(interaction); break;
		case "duel.note": await DuelUtils.noteDuel(interaction); break;
		case "duel.calc_false":
		case "duel.calc_true":
			await DuelUtils.toggleCalculations(interaction, subCommand == "duel.calc_true");
			break;
		case "duel.edit":
			if (!editPerms) { await interaction.reply({content:editError,...ephemeral}); return }
			await DuelUtils.editDuel(interaction);
			break;
	}
}

const data = new SlashCommandBuilder()
	.setName(`duel${config.DEV ? "dev" : ""}`)
	.setDescription('Conclude a duel')

module.exports = {
	data: data,
	execute: execute,
	button: handleButton,

	build:config.PRODUCTION || config.DEV
};

const requiredRoles = [ config.role.Builder, config.role.Staff, config.role.Helper, config.role.OffDutyHelper ]
if (config.DEV) {
	module.exports.aliases = ["duel"]
	module.exports.whitelistRoles = requiredRoles
}