const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const name = 'shardError'
module.exports = {
	name: name,
	once: false,
	execute(client, error, id)
	{
		console.error(`${name} -> id: ${id}`, `Error: ${error}`)
	},
	build: config.DEV || config.PRODUCTION,		
};