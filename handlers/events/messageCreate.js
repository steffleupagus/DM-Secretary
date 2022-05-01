async function processBotMessage(client, message)
{
	client.messageHandlers.forEach(handler => 
	{
		// if (handler.hasOwnProperty("build") && !handler.build)		
		// {
		// 	console.log("Wrong Build");
		// 	return
		// }
		if (handler.shouldHandle(client, message))
			handler.handle(client, message)
	});
}

async function execute(client, message)
{
	if (message.author.bot)
	{
		processBotMessage(client, message);
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
}

module.exports = {
	name: 'messageCreate',
	execute: execute
};