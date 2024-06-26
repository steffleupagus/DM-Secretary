const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Utils = require(`../../utilities/utilFuncs.js`)
const Avrae = require(`../../utilities/avrae.js`)
const Items = require(`../../database/itemMetaSchema.js`)
const util = require('util')
let cache = null;
let keys = null;

async function execute(interaction)
{
	const ephemeral = true;
	await interaction.deferReply({ephemeral: ephemeral});

//https://sheets.googleapis.com/v4/spreadsheets/1YEPAbZ1gVoLWL1SR5RRvIGhlk2FN61RcrMcuJJ87PxI/values/JSON?key=AIzaSyBDaQj-82W2OYuHLQWLo19IrW1tqVje4dk
	const file = "1YEPAbZ1gVoLWL1SR5RRvIGhlk2FN61RcrMcuJJ87PxI"
	const sheet = "data"
	const gvar = "78965670-9d4b-455c-b44c-59da0255cdce";

	if (null == cache)
	{
		cache = await Avrae.readSpreadsheet(file,sheet)
		keys = cache.shift();
	}
	console.log(keys,"\n",cache.length)

	const records = []
	const gvarData = []
	const numItems = cache.length;
	for (let rIdx = 0; rIdx < numItems; ++rIdx)
	{
		const item = cache[rIdx];
		const record = {};
		for (let field = 0; field < keys.length; ++field)
		{
			const key = keys[field];
			const value = item[field];
			record[key] = value;
		}

		gvarData.push(record.data)
		delete record.data		
		records.push(record)		
	}

	gvarData.unshift(`# ITEMS = load_yaml(get_gvar("${gvar}"))`)	
	Avrae.writeGvar(gvar, gvarData.join("\n"))

	console.log(util.inspect(records, false, null, true /* enable colors */))
	const bulkOps = records.map(item => ({
		updateOne: {
			filter: { 'name': item.name, 'source': item.source },
			update: { $set: item },
			upsert: true
		}
	}));
	const result = await Items.collection.bulkWrite(bulkOps);
	console.log(`Matched: ${result.matchedCount}`);
	console.log(`Modified: ${result.modifiedCount}`);
	console.log(`Upserted: ${result.upsertedCount}`);
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