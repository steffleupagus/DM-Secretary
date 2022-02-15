const client = require(`${process.cwd()}/bot`)




async function processBotMessage(bot, message)
{
	bot.messageHandlers.forEach(handler => 
	{
		if (handler.shouldHandle(bot, message))
			handler.handle(bot, message)
	});
}

async function execute(bot, message)
{
	if (message.author.bot)
	{
		processBotMessage(bot, message);
		return;
	}

	const prefix = bot.config.PREFIX;
	//If it starts with the command character, process it as command		
	if (message.content.startsWith(prefix))
	{
		const args = message.content.slice(prefix.length).trim().split(/ +/g);
		const commandName = args.shift().toLowerCase();
		const command = bot.client.commands.get(commandName);
		if (command) 
		{
			try 
			{
				await command.message(message, commandName, args);
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


// async function asdfasdf (message) => 
// {
//     if (	message.author.bot || 
// 			!message.guild || 
// 			!message.content.toLowerCase().startsWith(client.config.prefix)	)
// 		   return;

//     const [cmd, ...args] = message.content
//         .slice(client.config.prefix.length)
//         .trim()
//         .split(" ");

//     const command = client.commands.get(cmd.toLowerCase()) || 
// 					client.commands.find(c => c.aliases?.includes(cmd.toLowerCase()));

//     if (!command) return;
//     await command.run(client, message, args);
// });


module.exports = {
	name: 'messageCreate',
	execute: execute
};