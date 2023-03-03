const { SlashCommandBuilder } = require('discord.js');
const SceneUtils = require(`../../utilities/funcsScene.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction, message=null)
{
	const reply = await interaction.deferReply({fetchReply:true, ephemeral: config.DEV})
	try
	{	
		const response = await SceneUtils.processScene(interaction, message);	
		if (response !== true)
			await interaction.editReply(response);
		else if (interaction.ephemeral)
			await interaction.editReply("Done")
		else
			await interaction.deleteReply();
	}
	catch (error)
	{
		throw error.message
	}
}

async function run(client, message, command, args)
{
	try
	{		
		SceneUtils.sceneDebug(message);
	}
	catch (error)
	{
		console.error(error)
	}
	return

	
	const channel = message.channel;
	const user = message.author;

	const reply = await channel.send(`●●● ${client.user.username} is thinking...`)
	try
	{
		const response = await SceneUtils.processScene(channel, user, null);
		if (response === true)
			reply.delete();
		else
			await reply.edit(response);		
	}
	catch (error)
	{
		console.error(error);
		await reply.edit(`There was an error executing this command:\n${error.message}`);		
	}

	message.delete()
}

async function button(interaction)
{
	const subCommand = interaction.customId;
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
	aliases:["scene"],
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select,
	build:config.DEV //||config.PRODUCTION
};

const requiredRoles = [ config.BuilderRole, config._BuilderRole	]
if (config.DEV)
	module.exports.whitelistRoles = requiredRoles