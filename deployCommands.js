const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const token = process.env.token;
const clientId = config.CLIENTID;
const guildId = config.GUILDID;

const commands = [];
const commandFiles = fs.readdirSync(`${process.cwd()}/handlers/commands`)
					   .filter(file => file.endsWith('.js'));

for (const file of commandFiles) 
{
	const command = require(`${process.cwd()}/handlers/commands/${file}`);
	if (command.type == "MESSAGE" || command.type == "USER")
		delete command.description;

	if (!command.hasOwnProperty("build") || command.build)
		commands.push(command.data.toJSON());
}

console.log(`Deploying commands to:\n`,
			`Client: ${clientId}\n`,
			`Guild: ${guildId}\n`);

const rest = new REST({ version: '9' }).setToken(token);

(async () => 
{
	try {
		console.log('Started refreshing application (/) commands.');

		//// Register global commands
		// await rest.put(
		// 	Routes.applicationCommands(clientId),
		// 	{ body: commands },
		// );

		//// Register guild commands
		await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
})();