const { SlashCommandBuilder, ButtonStyle,
	   	EmbedBuilder, ThreadManager, ThreadAutoArchiveDuration,
		PermissionsBitField } = require('discord.js')
const ActivityUtils = require(`../../utilities/activityUtils.js`)
const MessageUtils = require(`../../utilities/messageUtils.js`)
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChanUtils  = require(`../../utilities/channelUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const util = require('util')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const threadIcon = "🧵";

const ERROR_OWNER = (owner) => `Only the owner of this channel (${owner}) can manage threads.`
const ERROR_MAX_THREADS = 'This channel already has the maximum number of active threads.'

const MENU_DESC = "The following threads already exist, subject to the same guidelines for dead scenes as other channels. Alternately, you may select a channel in the dropdown to open a thread. Each channel has a limited number of threads, so some threads may be recycled, and some may not have threads available."


///
/// Find an archived or closed scene thread to recycle if one is available
///
async function findRecycleThread(threads, threadStatus = null) {
	let thread = null;

	//If we have any archived threads, grab one of those first and be done with it
	if (!thread && threads.archive.threads.size > 0)
 		thread = threads.archive.threads.first();

	//console.log(threadStatus)

	//Check to see if we have any threads with an ended scene by looking at the last post
	await Utils.asyncCollectionForEach(threads.active.threads, async (value) => {
		if (thread)	return

		//Check each thread's last post to see if it's a scene break divider
		let message = await value.messages.fetch({ limit: 1 });
			message = message?.first();
		if (MessageUtils.isSceneBreak(message))
			thread = value;
		const status = threadStatus.find(x => x.id == value.id)?.status;
		if (status.includes("🟢"))
			thread = value;
	})

	return thread
}

///
/// Create a thread or re-open a recycled one if possible
///
async function openThreadIfPossible(interaction, channel = null) {
	channel = channel || interaction.channel;

	//Get channel meta data for the current channel
	const chanMeta = await ChannelMeta.findOne({ channelId: channel.id });

	//Early out if we don't have metadata, if threads aren't enabled, or this isn't an RP channel
	if (!chanMeta || !ChanUtils.isRoleplayChannel(channel))
		throw new Error(`${channel} is not set up for RP threads.`)

	//Check for channel ownership, and if the interaction.user is an owner
	const hasOwner = Array.isArray(chanMeta.userOwner) ? chanMeta.userOwner.length > 0 : chanMeta.userOwner;
	if (hasOwner) {
		const isOwner = Array.isArray(chanMeta.userOwner) ?
							chanMeta.userOwner.includes(interaction.user.id) :
							chanMeta.userOwner === interaction.user.id;
		const hasManageThreadsPermission = channel.permissionsFor(interaction.user)
												  .has(PermissionsBitField.Flags.ManageThreads);
		if (!isOwner || !hasManageThreadsPermission) {
			let userOwner = Array.isArray(chanMeta.userOwner) ? chanMeta.userOwner : [chanMeta.userOwner];
				userOwner = chanMeta.userOwner.map( x => `<@${x}>`).join(",")
			throw new Error( ERROR_OWNER( userOwner ))
		}
	}

	let thread = null;
	const threads = await ChanUtils.fetchThreads(channel);
	const threadMax = chanMeta.threadMax ?? 0;
	let threadCount = threads?.active?.threads?.size || 0;
	// console.log(threads, threadMax, threadCount)

	// If we have reached the maximum number of threads
	if (threads.archive.threads.size > 0) {
		//Grab an archived thread if any exist before creating a new one
 		thread = threads.archive.threads.first();
 	} else {
		//Try to recycle a thread to open if possible
		const threadStatus = await ActivityUtils.getAllThreadsStatus(channel, threads.all);
		thread = await findRecycleThread(threads, threadStatus)
		//Return an error if none are available
		if (!thread) {
			if (threadCount >= threadMax)
				throw new Error( ERROR_MAX_THREADS )

			// create new thread
			const chanName = Utils.toSentenceCase(channel.name)
 			const threadName = `${chanName} ${Utils.toRomanNumeral(threadCount + 1)}`;
 			thread = await channel.threads.create({ name: threadName, 
											    	autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek });

			const message = await thread?.fetchStarterMessage();
			await message?.delete();
		}
 	}

	if (thread) {
		const reused = thread.totalMessageSent > 0;
		if (!thread.setArchived) console.log(thread)
		await thread.setArchived(false);
		await thread.members.add(interaction.user.id);
		await thread.send(`@ping your parner(s) to add them to the thread. They will need to have this location visible.`)
		await interaction.editReply({content: `Thread ${reused ? "Recycled" : "Created"}: ${thread.name} (${thread.url})`,
									 embeds:[],components:[]})

		const guild = interaction.guild;
		const logChanId = config.debug.thread
		const debugChan = await guild?.channels?.fetch(logChanId);
		if (debugChan)
		{
			const embed = new EmbedBuilder().setTitle(`Thread ${reused ? "Recycled" : "Created"}`)
											.addFields([
											{name:"User",value:`<@${interaction.user.id}>`,inline:false},
											{name:"Channel",value:`<#${channel.id}>\n${channel.name}`,inline:true},
											{name:"Thread",value:`<#${thread.id}>\n${thread.name}`,inline:true}
											])
			await debugChan.send({embeds:[embed]});
		}
	}
	return thread;
}

