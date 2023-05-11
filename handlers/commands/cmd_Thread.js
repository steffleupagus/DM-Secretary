const { SlashCommandBuilder, ButtonStyle,
	   	EmbedBuilder, ThreadManager, ThreadAutoArchiveDuration,
		PermissionsBitField } = require('discord.js')
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const util = require('util')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const threadIcon = "🧵";

const ERROR_OWNER = (owner) => `Only the owner of this channel (${owner}) can manage threads.`
const ERROR_MAX_THREADS = 'This channel already has the maximum number of active threads.'

///
///
///
async function createThreadIfPossible(interaction, channel) 
{
	//Early out if we don't have metadata, threads aren't enabled, or this isn't an RP channel
	const chanMeta = await ChannelMeta.findOne({ channelId: channel.id });
	if (!chanMeta || !ChanUtils.isRoleplayChannel(channel))
		return await interaction.editReply(`${channel} is not set up for RP threads.`)

	// check if user is an owner of the channel
	const hasOwner = Array.isArray(chanMeta.userOwner) ? chanMeta.userOwner.length > 0 : chanMeta.userOwner; 
	if (hasOwner)
	{
		const isOwner = Array.isArray(chanMeta.userOwner) ? 
							chanMeta.userOwner.includes(interaction.user.id) : 
							chanMeta.userOwner === interaction.user.id;
		const hasManageThreadsPermission = channel.permissionsFor(interaction.user).has(PermissionsBitField.Flags.ManageThreads);
		if (!isOwner && !hasManageThreadsPermission) 
		{
			chanMeta.userOwner = Array.isArray(chanMeta.userOwner) ? chanMeta.userOwner : [chanMeta.userOwner];
			chanMeta.userOwner = chanMeta.userOwner.map( x => `<@${x}>`).join(",")
			return await interaction.editReply( ERROR_OWNER(chanMeta.userOwner) )
		}
	}

	let thread = null;

	const threads = await ChanUtils.fetchThreads(channel);
	const threadMax = chanMeta.threadMax ?? 0;
	const threadCount = threads?.active?.threads?.size || 0;
	
	// check if we have reached the maximum number of threads
	if (threadCount >= threadMax) 
	{		
		await Utils.asyncCollectionForEach(threads.active.threads, async (value) => 
		{
			if (thread)	return thread
			let message = await value.messages.fetch({ limit: 1 });
				message = message?.first();
			if (message?.author?.id == "912162588253642763" || message?.author?.id == "912167154906988595")
			{
				thread = value;
				return thread;
			}			
		})
		if (thread)
			return await interaction.editReply(`Thread recycled: ${thread.name}\n${thread.url}`)
		return await interaction.editReply(ERROR_MAX_THREADS)
	}

	
	if (threads.archive.threads.size > 0)
	{
		thread = threads.archive.threads.first();
		await thread.setArchived(false);
		await interaction.editReply(`Thread recycled: ${thread.name}\n${thread.url}`)
	}
 	else 
 	{
 		// create new thread
		const chanName = toSentenceCase(channel.name)
 		const threadName = `${chanName} ${toRomanNumeral(threadCount + 1)}`;
 		thread = await channel.threads.create({ name: threadName, 
											    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek });
		await interaction.editReply(`Thread created: ${thread.name}\n${thread.url}`)
 	}

	await thread.members.add(interaction.user.id);
	await thread.send(`@ping your parner(s) to add them to the thread. They will need to have this location visible.`)
}



async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);		
	if (!isBuilder) return await createThreadIfPossible(interaction, interaction.channel);

	// return await addThreadButton(interaction)	
	return await showBuilderMenu(interaction)
}

const data = new SlashCommandBuilder()
	.setName(`thread${config.DEV ? "dev" : ""}`)
	.setDescription('Open an RP thread')
	// .setDefaultMemberPermission(false)
	
const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.BuilderRole, config._BuilderRole		];

module.exports = 
{
	data: data,
	whitelistRoles: whitelistRoles,
	userPermissions: userPermissions,
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,

	build:config.DEV //||config.PRODUCTION
};

































