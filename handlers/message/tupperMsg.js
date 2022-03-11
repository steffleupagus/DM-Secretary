/*-------------------------------------------------*\
| Detect Tupper messages and log them in a database |
\*-------------------------------------------------*/
const Tupper = require(`${process.cwd()}/utilities/tupperUtils.js`)

function shouldHandle(client, message)
{
	if (process.env.mod == "dev")
		return false;
	return Tupper.isTupperLogMessage(client, message)
}

function handle(client, message, interaction=null, sendResult=true)
{
	Tupper.logTupperMessage(client, message, interaction, sendResult)
}

module.exports = {
	name: 'tupperMsg',
	shouldHandle: shouldHandle,
	handle: handle
};