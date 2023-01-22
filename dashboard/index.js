const http = require('http');
const https = require('https');
const express = require('express');
const mongoose = require('mongoose')

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
	
	
	app.get('/', (req, res) => 
	{	
		const readyStates = ["Disconnected","Connected","Connecting","Disconnecting"]		
		
		let discordReady = client.isReady()
		let databaseState = mongoose.connection.readyState
		let databaseReady = (databaseState == 1 || databaseState == 2)
		let botReady = discordReady && databaseReady

		let discordStatus = discordReady ? "Ready" : "Not Ready";
		let databaseStatus = readyStates[databaseState];
	
		const status = botReady ? 200 : 503;
		const response = `Discord: ${discordStatus}<br>\nDatabase: ${databaseStatus}`	

		res.status(status).send(response);
		console.log(`\n\nHeartbeat Check: \n${response}\n\n`)

		if (!botReady)
		{
			time = 15
			console.log(`Bot not ready. Recheck in ${time}s\n\n`)
			const myTimeout = setTimeout(() =>
			{
				let discordReady = client.isReady()
				let databaseState = mongoose.connection.readyState
				let databaseReady = (databaseState == 1 || databaseState == 2)
				let botReady = discordReady && databaseReady
				if (!botReady)
				{
					console.log(`Bot not ready on recheck. Rebooting.\n\n`)				
					process.kill(1)
				}
				clearTimeout(myTimeout);			
			}, time * 1000);
		}
	});

	app.get('/test', (req, res) =>
	{
		res.status(200).send("Killing database...");
		mongoose.disconnect()
	})
			
	app.get('/reboot', (req, res) =>
	{
		res.status(200).send("Forcing reboot...");
		process.kill(1)
	})
	
	
// 	// get all guilds the bot is logged in
// 	app.get('/api/guild/all', (req, res) => 
// 	{
// 		let guilds = client.guilds.array();
// 		res.status(200).send(guilds);
// 	});
}