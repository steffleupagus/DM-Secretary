/*--------------------------------------------------------------*\
| Detect Avrae exp and level messages and log them in a database |
\*--------------------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const LevelData = require(`../../utilities/levelUtils.js`)

function shouldHandle(client, message)
{
	return LevelData.isLevelMessage(client, message)
}

function handle(client, message, interaction=null, sendResult=true)
{
	LevelData.logLevelMessage(client, message, interaction, sendResult)
}

module.exports = {
	name: 'expLevelMsg',
	shouldHandle: shouldHandle,
	handle: handle,
//	build: config.PRODUCTION
};