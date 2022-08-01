const { SlashCommandBuilder, 
	   	SlashCommandStringOption, 
	   	SlashCommandNumberOption } = require('@discordjs/builders');
const { EmbedBuilder, 
	   	PermissionsBitField } = require('discord.js')
const Avrae = require(`../../utilities/avrae.js`)
const levelUtils = require(`../../utilities/levelUtils.js`)
const guildData = require(`../../database/guildDataSchema.js`);
const guildRoster = require(`../../database/guildRosterSchema.js`);



const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const gvar = "776725c9-6944-4985-abfa-b629ffb89109";

/// Update the gvar to be in parity with the database.
/// Check first to make sure the changes to the GVar will be the same as the ones just made
async function updateGVar()
{
	const content = await Avrae.readGvar(gvar);
	interaction.reply({content:content, ephemeral: true})
	await Avrae.writeGvar(gvar, content + "\nasdfsadf")	
}

let charCache;
(async ()=>{
	charCache = await levelUtils.findLevelData({});
	console.log("Choices Cache:" + charCache.length);
})()

async function autoComplete(interaction)
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'character') 
	{
		const value = focusedOption.value.toLowerCase();
		const target = interaction.options.get('user')?.value;
		let user = '';
		if (target)
		{
			user = await interaction.guild.members.resolve(target);
			user = user?.displayName + ": ";
		}
		const filtered = charCache.filter(item => {
			const matchUser = (target == null || target == item.user);
			return matchUser && item.name.toLowerCase().includes(value);
		});
		const response = filtered.map(choice => ({ name: user+choice.name, value: choice.name }));
		await interaction.respond(response.length <= 25 ? response : []);
	}
}

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const messageId = interaction.targetId;

	const rank = interaction.options.getNumber('rank');
	const guild = interaction.options.getString('guild');
	const member = interaction.options.getMember('user');
	const character = interaction.options.getString('character');

	let guildData = await guildData.find({});
	//Lots of permutations for provided arguments
	if (guild && member && character && rank)
	{
		// Apply the appropriate role(s) to target user
		

		// Update the database with the new guild rank
		// Update the gvar to be in parity with the DB
		interaction.reply(`DO STUFF ${guild} ${rank}: ${member.displayName} - ${character}`)

		
	}
	else
	{
		//Else output lists of guilds / members / ranks based on what data IS provided		
		//Refresh the cache
		charCache = await levelUtils.findLevelData({});	
		let guildRosterData = await guildRoster.find({});
		guildRosterData = guildRosterData.filter(item => 
		{
			let show = true;
				show = show && (guild ? item.guild == guild : true);
				show = show && (member ? item.user == member.id : true);
				show = show && (character ? item.char == character : true);
				show = show && (rank ? item.rank == rank : true);
			return show;
		})
		console.log(guildRosterData);
				//List all characters' rank in the guild or all guilds if unspecified			
				//List all characters holding a given rank within the specified guild
				//List all characters holding the given rank in all guilds
				//List all members of the given guild organized by rank
	}	
}

const guildOption = new SlashCommandStringOption()
		.setName('guild')
		.setDescription('The name of the guild being applied')
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
		.setDescription('The guild rank to apply')
		.setRequired(false)
		.addChoices(
			{ name: '1: Recruit', value: 1 },
			{ name: '2: Initiate', value: 2 },
			{ name: '3: Member', value: 3 },
			{ name: '4: Council', value: 4 },
			{ name: '5: Leader', value: 5 },
		)

const data = new SlashCommandBuilder()
	.setName('guild')
	.setDescription('Does various guild things!')
	.addStringOption(guildOption)
	.addNumberOption(rankOption)
	.addUserOption(option => option
		.setName('user')
		.setDescription('The user being added to the guild')
		.setRequired(false)
  	)
	.addStringOption(option => option
		.setName('character')
		.setDescription('The character being added to the guild')
		.setRequired(false)
		.setAutocomplete(true)
  	)
	
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
	autoComplete: autoComplete,
	//message: run,
	// button: button,
	// select: select,

	build:config.PRODUCTION || config.DEV
};





	// const buttons = getButtonRow()
	// const select = getSelectRow()
	// const rows = [buttons,select]
	// interaction.reply({embeds:[embed], components: rows})

	// const modal = await Prompt.createModal();
	// console.log(modal)
	// interaction.showModal(modal)

/*
function getButtonRow()
{
	const options = [
		{style:'PRIMARY', emoji:"☑️", custom_id:"demo.bluecheck"},	
		{style:'SUCCESS', emoji:"✅", custom_id:"demo.greencheck"},
		{style:'DANGER', emoji:"❌", custom_id:"demo.redx"},
		{style:'SECONDARY', emoji:"✖️", custom_id:"demo.grayx"},
		{style:'SECONDARY', emoji:"🔒", custom_id:"demo.locked", disabled:true}
	]
	const row = Prompt.createButtonRow(options)
	return row;
}

async function button(interaction)
{
	interaction.reply({content:`Handling: ${interaction.customId}`, 
					  ephemeral: true})
}

async function select(interaction)
{
	console.log(interaction)
	interaction.reply({content:`Handling ${interaction.customId}: ${interaction.values.join(", ")}`, ephemeral: true})
}
*/