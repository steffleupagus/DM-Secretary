const { SlashCommandBuilder, SlashCommandStringOption, ChannelType, ButtonStyle,
	   	EmbedBuilder, PermissionsBitField } = require('discord.js')
const GuildUtils = require(`../../utilities/guildUtils.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`)
const AreaMeta = require(`../../database/areaMetaSchema.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const defaultAreaMeta = { }

async function updateDBRecord(area, areaMeta) {
	if (!area) return;
	let record;
	let query = { name: area }
	let update = { $set: {} }
	const options = { new: true, upsert: true }

	//Rename if necessary
	if (areaMeta.name && areaMeta.name != area)
		update["$set"].name = areaMeta.name
	if (areaMeta.catId)
		update["$set"].catId = areaMeta.catId
	if (areaMeta.roleId)
		update["$addToSet"] = { "roleId":areaMeta.roleId }
	if (areaMeta.icon)
		update["$set"].icon = areaMeta.icon
	if (areaMeta.guild)
		update["$set"].guild = areaMeta.guild
	if (areaMeta.hasOwnProperty('disable'))
		update["$set"].disable = areaMeta.disable

	if (update["$set"] != {}) {
		record = await AreaMeta.findOneAndUpdate(query, update, options);
	}
	return record
}

async function execute(interaction) {
	await interaction.deferReply({ephemeral:true})

	const area 	   	= interaction.options.getString('area');
	const category 	= interaction.options.getChannel('category') ?? null;
	const role     	= interaction.options.getRole('role') ?? null;
	const icon 		= interaction.options.getString('icon') ?? null;
	const guild 	= interaction.options.getString('guild') ?? null;
	const disable	= interaction.options.getBoolean('disable') ?? false;

	const areaMeta = {
		name: 	area,
		catId:	category?.id,
		roleId:	role?.id,
		icon:	icon,
		guild:	guild,
		disable:disable
	}
	const record = await updateDBRecord(area, areaMeta)
	console.log(record);

	let embed = generateMetaEmbed(record)
	interaction.editReply({embeds:[embed]})
}

function generateMetaEmbed(areaMeta) {
	const embed = new EmbedBuilder().setTitle("Area Meta")
	if (areaMeta)
	{
		const icon = areaMeta.icon || ""
		const name = `${icon}  ${areaMeta.name}`.trim()

		embed.addFields([{name:name, value:`\`${"".padEnd(1000," ")}\``}]);
		embed.addFields([{name:"Category", value:`<#${areaMeta.catId}> (\`${areaMeta.catId}\`)`}]);

		const hasLocations = areaMeta.roleId.length > 0
		const locationRoles = "<@&" + areaMeta.roleId.join(">\n<@&") + ">"
		embed.addFields([{name:"Locations", value: hasLocations ? locationRoles : "*None*", inline: true}])

		const guild      = areaMeta.guild
		const guildEmoji = guild ? GuildUtils?.guildData[guild]?.emoji : null;
		const guildValue = guild ? {name:"Guild",value:`${guildEmoji}${guild}`} : {name:"Guild",value:`*None*`,inline:true}
		if (guildValue) embed.addFields([guildValue])

		const disable	 = areaMeta.disable
		if (disable) embed.addFields([{name:"Status", value:"**Disabled**",inline:true}])

		embed.setFooter({text:areaMeta.name})
	}
	else embed.setDescription("No area meta data available")
	return embed;
}


async function handleInteraction(interaction)
{
}

const guildOption = new SlashCommandStringOption()
	.setName('guild')
	.setDescription('Add which guild owns this channel')
	.setRequired(false)
	.addChoices(
		{ name: 'Arcanum', value: 'Arcanum' },
		{ name: 'Black Hand', value: 'Black Hand' },
		{ name: 'Faith Council', value: 'Faith Council' },
		{ name: 'Guardians', value: 'Guardians' },
		{ name: 'Outriders', value: 'Outriders' },
		{ name: 'Silver Thorn', value: 'Silver Thorn' }
	);

const data = new SlashCommandBuilder()
	.setName(`areameta${config.DEV ? "dev" : ""}`)
	.setDescription('Modify area metadata')
	.setDefaultPermission(false)

	.addStringOption(option => option.setName('area').setDescription('Name of the area')
									  .setRequired(true).setAutocomplete(true))
	.addChannelOption(option => option.setName('category').setDescription('Channel Category')
									  .setRequired(false).addChannelTypes(ChannelType.GuildCategory))
	.addRoleOption(option => option.setName('role').setDescription('Location Role').setRequired(false))
	.addStringOption(option => option.setName('icon').setDescription('Location Emoji').setRequired(false))
	.addStringOption(guildOption)
	.addBooleanOption(option => option.setName('disable').setDescription('Disable the location').setRequired(false))

const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.role.Builder	];

module.exports =
{
	data: data,
	whitelistRoles: whitelistRoles,
	userPermissions: userPermissions,
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,
	autoComplete: autoComplete,

	build:config.PRODUCTION || config.DEV
};


let areaCache = null;
async function refreshCache() {
	areaCache = await AreaMeta.find({});
}

////// Handle autocomplete options for the location field
async function autoComplete(interaction) {
	if (null == areaCache) await refreshCache()

	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'area') {
		const value = focusedOption.value.toLowerCase();
		let response = [];
		response = areaCache.filter(x => x.catId == interaction.channel.parent.id ||
										 (value.length > 0 && x.name.toLowerCase().includes(value)));
		response = response.map(x => ({name:x.name, value:x.name}))

		try {
			response = response.length <= 25 ? response : response.splice(0,25)
			interaction.respond(response);
		}
		catch (e) {}
	}
}