const { ActivityType } = require('discord.js');
const client = require(`../../bot`)
const utils = require(`../../utilities/utilFuncs.js`)

function execute(client)
{
	console.log(`Ready! Logged in as ${client.user.tag} ✅`);

	const bld = Date.now() % 10000;
	const time = utils.formatDate(utils.getDate())
	const lastReboot = `Last Reboot: ${time}`
	const statusArray = [
		// {type: ActivityType.Custom, name:"Testing", state: "💋"},
		{type: ActivityType.Playing, name:"With Myself", state: lastReboot},
		{type: ActivityType.Watching, name:"You Fap", state: lastReboot},
		{type: ActivityType.Listening, name: "You Moan", state: lastReboot}
	];
	
	client.user.setPresence({ 
		activities: [statusArray[0]],	//[{ type: 3, name: name }], 
		status: 'dnd' 
	});

	let index = 0;
	setInterval(() => 
	{	
		if (index === statusArray.length) index = 0;
		const status = statusArray[index];
		//client.user.setActivity(status[1], status );//{ type: status[0] });
		client.user.setActivity(status)
		index++;
	}, 60000);
}

// when the client is ready, run this code
// this event will only trigger one time after logging in
module.exports = {
	name: 'ready',
	execute: execute
};