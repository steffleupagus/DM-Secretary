const { SlashCommandBuilder,
	    EmbedBuilder, 
	    PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Embed = require(`../../utilities/EmbedPaginator.js`);
const charUtils = require(`../../utilities/charUtils.js`);
const Utils = require(`../../utilities/utilFuncs.js`)

async function execute(interaction)
{
	const ephemeral = true;
	await interaction.deferReply({ephemeral: ephemeral});

	const matches = await charUtils.nameMatchTest();
	await interaction.editReply("Logged")
	
	// //Generate the output
	// let embed = new Embed();
	// embed.setTitle(`Name Match`)
	// for (let c = 0; c < channels.size; ++c)
	// {
	// 	embed.addField(`${channel.name}`, `<#${channel.id}>`);
	// 	activeThreads.threads.each(thread =>
	// 	{
	// 		embed.extendField(`Active: <#${thread.id}>`);
	// 	})
	// 	archivedThreads.threads.each(thread =>
	// 	{
	// 		embed.extendField(`Archive: <#${thread.id}> [#${thread.name}](${thread.url})`);
	// 	})
	// }

	// let embeds = embed.embeds();
	//      embed = embeds.shift();
	// await interaction.editReply({embeds:[embed], ephemeral: true})
	// Utils.asyncArrayForEach(embeds, async embed => {
	// 	await interaction.followUp({embeds:[embed], ephemeral: true})
	// })	
}

async function run(client, message, command, args)
{
}


const data = new SlashCommandBuilder()
	.setName('testnames')
	.setDescription('Test name matching from Tupper log')
	.setDefaultPermission(false)

const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.role.Builder
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,

	build:config.DEV
};