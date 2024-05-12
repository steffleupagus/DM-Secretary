const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Utils = require(`../../utilities/utilFuncs.js`)
const Avrae = require(`../../utilities/avrae.js`)

let cache = null;

async function execute(interaction)
{
	const ephemeral = true;
	await interaction.deferReply({ephemeral: ephemeral});

//https://sheets.googleapis.com/v4/spreadsheets/1YEPAbZ1gVoLWL1SR5RRvIGhlk2FN61RcrMcuJJ87PxI/values/JSON?key=AIzaSyBDaQj-82W2OYuHLQWLo19IrW1tqVje4dk
	const file = "1YEPAbZ1gVoLWL1SR5RRvIGhlk2FN61RcrMcuJJ87PxI"
	if (null == cache)
		cache = await Avrae.readSpreadsheet(file)

	const fields = 
	
	console.log(cache)
}

async function run(client, message, command, args){}
const data = new SlashCommandBuilder()
	.setName('refreshitems')
	.setDescription('Refresh the items gvar and database from JSON data imported from the google doc')
	.setDefaultPermission(false)

const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [ config.role.Builder ],
	userPermissions: userPermissions,
	execute: execute,
	message: run,

	build:config.DEV
};