const {
	SlashCommandBuilder,
	PermissionsBitField,
	EmbedBuilder,
	ButtonStyle
} = require('discord.js')
const CharUtils = require(`../../utilities/charUtils.js`)
const Prompt    = require(`../../utilities/promptUtils.js`)
const Utils     = require(`../../utilities/utilFuncs.js`)
const mod       = process.env.mod || "";
const config    = require(`../../config/${mod}_config.json`);

const ROSTER_DESCRIPTION = `
• Delete character
• Rename character
• Change char->NPC
• Update character level (admin only)
• Add an NPC to DB
• Add char Tuppers
• Add a image, url, desc
`

///
/// Run the slash command
///
async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	const triggeringMember = interaction.member;
	const targetMember  = interaction.options.getMember('user') ?? triggeringMember;
	const selfUpdate = triggeringMember == targetMember;
	const isAdmin = Utils.hasAnyRole(interaction.member, whitelistRoles);

	// if (isAdmin)
	//  	await showAdminMenu(interaction);
	// else
		await showUserMenu(interaction, targetMember);
}

///
/// Show the menu
///
async function showUserMenu(interaction, member=null, char=null)
{
	member = member || interaction.member
	const username = member?.displayName || member?.user?.username || member?.id

	const embed = new EmbedBuilder()
						.setTitle(`Character Roster for ${username}`)
						.setDescription(ROSTER_DESCRIPTION)
	const chars  = CharUtils.charByUser[member?.id] || []
	const fields = [];
	chars.forEach(char => fields.push({name:`__${char.name}__`, value:`*Level:* ${char.level || "NPC"}`}))
	if (fields.length) embed.addFields(fields);
	await interaction.editReply({embeds:[embed]})
}

///
/// Show the menu
///
async function showInteractionMenu(interaction)
{
	// const options = [
	// 	// {style:ButtonStyle.Primary, emoji:"🗺️", label:"Create Table", custom_id:`${data.name}.startTable`},
	// 	// {style:ButtonStyle.Danger, emoji:"✖️", label:"Close Table", custom_id:`${data.name}.closeTable`}
	// ]
	// const buttons = Prompt.createButtonRow(options)
}

///
/// Generic interaction handler
///
async function handleInteraction(interaction)
{
	const isAdmin  = Utils.hasAnyRole(interaction.member, whitelistRoles);
	const customId = interaction.customId;
	const prefix   = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")
	const command = customId.replace(prefix,"");

	switch(command)
	{
	}
}

const data = new SlashCommandBuilder()
	.setName(`roster${config.DEV ? "dev" : ""}`)
	.setDescription('Manage your roster of characters')
	.addUserOption(option => option
		.setName('user')
		.setDescription('Target user. If omitted, defaults to the person running the command')
		.setRequired(false)
	)

const userPermissions = [	PermissionsBitField.Flags.ViewChannel,
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.BuilderRole, config._BuilderRole		];

module.exports =
{
	data: data,
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,
	build:config.DEV //||config.PRODUCTION
};