///
/// Get the status of all the threads of a given channel
///
function getThreadStatus(threadStatus) {
	let value = ""
	threadStatus.forEach(thread => {
		const {id,status,lastMsg,elapsed,author,scene} = thread;
		value += `\n\`• ${status}\` <#${id}> - ${lastMsg} ${elapsed}`
	});
	return (value || "`No threads`");
}

function cleanAlphabetical(a,b) {
	const regex = /[^a-zA-Z0-9]/g;
	a = (a.label || a.name).replace(regex, '');
	b = (b.label || b.name).replace(regex, '');
	return (a < b) ? -1 : ((a > b) ? 1 : 0);
}

///
/// For button presses, pop up an ephemeral menu that shows channels that have open thread slots
///
async function showThreadMenu(interaction, roleIds) {
	await interaction.deferReply({ephemeral: true})
	let selectOptions = {};
	let embedFields   = [];

	let channels = []
	try { channels = await ChannelMeta.find({ locations: { $in: roleIds } }); }
	catch (error) { console.error('Error getting channels by roles:', error); }

	channels = channels.sort(cleanAlphabetical)

	//Loop over all the channels in the relevant encoded IDs
	await Utils.asyncArrayForEach( channels, async x => {
		//Skip channels with an owner (private channels) that happen to exist in the same role ID
		if (x.userOwner?.length && !x.userOwner.includes(interaction.user.id)) {
			console.log(`${x.name}: Owner = ${x.userOwner} `);
			return;
		}
		//Skip channels that have no thread max specified
		if (!x.threadMax){ console.log(`${x.name}: Thread Max = ${x.threadMax} `); return; }

		//Grab the channel and get the status of all threads
		const channel = await interaction.guild.channels.resolve(x.channelId);
		const threads = await ChanUtils.fetchThreads(channel);
		const order = channel.rawPosition

		//Prep a field for this channel
		const threadStatus = await ActivityUtils.getAllThreadsStatus(channel, threads.all);
		const value = getThreadStatus(threadStatus);
		const field = {name:`__**${channel}**__`,value:value,order};
		embedFields.push(field);

		//Add the channel to the select box if new threads can be opened
		const threadMax = x.threadMax ?? 0;
		const threadCount = threads?.active?.threads?.size || 0;
		const canRecycle = threadStatus.find( x=>x.scene ) || await findRecycleThread(threads, threadStatus)
		console.log(`${channel.name}: ${threadCount} >= ${threadMax} | Recycle: ${canRecycle}`)

		if ((threadCount >= threadMax) && !canRecycle) {
			//Skip any that are already maxed out.
			console.log(`${x.name}: Thread Max = ${x.threadMax} | Active Threads = ${threadCount}`)
			return;
		}
		selectOptions[x.channelId] = {label: Utils.toSentenceCase(x.name), value:x.channelId, order}
	});
	embedFields = embedFields.sort((a,b) => a.order - b.order)

	//Sort the options
	selectOptions = Object.values(selectOptions)
	if (!selectOptions.length)
		return await interaction.followUp({content:"No threads can be open in the selected channels at this time",ephemeral:true})
	//selectOptions = selectOptions.sort(cleanAlphabetical);
	selectOptions = selectOptions.sort((a,b) => a.order - b.order)

	//Show the embed with the select box component.
	const embed = new EmbedBuilder()
						.setTitle(`RP Thread Menu`)
						.setDescription(MENU_DESC)
						.addFields(embedFields)
	const component = Prompt.createSelectRow(`${data.name}.openThread`,selectOptions,1,1,"Open new thread in [select channel]...");
 	return await interaction.editReply({embeds:[embed],components:[component]})	
}

///
/// Create the buttons for everyone to use
///
async function createThreadButton(interaction, roleIDs, attachMessage = null) {
	roleIDs = (Array.isArray(roleIDs) ? roleIDs.join(",") : roleIDs)

	const openbutton = {style:ButtonStyle.Primary, emoji:threadIcon, label:'Join / Create RP Thread',
			  		    custom_id:`${data.name}.showThreadMenu:${roleIDs}`}
	// const listbutton = {style:ButtonStyle.Secondary, label:'List Threads',
	// 				    custom_id:`${data.name}.listThreads:${roleIDs}`}
	const buttonRow  = Prompt.createButtonRow([openbutton]);	//,listbutton]);
	if (!attachMessage)
		await interaction.channel.send({components:[buttonRow]})
	else {
		console.log(attachMessage)
		await attachMessage.edit({components:[buttonRow]})
	}
}

