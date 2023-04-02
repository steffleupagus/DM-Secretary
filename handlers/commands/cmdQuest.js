const { SlashCommandBuilder,
	    SlashCommandStringOption, 
	    EmbedBuilder,
	    PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Embed = require(`../../utilities/EmbedPaginator.js`);
const CharUtils = require(`../../utilities/charUtils.js`);
const Utils = require(`../../utilities/utilFuncs.js`)
const quest = require(`../../database/questSchema.js`)
const util = require('util')

const guildEmoji = {
    "Arcanum":"🔮",
    "Black Hand":"🧤",
    "Faith Council":"🕯️",
    "Guardian":"⚔️",
    "Outrider":"🍃",
    "Silver Thorn":"<:silverrose:699470814356963418>",
	"Unaligned":"👤"
}

async function execute(interaction)
{
	const ephemeral = true;
	await interaction.deferReply({ephemeral: ephemeral});

	// Gather necessary data (or defaults) from the command
	const global  = interaction.options.getBoolean('global') || false;
	const channel = global ? null : interaction.channel;
	const chan    = interaction.options.getChannel('chan') || channel;
	const user    = interaction.options.getMember('user') ?? null;
	const char    = interaction.options.getString('character') ?? null;
	const type    = interaction.options.getString('type') ?? null; 
	const guild   = interaction.options.getString('guild') ?? null; 

	const query = {
		...(chan && { chan: chan.id }),
		...(user && { user: user }),
		...(char && { char: char })
	}

	console.log(query)
	let questData = await quest.find(query)
	questData = questData.map( record => 
	{
		const newRecord = { chan: record.chan, user: record.user, char: record.char };
		if (!type || type == "Damage") newRecord.damage = { count:record.damage.count, total:record.damage.total }; 
		if (!type || type == "Healing") newRecord.healing = { count:record.healing.count, total:record.healing.total }; 
		if (!type || type.startsWith("Skill"))
		{
			newRecord.skills = [];
			record.skills.forEach( x => {
				if (!type || type.includes(x.skill)) newRecord.skills.push( { skill: x.skill, count: x.count, total: x.total } )
			})
			if (newRecord.skills.length == 0) delete newRecord.skills
		}
		newRecord.guilds = [];
		record.guilds.forEach( x=> {
			let guildRecord = { guild: x.guild, count: x.count }			
			if (!type || type == "Damage") guildRecord.damage = x.damage
			if (!type || type == "Healing") guildRecord.healing = x.healing
			if (!type || type.startsWith("Skill")) guildRecord.skill = x.skill
			if (!guild || guild == x.guild) newRecord.guilds.push( guildRecord )
		})
		if (newRecord.guilds.length == 0) delete newRecord.guilds		

		return newRecord;
	}).filter( record => 
	{
		let include = true;
		if (guild) include = include && record?.guilds?.find( x => x.guild == guild);
		if (type == "Damage") include = include && (record.damage.total > 0 && record.damage.count > 0)
		if (type == "Healing") include = include && (record.healing.total > 0 && record.healing.count > 0)
		if (type && type.startsWith("Skill")) include = include && record.skills && record.skills.length > 0
		if (type && type.startsWith("Skill|"))
		{
			skill = type.replace("Skill|","");
			include = include && record?.skills?.find( x => x.skill == skill && x.total > 0 )
		}		
		return include;		
	})

	console.log(util.inspect(questData, false, null, true /* enable colors */))

	
	let	embed = null;
		embed = new EmbedBuilder()	
	interaction.editReply({embeds:[embed]})

	ShowByGuild(interaction, questData)

//guild
		// { name: 'Arcanum', value: 'Arcanum' },
		// { name: 'Black Hand', value: 'Black Hand' },
		// { name: 'Faith Council', value: 'Faith Council' },
		// { name: 'Guardians', value: 'Guardians' },
		// { name: 'Outriders', value: 'Outriders' },
		// { name: 'Silver Thorn', value: 'Silver Thorn' },
		// { name: 'Unaligned', value: 'Unaligned' }
//user
//character
//channel
//global






	
	// //Generate the output
	// let embed = new Embed();
	// embed.setTitle(`Name Match`)
	// for (let c = 0; c < channels.size; ++c)
	// {
	// 	embed.addField(`${channel.name}`, `<#${channel.id}>`);
	// 	activeThreads.threads.each(thread =>
	// 	{
	// 		embed.extendField(`Active: <#${thread.id}>`);
	// 	})
	// 	archivedThreads.threads.each(thread =>
	// 	{
	// 		embed.extendField(`Archive: <#${thread.id}> [#${thread.name}](${thread.url})`);
	// 	})
	// }

	// let embeds = embed.embeds();
	//      embed = embeds.shift();
	// await interaction.editReply({embeds:[embed], ephemeral: true})
	// Utils.asyncArrayForEach(embeds, async embed => {
	// 	await interaction.followUp({embeds:[embed], ephemeral: true})
	// })	
}

async function ShowByGuild(interaction, data)
{
	const lineLen = 69
	const totalLen = 6
	const nameLen = lineLen - totalLen
	const pad = '.'
	Utils.asyncArrayForEach(guildOption.choices, async (guild) => {
		guild = guild.name
		let embed = new EmbedBuilder()
			embed.setTitle(`${guildEmoji[guild]} ${guild}`)

		let title = `\`${"Name".padEnd(nameLen,pad)}${"Total".padStart(totalLen,pad)}\``
		let value = data.map( record => {
							let n = record.char.padEnd(nameLen,pad);
							let g = record.guilds?.find( x=> x.guild == guild)	
							if (!g) return null
							let t = g.damage + g.skill - g.healing
								t = t.toString().padStart(totalLen,pad)
							return `\`${n}${t}\``;
						})
						.filter(record => record)
		if (value.length > 0)
		{
			console.log(title, value);		
			embed.addFields({name:title,value:value.join('\n')})
			await interaction.followUp({embeds:[embed],ephemeral:true})
		}
	})
}

async function ShowByType(interaction, data)
{
	
}







////// Gather up data to populate the character prompt / autocomplete
async function getPromptData(user = null, value = null, guild = null) 
{
	let result = await CharUtils.getUserCharData(user, value, guild);
	return result;
}

////// Handle autocomplete options for the Character field
async function autoComplete(interaction) 
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'character') 
	{
		const value = focusedOption.value.toLowerCase();
		const user = interaction.member.id;
		const target = interaction.options.get('user') ?.value || null;
		const guild = interaction.options.get('guild') ?.value || null;

		//let response = await GuildUtils.getAutoCompleteData(user, value);
		let response = await getPromptData(target, value, guild);
		console.log(response)
		response = Object.entries(response).map(([choice,details]) => 
		({
			name: `${choice} ${details ? '('+details+')' : ""}`,
			value: choice
		}));
		await interaction.respond(response.length <= 25 ? response : []);
	}
}

