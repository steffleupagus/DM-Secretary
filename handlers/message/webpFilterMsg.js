/*----------------------------------------------*\
| Detect webp messages and delete with a message |
\*----------------------------------------------*/

const { ChannelType, EmbedBuilder, PermissionsBitField, time } = require('discord.js')
const MsgUtils = require(`../../utilities/messageUtils.js`);
const ChanUtils = require(`../../utilities/channelUtils.js`);
const RPP = require(`../../database/rppTrackerSchema.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

function shouldHandle(client, message) 
{
	// Regular expression to match URLs with query strings ending with .webp
	const urlWithQueryStringRegex = /(https?|ftp):\/\/[^\s/$.?#].[^\s]*\.(webp)[^\s]*/gi;
	
	// Check if the message content contains URLs with query strings ending with .webp
	const content = message.content.toLowerCase(); // Convert to lowercase for case-insensitive check
	const contentMatches = content.match(urlWithQueryStringRegex);

//	console.log(contentMatches,content)
	
	// Check if the message has attachments that have a .webp extension
	const hasAttachments = message.attachments.size > 0;
	const attachmentMatches = message.attachments.some((attachment) =>
		attachment.name.toLowerCase().endsWith('.webp')
	);
	
	// Return true if either content or attachments match
	return contentMatches || (hasAttachments && attachmentMatches);
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	await message.reply("Your message containing a `webp` link or attachment has been removed per https://discord.com/channels/694275190976413816/701759916288901160/1157704944091140147");
	await message.delete();
}

module.exports = {
	name: 'webpFilterMsg',
	bot: true,
	user: true,
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: false	//config.PRODUCTION
};