const { SlashCommandBuilder, SlashCommandStringOption, SlashCommandNumberOption, 
	EmbedBuilder, MessageFlags, PermissionsBitField } = require('discord.js')
const CharUtils = require(`../../utilities/charUtils.js`);
const LevelUtils = require(`../../utilities/levelUtils.js`)
//const Log = require(`../../utilities/loggerUtils.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(interaction)
{
	const user = interaction.options.getMember('user')?.id ?? null;
	const name = interaction.options.getString('name')?.trim() ?? null;
	const level = interaction.options.getNumber('level') ?? 3;
	const clean = interaction.options.getBoolean('delete') ?? false;
	let content = ''
	if (user && name) {
		if (clean) {
			const update = await LevelUtils.PurgeChar({user,name})
			content = `Purged \`${update?.name||name}\` (<@${update?.user||user}>)`
		}
		else {
			const update = await LevelUtils.updateLevelData({user, name}, level);
//			Log.DEBUG(update)
			content = `Updated \`${name}\` (<@${user}>) to level \`${level}\``
		}
		await interaction.reply({content, flags:MessageFlags.Ephemeral})
	}
	CharUtils.RefreshCache();
}

////// Handle autocomplete options for the Character field
//Use the CharUtils cache to make a list of all chars registered to the target user 
//Use the GuildUtils to grab characters that aren't 
async function autoComplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'name')	{
		const value = focusedOption.value.toLowerCase();
		const user = interaction.options.get('user')?.value || interaction.member.id;
		let response = CharUtils.getUserCharData(user, value);
		response = Object.keys(response).map(choice => ({ name: choice, value: choice }));
		await interaction.respond(response.length <= 25 ? response : []);
	}
}

const data = new SlashCommandBuilder()
.setName(`charmeta${config.DEV ? "dev" : ""}`)
.setDescription('Add a character to the levels database')
.addUserOption(option => option
	.setName('user')
	.setDescription('Apply to a specific user')
	.setRequired(true)
)
.addStringOption(option => option
	.setName('name')
	.setDescription('Character name')
	.setRequired(true)
	.setAutocomplete(true)
)
.addNumberOption(option => option
	.setName('level')
	.setDescription('Character level')
	.setRequired(false)
)
.addBooleanOption(option => option
	.setName('delete')
	.setDescription('Delete the character')
	.setRequired(false)
)

const userPermissions = [	PermissionsBitField.Flags.SendMessages	];
module.exports = {
	data: data,
	userPermissions: userPermissions,
	execute: execute,
	autoComplete: autoComplete,
	build: config.PRODUCTION || config.DEV
};
if (config.DEV) module.exports.aliases = ["charmeta"]