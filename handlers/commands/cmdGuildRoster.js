const { SlashCommandBuilder, 
	   	SlashCommandStringOption, 
	   	SlashCommandNumberOption,
	    PermissionsBitField } = require('discord.js')
const Embed = require(`../../utilities/EmbedPaginator.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const { SortOrder } = require(`../../utilities/enums.js`)
const GuildUtils = require(`../../utilities/guildUtils.js`);
const CharUtils = require(`../../utilities/charUtils.js`);
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const PermanentRoster = "PermGuildRoster"

////// Gather up data to populate the character prompt / autocomplete
async function getPromptData(user = null, value = null, guild = null, includeAll = true) 
{
	//Use the GuildUtils to grab characters that are part of guilds
	let result = await GuildUtils.getAutoCompleteData(user, value, guild);
	if (includeAll)
		//Use the CharUtils cache to make a list of all the other chars registered to the target user
		result = await CharUtils.getUserCharData(user, value, guild, result);
	return result;
}

////// Handle autocomplete options for the Character field
//Use the CharUtils cache to make a list of all chars registered to the target user 
//Use the GuildUtils to grab characters that aren't 
async function autoComplete(interaction) 
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'character') 
	{
		const roleNames = GuildUtils.GetRoleNames(interaction.guild);
		const value = focusedOption.value.toLowerCase();
		const user = interaction.options.get('user')?.value || interaction.member.id;
		const target = user;

		//let response = await GuildUtils.getAutoCompleteData(user, value);
		let response = await getPromptData(target, value);
		response = Object.keys(response).map(choice => ({ name: choice, value: choice }));

		//Add an "Other" option to the autocomplete list
		response.push({ name: 'NPC / Other Not Listed', value: 'null' });
		//Add menu options to the autocomplete list for owner.
		if (config.OWNERID == user)
		{
			response.push({ name: 'Builder: Perm Guild Roster', value: PermanentRoster });
		}
		await interaction.respond(response.length <= 25 ? response : []);
	}
}

async function execute(interaction)
{
	const member = interaction.options.getUser('user') ?? null;
	const guild = interaction.options.getString('guild') ?? null;
	const char = interaction.options.getString('character') ?? null;
	const rank = interaction.options.getNumber('rank') ?? null;
	showRoster(interaction, member, guild, char, rank)
}

async function showRoster(interaction, member=null, guild=null, char=null, rank=null)
{
	let ephemeral = true

	if (char == PermanentRoster) 
	{
		ephemeral = false
		char = null
	}
	//// TODO - Add a mechanism to show and update an official roster visible permanently in-channel

	if (!interaction.isButton())
		await interaction.deferReply({ephemeral:ephemeral});
	const anyArgs = member || guild || char || rank
	
	//// TODO - This will show ALL guild data when there are no arguments. 
	////	    Uncomment the line below to show ONLY the activating users' roster
	const user = member?.id 
	//const user = anyArgs ? member?.id || null : interaction.member.id;

	//Construct a query from the arguments
	let argStr = ''
	let query = {};
	if (guild) query.guild = guild
	if (user) query.user = user
	if (char) query.char = char
	if (rank) 
	{
		query.rank = rank

		let _rank = GuildUtils.rankData[rank];
		if (guild)
			_rank = GuildUtils.guildData[guild].ranks[rank] 
		_rank = interaction.guild.roles.resolve(_rank).name
		argStr += ` ${_rank}`
	}
	else argStr += guild ? ` ${guild}` : ''
	argStr += user ? ` ${member.nickname || member.user.tag}` : ''	
	argStr += char ? ` ${char}` : ''	

	//Get the roster data from the query and hierarchically sort it
	let rosterData = await GuildUtils.GetRosterData(query, true);
	// console.log(rosterData);
	rosterData = rosterData.raw

	keys = {
		"guild":SortOrder.ASC,
		"rank":SortOrder.DESC,
		"char":SortOrder.ASC
	};
	rosterData.sort((a,b)=>{ return Utils.priorityCompare(a, b, keys) })
	//console.log(rosterData);

	//Group the data by an appropriate key
	let groupKey = "guild";
	if (guild) groupKey = "rank";
	if (member) groupKey = "char";
	
	rosterData = Utils.groupBy(rosterData, groupKey);
	//console.log(rosterData);

	//Generate the output
	let embed = new Embed();
	embed.setTitle(`Guild Roster:${argStr}`)
	// if (guild && GuildUtils.guildData[guild].image) 
	// 	embed.setThumbnail(GuildUtils.guildData[guild].image);
	embed.setFooter({text:`/guildroster${argStr}`})

	groupKeys = Object.keys(rosterData);
	groupKeys.sort((a,b)=> { return Utils.sortDir(a, b, keys[groupKey]); })
	groupKeys.forEach(key => {
		let inline = false;
		let field = '';
		if (groupKey == "rank")
		{
			field = GuildUtils.guildData[guild].ranks[key]
			field = interaction.guild.roles.resolve(field).name
		}
		else if (groupKey == "char")
			field = key
		else
			field = GuildUtils.guildData[key].emoji + " " + key
		embed.addField(field, '', inline);
		let lastRank = '';
		rosterData[key].forEach(item => {
			let rank = GuildUtils.guildData[item.guild].ranks[item.rank]
			let content = ''
			if (groupKey == "char")
				content += `${GuildUtils.guildData[item.guild].emoji} <@&${GuildUtils.guildData[item.guild].ranks[0]}>`
			content += `<@&${rank}> `
			if (groupKey != "char")			
				content += `${item.char}`
			content += user ? "" : ` (<@${item.user}>)`
			embed.extendField(content);
		})
	})
	
	let embeds = embed.embeds();
	if (!ephemeral)
		await interaction.editReply({content: `Roster for \`${argStr.trim()}\``});	

	if (interaction.isButton())
	{
		let embed = embeds.shift();
		await interaction.update({embeds:[embed], ephemeral: ephemeral})		
	}

	Utils.asyncArrayForEach(embeds, async embed => {
		if (ephemeral)
			await interaction.followUp({embeds:[embed], ephemeral: ephemeral})
		else
			await interaction.channel.send({embeds:[embed]})
	})
}

