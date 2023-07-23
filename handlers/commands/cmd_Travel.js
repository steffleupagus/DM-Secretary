const { SlashCommandBuilder,
	    EmbedBuilder, 
	    PermissionsBitField, 
	    ButtonStyle } = require('discord.js')
const mod = process.env.mod || "";
const Utils = require(`../../utilities/utilFuncs.js`);
const config = require(`../../config/${mod}_config.json`);
const Prompt = require(`../../utilities/promptUtils.js`);
const AreaMeta = require(`../../database/areaMetaSchema.js`);
const ChanMeta = require(`../../database/chanMetaSchema.js`);

const MAX_LOCATIONS = 3;
const LOCATION_DATA = [];
const CHANNEL_ROLES = {};
let  LOCATION_ROLES = [];
const STATIC_ROLES  = [
	{emoji:"🌐",label:"Open RP",value:"1001640103841632306",order:999}
]
const DoChangeRoles = true;

async function RefreshLocationData(guild, force = false)
{
	if (LOCATION_DATA.length == 0 || force)
	{
		const areas = await AreaMeta.find({});
		areas.forEach(area => 
		{
			area.roleId.forEach(role => {
				  	  role = guild.roles.resolve(role)
				const name = role.name
				const desc = area.guild || null			
				const opt  = {emoji:area.icon,label:name,value:role.id}
				if   (desc)  opt.description = desc				
				opt.order  = role.position
				LOCATION_DATA.push(opt);
			})
		})
		STATIC_ROLES.forEach( x=> LOCATION_DATA.push(x) );
		LOCATION_DATA.sort( (a,b) => b.order - a.order );				
		LOCATION_ROLES = LOCATION_DATA.map(x => x.value)
		LOCATION_ROLES = [... new Set(LOCATION_ROLES)]
		// console.log(LOCATION_ROLES.map(x => `<@&${x}>`).join('\n'))
		const channels = await ChanMeta.find({});
		channels.forEach(chan =>
		{
			const locations = (chan.locations || []).filter( role => LOCATION_ROLES.includes(role) )		
			if (locations.length > 0)
				CHANNEL_ROLES[chan.channelId] = locations[0];
				CHANNEL_ROLES[chan.name] = locations[0];
		})
	}
}

