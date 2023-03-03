const { SlashCommandBuilder,
	    EmbedBuilder, 
	    PermissionsBitField, 
	    ButtonStyle } = require('discord.js')
const Prompt = require(`../../utilities/promptUtils.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

function getSelectRow()
{
	const id = "demo.locations"
	const label = "●▬▬▬▬▬ 𝕷𝖔𝖈𝖆𝖙𝖎𝖔𝖓𝖘 ▬▬▬▬▬●"
	let options = ["City Square","Administrative District","Entertainment District","Colosseum","Silver Thorn Brothel","Residential Quarter","Ample Ogre Inn","Manticore's Dream Tavern","Veluthe Oro Gardens","Mercantile Quarter","Cyu'unt Restaurant","Sewer","Slum","City Dock","Outside Blessed Gate","Outside Cursed Gate","Wilderness","Arcanum Tower","Temple District","Den of Iniquity","Gladiators Guard Barracks"];

	for (let i=0; i < options.length; ++i)
	{
		options[i] = Prompt.createSelectOption(`Label: ${options[i]}`, 
											   `Desc: Description for ${options[i]}`,
											   options[i]);
	}

	const row = Prompt.createSelectRow("demo.select", options, 0, 3, label)
	return row;
}

function getButtonRow()
{
	const options = [
		{style:ButtonStyle.Primary, emoji:"☑️", custom_id:"demo.bluecheck"},	
		{style:ButtonStyle.Success, emoji:"✅", custom_id:"demo.greencheck"},
		{style:ButtonStyle.Danger, emoji:"❌", custom_id:"demo.redx"},
		{style:ButtonStyle.Secondary, emoji:"✖️", custom_id:"demo.grayx"},
//		{style:ButtonStyle.Secondary, emoji:"<:silverrose:699470814356963418>", custom_id:"demo.customemoji"},
		{style:ButtonStyle.Secondary, emoji:"🔒", custom_id:"demo.locked", disabled:true}
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

	let embed = new EmbedBuilder();
		embed.setTitle("Interaction Demo");
		embed.setDescription("Demo buttons & select box");

	const buttons = getButtonRow()
	const select = getSelectRow()
	const rows = [buttons,select]
	await interaction.reply({embeds:[embed], components: rows})

	// const modal = await Prompt.createModal();
	// console.log(modal)
	// interaction.showModal(modal)
}

async function run(client, message, command, args)
{
}

async function button(interaction)
{
	await interaction.reply({content:`Handling: ${interaction.customId}`, 
							 ephemeral: true})
}

async function select(interaction)
{
	// console.log(interaction)
	await interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, 
							 ephemeral: true})
}

const data = new SlashCommandBuilder()
	.setName('demo')
	.setDescription('Demo Features')
	.setDefaultPermission(false)	
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))

const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole	
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
	button: button,
	select: select,

	build:config.DEV
};