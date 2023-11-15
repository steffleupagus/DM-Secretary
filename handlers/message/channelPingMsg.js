/*-----------------------------------------------------*\
| Detect channel pings and decipher the No Access links |
\*-----------------------------------------------------*/

const { ChannelType, EmbedBuilder, PermissionsBitField, time } = require('discord.js')
const MsgUtils = require(`../../utilities/messageUtils.js`);
const ChanUtils = require(`../../utilities/channelUtils.js`);
const RPP = require(`../../database/rppTrackerSchema.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const ignoreChannels =
[
//	"",	//	
];

async function shouldHandle(client, message)
{
	let handle = false;	
	if (message?.mentions?.channels?.size > 0)
		handle = true;
	
	return handle;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const citizen = '841415224216780800';	
	const channelMentions = message?.mentions?.channels
	const channels = channelMentions
		.filter(channel => {
			const perms = channel.permissionsFor(citizen);
			const viewChan = perms.has(PermissionsBitField.Flags.ViewChannel);
//			console.log(`${viewChan} - ${channel.name} <#${channel.id}>`)
			return !viewChan
		});
	const channelNames = channels.map(channel => channel.name).join("\n")
	if (channelNames.length == 0) return;
	
	const embed = new EmbedBuilder()	
	embed.setFooter({text:`Above channel mentions:\n${channelNames}`})

	// if ((message.author.id != config.OWNERID)||
	// 	(message.channel.id != config.buildSpamChannel))
	// 	return message.channel.send({embeds:[embed],components:row})
	
	//Handle the travel attachment	
	const travel = client.commands.get(`travel${config.DEV ? "dev" : ""}`)
	const button = await travel?.attach?.chanMention?.(channels)
	const row    = button ? [button] : []
	message.channel.send({embeds:[embed],components:row})
}

module.exports = {
	name: 'channelPingMsg',
	bot: false,
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: config.PRODUCTION //|| config.DEV
};