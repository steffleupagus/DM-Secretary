const { SlashCommandBuilder,
		EmbedBuilder,
		MessageFlags,
		PermissionsBitField,

		AttachmentBuilder,
		ContainerBuilder,
		FileBuilder,
		SectionBuilder,
		TextDisplayBuilder,
		UserSelectMenuBuilder,

		ButtonStyle } = require('discord.js')
const Prompt = require(`../../utilities/promptUtils.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const ephemeral = {flags:MessageFlags.Ephemeral};

function getSelectRow() {
	const id = "demo.locations"
	const label = "●▬▬▬▬▬ 𝕷𝖔𝖈𝖆𝖙𝖎𝖔𝖓𝖘 ▬▬▬▬▬●"
	let options = ["City Square","Administrative District","Entertainment District","Colosseum","Silver Thorn Brothel","Residential Quarter","Ample Ogre Inn","Manticore's Dream Tavern","Veluthe Oro Gardens","Mercantile Quarter","Cyu'unt Restaurant","Sewer","Slum","City Dock","Outside Blessed Gate","Outside Cursed Gate","Wilderness","Arcanum Tower","Temple District","Den of Iniquity","Gladiators Guard Barracks"];
	for (let i=0; i < options.length; ++i)
	{
		options[i] = Prompt.createSelectOption(	`Label: ${options[i]}`, 
												`Desc: Description for ${options[i]}`,
												options[i]);
	}
	const row = Prompt.createSelectRow("demo.select", options, 0, 3, label)
	return row;
}
function getButtonRow() {
	const options = [
		{style:ButtonStyle.Primary, emoji:"☑️", custom_id:"demo.bluecheck"},
		{style:ButtonStyle.Success, emoji:"✅", custom_id:"demo.greencheck"},
		{style:ButtonStyle.Danger, emoji:"❌", custom_id:"demo.redx"},
		{style:ButtonStyle.Secondary, emoji:"✖️", custom_id:"demo.grayx"},
		{style:ButtonStyle.Secondary, emoji:"🔒", custom_id:"demo.locked", disabled:true}
	]
	const row = Prompt.createButtonRow(options)
	return row;
}
async function TestComponentEmbed(interaction) {
	let embed = new EmbedBuilder();
		embed.setTitle("Interaction Demo");
		embed.setDescription("Demo buttons & select box");
	const buttons = getButtonRow()
	const select = getSelectRow()

	const file = new AttachmentBuilder('data/sceneData.json');

	const rows = [buttons,select]
	await interaction.reply({embeds:[embed], files:[file], components: rows, ...ephemeral})
}
async function TestModal(interaction) {
	const modal = await Prompt.createModal();
	console.log(modal)
	interaction.showModal(modal)
}

async function TestComponentV2(interaction, update = false)
{
	const content = `This text is inside a Text Display component! ` + 
					`You can use **any __markdown__** available inside this component too.`;
	const file = new AttachmentBuilder('data/duelData.json');
	const exampleFile = new FileBuilder().setURL('attachment://duelData.json');

	const exampleTextDisplay = new TextDisplayBuilder().setContent(content);
	const exampleSection = new SectionBuilder()
	.addTextDisplayComponents(
		(textDisplay) => textDisplay.setContent(content),
		(textDisplay) => textDisplay.setContent('Using a section, you may only use up to three Text Display components.'),
		(textDisplay) => textDisplay.setContent('And you can place one button or one thumbnail component next to it!'),
	)
	.setButtonAccessory((button) =>
		button.setCustomId('showContainer').setLabel('Button inside a Section').setStyle(ButtonStyle.Primary),
	);

	const reply = { components: [exampleSection], files: [file],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
	await (update ? interaction.update(reply) : interaction.reply(reply));
}

async function EditComponentV2(interaction)
{
	const content = `This text is inside a Text Display component! ` + 
	`You can use **any __markdown__** available inside this component too.`;

	const file = new AttachmentBuilder('data/sceneData.json');
	const exampleFile = new FileBuilder().setURL('attachment://sceneData.json');

	const exampleContainer = new ContainerBuilder()
	.setAccentColor(0x0099ff)
	.addTextDisplayComponents((textDisplay) => textDisplay.setContent(content))
	.addActionRowComponents((actionRow) =>
		actionRow.setComponents(new UserSelectMenuBuilder().setCustomId('exampleSelect').setPlaceholder('Select users')),
	)
	.addSeparatorComponents((separator) => separator)
	.addSectionComponents((section) =>
		section
			.addTextDisplayComponents(
				(textDisplay) => textDisplay.setContent(content),
				(textDisplay) => textDisplay.setContent('And you can place one button or one thumbnail component next to it!'),
			)
			.setButtonAccessory((button) =>
				button.setCustomId('showSimple').setLabel('Button inside a Section').setStyle(ButtonStyle.Primary),
			),
	);

	await interaction.update({
		components: [exampleContainer],
		files: [file],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});
}

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const messageId = interaction.targetId;

	//// Test Component Embed
	if (false) await TestComponentEmbed(interaction);

	//// Test modal
	if (false) await TestModal(interaction);

	if (false) await TestComponentV2(interaction);
}

async function button(interaction)
{
	if (interaction.customId == "showContainer")
	{
		return EditComponentV2(interaction)
	}
	else if (interaction.customId == "showSimple")
	{
		return TestComponentV2(interaction, true)
	}

	await interaction.reply({content:`Handling: ${interaction.customId}`,
							...ephemeral})
}

async function select(interaction)
{
	// console.log(interaction)
	await interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`,
							...ephemeral})
}

const data = new SlashCommandBuilder()
	.setName('demo')
	.setDescription('Demo Features')

const userPermissions = [	PermissionsBitField.Flags.SendMessages	];
module.exports =
{
	data: data,
	whitelistRoles: [
		config.role.Builder
	],
	userPermissions: userPermissions,
	execute: execute,
	button: button,
	select: select,

	build:config.DEV
};