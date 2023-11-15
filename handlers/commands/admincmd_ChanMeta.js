const { SlashCommandBuilder, SlashCommandStringOption, ChannelType, ButtonStyle,
	   	EmbedBuilder,
	    PermissionsBitField } = require('discord.js')
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const GuildUtils = require(`../../utilities/guildUtils.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const defaultChanMeta = { awardsExp: false, trackActivity: false, threadMax: 0, userOwner: [], guildHall: "", locations: [] }
const threadIcon = "🧵";
const defaultThreadMax = 5;
const locationPermission = { ViewChannel: true };
const ownerPermission = { ViewChannel: true, ManageChannels: true, ManageMessages: true, ManageThreads: true }

function getDefaultChanMeta(channel)
{
	return { channelId: channel.id, ...defaultChanMeta};
}

function getCurrentChanMeta(channel, chanMeta, sync = false)
{
	const locations = {}
	ChanUtils.locations.forEach(role => { locations[role.value] = role.label; })
	ChanUtils.guildLocations.forEach(role => { locations[role.value] = role.label; })
	const ids = Object.keys(locations)
	const owners = [];
	if (null === chanMeta)
	{	
		sync = true;
		chanMeta = getDefaultChanMeta(channel)
	}

	if (sync)
	{
		chanMeta.locations = [];
		chanMeta.userOwner = [];
	}
	
	channel.permissionOverwrites.cache.map( (val, id) => 
	{
		if ((val.type == 0)&&(ids.includes(id)))
		{
			if (sync && val.allow.has(PermissionsBitField.Flags.ViewChannel))
				chanMeta.locations.push(id)
			console.log(`${locations[id]} (<@&${id}>):\n - ${val.allow.toArray()}\n - ${val.deny.toArray()}\n`)			
		}
		else if (val.type == 1)
		{
			if (sync && val.allow.has(PermissionsBitField.Flags.ManageChannels))
				owners.push(id)
			console.log(`<@${id}>:\n - ${val.allow.toArray()}\n - ${val.deny.toArray()}\n`)
		}
	})

	if (sync && owners.length == 1)
		chanMeta.userOwner = owners;

	const topic = channel.topic || ""
	if (sync && topic.includes(config.xpemoji))
		chanMeta.awardsExp = true;
	
	console.log(chanMeta)
	
	if (sync) return chanMeta;
}


async function updateChannelPerms(channel, chanMeta)
{
	const locations = {}
	ChanUtils.locations.forEach(role => { locations[role.value] = role.label; })
	ChanUtils.guildLocations.forEach(role => { locations[role.value] = role.label; })
	const ids = Object.keys(locations)
	const owners = [];
	const output = [];
	channel.permissionOverwrites.cache.map( (val, id) => 
	{
		//Remove any location permissions that the channel has that aren't in the chanMeta
		if ((val.type == 0)&&ids.includes(id))	//Location Role permission (Don't touch other roles)
		{
			if (!chanMeta.locations.includes(id))	//Perm override exists but we don't want it to
			{
				output.push(`Removing permissions for role <@&${id}>`);
				channel.permissionOverwrites.delete(id)
			}
			else output.push(`Keeping permissions for role <@&${id}>`);
		}
		else if ((val.type == 1)&&					//User Permission
	 			 (chanMeta.userOwner)&&				//And this channel has a registered owner
				 (!chanMeta.userOwner.includes(id)))//But this user isn't an owner
		{
			output.push(`Removing permissions for user <@${id}>`);
			channel.permissionOverwrites.delete(id)							
		}
	});

	//Add any chanMeta locations permissions that the channel doesn't already have
	chanMeta.locations.forEach( id => {
		const val = channel.permissionOverwrites.cache.get(id);
		if (!val || val.allow.has(PermissionsBitField.Flags.ViewChannel))
		{
			output.push(`Adding permissions for role <@&${id}>`);
			channel.permissionOverwrites.create(id, locationPermission);
		}
	});

	//Add the new owner's permissions
	chanMeta?.userOwner?.forEach( owner => 
	{
		const val = channel.permissionOverwrites.cache.get(owner);
		if (!val || !val.allow.has(PermissionsBitField.Flags.ManageChannels))
		{
			output.push(`Adding permissions for owner: <@${owner}>`);
			channel.permissionOverwrites.create(owner, ownerPermission);
		}					
	});

	return output;	
}

async function updateChannelTopic(channel, chanMeta)
{
	let topic = channel.topic || ""
		
	if (topic.includes(config.xpemoji)) topic = topic.replaceAll(config.xpemoji,``)
	if (topic.includes(threadIcon)) topic = topic.replaceAll(threadIcon,``)
	if (topic.includes(":thread:")) topic = topic.replaceAll(":thread:",``)	 
	ChanUtils.locations.forEach( role => 
	{
		const value = `<@&${role.value}>`
		if (topic.includes(value)) topic = topic.replaceAll(value,``)
	})
	ChanUtils.guildLocations.forEach( role => 
	{
		const value = `<@&${role.value}>`
		if (topic.includes(value)) topic = topic.replaceAll(value,``)
	})
	
	for (const [guild,data] of Object.entries(GuildUtils?.guildData)) 
	{
  		if (topic.includes(data.emoji)) topic = topic.replaceAll(data.emoji,'')
	}
	const guild      = chanMeta.guildHall
	const guildEmoji = guild ? 	GuildUtils?.guildData?.[guild]?.emoji : null
	
	const prefix = [];
	if (chanMeta.awardsExp) prefix.push(config.xpemoji)
	if (chanMeta.threadMax > 0) prefix.push(threadIcon)
	if (chanMeta.guildHall) prefix.push(guildEmoji)
	if (chanMeta.locations.length > 0) prefix.push(`<@&${chanMeta.locations.join('><@&')}>`)
	chanMeta?.userOwner?.forEach(owner => {
		if (!topic.includes(`<@${owner}>`)) prefix.push(`<@${owner}>`)	
	})
	topic = prefix.join("") + "\n" + topic.trim()
	
	if (topic.length > 1024)
		throw new Error(`Topic is too long to include ${config.xpemoji} icon`)	

	console.log(topic,"\n\n\n")
	
	try { await channel.setTopic(topic)	}
	catch(e){ console.error(e); throw e; }

}


async function deleteDBRecord(channelId)
{
	await ChannelMeta.findOneAndDelete({channelId:channelId})
}

async function updateDBRecord(chanMeta)
{
	const channelId = chanMeta.channelId;
	const newResult = await ChannelMeta.findOneAndUpdate(
		{channelId: channelId},
		chanMeta,
		{
			upsert: true
		})
	return newResult
}

function generateMetaEmbed(chanMeta)
{	
	const embed      = new EmbedBuilder().setTitle("Channel Meta")
	if (chanMeta)
	{
		const ownerStr   = chanMeta.userOwner.map(owner => `<@${owner}> (\`${owner}\`)`).join("\n")
		const owner      = chanMeta.userOwner.length ? {name:"Owners",value:ownerStr} : {name:"Owners",value:"*None*",inline:true}
		const guild      = chanMeta.guildHall
		const guildEmoji = guild ? GuildUtils?.guildData[guild]?.emoji : null;
		const guildValue = guild ? {name:"Guild",value:`${guildEmoji}${guild}`} : {name:"Guild",value:`*None*`,inline:true}
	
		const threadValue = chanMeta.threadMax > 0 ? `✅ **(Max ${chanMeta.threadMax}x${threadIcon}**)` : "❌ Off";
		embed.setFooter({text:chanMeta.channelId})
		embed.setDescription(`\`${"".padEnd(4092," ")}\``)
		embed.addFields([{name:"Channel", value:`<#${chanMeta.channelId}> (\`${chanMeta.channelId}\`)`}]);
		embed.addFields([
			{name:`${config.xpemoji} RP Exp`, value:`${chanMeta.awardsExp ? "✅ On "+ config.xpemoji : "❌ Off"}`, inline:true},
			{name:`🧵 Threads`, value:`${threadValue}`, inline:true},
			{name:`📍 Tracked`, value:`${chanMeta.trackActivity ? "✅ On" : "❌ Off"}`, inline:true}
		]);
		const locationRoles = "<@&" + chanMeta.locations.join(">\n<@&") + ">"	
		const hasLocations = chanMeta.locations.length > 0
		embed.addFields([{name:"Locations", value: hasLocations ? locationRoles : "*None*", inline: !hasLocations}])
		if (guildValue) embed.addFields([guildValue])
		if (owner) embed.addFields([owner])
	}
	else embed.setDescription("No channel meta data available")

	return embed;
}

