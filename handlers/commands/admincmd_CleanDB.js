const { SlashCommandBuilder,
	   	EmbedBuilder,
	    PermissionsBitField } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Embed = require(`../../utilities/EmbedPaginator.js`);
const charUtils = require(`../../utilities/charUtils.js`);
const LevelUtils = require(`../../utilities/levelUtils.js`);
const GuildUtils = require(`../../utilities/guildUtils.js`);
const TupperUtils = require(`../../utilities/tupperUtils.js`);
const Utils = require(`../../utilities/utilFuncs.js`)
const Prompt = require(`../../utilities/promptUtils.js`)

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guild = interaction.guild;
	const ephemeral = true;

	const char = interaction.options.getString('char') || null
	const level = interaction.options.getInteger('level') || null
	if (char && level)
	{
		await interaction.deferReply({ephemeral: false});
		
		const levelQuery = {name:char, level}
		const levelResult = await LevelUtils.getLevelData(levelQuery);
		const user = levelResult?.user;

		const guildQuery = {char, user}
		const guildResult = await GuildUtils.GetRawRosterData(guildQuery, true);
		console.log(guildResult)
		const guilds = guildResult.map( x => {
			return `${x.guild} (${x.rank})`
		}).join("\n")
		
		const embed = new EmbedBuilder()
			.setTitle("Char Cleanup")
			.addFields([
				{name:"Char",value:`${levelResult.name} (${levelResult.level})`,inline:true},
				{name:"User",value:`<@${levelResult.user}>`,inline:true},
				{name:"Guilds", value:guilds || "None"}
			])		

		const prompt = await interaction.followUp({embeds:[embed], ephemeral:false})
		const confirm = await Prompt.confirmDialog(prompt,[interaction.user.id])
		if (confirm)
		{	
			let result = await LevelUtils.PurgeChar(levelQuery)
			console.log(result)
			if (guilds)
			{
		 		result = await GuildUtils.PurgeChar(guildQuery)	
				console.log(result)
			}
		}
		await prompt.delete();				
		return;		
	}
		


	
	for (var i=0; i < 5; ++i)
	{
		const targetMember  = interaction.options.getMember(`user_${i}`);
		if (targetMember)
		{
			await interaction.reply({content:`${targetMember} is still active in the server`, ephemeral: ephemeral})
			return;
		}
		
		const targetUser = interaction.options.getUser(`user_${i}`);
		if (targetUser)	
			await cleanupDB(targetUser.id);
	}
	await interaction.deferReply({ephemeral: ephemeral});


	//Generate the output
	let embed = new Embed();
	embed.setTitle(`Stale DB Entries`)
	embed.addField("** **", '');

	await charUtils.RefreshCache();
	const members = await guild.members.fetch();	
	let empty = true;	
	for (const [user,chars] of Object.entries(charUtils.charByUser))
	{
		const member = members.get(user);
		if (!member)
		{
			const charList = chars.map(char => char.name).join(",")
			embed.extendField(`<@${user}>: ${charList}`);
			empty = false;
		}
	}
	if (empty) embed.extendField(`Database has no stale entries!`);

	let tupper = await TupperUtils.cleanTupperData();
	if (tupper) embed.addField("Tupper",`${tupper ?? 0} stale tupper records deleted`)

	let embeds = embed.embeds();
	     embed = embeds.shift();
	await interaction.editReply({embeds:[embed], ephemeral: ephemeral})
	Utils.asyncArrayForEach(embeds, async embed => {
		if (ephemeral)
			await interaction.followUp({embeds:[embed], ephemeral: ephemeral})
		else
			await interaction.channel.send({embeds:[embed]})
	})
}

async function cleanupDB(user_id)
{
	await GuildUtils.PurgeUser(user_id);
	await LevelUtils.PurgeUser(user_id);
}

async function run(client, message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName('cleandb')
	.setDescription('Check the database data for invalid members and remove their records')
	.setDefaultPermission(false)	
	.addStringOption(option => option
			.setName('char')
			.setDescription('Character to clean from the databases')
			.setRequired(false))
	.addIntegerOption(option => option
			.setName('level')
			.setDescription('Level of the char to clean from the databases')
			.setRequired(false))
	
	.addUserOption(option => option
			.setName('user_0')
			.setDescription('User to clean from the databases')
			.setRequired(false))
	.addUserOption(option => option
			.setName('user_1')
			.setDescription('User to clean from the databases')
			.setRequired(false))
	.addUserOption(option => option
			.setName('user_2')
			.setDescription('User to clean from the databases')
			.setRequired(false))
	.addUserOption(option => option
			.setName('user_3')
			.setDescription('User to clean from the databases')
			.setRequired(false))
	.addUserOption(option => option
			.setName('user_4')
			.setDescription('User to clean from the databases')
			.setRequired(false))


const userPermissions = [	PermissionsBitField.Flags.ManageGuild	];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.role.Builder
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
//	button: button,

	build:config.DEV
};