const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, PermissionsBitField } = require('discord.js')
const Avrae = require(`../../utilities/avrae.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const gvar = "776725c9-6944-4985-abfa-b629ffb89109";

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const messageId = interaction.targetId;

	console.log(interaction)

	const group = interaction.options.group
	const subcommand = interaction.options.subcommand
	const options = interaction.options
	console.log(options)

	
	const content = await Avrae.readGvar(gvar);
	interaction.reply({content:content, ephemeral: true})
	await Avrae.writeGvar(gvar, content + "\nasdfsadf")
	
	// const buttons = getButtonRow()
	// const select = getSelectRow()
	// const rows = [buttons,select]
	// interaction.reply({embeds:[embed], components: rows})

	// const modal = await Prompt.createModal();
	// console.log(modal)
	// interaction.showModal(modal)
}


const data = new SlashCommandBuilder()
	.setName('guild')
	.setDescription('Does various guild things!')
	.addSubcommand(subcommand =>
		subcommand
			.setName('user')
			.setDescription('Info about a user')
			.addUserOption(option => option.setName('target').setDescription('The user')))
	.addSubcommandGroup(group =>
		group
			.setName('admin')
			.setDescription('Guild admin commands')
			.addSubcommand(subcommand => 
				subcommand
					.setName('setrole')
					.setDescription('Set role(s) for this guild')
					.addStringOption(option => option.setName('guild')
										.setDescription('The guild in question')
										.setRequired(true)
									.addChoices(
										{ name: 'Arcanum', value: 'arcanum' },
										{ name: 'Black Hand', value: 'blackhand' },
										{ name: 'Faith Council', value: 'faithcouncil' },
									 	{ name: 'Guardians', value: 'guardian' },
										{ name: 'Outriders', value: 'outriders' },
										{ name: 'Silver Thorn', value: 'silverthorn' },
									)
					)
					.addRoleOption(option => option.setName('role')
										.setDescription('The role to apply')
										.setRequired(true)
					)
					.addNumberOption(option => option.setName('rank')
										.setDescription('The guild rank this role will apply to')
									 	.setRequired(false)							 
					)
			)
		)
	// .addUserOption(option => option.setName('user').setRequired(false)
	// 							   .setDescription('Specify a target user to whom the role(s) should be applied'))
	// .addUserOption(option => option.setName('user').setRequired(false)
	// 							   .setDescription('Specify a target user to whom the role(s) should be applied'))

	// .addSubcommand(subcommand =>
	// 	subcommand
	// 		.setName('server')
	// 		.setDescription('Info about the server'));

const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
	],
	userPermissions: userPermissions,
	execute: execute,
	//message: run,
	// button: button,
	// select: select,

	build:config.PRODUCTION || config.DEV
};



/*
function getButtonRow()
{
	const options = [
		{style:'PRIMARY', emoji:"☑️", custom_id:"demo.bluecheck"},	
		{style:'SUCCESS', emoji:"✅", custom_id:"demo.greencheck"},
		{style:'DANGER', emoji:"❌", custom_id:"demo.redx"},
		{style:'SECONDARY', emoji:"✖️", custom_id:"demo.grayx"},
		{style:'SECONDARY', emoji:"🔒", custom_id:"demo.locked", disabled:true}
	]
	const row = Prompt.createButtonRow(options)
	return row;
}

async function button(interaction)
{
	interaction.reply({content:`Handling: ${interaction.customId}`, 
					  ephemeral: true})
}

async function select(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, ephemeral: true})
}
*/