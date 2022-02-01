async function execute(client, interaction)
{
	console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction of type ${interaction.type}.`);
	console.log(interaction);

	console.log("isCommand: "+ interaction.isCommand());
	console.log("isContextMenu: "+ interaction.isContextMenu());
	console.log("isMessageComponent: "+ interaction.isMessageComponent());
	console.log("isButton: "+ interaction.isButton());
	console.log("isSelectMenu: "+ interaction.isSelectMenu());

	let commandName = interaction.isMessageComponent() ? 
						interaction.message?.interaction?.commandName : 
						interaction.commandName;

	// const commandName = interaction.commandName ?? interaction.message.interaction.commandName ?? false;
	// if (!commandName) return

	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) return;

	try
	{
		//interaction.isMessageComponent()
		// if (interaction.isButton())
		// 	await command.handleButton(interaction);
		// else 
		if (interaction.isSelectMenu())
			await command.select(interaction);
		else 			//interaction.isCommand() || interaction.isContextMenu()
			await command.execute(interaction);
	}
	catch (error)
	{
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
}

module.exports = {
	name: 'interactionCreate',
	execute: execute
};