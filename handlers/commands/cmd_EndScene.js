const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const SceneUtils = require(`../../utilities/funcsScene.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Activity  = require(`../../utilities/activityUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const Log = require(`../../utilities/loggerUtils.js`)
const util = require('util')

async function execute(interaction, message=null)
{
	const ephemeral = (config.DEV || message) ? {flags:MessageFlags.Ephemeral} : {}
	await interaction.deferReply({...ephemeral})
	try	{
		const response = await SceneUtils.processScene(interaction, message);
		if (response !== true)
			await interaction.editReply(response);
		else if (interaction.ephemeral)
			await interaction.editReply({content:"Done",components:[]})
		Activity.updateActivity(reply);
	}
	catch (error) {
		error = error.error || error
		console.log(error, error.stack, Error().stack)

		const embed = new EmbedBuilder().setTitle(`${config.emoji.duel} ${error.name}`)
										.setThumbnail("https://i.imgur.com/2U90DwW.png")
		if (error.message) embed.setDescription(error.message)
		if (error.cause) embed.addFields(error.cause)

		await interaction.editReply({content:"", embeds:[embed], components:[]});
		throw error
	}
}



async function autoClose(message) {
	await SceneUtils.autoCloseScene(message)
}

async function run(client, message, command, args) {
	const reply = await message.reply("*This command has been disabled. Please use `/scene` going forward.*")
	message.delete()
	return
}

async function button(interaction) {
	const subCommand = interaction.customId;
	console.log(subCommand)

	switch(subCommand) {
		case "scene.approve":
			await SceneUtils.handleApprove(interaction);
			return;
		case "scene.decline":
			await SceneUtils.handleReject(interaction);
			return;
		case "scene.npc":
			await SceneUtils.handleNPC(interaction);
			return;
		case "scene.edit":
			await SceneUtils.handleEdit(interaction);
			return;
		case "scene.undo":
			await SceneUtils.handleUndo(interaction);
			return;
	}
	return;
}

async function select(interaction) {
	const subCommand = interaction.customId;
	const values = interaction.values.join(", ")
	return;
}

const data = new SlashCommandBuilder()
	.setName(`scene${config.DEV ? "dev" : ""}`)
	.setDescription('Conclude a scene')
if (config.DEV)
{
	data.setDefaultPermission(false)
	data.addBooleanOption(option => option
		.setName('testmode')
		.setDescription('Test the new functionality')
		.setRequired(false)
	)
}


module.exports = {
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select,
	autoClose: autoClose,
	build:config.PRODUCTION||config.DEV
};

const requiredRoles = [ config.role.Builder, config.role.Staff, config.role.Helper, config.role.OffDutyHelper ]
if (config.DEV) {
	module.exports.aliases = ["scene"]
	module.exports.whitelistRoles = requiredRoles
}