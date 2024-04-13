const { SlashCommandBuilder,
	    ChannelType,
	    PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Embed = require(`../../utilities/EmbedPaginator.js`);
const charUtils = require(`../../utilities/charUtils.js`);
const LevelUtils = require(`../../utilities/levelUtils.js`);
const GuildUtils = require(`../../utilities/guildUtils.js`);
const Utils = require(`../../utilities/utilFuncs.js`)

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guild = interaction.guild;
	const ephemeral = true;

	await interaction.deferReply({ephemeral: ephemeral});

	//Generate the output
	let embed = new Embed();
	embed.setTitle(`Threads`)
	
	let channels = await guild.channels.fetch();
	channels = channels.sort((chanA, chanB) => 
	{
		const chanA_pos = chanA.parent?.position * 1000 + chanA.position;
		const chanB_pos = chanB.parent?.position * 1000 + chanB.position;
		return chanA_pos - chanB_pos;
	});
	for (let c = 0; c < channels.size; ++c)
	{
		const channel = channels.at(c);
		if (channel.type == ChannelType.GuildText)
		{
	 		const activeThreads = await channel.threads.fetchActive();
	 		const archivedThreads = await channel.threads.fetchArchived();

			console.log(`${channel.id}: ${channel.name}`)

			if (activeThreads.threads.size || archivedThreads.threads.size)
			{
//TODO: Add commands to filter out what is displayed: active, archived, both
//TODO: Add option to unarchive pinned threads or delete cleanup threads				
				embed.addField(`${channel.name}`, `<#${channel.id}>`);
				activeThreads.threads.each(thread =>
				{
					embed.extendField(`Active: <#${thread.id}>`);
				})
				archivedThreads.threads.each(thread =>
				{
					embed.extendField(`Archive: <#${thread.id}> [#${thread.name}](${thread.url})`);
				})
			}
		}
	}

	let embeds = embed.embeds();
	     embed = embeds.shift();
	await interaction.editReply({embeds:[embed], ephemeral: true})
	Utils.asyncArrayForEach(embeds, async embed => {
		await interaction.followUp({embeds:[embed], ephemeral: true})
	})	
}

async function run(client, message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName(`listthreads${config.DEV ? "dev" : ""}`)
	.setDescription('Go through every channel and find every thread')
	.setDefaultPermission(false)

const userPermissions = [	PermissionsBitField.Flags.ManageGuild	];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.role.Builder
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
//	button: button,

	build: config.PRODUCTION || config.DEV
};