async function generateComponents(interaction, chanMeta, isBuilder, publicFlag = null)
{
	const minLocations = isBuilder ? 0 : 1
	const maxLocations = isBuilder ? 5 : 1

	console.log(chanMeta)
	
	const useGuildLocations = (isBuilder && !publicFlag) //&& chanMeta.guildHall)	
	let locations = JSON.parse(JSON.stringify(useGuildLocations ? ChanUtils.guildLocations : ChanUtils.locations));
		locations = locations.map( role => {
			if (chanMeta.locations.includes(role.value)) role.default = true
			return role;
		})
	if (!useGuildLocations) locations.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0))
	const location = Prompt.createSelectRow(`${data.name}.location`,locations,
											minLocations,maxLocations,"Locations (None Selected)");
	
	let guilds = JSON.parse(JSON.stringify(guildOption.choices));
		guilds = guilds.map( guild => {
			guild.default = (guild.value == chanMeta.guildHall)
			guild.label = guild.name
			delete guild.name;		
			return guild
		})
		guilds = [{label:"None",value:"none"},...guilds]
	const guildHall = Prompt.createSelectRow(`${data.name}.guild`,guilds,1,1,"Guild Hall (None selected)");

	///Owners selection box
	// const select  = new UserSelectMenuBuilder().setCustomId('user-select')
	// 									 	   .setPlaceholder('Select a user')
	// 										   .setMinValues(1).setMaxValues(5)
 	// const row = new ActionRowBuilder().addComponents(select);
    const users = await Promise.all( chanMeta?.userOwner?.map(async (id) => {
		try {
			const user = await interaction.client.users.fetch(id);
			return user;
		} catch (error) {
			console.error(`Error fetching user with ID ${id}: ${error}`);
			return null;
		}		
	}) );
    // Filter out any null values that may have been returned due to errors
    const validUsers = users.filter((user) => user !== null);
    // Do something with the fetched users, e.g. send their usernames in a message
    const owners = validUsers.map((user) => { return { label: user.username, value: user.id, default:true } });	
	console.log(owners)
	const ownerSelect = Prompt.createSelectRow(`${data.name}.modifyOwners`,owners,0,owners.length,"Owners")
	const buttons = [
		{style:ButtonStyle.Secondary, emoji:config.xpemoji, label:'RP Exp', custom_id:`${data.name}.toggleExp`},
		// {style:ButtonStyle.Secondary, emoji:threadIcon, label:'➖', custom_id:`${data.name}.decThread`},
		// {style:ButtonStyle.Secondary, emoji:threadIcon, label:'➕', custom_id:`${data.name}.incThread`},	
		{style:ButtonStyle.Secondary, emoji:threadIcon, label:'Threads', custom_id:`${data.name}.toggleThread`},
		{style:ButtonStyle.Secondary, emoji:"📍", label:'Activity', custom_id:`${data.name}.toggleTrack`},
		{style:ButtonStyle.Secondary, emoji:'👤', label:'Owner', custom_id:`${data.name}.assignOwner`},
		{style:ButtonStyle.Secondary, label:'Log Perms', custom_id:`${data.name}.permDebug`}		
	]
	const locationPub = {style:ButtonStyle.Secondary,
						 label:`Location: ${useGuildLocations?"Guilds":"Public"}`, 
						 custom_id:`${data.name}.publicLocation.${!publicFlag}`}
	const deleteMeta  = {style:ButtonStyle.Danger,emoji:"🗑️", label: "Delete", custom_id:`${data.name}.deleteRecord`}
	const revertPerms = {style:ButtonStyle.Secondary,emoji:"⏮️", label:'Reset Perm', custom_id:`${data.name}.syncPerms`}
	const topicButton = {style:ButtonStyle.Secondary,emoji:"🔄", label:'Refresh Topic', custom_id:`${data.name}.refreshTopic`}

	const components = [];
	if (isBuilder) components.push(Prompt.createButtonRow(buttons))			//Row 1 - Buttons (Builder Only)
	components.push(location);												//Row 2 - Location Select (Visible to owner)
	if (isBuilder) components.push(guildHall);								//Row 3 - Guild Hall (Builder Only)
	if (isBuilder && chanMeta.userOwner.length) components.push(ownerSelect)//Row 4 - Owner Edit (Builder Only)
	
	const miscButtons = [];										
	if (isBuilder) miscButtons.push(deleteMeta)								//		- Delete the database record (Builder Only)
	if (isBuilder) miscButtons.push(locationPub)							//		- Public/Guild Hall Loc Toggle (Builder Only)	
	if (isBuilder) miscButtons.push(revertPerms)							//		- Revert permissions to current
	//if (isBuilder) miscButtons.push(permDebug)							//		- Log the permissions to the console.
	miscButtons.push(topicButton)											//		- Topic Button (Visible to owner)
	components.push(Prompt.createButtonRow(miscButtons));					//Row 5 - Misc Buttons

	return components
}

