const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
async function execute(client, interaction)
{
	const commandName = interaction.isMessageComponent() ? 
							(interaction.message?.interaction?.commandName ||
							 (interaction?.customId?.includes('.') ? 
								interaction.customId.split(".")[0] : null)) : 
						interaction.commandName;
	//TODO: customId should be in the form of <command>.<payload>
	
	if (!commandName) return;
	const command = interaction.client.commands.get(commandName);
	if (!command) return;
	const commandPermitted = checkPermissions(interaction, command)
	if (!commandPermitted) return;

	try
	{
		//interaction.isMessageComponent()
		if (interaction.isSelectMenu())
			await command.select(interaction);
		else if (interaction.isButton())
			await command.button(interaction);
		else //(interaction.isCommand() || interaction.isContextMenu())
			await command.execute(interaction);
	}
	catch (error)
	{
		console.error(error);
		await reply(interaction, 
					{	content: `There was an error executing this command:\n${error}`, 
						ephemeral: true });
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
				perm = Utils.getPermissionStr(perm);
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

	const botPermissions = command.userPermissions;
	if (botPermissions)
	{
		const chanPerms = interaction.channel.permissionsFor(interaction.client.user);

		let missingPerms = [];
		botPermissions.forEach(perm => {
			if (!chanPerms.has(perm))
			{
				perm = Utils.getPermissionStr(perm);
				missingPerms.push(perm.toString())
			}
		});

		if (missingPerms.length > 0)
		{
			missingPerms = `\`${missingPerms.join('`,`')}\``;
			reply(interaction, 
				  {content:`Bot is missing required permissions for this command: ${missingPerms}`, ephemeral:true });
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

module.exports = {
	name: 'interactionCreate',
	execute: execute
};
