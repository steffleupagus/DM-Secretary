const ApplicationCommandType = require(`${process.cwd()}/utilities/enums.js`);
const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js')

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const channelId = interaction.channelId;
	const messageId = interaction.targetId;
	const guilds = client.guilds.cache;
	const guild = guilds.get(guildId);
	const channel = await guild?.channels.fetch(channelId);
	const message = await channel?.messages.fetch(messageId);

	if (interaction.user.id != client.config.OWNERID)
	{
		interaction.reply(`This menu can only be used by <@${client.config.OWNERID}>`);
		return;
	}

	const filter = m => {
		console.log(m.author.id, user.id)
		return m.author.id == user.id
	};

	const prompt = new MessageEmbed()
						.setTitle("Enter the new message content")
						.setDescription(`\`\`\`${message.embeds[0].description}\`\`\``)
	await interaction.reply({embeds:[prompt], ephemeral: true, fetchReply: true })
	interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
	.then(async (collected) => 
	{
		message.embeds[0].description = collected.first().content
		await message.edit({embeds:message.embeds});
		await collected.first().delete();
		await interaction.editReply({content:'Message updated!',embeds:[]});
	})
	.catch(collected => 
	{
	});
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Content Edit')
		.setType(ApplicationCommandType.Message),
	execute: execute
};