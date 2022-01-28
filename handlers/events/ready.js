const client = require(`${process.cwd()}/bot`)

function execute(client)
{
	console.log(`Ready! Logged in as ${client.user.tag} ✅`);

	const bld = Date.now() % 10000;
	const name = `You Fap (Build: ${bld})`;
	client.user.setPresence({ 
		activities: [{ type: 3, name: name }], 
		status: 'dnd' 
	});

// 	const arrayOfStatus = [
// 		`${client.guilds.cache.size} servers | ${client.config.prefix}help`,
// 		`${client.channels.cache.size} channels | ${client.config.prefix}help`,
// 		` ${client.guilds.cache
// 				.reduce((a, b) => a + b.memberCount, 0)
// 				.toLocaleString()} users | ${client.config.prefix}help`,
// //		`${client.commands.size} commands | ${client.config.prefix}help`,
//    	];

	const arrayOfStatus = [
		["WATCHING","You Fap"],
		["LISTENING","You Moan"],
		["PLAYING","With Myself"],
	];

   	let index = 0;
	setInterval(() => 
	{	
		if (index === arrayOfStatus.length) index = 0;
		const status = arrayOfStatus[index];
		client.user.setActivity(status[1], { type: status[0] });
		index++;
	}, 8000);
}

// when the client is ready, run this code
// this event will only trigger one time after logging in
module.exports = {
	name: 'ready',
	execute: execute
};