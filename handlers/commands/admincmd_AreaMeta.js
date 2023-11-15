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

async function updateDBRecord(area, areaMeta)
{
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

	if (update["$set"] != {})
	{
		record = await AreaMeta.findOneAndUpdate(query, update, options);		
	}
	return record
}

async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})	

	const area 	   	= interaction.options.getString('area');
	const category 	= interaction.options.getChannel('category') ?? null;
	const role     	= interaction.options.getRole('role') ?? null;
	const icon 		= interaction.options.getString('icon') ?? null;
	const guild 	= interaction.options.getString('guild') ?? null;
	
	const areaMeta = {
		name: 	area,
		catId:	category?.id,
		roleId:	role?.id,
		icon:	icon,
		guild:	guild
	}
	const record = await updateDBRecord(area, areaMeta)
	console.log(record);

	let embed = generateMetaEmbed(record)
	interaction.editReply({embeds:[embed]})
}

function generateMetaEmbed(areaMeta)
{	
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
									  .setRequired(true))
	.addChannelOption(option => option.setName('category').setDescription('Channel Category')
									  .setRequired(false).addChannelTypes(ChannelType.GuildCategory))
	.addRoleOption(option => option.setName('role').setDescription('Location Role').setRequired(false))
	.addStringOption(option => option.setName('icon').setDescription('Location Emoji').setRequired(false))
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


/*
async function generateComponents(interaction, chanMeta, isBuilder, publicFlag = null)
{
	const minLocations = 0
	const maxLocations = 5

	const useGuildLocations = (isBuilder && chanMeta.guildHall && !publicFlag)	
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
						 custom_id:`${data.name}.publicLocation.${useGuildLocations}`}
	const revertPerms = {style:ButtonStyle.Secondary,emoji:"⏮️", label:'Reset Perm', custom_id:`${data.name}.syncPerms`}	
	const topicButton = {style:ButtonStyle.Secondary,emoji:"🔄", label:'Refresh Topic', custom_id:`${data.name}.refreshTopic`}

	const components = [];
	if (isBuilder) components.push(Prompt.createButtonRow(buttons))			//Row 1 - Buttons (Builder Only)
	components.push(location);												//Row 2 - Location Select (Visible to owner)
	if (isBuilder) components.push(guildHall);								//Row 3 - Guild Hall (Builder Only)
	if (isBuilder && chanMeta.userOwner.length) components.push(ownerSelect)//Row 4 - Owner Edit (Builder Only)
	
	const miscButtons = [];										
	if (isBuilder && chanMeta.guildHall) miscButtons.push(locationPub)		//		- Public/Guild Hall Loc Toggle (Builder Only)	
	if (isBuilder) miscButtons.push(revertPerms)							//		- Revert permissions to current
	//if (isBuilder) miscButtons.push(permDebug)							//		- Log the permissions to the console.
	miscButtons.push(topicButton)											//		- Topic Button (Visible to owner)
	components.push(Prompt.createButtonRow(miscButtons));					//Row 5 - Misc Buttons

	return components
}








/*






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
		case `${data.name}.toggleThread`: 			
			if (!isBuilder) return;
			chanMeta.threadMax = chanMeta.threadMax ? 0 : defaultThreadMax;
			// chanMeta.threadMax = defaultThreadMax - chanMeta.threadMax;
			// chanMeta.threadMax = Math.max(0, chanMeta.threadMax);
			break;			
		case `${data.name}.clearOwner`:
			if (!isBuilder) return;
			chanMeta.userOwner = [];
			permsDirty = true;
			break;
		case `${data.name}.assignOwner`:
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
		case `${data.name}.modifyOwners`:
			chanMeta.userOwner = interaction.values
			permsDirty = true;
			break;
		case `${data.name}.location`:
			chanMeta.locations = interaction.values
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
		const result = await updateChannelPerms(channel, chanMeta)
		console.log(result)
		interaction.followUp({content:result.join("\n"), ephemeral:true})
	}
	await editReply(interaction, chanMeta, publicFlag)	
}

*/