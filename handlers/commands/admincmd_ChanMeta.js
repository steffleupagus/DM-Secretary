const { SlashCommandBuilder, SlashCommandStringOption, ChannelType, ButtonStyle,
	   	EmbedBuilder,
	    PermissionsBitField } = require('discord.js')
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const GuildUtils = require(`../../utilities/guildUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const defaultChanMeta = { awardsExp: false, trackActivity: false, threadMax: 0, userOwner: "", guildHall: "", locations: [] }
const threadIcon = "🧵";

const locationPermission = { ViewChannel: true };
const ownerPermission = { ViewChannel: true, ManageChannels: true, ManageMessages: true, ManageThreads: true }

//Put these in a centralized location so we don't copy/paste them in multiple places
const locationRoles = [
	{value:"1001640103841632306", label:"OpenRP"},
	{value:"694854069684142101", label:"City Square"},
	{value:"695642023037763664", label:"City Administrative District"},
	{value:"695641905811292240", label:"City Entertainment District"},
	{value:"695808294945816586", label:"City Colosseum"},
	{value:"695641963642224750", label:"City Residential Quarter"},
	{value:"696534005671133224", label:"City Inn"},
	{value:"696533919075401788", label:"City Tavern"},
	{value:"699065480165589003", label:"City Gardens"},
	{value:"695641819094188042", label:"City Mercantile Quarter"},
	{value:"711726751549489203", label:"City Cyu'unt Restaurant"},
	{value:"697748561357701131", label:"City Sewer"},
	{value:"709376645521342464", label:"City Slum"},
	{value:"713002635267145758", label:"City Dock"},
	{value:"695238063517073461", label:"Outside City Blessed Gate"},
	{value:"697174243556982816", label:"Outside City Cursed Gate"},
	{value:"699203153274601491", label:"Arcanum Tower Guild Hall"},
	{value:"697748746406068314", label:"Black Hand Guild Hall"},
	{value:"742107924255735849", label:"Guardian Guild Barracks	"},
	{value:"699205524960313424", label:"Temple District"},
	{value:"696807848117534820", label:"Silver Thorn Brothel"},
	{value:"699064641950842880", label:"Silver Thorn Suites"},
	{value:"833787998150590481", label:"Wilderness"}
]

const guildLocationRoles = [
	{value:"699203153274601491", label:"Arcanum Tower Guild Hall"},
	{value:"742107921835360376", label:"Arcanum Inner Sanctum"},

	{value:"697748746406068314", label:"Black Hand Guild Hall"},
	{value:"742107953577984110", label:"Black Hand Inner Sanctum"},
	
	{value:"699205524960313424", label:"Temple District"},
	{value:"766031999864668191", label:"Temple Sanctuary"},
	
	{value:"695808294945816586", label:"City Colosseum"},
	{value:"742107924255735849", label:"Guardian Guild Barracks	"},

	{value:"833787998150590481", label:"Wilderness"},
	{value:"853362003691438101", label:"Outrider's Lodge Guild Hall"},
	
	{value:"696807848117534820", label:"Silver Thorn Brothel"},
	{value:"699064641950842880", label:"Silver Thorn Suites"},
	{value:"768307340625575977", label:"Brothel Blindfold Room"},
]



function getCurrentChanMeta(channel, chanMeta, sync = false)
{
	const locations = {}
	locationRoles.forEach(role => { locations[role.value] = role.label; })
	guildLocationRoles.forEach(role => { locations[role.value] = role.label; })
	const ids = Object.keys(locations)
	const owners = [];
	if (null === chanMeta)
	{	
		sync = true;
		chanMeta = { channelId: channel.id, ...defaultChanMeta};
	}

	if (sync)
	{
		chanMeta.locations = [];
		chanMeta.userOwner = "";
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
		chanMeta.userOwner = owners[0];

	console.log(chanMeta)
	
	if (sync) return chanMeta;
}


async function updateChannelPerms(channel, chanMeta)
{
	const locations = {}
	locationRoles.forEach(role => { locations[role.value] = role.label; })
	guildLocationRoles.forEach(role => { locations[role.value] = role.label; })
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
		else if ((val.type == 1)&&				//User Permission
	 			 (chanMeta.userOwner)&&			//And this channel has a registered owner
				 (id != chanMeta.userOwner))	//But this user isn't the owner
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
	if (chanMeta.userOwner)
	{
		const val = channel.permissionOverwrites.cache.get(chanMeta.userOwner);
		if (!val || !val.allow.has(PermissionsBitField.Flags.ManageChannels))
		{
			output.push(`Adding permissions for owner: <@${chanMeta.userOwner}>`);
			channel.permissionOverwrites.create(chanMeta.userOwner, ownerPermission);
		}		
	}

	return output;	
}

async function updateChannelTopic(channel, chanMeta)
{
	let topic = channel.topic || ""
		
	if (topic.includes(config.xpemoji)) topic = topic.replaceAll(config.xpemoji,``)
	if (topic.includes(threadIcon)) topic = topic.replaceAll(threadIcon,``)
	if (topic.includes(":thread:")) topic = topic.replaceAll(":thread:",``)	 
	locationRoles.forEach( role => 
	{
		const value = `<@&${role.value}>`
		if (topic.includes(value)) topic = topic.replaceAll(value,``)
	})
	guildLocationRoles.forEach( role => 
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
	if (chanMeta.userOwner && !topic.includes(`<@${chanMeta.userOwner}>`)) prefix.push(`<@${chanMeta.userOwner}>`)
	topic = prefix.join("") + "\n" + topic.trim()
	
	if (topic.length > 1024)
		throw new Error(`Topic is too long to include ${config.xpemoji} icon`)	

	console.log(topic,"\n\n\n")
	
	try { await channel.setTopic(topic)	}
	catch(e){ console.error(e); throw e; }

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
	const owner      = chanMeta.userOwner ? {name:"Owner",value:`<@${chanMeta.userOwner}> (\`${chanMeta.userOwner}\`)`} : null
	const guild      = chanMeta.guildHall
	const guildEmoji = guild ? GuildUtils?.guildData[guild]?.emoji : null
	const guildValue = guild ? {name:"Guild",value:`${guildEmoji}${guild}`} : null	
	const embed      = new EmbedBuilder().setTitle("Channel Meta")
	if (chanMeta)
	{
		const threadValue = chanMeta.threadMax > 0 ? `✅ **(Max ${chanMeta.threadMax}x${threadIcon}**)` : "❌ Off";
		embed.setFooter({text:chanMeta.channelId})
		embed.addFields([{name:"Channel", value:`<#${chanMeta.channelId}> (\`${chanMeta.channelId}\`)`}]);
		embed.addFields([
			{name:`${config.xpemoji} RP Exp`, value:`${chanMeta.awardsExp ? "✅ On "+ config.xpemoji : "❌ Off"}`, inline:true},
			{name:`🧵 Threads`, value:`${threadValue}`, inline:true},
			{name:`📍 Tracked`, value:`${chanMeta.trackActivity ? "✅ On" : "❌ Off"}`, inline:true}
		]);
		if (owner) embed.addFields([owner])
		if (guildValue) embed.addFields([guildValue])
		const locationRoles = "<@&" + chanMeta.locations.join(">\n<@&") + ">"	
		embed.addFields([{name:"Location Roles", value:chanMeta.locations.length > 0 ? locationRoles : "*None*"}])
	}
	else embed.setDescription("No channel meta data available")

	return embed;
}

