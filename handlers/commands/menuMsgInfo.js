const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)

async function execute(interaction)
{
	const client = interaction.client;
	const guildId = interaction.guildId;
	const channelId = interaction.channelId;
	const messageId = interaction.targetId;
	const guilds = client.guilds.cache;
	const guild = guilds.get(guildId);
	const channel = await guild?.channels.fetch(channelId);
	const message = await channel?.messages.fetch(messageId);

	interaction.deferReply({ephemeral:true});

	let response = [];
	response.push(`.applicationId: ${message.applicationId}`)
	response.push(`.author: ${message.author}`)
	response.push(`.channel: ${message.channel}`)
	response.push(`.content: ${message.content}`)
	response.push(`.id: ${message.id}`)
	response.push(`.member: ${message.member}`)
	response.push(`.url: ${message.url}`)
	response.push(`.webhookId: ${message.webhookId}`)	

	interaction.editreply({content:response.join("\n"), ephemeral:true});
}

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Info')
		.setType(ApplicationCommandType.Message),
	execute: execute
};