async function handleInteraction(interaction)
{
	const customId = interaction.customId;

	if (customId == `${data.name}.openThread`)
	{
		await interaction.deferReply({ephemeral:true});
		try { 
			const channelId = interaction.values[0];
			const channel = await interaction.guild.channels.fetch(channelId)
			await createThreadIfPossible(interaction, channel); }
		catch (e) { console.error(e) }
		return		
	}
	else if (customId.startsWith(`${data.name}.listthreads`))
	{
		const roleIds = customId.split(":")[1].split(",")
		console.log(roleIds)
	//	await listTargetThreads()
		return;	
	}

	await interaction.deferUpdate();
	const isBuilder= Utils.hasAnyRole(interaction.member, whitelistRoles);	
	let useGuildLocations = false;
	let roleOverride = []
	switch (customId)
	{		
		case `${data.name}.guildLocations.true`:
			useGuildLocations = true;
		case `${data.name}.guildLocations.false`:
			break;
		case `${data.name}.location.guild`:
			useGuildLocations = true;
		case `${data.name}.location`:
			roleOverride = interaction.values;
			break;
		case `${data.name}.createThreadMenu`:
			await createThreadMenu(interaction)
			await interaction.deleteReply();			
			return;
	}

	if (isBuilder) await showBuilderMenu(interaction, useGuildLocations, roleOverride)
}

async function createThreadMenu(interaction) 
{
	// Get the selected values from the interaction
	const message = interaction?.message
	const componentRow = message?.components?.[0]
	const select = componentRow?.components?.[0]
	const roleIds = select.data.options.filter(x=>x.default).map(x=>x.value)

	let options = {};
	try {
    	const channels = await ChannelMeta.find({ locations: { $in: roleIds } });
		channels.map( x => {
			x.name = toSentenceCase(x.name)
			const option = {label: x.name, value:x.channelId}			
			if (x.userOwner?.length) { console.log(`${x.name}: Owner = ${x.userOwner} `); return; }
			if (!x.threadMax){ console.log(`${x.name}: Thread Max = ${x.threadMax} `); return; }
			options[x.channelId] = option
		})
	} catch (error) {
		console.error('Error getting channels by roles:', error);
		return
	}
	
	options = Object.values(options)
	options = options.sort((a,b) => 
	{
		const regex = /[^a-zA-Z0-9]/g;
		a = a.label.replace(regex, '');
		b = b.label.replace(regex, '');
		if (a < b) return -1
		if (a > b) return 1
				   return 0
	});

	if (!options.length)
		return await interaction.followUp({content:"Can't create a select menu with no options",ephemeral:true})
	
	const embed = new EmbedBuilder()
						.setTitle(`RP Thread Menu`)
						.setDescription("Select the channel in which you would like to open a thread. Each channel has a limited number of threads, so some threads may be recycled, and some channels may not have threads available.")
	const component = Prompt.createSelectRow(`${data.name}.openThread`,options,1,1,"Open thread in...");

	let listbutton = [{style:ButtonStyle.Secondary, emoji:threadIcon, label:'List Threads', 
					   custom_id:`${data.name}.listthreads:${roleIds.join(",")}`}]
	listbutton = Prompt.createButtonRow(listbutton);
	
	return await interaction.channel.send({embeds:[embed],components:[component,listbutton]})
}






	
async function showBuilderMenu(interaction, useGuildLocations = false, locationOverride = [])
{
	const channel = interaction.channel;
	const embed = new EmbedBuilder().setTitle("🛠️ Builder Thread Menu")

	const chanMeta = await ChannelMeta.findOne({channelId:channel.id});
	const roleIds  = chanMeta.locations;
		
	let locations = JSON.parse(JSON.stringify(useGuildLocations ? ChanUtils.guildLocations : ChanUtils.locations));
		locations = locations.map( role => 
		{
			if (locationOverride.includes(role.value))
				role.default = true
			else if (!locationOverride.length && roleIds.includes(role.value))				
				role.default = true;		
			// else if (channel.permissionsFor(role.value).has(PermissionsBitField.Flags.ViewChannel) && !locationOverride.length)
			// 	role.default = true
			return role;
		})
	
	if (!useGuildLocations) locations.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0))
	const guild = useGuildLocations ? ".guild" : ""
	const location = Prompt.createSelectRow(`${data.name}.location${guild}`,locations,0,5,"Locations (None Selected)");
	
	const locationPub = {style:ButtonStyle.Secondary,
						 label:`Location: ${useGuildLocations?"Guilds":"Public"}`, 
						 custom_id:`${data.name}.guildLocations.${!useGuildLocations}`}	
	const createMenu = {style:ButtonStyle.Primary,
						 label:`Create Menu`, 
						 custom_id:`${data.name}.createThreadMenu`}	
	
	const components = [];
	components.push(location);

	const miscButtons = [locationPub, createMenu];
	components.push(Prompt.createButtonRow(miscButtons));

	await interaction.editReply({ embeds: [embed], components: components });
}

