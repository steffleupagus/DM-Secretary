const { ContextMenuCommandBuilder } = require('@discordjs/builders')
const { Permissions } = require('discord.js')
const { ApplicationCommandType } = require(`${process.cwd()}/utilities/enums.js`)
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

const MsgUtils = require(`${process.cwd()}/utilities/messageUtils.js`)
const Tupper = require(`${process.cwd()}/utilities/tupperUtils.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(interaction)
{
	const guild = interaction.guild;
	const client = interaction.client;
	const channel = interaction.channel;

	if (channel.id != config.tupperLogChannel)
		return interaction.reply({content:"Not the tupper log channel",ephemeral:true})
	
	await interaction.deferReply();

	const messages = await MsgUtils.getMessageRange(channel, interaction.targetId, null, 200);
	console.log(`Log cleanup: ${messages.length} messages.`)
	let url;
	for (let message of messages)
	{
		url = message.url
		const data = Tupper.parseTupperLog(client, message);
		if (data)
		{	
			//If the channel is not an RP channel, delete it
			const msgChan = await guild.channels.fetch(data.cId);
			const isRP = MsgUtils.isRoleplayChannel(msgChan);

			//If the author is no longer a member, delete it
			const member = await guild.members.fetch(data.aId).catch(() => null)

			if (isRP && member)
				await Tupper.logTupperMessage(client, message)
			else
				await message.delete()
			await Utils.slowdown(500);
		}
		else
		{
			await message.delete()
			await Utils.slowdown(1000);
		}
	}

	console.log(url)
	interaction.deleteReply();
	await interaction.channel.send(url);	
}

const userPermissions = [	Permissions.FLAGS.MANAGE_GUILD,
							Permissions.FLAGS.MANAGE_CHANNELS,
						 	Permissions.FLAGS.MANAGE_MESSAGES	];

module.exports = 
{
	data: new ContextMenuCommandBuilder()
		.setName('Clean Log')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),	
	whitelistRoles: [config.LiveModRole],
	userPermissions: userPermissions,
	execute: execute
};