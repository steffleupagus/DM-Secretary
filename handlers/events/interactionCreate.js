const { InteractionType } = require('discord.js');
const Utils = require(`../../utilities/utilFuncs.js`)

const mod = process.env.mod || '';
const config = require(`../../config/${mod}_config.json`);

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
	if (command.hasOwnProperty("build") && !command.build) return;

	try
	{
		//interaction.isMessageComponent()
		if (interaction.type === InteractionType.ApplicationCommandAutocomplete)
		{
			await command.autoComplete(interaction);
		}
		else if (interaction.isAnySelectMenu())
		{
			if (command.select) await command.select(interaction);
		}
		else if (interaction.isButton())
		{
			if (command.button) await command.button(interaction);
		}
		else //(interaction.isCommand() || interaction.isContextMenu())
		{
			await command.execute(interaction);
		}
	}
	catch (error)
	{
		// var stackTrace = Error().stack;
		console.error("Error",error)//, stackTrace);
		await reply(interaction,
					{	content: `This command failed to execute:\n${error}`,
					 	components: [], ephemeral: true });
	}
}

async function reply(interaction, reply)
{
	let identifier = interaction?.commandName ||
					 interaction?.message?.interaction?.commandName ||
					 interaction?.customId;
	console.log(">", identifier, reply)

	if (interaction.deferred)
		await interaction.editReply(reply)
	else if (interaction.replied)
		await interaction.followUp(reply)
	else if (interaction.reply)
		await interaction.reply(reply)
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