async function execute(interaction, expOverride = null)
{
	await interaction.deferReply({ephemeral:true})	

	const isBuilder= Utils.hasAnyRole(interaction.member, whitelistRoles);
	const channel  = interaction.channel;
	const owner    = interaction.options.getUser('owner')?.id ?? null;
	const guild    = interaction.options.getString('guild') ?? null;
	let	  source   = interaction.options.getChannel('source') ?? null;
	let   dirty    = false;
	let   chanMeta = await ChannelMeta.findOne({channelId:channel.id});
			  
	if (!chanMeta)
	{
		chanMeta   = { channelId: channel.id, name: channel.name, ...defaultChanMeta}; dirty = true
		if (source)
		{
			source = await ChannelMeta.findOne({channelId:source.id});
			chanMeta.awardsExp = source.awardsExp;
			chanMeta.userOwner = source.userOwner;
			chanMeta.guildHall = source.guildHall;
			chanMeta.threadMax = source.threadMax
			chanMeta.locations = source.locations;
			chanMeta.trackActivity = source.trackActivity;	
		}
	}
	
	const isOwner  = chanMeta?.userOwner?.includes(interaction.user.id) ?? false;

	if (owner && !chanMeta.userOwner.includes(owner)){ chanMeta.userOwner.push(owner); dirty = true }
	if (guild && guild != chanMeta.guildHall){ chanMeta.guildHall = guild; dirty = true }

	if (expOverride)
	{
		chanMeta.awardsExp = expOverride;
		dirty = true;		
	}

	if (dirty && (isBuilder || isOwner))
	{
		//Prepare the embed
		const embed = new EmbedBuilder().setTitle(`Channel Updated`)
					.addFields([{name:`Experience`,
								 value:`<#${channel.id}> ${chanMeta.awardsExp?"is":"is not"} eligible for \`/scene\` experience`}])
		const result = await updateDBRecord(chanMeta)
		if (expOverride && result)
			await channel.send({embeds:[embed]})

		if (owner)
		{
			const result = await updateChannelPerms(channel, chanMeta)
			console.log(result)
			interaction.followUp({content:result.join("\n"), ephemeral:true})
		}
	}
	
	
	await editReply(interaction, chanMeta)
}

