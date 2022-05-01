const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, Permissions } = require('discord.js')
const Prompt = require(`${process.cwd()}/utilities/promptUtils.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);


function getSelectRow()
{
	const id = "demo.locations"
	const label = "●▬▬▬▬▬ 𝕷𝖔𝖈𝖆𝖙𝖎𝖔𝖓𝖘 ▬▬▬▬▬●"
	let options = ["City Square","Administrative District","Entertainment District","Colosseum","Silver Thorn Brothel","Residential Quarter","Ample Ogre Inn","Manticore's Dream Tavern","Veluthe Oro Gardens","Mercantile Quarter","Cyu'unt Restaurant","Sewer","Slum","City Dock","Outside Blessed Gate","Outside Cursed Gate","Wilderness","Arcanum Tower","Temple District","Den of Iniquity","Gladiators Guard Barracks"];

	for (let i=0; i < options.length; ++i)
	{
		options[i] = {label: options[i], value: options[i]}	
	}

	const row = Prompt.createSelectRow("demo.select", options, 0, 3, label)
	return row;
}

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

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const messageId = interaction.targetId;

	let embed = new MessageEmbed();
		embed.setTitle("Interaction Demo");
		embed.setDescription("Demo buttons & select box");

	const buttons = getButtonRow()
	const select = getSelectRow()
	const rows = [buttons,select]
	interaction.reply({embeds:[embed], components: rows})
}

async function run(client, message, command, args)
{
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

const data = new SlashCommandBuilder()
	.setName('demo')
	.setDescription('Update the contents of a static channel')
	.setDefaultPermission(false)	
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))

const userPermissions = [	Permissions.FLAGS.SEND_MESSAGES		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
	button: button,
	select: select,

	build:config.DEV
};