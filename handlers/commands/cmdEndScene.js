const { SlashCommandBuilder } = require('discord.js');
const SceneUtils = require(`../../utilities/funcsScene.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction, message=null)
{
	const channel = interaction.channel;
	const reply = await interaction.deferReply({fetchReply:true})//,ephemeral:true})
	
	const response = await SceneUtils.processScene(channel, user, message);
	if (response !== true)
		await interaction.editReply(response);
	else if (interaction.ephemeral)
		await interaction.editReply("Done")
	else
		await interaction.deleteReply();
}

async function run(client, message, command, args)
{
	return
	const channel = message.channel;
	const user = message.author;

	const reply = await channel.send(`●●● ${client.user.username} is thinking...`)
	const response = await SceneUtils.processScene(channel, user, null);
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
	return;
}

async function select(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, ephemeral: true})
}

const data = new SlashCommandBuilder()
	.setName('scene')
	.setDescription('Conclude a scene')
	.setDefaultPermission(false)

module.exports = 
{
	data: data,
	execute: execute,
	message: run,
	button: button,
	select: select,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole	
	],
	build:config.DEV //||config.PRODUCTION
};