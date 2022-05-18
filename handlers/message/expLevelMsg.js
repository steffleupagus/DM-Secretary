/*--------------------------------------------------------------*\
| Detect Avrae exp and level messages and log them in a database |
\*--------------------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const LevelData = require(`../../utilities/levelUtils.js`)

async function shouldHandle(client, message)
{
	return LevelData.isLevelMessage(client, message)
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	LevelData.logLevelMessage(client, message, interaction, sendResult)
}



module.exports = {
	name: 'expLevelMsg',
	bot: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate
//	build: config.PRODUCTION
};