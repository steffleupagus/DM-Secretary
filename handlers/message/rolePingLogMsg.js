/*---------------------------------------------------*\
| Detect DM Ping messages and log them in a database |
\*---------------------------------------------------*/

const { ChannelType, EmbedBuilder, PermissionsBitField, time } = require('discord.js')
const MsgUtils = require(`../../utilities/messageUtils.js`);
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const logRoles = {
	[config.BuilderRole]:"Builder Attention Needed",
	[config.ModeratorRole]:"Mod Attention Needed",
	[config.DMOnDutyRole]:"DM Attention Needed",
	[config.ItemTradeRole]:"Item Exchange Log"
}
const roleIDs = Object.keys(logRoles)

async function shouldHandle(client, message)
{
	let handle = false;	

//	if (message?.mentions?.roles.has(config.BuilderRole))	//DMOnDutyRole))
	const mentions = message.mentions.roles.filter( x => roleIDs.includes(x.id) )
	if (mentions.size > 0)
		handle = true;
	
	if (message.author.id != config.OWNERID)
		return false;
	
	return handle;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const guild = message.guild
	const msgChan = message.channel
	const channel = await guild.channels.fetch(config.debugPingChannel)
	if (!channel) return;
	const mentions = message.mentions.roles.filter( x => roleIDs.includes(x.id) )
	if (mentions.size == 0) return;
	
	const color = message.mentions.roles.filter(x => x.color).last()?.color || 0
	const pings = Array.from(mentions.keys()).map(x=>`<@&${x}>`).join("")
	const member = message.member
	const avatar = `${member.displayAvatarURL()}`
	const location = message.channel.parent.name
	const embed = new EmbedBuilder()
		.setTitle(`${logRoles[mentions.last().id]}: ${location}`)
		.setDescription(message.content)
		.setThumbnail(avatar)
		.setColor(color)
		.setAuthor({name:message.member.displayName,iconURL:avatar})
		.addFields([
			{name:"User",value:`\`${member.id}\`\n<@${member.id}>`,inline:true},
			{name:"Channel",value:`\`${msgChan.name}\`\n\`${msgChan.id}\`\n<#${msgChan.id}>`,inline:true},
			{name:"Message Link",value:message.url}
		]);

	//Handle the travel attachment	
	const travel = client.commands.get(`travel${config.DEV ? "dev" : ""}`)
	const button = await travel?.attach?.dmPing?.(msgChan)
	const row    = button ? [button] : []

	channel.send({content:pings,embeds:[embed],components:row});
}

module.exports = {
	name: 'rolePingLogMsg',
	// bot: true,
	user: true, 
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: config.PRODUCTION || config.DEV
};