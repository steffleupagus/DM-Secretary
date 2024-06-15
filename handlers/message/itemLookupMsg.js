/*----------------------------------------------------------*\
| Detect item messages and respond with server-relevant info |
\*----------------------------------------------------------*/
const { EmbedBuilder }  = require(`discord.js`)
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const Items = require(`../../database/itemMetaSchema.js`)

async function shouldHandle(client, message)
{
	const embed = message?.embeds?.[0]
	if (!embed) return false
	if (message.channel.id != config.chan.builder) return false;

	const item = embed?.footer?.text.startsWith("Item | ")
	return item
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	let item = message?.embeds?.[0].title
	if (item.includes(",")) item = item.split(",").reverse().join(" ")
	const results = await Items.find({ name: { $regex:item, $options: "i"} })

	if (results.length == 0) return message.react("❓")

	console.log(results)

	//Prepare and present the output to the user
	const embed = new EmbedBuilder();
}

module.exports = {
	name: 'itemLookupMst',
	bot: true,
	menu: true,	
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: config.PRODUCTION || config.DEV
};