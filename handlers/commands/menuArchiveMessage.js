const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder, EmbedBuilder } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const requiredRoles = [ config.ModeratorRole, config.DMRole ];

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
	const message = interaction.targetMessage;	
	if (!message)
		return interaction.reply({ 	content: 'No message found', ephemeral: true });
	const author = message.author

	const isChar = (channel.id == config.profileChannel || channel.id == config.npcProfileChannel);	
	const archiveChanId =  isChar ? config.archiveThreads.charArchive : config.archiveThreads.modArchive
	const archiveChannel = await interaction.guild.channels.fetch(archiveChanId)
	const attachments = message.attachments.map( x => x )

	let reply = `Archiving [message](${message.url})\n`
	await interaction.reply({ 	content: reply, 
								ephemeral: true });

	const embed = getLogEmbed(author, archivist, channel)
	if (message?.content?.length > 0)
		  embed.setDescription(message.content)
		  //embed.addFields([{name:"Posted",value:`<t:${}:`}])
	embed.setFooter({text: `Original post created: `})
	embed.setTimestamp(message.createdTimestamp)
	
	const archiveMsg = await archiveChannel.send({embeds:[embed,...message.embeds]});
	if (attachments.length)
		await archiveChannel.send({files:attachments});

	// let content = message.content;
	// while (content.length > 2000)
	// {
	// 	let subContent = content.substr(0,2000);
	// 	content = content.substr(2000);
	// 	await archiveChannel.send({content:subContent});
	// }
	// await archiveChannel.send({content:content, embeds:message.embeds, files:attachments});

	reply += `\nMessage [Archived](${archiveMsg.url})`
	await interaction.editReply({content: reply})
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Archive Message')
		.setType(ApplicationCommandType.Message),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION// || config.DEV
};