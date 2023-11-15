const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const pattern = /.* : (.*) has purchased a single reroll \(limit 1\) of their character's beginning attributes./gi

async function shouldHandle(client, message)
{	
	if (!message.author.bot) return false
	if ((message.channel.id != config.botSpamChannel)&&
		(message.channel.id != config.gameSpamChannel)) 
		return false

	if (message.content.match(pattern))
		return true

	return false;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	console.log(message.content)
	
	let result = [...message.content.matchAll(pattern)]?.[0];
	console.log(result)
	result = result?.[1] || null;

	const channel = await message.guild.channels.fetch(config.rollChannel)
	if (channel)
		channel.send(message.content)
}

const schemaName = `rerollMsg`
module.exports = {
	name: schemaName,
	bot: true,
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	build: config.PRODUCTION //|| config.DEV
};