function generateComponents(chanMeta, isBuilder, publicFlag = null)
{
	const minLocations = isBuilder ? 0 : 1
	const maxLocations = isBuilder ? 5 : 1

	console.log(chanMeta)
	
	const useGuildLocations = (isBuilder && chanMeta.guildHall && !publicFlag)	
	let locations = JSON.parse(JSON.stringify(useGuildLocations ? guildLocationRoles : locationRoles));
		locations = locations.map( role => {
			if (chanMeta.locations.includes(role.value)) role.default = true
			return role;
		})
	if (!useGuildLocations) locations.sort((a,b) => (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0))
	const location = Prompt.createSelectRow(`${data.name}.location`,locations,
											minLocations,maxLocations,"Select Location");
	
	let guilds = JSON.parse(JSON.stringify(guildOption.choices));
		guilds = guilds.map( guild => {
			guild.default = (guild.value == chanMeta.guildHall)
			guild.label = guild.name
			delete guild.name;		
			return guild
		})
		guilds = [{label:"None",value:"none"},...guilds]
	const guildHall = Prompt.createSelectRow(`${data.name}.guild`,guilds,1,1,"Is this area guild controlled?");
	
	const buttons = [
		{style:ButtonStyle.Secondary, emoji:config.xpemoji, label:'RP Exp', custom_id:`${data.name}.toggleExp`},
		{style:ButtonStyle.Secondary, emoji:threadIcon, label:'➖', custom_id:`${data.name}.decThread`},
		{style:ButtonStyle.Secondary, emoji:threadIcon, label:'➕', custom_id:`${data.name}.incThread`},	
		{style:ButtonStyle.Secondary, emoji:"📍", label:'Track Activity', custom_id:`${data.name}.toggleTrack`}		
	]
	const locationPub = {style:ButtonStyle.Secondary,
						 label:`Location: ${useGuildLocations?"Guilds":"Public"}`, 
						 custom_id:`${data.name}.publicLocation.${useGuildLocations}`}
	const permDebug   = {style:ButtonStyle.Secondary,label:'Log Perms', custom_id:`${data.name}.permDebug`}
	const revertPerms = {style:ButtonStyle.Secondary,emoji:"⏮️", label:'Undo Perms', custom_id:`${data.name}.syncPerms`}
	const ownerButton = {style:ButtonStyle.Danger,emoji:"🚫", label:'Clear Owner', custom_id:`${data.name}.clearOwner`}
	const topicButton = {style:ButtonStyle.Secondary,emoji:"🔄", label:'Refresh Topic', custom_id:`${data.name}.refreshTopic`}
	
	const components = [];
	if (isBuilder) components.push(Prompt.createButtonRow(buttons))			//Row 1 - Buttons (Builder Only)
	components.push(location);												//Row 2 - Location Select (Visible to owner)
	if (isBuilder) components.push(guildHall);								//Row 3 - Guild Hall (Builder Only)

	const miscButtons = [topicButton];										//		- Topic Button (Visible to owner)
	if (isBuilder && chanMeta.guildHall) miscButtons.push(locationPub)		//		- Public/Guild Hall Loc Toggle (Builder Only)
	if (isBuilder && chanMeta.userOwner) miscButtons.push(ownerButton)		//		- Clear Owner Button (Builder Only)
	components.push(Prompt.createButtonRow(miscButtons));					//Row 4 - Misc Buttons

	const permButtons = [permDebug, revertPerms];
	if (isBuilder) components.push(Prompt.createButtonRow(permButtons))		//Row 5 - Perm Buttons (Builder Only)

	return components
}