///
/// Parse role IDs from a button's encoding
///
function getRoleIDs(interaction) {
	if (interaction.isStringSelectMenu()) return interaction.values;

	const message  = interaction?.message
	const componentRow = message?.components?.[0]
	const select   = componentRow?.components?.[0]
	const selected = select?.data?.options?.filter(x=>x.default).map(x=>x.value) || []
	const roleIds  = interaction.customId.split(":")[1]?.split(",") || selected

	return roleIds;
}

///
/// Show the builder menu to create encoded buttons for everyone to use.
///
async function showBuilderMenu(interaction, useGuildLocations = null, locationOverride = []) {
	const embed = new EmbedBuilder().setTitle("🛠️ Builder Thread Menu")
	const channel = interaction.channel;
 	const chanMeta = await ChannelMeta.findOne({channelId:channel.id});
 	const roleIds  = chanMeta?.locations ?? locationOverride ?? [];
	const guildLocations = roleIds.length && roleIds.every( x => ChanUtils.LocationRoles.guild.find( y => y.value == x) )
	useGuildLocations = useGuildLocations ?? guildLocations

	let locations = JSON.parse(JSON.stringify(useGuildLocations ? ChanUtils.LocationRoles.guild :
											  					  ChanUtils.LocationRoles.public));
		locations = locations.map( role => {
			if (locationOverride.includes(role.value))
				role.default = true
			else if (!locationOverride.length && roleIds.includes(role.value))
				role.default = true;
			return role;
		})

	if (!useGuildLocations) locations.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0))
 	const guild = useGuildLocations ? ".guild" : ""
 	const location = Prompt.createSelectRow(`${data.name}.location${guild}`,locations,0,5,"Locations (None Selected)");

	const lastMessage = (await channel.messages.fetch({ limit: 1 })).first();
	const editableMessage = lastMessage?.author?.id == interaction.client.user.id
	console.log(editableMessage + ": " + lastMessage?.id+" - "+ interaction.client.user.id)

	const locationPub = {style:ButtonStyle.Secondary,
						 label:`Location: ${useGuildLocations?"Guilds":"Public"}`, 
						 custom_id:`${data.name}.guildLocations.${!useGuildLocations}`}
	const attachButton = {style:ButtonStyle.Primary, label:`Attach Button`,
						 custom_id:`${data.name}.attachThreadButton`, disabled: !editableMessage}
	const createButton = {style:ButtonStyle.Primary, label:`Create Button`,
						 custom_id:`${data.name}.createThreadButton`}
	const createThread = {style:ButtonStyle.Primary, label:`Create Thread`, 
						 custom_id:`${data.name}.openThreadInCurrentChannel`}

	const components = [];
	components.push(location);
	const miscButtons = [locationPub, attachButton, createButton, createThread];
	components.push(Prompt.createButtonRow(miscButtons));
	await interaction.editReply({ embeds: [embed], components: components });
}

///
/// Generic interaction handler
///
async function handleInteraction(interaction) {
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const customId = interaction.customId;
	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")	
	const command = customId.split(":")[0].replace(prefix,"");
	const roleIds = getRoleIDs(interaction)

	let useGuildLocations = null;
	let roleOverride = roleIds;
	let attachMessage = null;
	let thread  = null;

	switch(command) {
 		case `guildLocations.true`:
 		case `guildLocations.false`:
			useGuildLocations = command.endsWith("true");
			break;
		case `location`:
		case `location.guild`:
			roleOverride = interaction.values;
			break;
		case `attachThreadButton`:
			attachMessage = (await interaction.channel.messages.fetch({ limit: 1 })).first();
		case `createThreadButton`:
			await createThreadButton(interaction, roleIds, attachMessage);
			break;
		case `listThreads`:
		case `showThreadMenu`:
			return await showThreadMenu(interaction, roleIds);
		case `openThreadInCurrentChannel`:
			await interaction.deferUpdate({ephemeral:true});
			try { thread   = await openThreadIfPossible(interaction, interaction.channel) }
			catch (e) { await interaction.editReply(e.toString()) }
			return;
		case `openThread`:
			await interaction.deferUpdate({ephemeral:true});
			const channels = interaction.guild.channels;
			const channel  = channels.resolve(roleIds[0]) || await channels.fetch(roleIds[0]);
			try { thread   = await openThreadIfPossible(interaction, channel) }
			catch (e) { await interaction.editReply(e.toString()) }
			return 
	}

	if (isBuilder) {
		console.log(useGuildLocations,roleOverride,"\n=-=-=-=-=-=-=-")
		await interaction.deferUpdate();
		await showBuilderMenu(interaction, useGuildLocations, roleOverride)
	}
}

///
async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);

	if (isBuilder)
	 	return await showBuilderMenu(interaction)

	try {
		const thread = await openThreadIfPossible(interaction);
	}
	catch (e) { await interaction.editReply(e.toString()) }
}

const data = new SlashCommandBuilder()
	.setName(`rpthread${config.DEV ? "dev" : ""}`)
	.setDescription('Open an RP thread')

const botPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,
							PermissionsBitField.Flags.SendMessages		];
const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.role.Builder		];
module.exports =
{
	data: data,
	userPermissions: userPermissions,
	botPermissions: botPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,

	build:config.PRODUCTION	|| config.DEV
};