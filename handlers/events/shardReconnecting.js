const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const name = 'shardReconnecting'
module.exports = {
	name: name,
	once: false,
	execute(client, id) 
	{
		console.error(`${name} -> id: ${id}`)
	},
	build: config.DEV || config.PRODUCTION,		
};