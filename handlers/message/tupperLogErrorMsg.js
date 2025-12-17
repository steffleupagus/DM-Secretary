/*--------------------------------------------------*\
| Detect Tupper logging error messages and inform me |
\*--------------------------------------------------*/
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const error = "Warning: There is a log channel configured but I do not have permission to send messages to it. Logging has been disabled."

async function shouldHandle(client, message)
{
	if (!message) return false;
	const isBot = message?.author?.bot;
	const isTupper = message?.author?.id == config.bots.tupper;
	const isError = message.content == error;
	return isBot && isTupper && isError
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const reply = await message.reply(`### ⚠️ Tupper logging disabled\n### ⚠️ This is very bad.\n ### ⚠️ Please inform <@&${config.role.Builder}>.`)
	const handler = client.messageHandlers.find(x => x.name == 'rolePingLogMsg')
	if (handler) handler.handleCreate(client, reply)
}

module.exports = {
	name: 'tupperErrorLogMsg',
	bot: true,
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate
};