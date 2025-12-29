const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, MessageFlags } = require('discord.js')
const mod       = process.env.mod || "";
const config    = require(`../../config/${mod}_config.json`);
const Utils     = require(`../../utilities/utilFuncs.js`)
const Embed     = require(`../../utilities/EmbedPaginator.js`)
const Profile   = require(`../../utilities/profileUtils.js`)
const CharMeta  = require(`../../database/charMetaSchema.js`)
const CharUtils = require(`../../utilities/charUtils.js`)
const Prompt    = require(`../../utilities/promptUtils.js`)
const Log		= require(`../../utilities/loggerUtils.js`)
const StrComp   = require("string-similarity");
const util 		= require("util")
const URLRegex  = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi

/// Run the slash command
async function execute(interaction) {
	console.log('\n'.repeat(69))
	await interaction.deferReply({flags:MessageFlags.Ephemeral})
	const batch = await Profile.batchProfiles(interaction);
	const logProfiles = interaction.options.getBoolean('logprofiles') ?? true;
	if (logProfiles) await Log.FILE("./data/profileData.json", batch)

	const data = GenerateDemographics(interaction, batch.charRecords)
	await Log.FILE("./data/demographics.json", data)
	await interaction.editReply({content:"Done"})
}

function GenerateDemographics(interaction, charRecords)
{
	const fieldOptions =
	{
		"race":
		{
			"aarakocra":/aarakocra/ig,
			"aasimar":/(aasimi?ar|assimar)/ig,
			"autognome":/autognome/ig,
			"bugbear":/bugbear/ig,
			"centaur":/centaur/ig,
			"changeling":/change?ling/ig,
			"custom linage":/custom ?(?:line?age|race)?/ig,
			"dhampir":/(dhampir|dampire|dhampire|drampire)/ig,
			"dragonborn":/dragonborn/ig,
			"dwarf":/(dwarf|duergar)/ig,
			"elf":/(elf|eladrin|\b[^\-]elf\b|shadar\-? ?kai|elven|drow)/ig,
			"fairy":/fairy/ig,
			"firbolg":/firbolg/ig,
			"genasi":/(genasi|gensai)/ig,
			"gith":/gith.*/ig,
			"gnome":/gnome/ig,
			"goblin":/(goblii?n|gobb?o)/ig,
			"goliath":/goliath/ig,
			"grung":/grung/ig,
			"hadozee":/hadozee/ig,
			"half\-elf":/half\-? ?.*(elf|elven)/ig,
			"half\-orc":/half\-? ?orc/ig,
			"halfling":/halfling/ig,
			"harengon":/(rabbitfolk|haren?gon|herengon)/ig,
			"hexblood":/hexblood/ig,
			"hobgoblin":/hobgoblin/ig,
			"human":/(human|hooman)/ig,
			"kalashtar":/(kalashtar|kalashstar)/ig,
			"kenku":/kenku/ig,
			"kobold":/kobold/ig,
			"leonin":/leonin/ig,
			"lizardfolk":/lizard\-?folk/ig,
			"loxodon":/loxodon/ig,
			"minotaur":/(minotaur|minotuar|minitour)/ig,
			"orc":/or[ck]/ig,
			"owlin":/owlin/ig,
			"plasmoid":/plasmoid/ig,
			"reborn":/reborn/ig,
			"satyr":/satyr/ig,
			"shifter":/shifter/ig,
			"tabaxi":/tabaxi/ig,
			"tiefling":/tiefling/ig,
			"tortle":/tortle/ig,
			"triton":/triton/ig,
			"warforged":/warforged/ig,
			"yuan-ti":/(yuan-? ?ti|pure ?\-?blood)/ig,
		},
		"class":
		{
			"artificer":/\b(arti(fie?cer)?|alchemist|battle ?smith)\b/ig,
			"barbarian":/\b(barb(arian)?|zealot)\b/ig,
			"bard":/\b(bard)(lock)?\b/ig,
			"bloodhunter":/\bblood\-? ?hunter\b/ig,
			"cleric":/\b(cleric|priest)\b/ig,
			"druid":/\b((arch)?druid|circle)\b/ig,
			"fighter":/\b(fighter|battlemaster|echo|knight|echoknight|psi\-? ?warrior)\b/ig,
			"monk":/\b(monk|drunken)\b/ig,
			"paladin":/\b(pal|sorc)?(a?din|idan)\b/ig,
			"ranger":/\b(ranger|gloomstalker|drake ?warden)\b/ig,
			"rogue":/\b(rogue|rouge|arcane trickster|inquisitive|thief|swashbuckler)\b/ig,
			"sorceror":/\b(sorc?(eror|erer|lock|e?r?eress)?|wild Magic)\b/ig,
			"warlock":/\b((sor|war|bard)?lock|hex.*)\b/ig,
			"wizard":/\b(wiz(ard)?)\b/ig
		},
		"gender":
		{
			"female":/\b(?:cis|demi|trans)?(feminine|femal[es]|fem|femme|f|woman|girl|she|her|mtf)s?\b/ig,
			"male":/\b(?:cis|demi|trans)?(male|m|he|him|ftm|masc|man)s?\b/ig,
			"femboy":/\bfem-?boy\b/ig,
			"nonbinary":/\b(agender|non\-? ?binary|none|they|them|none?|nope|n|enby\/a)\b/ig,
			"intersex":/\b(futa(?:nari)?|inter(?:sex)?|herm.*)\b/ig,
			"fluid":/\b((?:gender)?\-? ?fluid|any|all|changes?|changing|pangender|varies|ooze|yes|\?+)\b/ig
		}
	}
	const npcFieldOptions = {
		"race":
		{
			"celestial":/(angel|celestial|solar)/ig,
			"dragon":/(dragon\b|(great)? ?wyrm)/ig,
			"fiend":/(arcanaloth|fiend|devil(?!.*tiefling)|demon|daemon|demoness|demonic|hell\-? ?hound)/ig,
			"succubus":/succubus/ig,
			"illithid":/(mind flayer|illithid)/ig,
			"mimic":/mimic/ig,
			"drider":/drider/ig,
			"eldritch":/eldritch/ig,
			"aberration":/aberration/ig,
			"fey":/\b(fae|fey|fairy|pixie)\b/ig,
			"ooze":/(ooze|slime)/ig,
			"spirit":/spirit/ig,
			"ghost":/ghost/ig,
			"lich":/lich/ig,
			"lamia":/lamia/ig,
			"medusa":/(medusa|gorgon)/ig,
			"kitsune":/kitsune/ig,
			"gnoll":/gnoll/ig,
			"were-":/\b(were\-?.*)/ig,
			"harpy":/harpy/ig,
			"insectoid":/\b(moth|bee|thri\-kreen)/ig,
			"kemonomimi":/kemonomimi/ig
		}
	}
	const fields = Object.keys(fieldOptions)

	const demographics = {}
	const unknown = {}
	charRecords.forEach( data => {
		type = data.type
		demographics[type] = demographics[type] || {}
		unknown[type] = unknown[type] || {}

		fields.forEach( field => {
			demographics[type][field] = demographics[type][field] || {}
			if (data[field])
			{
				//demographics[type][field]['total'] = (demographics[type][field]['total'] || 0) + 1
				const value = data[field].toLowerCase();
				const fieldRegex = {...fieldOptions[field], ...(type == "NPC" ? npcFieldOptions[field] : {})}
				const options = Object.keys(fieldRegex)
				if (options && options.length > 0)
				{
					let match = false;
					options.forEach(option =>
					{
						const regex = fieldRegex[option]
						if (value.match(regex))
						{
							match = true
							demographics[type][field][option] = (demographics[type][field][option] || 0) + 1
							//console.log(`Matched ${field}: ${value} => ${option}`)
						}
					})
					if (!match)
					{
						option = "other/unknown"
						//console.log(`Unknown ${field}: ${value}`)
						demographics[type][field][option] = (demographics[type][field][option] || 0) + 1

						unknown[type][field] = unknown[type][field] || {}
						unknown[type][field][data.url] = value
					}
				}
				else
				{
					demographics[type][field][value] = (demographics[type][field][value] || 0) + 1
				}
			}
		})
	})

	//Post-process demographic data -
	const mergeLimit = interaction.options.getInteger('mergelimit') ?? 4;
	const maxKeys = 24;
	const unk = "other/unknown"
	const types = ["PC","NPC"]
	types.forEach(type => {
		fields.forEach(field => {
			const keys = Object.keys(demographics[type][field])

			// //Dynamically merge smallest records into "Other" field
			// const entries = Object.entries(demographics[type][field]);
			// entries.sort((a,b) => b[1] - a[1])
			// if (entries.length > maxKeys) console.log(entries)

			const updated = keys.sort().reduce((obj,key) => {
				if (mergeLimit && demographics[type][field][key] <= mergeLimit)
					obj[unk] = (obj[unk] || 0) + demographics[type][field][key];
				else
					obj[key] = (obj[key] || 0) + demographics[type][field][key];
				return obj
			}, {});
			demographics[type][field] = {...updated}
		})
	})

	const logUnknown = interaction.options.getBoolean('logunknown') ?? false;
	if (logUnknown) demographics.unknown = unknown

	return demographics
}

const data = new SlashCommandBuilder()
	.setName(`demographics${config.DEV ? "dev" : ""}`)
	.setDescription('Parse all the profiles and output demographic data')
	.addIntegerOption(option => option
		.setName('mergelimit').setRequired(false)
		.setDescription('Merge items below this limit into `Other`')
	)
	.addBooleanOption(option => option
		.setName('logprofiles').setRequired(false)
		.setDescription('Log Profiles')
	)
	.addBooleanOption(option => option
		.setName('logunknown').setRequired(false)
		.setDescription('Log Unknown')
	)

const userPermissions = [	PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages	];
const whitelistRoles  = [	config.role.Builder	];

module.exports =
{
	data: data,
	whitelistRoles: whitelistRoles,
	botPermissions: userPermissions,
	execute: execute,

	build:config.DEV //||config.PRODUCTION
};