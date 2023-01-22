const Utils = require(`../../utilities/utilFuncs.js`)
async function processMessage(client, message)
{
	Utils.asyncArrayForEach(client.messageHandlers, async (handler) => 
	{
		if (handler.hasOwnProperty("build") && !handler.build) return;
		if (handler.bot != message.author.bot) return;
		const shouldHandle = await handler.shouldHandle(client, message);
		if (shouldHandle) await handler.handleCreate(client, message)
	});
}

async function execute(client, message)
{
	if (message.author.bot)
	{
		processMessage(client, message);
		return;
	}

	const prefix = client.config.prefix;
	//If it starts with the command character, process it as command		
	if (message.content.startsWith(prefix) && 
		message.guild.id == client.config.GUILDID)
	{
		const args = message.content.slice(prefix.length).trim().split(/ +/g);
		const commandName = args.shift().toLowerCase();
		const command = client.commands.get(commandName);
		if (command)
		{
			if (command.hasOwnProperty("build") && !command.build) return;		
			try 
			{
				await command.message(client, message, commandName, args);
			}
			catch (error) 
			{
				console.error(error);
				await message.reply({ content: 'There was an error while executing this command!', ephemeral: true });
			}
		}
		return;
	}

	//Finally, if we're all the way through here, check for RP messages
	if (!message.author.bot)
		processMessage(client, message)	
}

module.exports = {
	name: 'messageCreate',
	execute: execute
};