const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const DuelUtils = require(`../../utilities/funcsDuel.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const Log = require(`../../utilities/loggerUtils.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const util = require('util')


async function execute(interaction, message=null) {
	const ephemeral = (message) ? {flags:MessageFlags.Ephemeral} : {}
	const reply = await interaction.deferReply({fetchReply:true, ...ephemeral})
	try {
		const response = await DuelUtils.processDuel(interaction, message);
		if (response !== true)
			await interaction.editReply(response);
		else if (interaction.ephemeral)
			await interaction.editReply("Done")
	}
	catch (error) {
		error = error.error || error
		const embed = new EmbedBuilder().setTitle(`${config.emoji.duel} ${error.name}`)
										.setThumbnail("https://i.imgur.com/2U90DwW.png")
		if (error.message) embed.setDescription(error.message)
		if (error.cause) embed.addFields(error.cause)
		await interaction.editReply({content:"", embeds:[embed], components:[]});
	}
}

async function button(interaction)
{
	const subCommand = interaction.customId;
	if (!subCommand.startsWith(`duel`)) return;
	const ephemeral = {flags:MessageFlags.Ephemeral}

	const editPerms = interaction?.member && Utils.hasAnyRole(interaction.member, [config.role.DM]);
	const editError = `Only <@&${config.role.DM}> has permissions to edit duel data.`
	const builderPerms = interaction?.member && Utils.hasAnyRole(interaction.member, [config.role.Builder]);
	const builderError = `Only <@&${config.role.Builder}> has permissions to edit duel data.`

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

module.exports =
{
	data: data,
	execute: execute,
	button: button,

	build:config.PRODUCTION || config.DEV
};
if (config.DEV) module.exports.aliases = ["duel"]