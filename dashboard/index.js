const http = require('http');
const https = require('https');
const express = require('express');

const app = express();
const port = 3000;	//process.env.PORT

const listener = app.listen(port, () => {
	const url = `http://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/`
	setInterval(() => { http.get(url); }, 280000);	

	console.log(url);
	console.log(`localhost:${port}`)
	console.log(listener.address().port)
});

// Example of API from your client (discord.js)
module.exports = client => 
{
	app.get('/', (req, res) => {
	//	res.send('Bot Is Up')
		res.status(200).send(client.isReady() ? 'Bot is up!' : 'Bot is not ready...');
	});

	
// 	// get all guilds the bot is logged in
// 	app.get('/api/guild/all', (req, res) => 
// 	{
// 		let guilds = client.guilds.array();
// 		res.status(200).send(guilds);
// 	});
}