/*---------------------------------------------------*\
| Detect Roleplay messages and log them in a database |
\*---------------------------------------------------*/

const { ChannelType, EmbedBuilder, PermissionsBitField, time } = require('discord.js')
const MsgUtils = require(`../../utilities/messageUtils.js`);
const ChanUtils = require(`../../utilities/channelUtils.js`);
const RPP = require(`../../database/rppTrackerSchema.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const ignoreChannels =
[
//	"",	//	
];

async function shouldHandle(client, message)
{
	let handle = false;	
	if (message?.mentions?.channels?.size > 0)
		handle = true;

	if (message.author.id != config.OWNERID)
		return false;
	
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
			return !viewChan
		})
		.map(channel => channel.name).join("\n")	
	const embed = new EmbedBuilder()	
	embed.setFooter({text:`Above channel mentions:\n${channels}`})
	message.channel.send({embeds:[embed]})
}

module.exports = {
	name: 'channelPingMsg',
	bot: false,
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: config.PRODUCTION || config.DEV
};