///
async function button(interaction)
{
	const memberId = interaction.member.id;
	const customId = interaction.customId.replace(`${data.name}.`,'');
	switch(customId)
	{
		case "Arcanum":
		case "Black Hand":
		case "Faith Council":
		case "Guardians":
		case "Outriders":
		case "Silver Thorn":
			await showRoster(interaction, null, customId)
			break;
		case "personalRoster":
			await showRoster(interaction, interaction.member)
			break;
		default:
			throw `Button (customId: ${customId}) is not implemented.`
			break;
	}
}











const guildOption = new SlashCommandStringOption()
		.setName('guild')
		.setDescription('Filter by guild')
		.setRequired(false)
		.addChoices(
			{ name: 'Arcanum', value: 'Arcanum' },
			{ name: 'Black Hand', value: 'Black Hand' },
			{ name: 'Faith Council', value: 'Faith Council' },
			{ name: 'Guardians', value: 'Guardians' },
			{ name: 'Outriders', value: 'Outriders' },
			{ name: 'Silver Thorn', value: 'Silver Thorn' },
		)
const rankOption = new SlashCommandNumberOption()
		.setName('rank')
		.setDescription('Filter by guild rank')
		.setRequired(false)
		.addChoices(
			{ name: '1: Recruit', value: 1 },
			{ name: '2: Initiate', value: 2 },
			{ name: '3: Member', value: 3 },
			{ name: '4: Council', value: 4 },
			{ name: '5: Leader', value: 5 },
		)

const data = new SlashCommandBuilder()
	.setName('guildroster')
	.setDescription('Various lookups in the guild database')
	.addStringOption(guildOption)
	.addNumberOption(rankOption)
	.addUserOption(option => option
		.setName('user')
		.setDescription('Filter by user')
		.setRequired(false)
  	)
	.addStringOption(option => option
		.setName('character')
		.setDescription('Filter by character name')
		.setRequired(false)
		.setAutocomplete(true)
  	)

const userPermissions = [	PermissionsBitField.Flags.SendMessages	];
module.exports = 
{
	data: data,
	// whitelistRoles: [ config.BuilderRole, config._BuilderRole ],
	userPermissions: userPermissions,
	execute: execute,
	autoComplete: autoComplete,
	//message: run,
	button: button,
	// select: select,

	build: config.PRODUCTION// || config.DEV
};