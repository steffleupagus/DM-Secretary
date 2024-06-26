const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder, EmbedBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const requiredRoles = [ config.role.Moderator, config.role.DM ];

function getLogEmbed(author, archivist, msgChan)
{
	const embed = new EmbedBuilder()
		.setTitle(`Message Archived`)
		.setAuthor({ name: author.displayName, iconURL: author.displayAvatarURL() })
		.addFields([
			{name:"Original Author",value:`\`${author.id}\`\n<@${author.id}>\n\n*Archived by*\n\`${archivist.id}\`\n<@${archivist.id}>`,inline:true},
			{name:"Original Channel",value:`\`${msgChan.id}\`\n\`${msgChan.name}\`\n<#${msgChan.id}>`,inline:true}
		])
	return embed;
}

async function execute(interaction)
{
	const archivist = interaction.member;
	const channel = interaction.channel;
	const parent  = channel.parent;
	const message = interaction.targetMessage;	
	if (!message)
		return interaction.reply({ 	content: 'No message found', ephemeral: true });
	const author = message.author

	const isChar = (channel.id == config.chan.pcProfile || channel.id == config.chan.npcProfile);
	const isArchivedChar = (parent.id == config.chan.pcProfile || parent.id == config.chan.npcProfile);
	const archiveChanId =  (isChar || isArchivedChar) ? config.chan.charArchive : config.chan.modArchive
	const archiveChannel = await interaction.guild.channels.fetch(archiveChanId)
	const attachments = message.attachments.map( x => x )

	let reply = `Archiving [message](${message.url})\n`
	await interaction.reply({ 	content: reply, 
								ephemeral: true });

	let embed = null;
	if (isArchivedChar && message.embeds?.length > 0)
	{
		embed = await archiveChannel.send({embeds:[...message.embeds]});
	}
	else
	{
		embed = getLogEmbed(author, archivist, channel)
		if (message?.content?.length > 0)
			  embed.setDescription(message.content)
		embed.setFooter({text: `Original post created: `})
		embed.setTimestamp(message.createdTimestamp)
		embed = await archiveChannel.send({embeds:[embed,...message.embeds]});
	}		
	if (attachments.length)
		await archiveChannel.send({files:attachments});

	reply += `\nMessage [Archived](${embed.url})`
	await interaction.editReply({content: reply})
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Archive Message')
		.setType(ApplicationCommandType.Message),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION //|| config.DEV
};