const { SlashCommandBuilder, 
	   	SlashCommandStringOption, 
	   	SlashCommandNumberOption } = require('@discordjs/builders');
const { EmbedBuilder, 
	   	PermissionsBitField } = require('discord.js')
const guildData = require(`../../database/guildDataSchema.js`);
const guildRank = require(`../../database/guildRankSchema.js`);
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function updateGuildRank(server, guild, rank=null, role=null, image=null, emoji=null)
{
	let query = { guild: guild, rank: rank }
	let update;
	let options = { new: true, upsert: true }
	let record;
	if (rank && guild)
	{
		update = { $set: { } };
		if (role) update["$set"].role = role.id
		if (image) update["$set"].imageUrl = image		
		record = await guildRank.findOneAndUpdate(query, update, options);
	}
	else if (rank)
	{
		update = { $set: { role: role.id } };
		record = await guildRank.findOneAndUpdate(query, update, options);
	}
	else
	{
		query = { guild: guild }
		// update = { $set: { role: role.id, imageUrl: image, emoji: emoji } };
		update = { $set: { } }
		if (role) update["$set"].role = role.id
		if (image) update["$set"].imageUrl = image
		if (emoji) update["$set"].emoji = emoji;
		record = await guildData.findOneAndUpdate(query, update, options);
	}

	return record;
}

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const messageId = interaction.targetId;

	const guild = interaction.options.getString('guild');
	const rank = interaction.options.getNumber('rank');
	const role = interaction.options.getRole('role');
	const image = interaction.options.getString('image');
	let emoji = interaction.options.getString('emoji');

	await interaction.deferReply({ephemeral:true})

	const server = interaction.guild;
	const record = await updateGuildRank(server, guild, rank, role, image, emoji);
	console.log(record);

	let embed = new EmbedBuilder();
		embed.setTitle("Guild Rank Updated")
	if (rank && guild)
	{
		emoji = await guildData.findOne({guild: guild})
		console.log(emoji)
		emoji = emoji ? emoji.emoji : '';
		embed.setDescription(`${emoji} Rank \`${rank}\` of the \`${guild}\`: ${role}`)
	}
	else if (rank)
	{
		embed.setDescription(`Rank role set: ${role}`)
	}
	else
	{
		embed.setDescription(`Guild data set: ${emoji} ${role}`)	
	}
	if (image)
		embed.setThumbnail(image)
	interaction.editReply({embeds:[embed]})
	// const buttons = getButtonRow()
	// const select = getSelectRow()
	// const rows = [buttons,select]
	// interaction.reply({embeds:[embed], components: rows})

	// const modal = await Prompt.createModal();
	// console.log(modal)
	// interaction.showModal(modal)
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
	.setName('guildsetup')
	.setDescription('Configures the guild ranks database')
	.addStringOption(guildOption)
	.addNumberOption(rankOption)
	.addRoleOption(option => option
		.setName('role')
		.setDescription('The role to apply to the guild/rank')
		.setRequired(false)
	)
	.addStringOption(option => option
		.setName('image')
		.setDescription('The image URL to associate with the guild/rank')
		.setRequired(false)
  	)
	.addStringOption(option => option
		.setName('emoji')
		.setDescription('The emoji to associate with the specified guild/rank')
		.setRequired(false)
  	)

const userPermissions = [	PermissionsBitField.Flags.ManageGuild	];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole
	],
	userPermissions: userPermissions,
	execute: execute,
	//message: run,
	// button: button,
	// select: select,

	build: config.PRODUCTION// || config.DEV
};