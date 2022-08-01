const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js')

async function execute(interaction)
{
	if (interaction.options.getSubcommand() === 'user') 
	{
		const user = interaction.options.getUser('target');
		if (user) 
		{
			await interaction.reply(`Username: ${user.username}\nID: ${user.id}`);
		} 
		else 
		{
			await interaction.reply(`Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`);
		}
	}
	else if (interaction.options.getSubcommand() === 'server') 
	{
		const embed = new EmbedBuilder()
						.setTitle(interaction.guild.name)
						.addField("Total Members", `${interaction.guild.memberCount}`);
		await interaction.reply({embeds:[embed]});

//		await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
	}
}

async function run(message, command, args)
{
	console.log(message);
	await message.reply('Boop!');
}

const data = new SlashCommandBuilder()
	.setName('info')
	.setDescription('Get info about a user or a server!')
	.addSubcommand(subcommand =>
		subcommand
			.setName('user')
			.setDescription('Info about a user')
			.addUserOption(option => option.setName('target').setDescription('The user')))
	.addSubcommand(subcommand =>
		subcommand
			.setName('server')
			.setDescription('Info about the server'));

//https://discordjs.guide/interactions/registering-slash-commands.html#subcommands

module.exports = 
{
	data: data,
	execute: execute,
	message: run
};