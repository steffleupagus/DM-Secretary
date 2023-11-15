const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const name = 'shardResume'
module.exports = {
	name: name,
	once: false,
	execute(client, id, replayedEvents) 
	{
		console.error(`${name} -> id: ${id} | Replayed Events: ${replayedEvents}`)
	},
	build: config.DEV //|| config.PRODUCTION,		
};