const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

module.exports = {
	name: 'debug',
	once: false,
	execute(client, info) 
	{
		const filters = ["Heartbeat"]

		let log = true;
		filters.forEach(filter => 
		{
			if (info.includes(filter))
				log = false;			
		})

		if (log)
			console.error(`debug -> ${info}`)//, stackTrace);
	},
	
	build: config.DEV || config.PRODUCTION,	
};