/*---------------------------------------------------*\
| Detect Roleplay messages and log them in a database |
\*---------------------------------------------------*/
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

const Activity  = require(`../../utilities/activityUtils.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`);

async function shouldHandle(client, message)
{
	let tracked = false;
	
	if (ChanUtils.isRoleplayChannel(message.channel) || ChanUtils.isRoleplayThread(message.channel))
		tracked = true;	//await ChanUtils.isTrackedChannel(message.channel);

	return tracked;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const record = await Activity.updateActivity(message);
}

module.exports = {
	name: 'chanActivityMsg',
	bot: true,
	user: true,
	menu: false,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	
	build: config.PRODUCTION //|| config.DEV	//
};