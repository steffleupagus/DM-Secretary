module.exports = {
	name: 'rateLimit',
	once: false,
	execute(client, info) 
	{
		console.error(`rateLimit -> `, info);
		if (info.timeout > 10000) 
		{			
			process.kill(1)		
		}
	},
};