async function execute(interaction, expOverride = null)
{
	await interaction.deferReply({ephemeral:true})	

	const isBuilder= Utils.hasAnyRole(interaction.member, whitelistRoles);
	const channel  = interaction.options.getChannel('target') ?? interaction.channel;
	const owner    = interaction.options.getUser('owner')?.id ?? null;
	const guild    = interaction.options.getString('guild') ?? null;
	let   dirty    = false;
	let   chanMeta = await ChannelMeta.findOne({channelId:channel.id});
	const isOwner  = chanMeta.userOwner == interaction.user.id;
	
	if (!chanMeta)
	{
		chanMeta   = { channelId: channel.id, ...defaultChanMeta}; dirty = true
	}
	let oldOwner = chanMeta.userOwner;
	if (owner && owner != chanMeta.userOwner){ chanMeta.userOwner = owner; dirty = true }
	if (guild && guild != chanMeta.guildHall){ chanMeta.guildHall = guild; dirty = true }
	if (oldOwner == chanMeta.userOwner) oldOwner = null

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

		if (owner || oldOwner)
		{
			const result = await updateChannelPerms(channel, chanMeta, oldOwner)
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
    const isOwner  = chanMeta.userOwner === user.id;
	const isBuild  = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const components = (isOwner || isBuild) ? generateComponents(chanMeta, isBuild, publicFlag) : []
	const embed = generateMetaEmbed(chanMeta)
	await interaction.editReply({embeds:[embed], components:components});	
}

async function handleInteraction(interaction)
{
	await interaction.deferUpdate();
	const isBuilder= Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const customId = interaction.customId;
	const message  = interaction.message || null;
	const embed    = message?.embeds?.[0] || null;
	let   channel  = embed?.footer?.text || "";
	if (!message || !embed || !channel) return;
	let chanMeta   = await ChannelMeta.findOne({channelId:channel});
		  channel  = await interaction.guild.channels.fetch(channel);	
	let oldOwner   = null;
	let dirty      = true;
	let permsDirty = false;
	let publicFlag = false;
	console.log(`HandleSelect: ${customId} for ${chanMeta?.channelId}`)
	if (!chanMeta) return;		
	switch(customId)
	{
		case `${data.name}.incThread`:
			if (!isBuilder) return;
			chanMeta.threadMax++;
			break;			
		case `${data.name}.decThread`:			
			if (!isBuilder) return;
			chanMeta.threadMax--;
			chanMeta.threadMax = Math.max(0, chanMeta.threadMax);
			break;			
		case `${data.name}.clearOwner`:
			if (!isBuilder) return;
			oldOwner = chanMeta.userOwner
			chanMeta.userOwner = "";
			permsDirty = true;
			break;			
		case `${data.name}.toggleTrack`:
			if (!isBuilder) return;
			chanMeta.trackActivity = !chanMeta.trackActivity;
			break;
		case `${data.name}.toggleExp`:
			if (!isBuilder) return;
			chanMeta.awardsExp = !chanMeta.awardsExp;
			break;
		case `${data.name}.guild`:
			if (!isBuilder) return;
			chanMeta.guildHall = interaction.values[0];			
			if (chanMeta.guildHall == "none") chanMeta.guildHall = ""
			break;			
		case `${data.name}.location`:
			chanMeta.locations = interaction.values;
			permsDirty = true;
			break;
		case `${data.name}.publicLocation.true`:
			publicFlag = true;
		case `${data.name}.publicLocation.false`:
			dirty = false;
			break;			
		case `${data.name}.permDebug`:
			getCurrentChanMeta(channel, chanMeta)
			dirty = false;
			break;			
		case `${data.name}.syncPerms`:
			chanMeta = getCurrentChanMeta(channel, chanMeta, true)
			dirty = true;
			break;			
		case `${data.name}.refreshTopic`:
			try { await updateChannelTopic(channel, chanMeta) } 
			catch(e) { interaction.followUp({content:e, ephemeral:true}) }
		default: dirty = false;
	}	
	if (dirty)
		await updateDBRecord(chanMeta);
	if (permsDirty)
	{
		const result = await updateChannelPerms(channel, chanMeta, oldOwner)
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
	
	.addChannelOption(option => option.setName('channel').setDescription('Target channel. Defaults to current channel')
									  .setRequired(false).addChannelTypes(ChannelType.GuildText))
	.addUserOption(option => option.setName('owner').setDescription('Specify the user who owns this channel'))
	.addStringOption(guildOption)

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

	build:config.PRODUCTION || config.DEV
};