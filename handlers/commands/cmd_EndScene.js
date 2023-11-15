const { SlashCommandBuilder } = require('discord.js');
const SceneUtils = require(`../../utilities/funcsScene.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(interaction, message=null)
{
	const reply = await interaction.deferReply({fetchReply:true, ephemeral: config.DEV || message != null})
	try
	{	
		const response = await SceneUtils.processScene(interaction, message);	
		if (response !== true)
			await interaction.editReply({content:`${response}`, embeds:[], components:[]});
		else
			await interaction.editReply({content:"",components:[]});
	}
	catch (error)
	{		
		console.log(error, error.stack, Error().stack)
		await interaction.editReply({content:`${error.message}`, embeds:[], components:[]});
		throw error.message
	}
}

async function autoClose(message)
{
	await SceneUtils.autoCloseScene(message)
}

async function run(client, message, command, args)
{
	const reply = await message.reply("*This command has been disabled. Please use `/scene` going forward.*")
	message.delete()
	return
}

async function button(interaction)
{
	const subCommand = interaction.customId;
	console.log(subCommand)	

	switch(subCommand)
	{
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

async function select(interaction)
{
	const subCommand = interaction.customId;
	const values = interaction.values.join(", ")
	return;
}

const data = new SlashCommandBuilder()
	.setName(`scene${config.DEV ? "dev" : ""}`)
	.setDescription('Conclude a scene')
if (config.DEV)
	data.setDefaultPermission(false)

module.exports = 
{
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select,
	autoClose: autoClose,
	build:config.PRODUCTION||config.DEV
};

const requiredRoles = [ //config.BuilderRole, 
					    config.DMRole	]
if (config.DEV)
{
	module.exports.aliases = ["scene"]
	module.exports.whitelistRoles = requiredRoles
}