async function editReply(interaction, chanMeta, publicFlag = null)
{
	const user     = interaction.user;
	// Check if the user is a moderator or the channel owner
    const isOwner  = chanMeta.userOwner.includes( user.id );
	const isBuild  = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const components = (isOwner || isBuild) ? await generateComponents(interaction, chanMeta, isBuild, publicFlag) : []
	const embed = generateMetaEmbed(chanMeta)
	await interaction.editReply({embeds:[embed], components:components});	
}

async function handleInteraction(interaction)
{
	const isBuilder= Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const customId = interaction.customId;
	const message  = interaction.message || null;
	const embed    = message?.embeds?.[0] || null;
	let   channel  = embed?.footer?.text || "";
	if (!message || !embed || !channel) return;
	if (`${data.name}.assignOwner` != customId)
		await interaction.deferUpdate();
	
	let chanMeta   = await ChannelMeta.findOne({channelId:channel});
		  channel  = await interaction.guild.channels.fetch(channel);	
	let dirty      = true;
	let permsDirty = false;
	let publicFlag = false;
	console.log(`HandleSelect: ${customId} for ${chanMeta?.channelId}`)
	if (!chanMeta) return;		
	chanMeta.threadMax = chanMeta.threadMax ?? 0;
	chanMeta.name = channel.name;

	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")
	const command = customId.replace(prefix,"");	
	switch(command)
	{
		case `incThread`:
			if (!isBuilder) return;
			chanMeta.threadMax++;
			break;			
		case `decThread`:			
			if (!isBuilder) return;
			chanMeta.threadMax--;
			chanMeta.threadMax = Math.max(0, chanMeta.threadMax);
			break;
		case `toggleThread`: 			
			if (!isBuilder) return;
			chanMeta.threadMax = chanMeta.threadMax ? 0 : defaultThreadMax;
			// chanMeta.threadMax = defaultThreadMax - chanMeta.threadMax;
			// chanMeta.threadMax = Math.max(0, chanMeta.threadMax);
			break;			
		case `clearOwner`:
			if (!isBuilder) return;
			chanMeta.userOwner = [];
			permsDirty = true;
			break;
		case `assignOwner`:
			const modal = await Prompt.promptModal(interaction, "Enter user ID", "owner"+interaction.id);
			if (modal?.fields)
			{
				const newOwner = modal.fields.getTextInputValue('input');
				let user = null
				try { 
					user = await interaction.client.users.fetch(newOwner) 
					if (!user) throw "Invalid User"
					if (!chanMeta.userOwner.includes(newOwner))
					{
						await modal.reply({content:`${user} added as a channel owner`, ephemeral: true})
						chanMeta.userOwner.push(newOwner)
						permsDirty = true;
					} else await modal.reply({content:`${user} was already a channel owner`, ephemeral: true})
				} catch {}
				if (!user) await modal.reply({content:`${newOwner} is not a valid user`,ephemeral: true});
			}
			break;
		case `modifyOwners`:
			chanMeta.userOwner = interaction.values
			permsDirty = true;
			break;
		case `location`:
			chanMeta.locations = interaction.values
			permsDirty = true;
			break;
		case `toggleTrack`:
			if (!isBuilder) return;
			chanMeta.trackActivity = !chanMeta.trackActivity;
			break;
		case `toggleExp`:
			if (!isBuilder) return;
			chanMeta.awardsExp = !chanMeta.awardsExp;
			break;
		case `guild`:
			if (!isBuilder) return;
			chanMeta.guildHall = interaction.values[0];			
			if (chanMeta.guildHall == "none") chanMeta.guildHall = ""
			break;			
		case `publicLocation.true`:
			publicFlag = true;
		case `publicLocation.false`:
			dirty = false;
			break;			
		case `permDebug`:
			getCurrentChanMeta(channel, chanMeta)
			dirty = false;
			break;			
		case `syncPerms`:
			chanMeta = getCurrentChanMeta(channel, chanMeta, true)
			break;
		case `deleteRecord`:
			deleteDBRecord(channel.id)
			chanMeta = getDefaultChanMeta(channel)
			dirty = false;
			permsDirty = false;
			break;
		case `refreshTopic`:
			await editReply(interaction, chanMeta, publicFlag)			
			try { await updateChannelTopic(channel, chanMeta) } 
			catch(e) { interaction.followUp({content:e, ephemeral:true}) }
			return
		default: dirty = false;
	}	
	if (dirty)
		await updateDBRecord(chanMeta);
	if (permsDirty)
	{
		const result = await updateChannelPerms(channel, chanMeta)
		console.log(result)
		interaction.followUp({content:result.join("\n"), ephemeral:true})
	}
	await editReply(interaction, chanMeta, publicFlag)	
}

// 	//Update the channel topic with the exp icon if the bot has the right permissions
// 	const chanPerms = channel.permissionsFor(interaction.client.user);
// 	if (null != expIcon && chanPerms.has(PermissionsBitField.Flags.ManageChannels))
// 		await updateTopic(target, channelMeta.awardsExp)

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
	.setName(`chanmeta${config.DEV ? "dev" : ""}`)
	.setDescription('Modify channel metadata')
	.setDefaultPermission(false)
	
	.addChannelOption(option => option.setName('source').setDescription('Target channel to duplicate')
									  .setRequired(false).addChannelTypes(ChannelType.GuildText))
	.addUserOption(option => option.setName('owner').setDescription('Specify the user who owns this channel'))
	.addStringOption(guildOption)

const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.BuilderRole	];

module.exports = 
{
	data: data,
	whitelistRoles: whitelistRoles,
	userPermissions: userPermissions,
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,

	build:config.PRODUCTION || config.DEV
};