/////////////////////////////////////////////////
/// Define the slash command & parameters
/////////////////////////////////////////////////
const guildOption = new SlashCommandStringOption()
	.setName('guild')
	.setDescription('Get guild banner data')
	.setRequired(false)
	.addChoices(
		{ name: 'Arcanum', value: 'Arcanum' },
		{ name: 'Black Hand', value: 'Black Hand' },
		{ name: 'Faith Council', value: 'Faith Council' },
		{ name: 'Guardians', value: 'Guardians' },
		{ name: 'Outriders', value: 'Outriders' },
		{ name: 'Silver Thorn', value: 'Silver Thorn' },
		{ name: 'Unaligned', value: 'Unaligned' }
	);
const typeOption = new SlashCommandStringOption()
	.setName('type')
	.setDescription('Type of quest engagement')
	.setRequired(false)
	.addChoices(
		{ name: 'Damage',  value: 'Damage' },
		{ name: 'Healing', value: 'Healing' },
		{ name: 'Skill',   value: 'Skill' },
		{ name: 'Skill: Acrobatics', value: 'Skill|Acrobatics' },
		{ name: 'Skill: Animal Handling', value: 'Skill|Acrobatics' },
		{ name: 'Skill: Arcana', value: 'Skill|Arcana' },
		{ name: 'Skill: Athletics', value: 'Skill|Athletics' },
		{ name: 'Skill: Deception', value: 'Skill|Deception' },
		{ name: 'Skill: History', value: 'Skill|History' },
		{ name: 'Skill: Insight', value: 'Skill|Insight' },
		{ name: 'Skill: Intimidation', value: 'Skill|Intimidation' },
		{ name: 'Skill: Investigation', value: 'Skill|Investigation' },
		{ name: 'Skill: Medicine', value: 'Skill|Medicine' },
		{ name: 'Skill: Nature', value: 'Skill|Nature' },
		{ name: 'Skill: Perception', value: 'Skill|Perception' },
		{ name: 'Skill: Performance', value: 'Skill|Performance' },
		{ name: 'Skill: Persuasion', value: 'Skill|Persuasion' },
		{ name: 'Skill: Religion', value: 'Skill|Religion' },
		{ name: 'Skill: Sleight of Hand', value: 'Skill|Sleight of Hand' },
		{ name: 'Skill: Stealth', value: 'Skill|Stealth' },
		{ name: 'Skill: Survival', value: 'Skill|Survival' }
	)

const data = new SlashCommandBuilder()
	.setName('quest')
	.setDescription('Get info from the ongoing quest')
	// .setDefaultPermission(false)	
	.addStringOption(guildOption)
	.addUserOption(option => option
			.setName('user')
			.setDescription('A user to narrow down search results')
			.setRequired(false)
		)
	.addStringOption(option => option
			.setName('character')
			.setDescription('Select from registered characters!')
			.setRequired(false)
			.setAutocomplete(true)
		)
	.addStringOption(typeOption)
	.addChannelOption(option => option
			.setName('channel')
			.setDescription('Select from the available channels the quest occurred in')
			.setRequired(false)
		)
	.addBooleanOption(option => option
			.setName('global')
			.setDescription('Get all results regardless of channel it occurred in')	
			.setRequired(false)
		)

const userPermissions = [PermissionsBitField.Flags.SendMessages];
module.exports = 
{
	data: data,
	userPermissions: userPermissions,
	execute: execute,
	autoComplete: autoComplete,
	// button: handleButton,
	// select: handleSelect,
	build: config.DEV	//||config.PRODUCTION
};