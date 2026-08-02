/*-----------------------------------------------------------------------------*\
| Detect Avrae combat messages, filtered for Quests, and log them in a database |
\*-----------------------------------------------------------------------------*/
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const quest = require(`../../database/questSchema.js`)

//Quest Save|{name} tries to resist the gloom\'s effects
const questSave = "Quest Save"
const saveIdent = /.* makes a (.*) Save!/gi
const success   = "Success!"

async function shouldHandle(client, message)
{
	if (!message?.author?.bot) return false
	if (message?.author?.id != config.bots.avrae) return false

	const embed = message?.embeds?.[0] || null;
	const fields = embed?.fields || null;
	if (!embed || !fields) return false;

	let save = fields.find(field => field.name == questSave);
	if (save) return true;
	return false;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const embed = message?.embeds?.[0] || null;
	const fields = embed?.fields || null;

	let save = [...embed.title.matchAll(saveIdent)]?.[0];
	console.log(save)
	save = save?.[1] || null;

	if (save != "Wisdom")
	{
		await message.react("❌")
		return;
	}

	const saved = embed.footer.text == success;
	await message.react("☸️")
	await message.react(saved ? "✅" : "❌")

	if (!saved)
		message.reply(`<@${config.OWNERID}> - Save Fail!`)
}

const schemaName = `questSaveMsg${config.DEV ? "dev" : ""}`
module.exports = {
	name: schemaName,
	bot: true,
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	build: config.PRODUCTION //|| config.DEV
};