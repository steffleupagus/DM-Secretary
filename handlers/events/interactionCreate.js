const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
async function execute(client, interaction)
{
	let commandName = interaction.isMessageComponent() ? 
						interaction.message?.interaction?.commandName : 
						interaction.commandName;
	if (!commandName) return;
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) return;
	const commandPermitted = checkPermissions(interaction, command)
	if (!commandPermitted) return;

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

function reply(interaction, reply)
{
	if (interaction.deferred)
		interaction.editReply(reply)
	else if (interaction.replied)
		interaction.followUp(reply)
	else
		interaction.reply(reply)
}

function checkPermissions(interaction, command)
{
	const userPermissions = command.userPermissions;
	if (userPermissions)
	{
		const userPerms = interaction.member.permissions;
		const chanPerms = interaction.channel.permissionsFor(interaction.user);

		let missingPerms = [];
		userPermissions.forEach(perm => {
			if (!userPerms.has(perm) && !chanPerms.has(perm))
			{
				perm = util.getPermissionStr(perm);
				missingPerms.push(perm.toString())
			}
		});

		if (missingPerms.length > 0)
		{
			missingPerms = `\`${missingPerms.join('`,`')}\``;
			reply(interaction, 
				  {content:`You are missing required permissions to run this command: ${missingPerms}`, ephemeral:true });
			return false;
		}
	}

	const whitelistRoles = command.whitelistRoles;
	if (whitelistRoles)
	{
		const userRoles = interaction.member.roles.cache;
		let missingRoles = [];
		for (const role of whitelistRoles)
		{
			if (userRoles.has(role))
				return true;
			else
				missingRoles.push(`<@&${role}>`)
		};
		missingRoles = `${missingRoles.join(',')}`;
		reply(interaction, 
				{content:`You are missing a required role to run this command: ${missingRoles}`, ephemeral:true });
		return false;
	}

	return true;
}

// console.log(`${interaction.user.tag} in #${interaction.channel.name} triggered an interaction of type ${interaction.type}.`);
// console.log(interaction);
// console.log("isCommand: "+ interaction.isCommand());
// console.log("isContextMenu: "+ interaction.isContextMenu());
// console.log("isMessageComponent: "+ interaction.isMessageComponent());
// console.log("isButton: "+ interaction.isButton());
// console.log("isSelectMenu: "+ interaction.isSelectMenu());
// const commandName = interaction.commandName ?? interaction.message.interaction.commandName ?? false;
// if (!commandName) return
//interaction.isMessageComponent()
// if (interaction.isButton())
// 	await command.handleButton(interaction);		

module.exports = {
	name: 'interactionCreate',
	execute: execute
};
