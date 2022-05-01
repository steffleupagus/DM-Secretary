const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

let mod = process.env.mod || "";
//console.log(process.argv)
if (process.argv.length > 2) 
	mod = (process.argv[2].includes("dev") ? "dev" : "")

const config = require(`${process.cwd()}/config/${mod}_config.json`);
const token = process.env.token;
const clientId = process.env.clientid;
const guildId = config.GUILDID;

const commands = [];
const commandFiles = fs.readdirSync(`${process.cwd()}/handlers/commands`)
					   .filter(file => file.endsWith('.js'));

console.log(`Deploying commands to ${mod}\n`,
			`Client: ${clientId}\n`,
			`Guild: ${guildId}\n`);

for (const file of commandFiles) 
{
	const command = require(`${process.cwd()}/handlers/commands/${file}`);
	if (command.type == "MESSAGE" || command.type == "USER")
		delete command.description;

	if (!command.hasOwnProperty("build") || command.build)
	{
		console.log(` - ${command.data.name}`)
		commands.push(command.data.toJSON());
	}
}

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