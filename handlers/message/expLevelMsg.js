/*--------------------------------------------------------------*\
| Detect Avrae exp and level messages and log them in a database |
\*--------------------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const LevelData = require(`../../utilities/levelUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)

async function shouldHandle(client, message)
{
	return LevelData.isLevelMessage(client, message)
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	await LevelData.logLevelMessage(client, message, interaction, sendResult)
	await CharUtils.RefreshCache()
}



module.exports = {
	name: 'expLevelMsg',
	bot: true,
	menu: true,	
	shouldHandle: shouldHandle,
	handleCreate: handleCreate
//	build: config.PRODUCTION
};