///
///
///
async function chanMentionButton(channels)
{
	if (!channels || channels.size == 0)
		return null;

	await RefreshLocationData(channels.first().guild);
	let custom_id = `${data.name}.mention`

	channels = channels.map( channel => CHANNEL_ROLES[channel.id] ).filter(x => x);
	const roles = [...new Set(channels)]
	if (roles.length == 0) return null;
	
	const options = [{style:ButtonStyle.Secondary,emoji:"🗺️",label:"Travel",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function dmPingButton(channel)
{
	if (!channel) return null;

	await RefreshLocationData(channel.guild);
	channel = CHANNEL_ROLES[channel.id]
	if (!channel) return null;

	const custom_id = `${data.name}.dmtoggle:${channel}`
	const options = [{style:ButtonStyle.Secondary,emoji:"🗺️",label:"Travel",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function getLocationSelectRow(interaction, selectRoles = [], roles = null)
{
	await RefreshLocationData(interaction.guild);

	const id = `${data.name}.locations`
	const label = "●▬▬▬▬▬ 𝕷𝖔𝖈𝖆𝖙𝖎𝖔𝖓𝖘 ▬▬▬▬▬●"	
	const isUnlimited = (roles === null) && Utils.hasAnyRole(interaction.member, whitelistRoles);	
	roles = roles ?? Array.from(interaction.member.roles.cache.keys());
	let options = LOCATION_DATA.filter(opt => {
		return (selectRoles.length == 0) || selectRoles.includes(opt.value) || roles.includes(opt.value)
	}).map(opt => {
		const { order, ...loc } = opt;
		return loc
	});
	
	const maxOptions = Math.max(3, Math.min(25,options.length));
	const max = isUnlimited ? maxOptions : Math.min(MAX_LOCATIONS, options.length)

	let selected = 0;
	options = options.map(opt => {
		opt.default = roles.includes(opt.value) && (selected < max);
		if (opt.default) ++selected
		return opt
	})
	
	return Prompt.createSelectRow(id, options, 0, max, label)	
}

////// Update the user's roles
// End goal: Set roles on the target member
// * One role that represents the highest rank that user has in any guild
// * (Each guild) The highest-rank role of all user's characters that are in that guild
// * (Each guild) General guild role if they have at least one character in that guild
async function UpdateLocationRoles(interaction, selectedLocations)
{
	await RefreshLocationData(interaction.guild)

	//The user's starting roles
	let roles = Array.from(interaction.member.roles.cache.keys());

	// Figure out which roles we're removing from the user
	let removed = [];
	roles = roles.filter( role => 
	{		
		let keep = false;
		//Don't remove any roles that aren't location roles.
		if (!LOCATION_ROLES.includes(role)) keep = true;
		//Don't remove the role if it was selected to be kept.
		if (selectedLocations.includes(role)) keep = true;
		if (!keep) removed.push(role)
		return keep;
	})

	// Add required roles to the user
	let added = [];
	selectedLocations.forEach( role => 
	{		
		if (!roles.includes(role)) added.push(role);
	})
	roles = roles.concat(added);
	
	//Set the updated roles on the user if that function is enabled.
	if (DoChangeRoles)
		await interaction.member.roles.set(roles);

	//Return fields to display the changes to the user
	const fields = []
	
	common  = added.filter(val => removed.includes(val))
	removed = removed.filter(val => !common.includes(val));
	added   = added.filter(val => !common.includes(val));
	if (added.length == 0 && removed.length == 0)
		return null;
	// removed = removed.length == 0 ? "[None]" : `<@&${removed.join(">\n<@&")}>`
	if (removed.length > 0) 
		fields.push({name:"Departed", value: removed.map(x=>`<@&${x}>`).join('\n'), inline:true})
	// added   = added.length == 0 ? "[None]" : `<@&${added.join(">\n<@&")}>`
	if (added.length > 0) 
		fields.push({name:"Arrived", value: added.map(x=>`<@&${x}>`).join('\n'), inline:true})
	//Return the fields
	return fields;
}

///
/// Generic interaction handler
///
async function handleInteraction(interaction)
{
	const prefix = `${data.name}.`
	if (!interaction.customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")	

	const logChan = await interaction.guild.channels.fetch(config.debugLogChannel)
	const isUnlimited = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const customId = interaction.customId.split(":");
	const command = customId[0]?.replace(prefix,"");
	let roleIds = customId[1]?.split(",") || [];	
	const embed  = new EmbedBuilder()
	let components = [];
	let result = null;
	
	await interaction.deferReply({ephemeral:true})
	await RefreshLocationData(interaction.guild);
	const userRoles = Array.from(interaction.member.roles.cache.keys())
						   .filter(x => LOCATION_ROLES.includes(x));
	const MAX = isUnlimited ? 25 : MAX_LOCATIONS

	if (Utils.hasAnyRole(interaction.member, [config.NeedRPRole]))
	{
		embed.setDescription(`An approved character profile is required to view RP locations\n(<#${config.profileChannel}>)`)
		await interaction.editReply({embeds:[embed]})	
		return;
	}
	
	switch(command)
	{
		//Button components
		case `mention`:
			const message  = interaction.message || null;
			const footer   = (message?.embeds?.[0]?.footer?.text || "\n");
			const channels = footer?.split("\n").slice(1).map( x => CHANNEL_ROLES[x] ).filter(x => x);
				  roleIds  = [...new Set(channels)]
			//Fall through once we've parsed out all the roles from the mention embed
		case `toggle`:
		case `dmtoggle`:			
			const combinedRoles = [...new Set(userRoles.concat(roleIds))].filter(x=>x)	
			if (roleIds.length > 0 && combinedRoles.length <= MAX)
			{			
				console.log(combinedRoles)
				result = await UpdateLocationRoles(interaction, combinedRoles)			
				if (result) embed.addFields(result)
				else embed.setFooter({text:"You are already in this location"})
				//TODO - Show Depart button for roleIds
			}
			else
			{
				embed.setTitle("Select your Locations")
				embed.setDescription(`You may have a maximum of ${MAX} location roles.`)
				const select = await getLocationSelectRow(interaction, roleIds)
				components.push(select)
			}
			break;
		// case `depart`:
		// 	const remainingRoles = userRoles.filter(x => !roleIds.includes(x))
		// 	result = await UpdateLocationRoles(interaction, remainingRoles)
		// 	if (result) embed.addFields(result)
		// 	else embed.setFooter({text:"No location changed"})
		// 	break
		//Select component
		case `locations`:
			let selectedLocations = interaction.values;
			result = await UpdateLocationRoles(interaction, selectedLocations)
			if (result) 
			{
				embed.addFields(result)
				embed.setFooter({text:`${interaction.member.displayName} | ${interaction.member.id}`})
				await logChan.send({embeds:[embed]})
			}
			else embed.setFooter({text:"You are already in these locations"})
			//TODO - Show Depart button for selectedLocations - userRoles
			
			// selectedLocations = selectedLocations.map(x=>`<@&${x}>`).join('\n')
			break;
	}
	
	await interaction.editReply({embeds:[embed],components:components})
}

async function execute(interaction)
{
	//Set up for the response
	await interaction.deferReply({ephemeral:true})
	const embed = new EmbedBuilder();

	if (Utils.hasAnyRole(interaction.member, [config.NeedRPRole]))
	{
		embed.setDescription(`An approved character profile is required to view RP locations\n(<#${config.profileChannel}>)`)
		await interaction.editReply({embeds:[embed]})	
		return;
	}
	
	const components = []
	let showSelect = true;
	//Check options to see if they specified a location to travel to
	const selectedLocation = [];
	const location = interaction.options.getString('location') ?? null;

	const isUnlimited = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const MAX = isUnlimited ? 25 : MAX_LOCATIONS	
	if (location && LOCATION_ROLES.includes(location))
	{
		selectedLocation.push(location)
	
		await RefreshLocationData(interaction.guild);
		const userRoles = Array.from(interaction.member.roles.cache.keys())
							   .filter(x => LOCATION_ROLES.includes(x));
	
		const combinedRoles = [...new Set(userRoles.concat(selectedLocation))]
		if (combinedRoles.length <= MAX)
		{				
			showSelect = false;

			const result = await UpdateLocationRoles(interaction, combinedRoles)			
			if (result) embed.addFields(result)
			else embed.setFooter({text:"You are already in this location"})
			//TODO - Show Depart button for selectedLocation
		}
	}
	else if (location == "BuilderButton")
	{
		const options = [{style:ButtonStyle.Primary, emoji:"🗺️",
						  label:"Fast Travel", custom_id:`${data.name}.toggle`}]
		components.push(Prompt.createButtonRow(options))
		interaction.channel.send({components:components})
		await interaction.editReply({content:"Location Select Menu Added"})
		return;
	}
	else if (location == "BuilderMenu")
	{
		embed.setTitle("Select your Locations")
		embed.setDescription(`You may have a maximum of ${MAX_LOCATIONS} location roles.`)
		const select = await getLocationSelectRow(interaction,[],[])
		components.push(select)
		interaction.channel.send({embeds:[embed],components:components})

		await interaction.editReply({content:"Location Select Menu Added"})
		return;
	}

	if (showSelect)
	{
		embed.setTitle("Select your Locations")
		embed.setDescription(`You may have a maximum of ${MAX} location roles.`)
		const select = await getLocationSelectRow(interaction, selectedLocation)
		components.push(select)
	}
	
	await interaction.editReply({embeds:[embed],components:components})	
}

const data = new SlashCommandBuilder()
	.setName(`travel${config.DEV ? "dev" : ""}`)
	.setDescription('Fast travel throughout the city')
	.setDefaultPermission(false)
	.addStringOption(option => option
			.setName('location')
			.setDescription('Select the location you would like to travel to.')
			.setRequired(false)
			.setAutocomplete(true)
		)

const whitelistRoles = [ config.BuilderRole, config.DMOnDutyRole, config.ModeratorRole ]
const userPermissions = [ PermissionsBitField.Flags.SendMessages ];
module.exports = 
{
	data: data,
	userPermissions: userPermissions,
	execute: execute,
	autoComplete: autoComplete,
	button: handleInteraction,
	select: handleInteraction,
	attach:{
		chanMention:chanMentionButton,
		dmPing:dmPingButton
	},
	build:config.DEV
};


////// Handle autocomplete options for the location field
async function autoComplete(interaction)
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'location') 
	{
		await RefreshLocationData(interaction.guild)
		const value = focusedOption.value.toLowerCase();

		let response = LOCATION_DATA
		if (value.length > 0)
			response = LOCATION_DATA.filter(x => x.label.includes(value))
		response = response.map(x => { x.name = x.label; return x})
		//console.log(response)

		//Add menu options to the autocomplete list for owner.
		const user = interaction.member.id;	
		if (config.OWNERID == user)
		{
			response.push({ name: 'Builder: Create Menu', value: "BuilderMenu" });
			response.push({ name: 'Builder: Create Button', value: "BuilderButton" });			
		}

		try {		
			response = response.length <= 25 ? response : response.splice(0,25)
			interaction.respond(response);
		}
		catch (e) {}
	}
}