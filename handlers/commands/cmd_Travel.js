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

const ROLE_REQUIREMENTS = {
	"742107921835360376":"702348143752118372",	//@Arcanum Inner Sanctum       @Arcanum Guild
	"742107953577984110":"697848468986921030",	//@Black Hand Guild Hall       @Black Hand Guild
	"766031999864668191":"766031516038987786",	//@Temple Sanctuary            @Council of Faith
	"742107924255735849":"702481674344071178",	//@Guardian Guild Barracks     @Guardian Guild
	"853362003691438101":"853346385545920522"	//@Outrider's Lodge Guild Hall @Outrider's Lodge
}

async function RefreshLocationData(guild, force = false)
{
	if (LOCATION_DATA.length == 0 || force)
	{
		const areas = await AreaMeta.find({});
		areas.forEach(area =>
		{
			area.roleId.forEach(role => {
				  	  role = guild.roles.resolve(role)
				if (!role) return
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
async function activityButton(guild, roles)
{
	await RefreshLocationData(guild);
	// console.log(channels)
	// channels = channels.map( channel => CHANNEL_ROLES[channel] ).filter(x => x);
	// const roles = [...new Set(channels)]
	if (roles.length == 0) return null;

	let custom_id = `${data.name}.activity:${roles.join(',')}`
	const options = [{style:ButtonStyle.Secondary,emoji:"🗺️",label:"Travel",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function chanMentionButton(channels)
{
	if (!channels || channels.size == 0)
		return null;

	await RefreshLocationData(channels.first().guild);
	let custom_id = `${data.name}.mention`

	channels = channels.map( channel => {
		return CHANNEL_ROLES[channel.id] || CHANNEL_ROLES[channel.parent.id]
	}).filter(x => x);
	const roles = [...new Set(channels)]
	if (roles.length == 0) return null;

	custom_id = roles.reduce(function(previousValue, currentValue, currentIndex)
	{
		// console.log(`${previousValue} | ${currentValue}`)
		if (previousValue.length + 1 + currentValue.length < 100)
			return previousValue + (currentIndex == 0 ? ":" : ",") + currentValue
		return previousValue
	}, custom_id)

	const options = [{style:ButtonStyle.Secondary,emoji:"🗺️",label:"Travel",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function dmPingButton(channel)
{
	if (!channel) return null;

	await RefreshLocationData(channel.guild);
	channel = CHANNEL_ROLES[channel.id] || CHANNEL_ROLES[channel.parent.id]
	if (!channel) return null;

	const custom_id = `${data.name}.dmtoggle:${channel}`
	const options = [{style:ButtonStyle.Secondary,emoji:"🗺️",label:"Travel",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function getDepartButton(interaction, roles)
{
	await RefreshLocationData(interaction.guild);
	if (roles.length == 0) return null;
	roles = [...new Set(roles)]

	let custom_id = `${data.name}.depart`
	custom_id = roles.reduce(function(previousValue, currentValue, currentIndex)
	{
		if (previousValue.length + 1 + currentValue.length < 100)
			return previousValue + (currentIndex == 0 ? ":" : ",") + currentValue
		return previousValue
	}, custom_id)

	console.log(custom_id)

	const options = [{style:ButtonStyle.Secondary,emoji:"❌",label:"Depart",custom_id:custom_id}]
	return Prompt.createButtonRow(options)
}

async function getLocationSelectRow(interaction, selectRoles = [], roles = null)
{
	await RefreshLocationData(interaction.guild);

	const id = `${data.name}.locations`
	const label = "●▬▬▬▬▬ 𝕷𝖔𝖈𝖆𝖙𝖎𝖔𝖓𝖘 ▬▬▬▬▬●"
	const isUnlimited = (roles === null) && Utils.hasAnyRole(interaction.member, whitelistRoles);
	roles = roles ?? Array.from(interaction.member.roles.cache.keys());
	const requires = Object.keys(ROLE_REQUIREMENTS);
	let options = LOCATION_DATA.filter(opt => {
		return (selectRoles.length == 0) || selectRoles.includes(opt.value) || roles.includes(opt.value)
	}).filter(opt => {
		if (!requires.includes(opt.value)) return true;
		const requiredRole = ROLE_REQUIREMENTS[opt.value];
		if (roles.includes(requiredRole)) return true;
		return false;
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
	const requires = Object.keys(ROLE_REQUIREMENTS);

	// Figure out which roles we're removing from the user
	let removed = [];
	roles = roles.filter( role =>
	{
		let keep = false;
		//Don't remove any roles that aren't location roles.
		if (!LOCATION_ROLES.includes(role)) keep = true;
		//Don't remove the role if it was selected to be kept.
		if (selectedLocations.includes(role)) keep = true;

		if (requires.includes(role))
		{
			const requiredRole = ROLE_REQUIREMENTS[role];
			if (!roles.includes(requiredRole)) 
				keep = false;
		}

		if (!keep) removed.push(role)
		return keep;
	})

	console.log(removed.map(x=>`<@&${x}>`).join('\n'))

	// Add required roles to the user
	let added = [];
	selectedLocations.forEach( role =>
	{
		if (requires.includes(role))
		{
			const requiredRole = ROLE_REQUIREMENTS[role];
			if (!roles.includes(requiredRole)) 
				return false;
		}

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

	const logChanId = config.debug.travel
	const logChan = await interaction.guild.channels.fetch(logChanId)
	const isUnlimited = Utils.hasAnyRole(interaction.member, whitelistRoles);
	const customId = interaction.customId.split(":");
	const command = customId[0]?.replace(prefix,"");
	let roleIds = customId[1]?.split(",") || [];
	const embed  = new EmbedBuilder()
	let components = [];
	let result = null;

	await interaction.deferReply({ephemeral:true})
	await RefreshLocationData(interaction.guild);
	const allUserRoles = Array.from(interaction.member.roles.cache.keys())
	const userLocRoles = allUserRoles.filter(x => LOCATION_ROLES.includes(x));
	const MAX = isUnlimited ? 25 : MAX_LOCATIONS
	const requires = Object.keys(ROLE_REQUIREMENTS);
	let   defaultMsg = "You are already in this location"
	if (Utils.hasAnyRole(interaction.member, [config.role.NeedRP]))
	{
		embed.setDescription(`An approved character profile is required to view RP locations\n(<#${config.chan.pcProfile}>)`)
		await interaction.editReply({embeds:[embed]})
		return;
	}

	switch(command)
	{
		//Button components
		case `depart`:
			console.log(roleIds.map(x=>`<@&${x}>`).join('\n'))
			const remainingRoles = userLocRoles.filter(x => !roleIds.includes(x));
			result = await UpdateLocationRoles(interaction, remainingRoles)
			if (result) 
			{
				embed.addFields(result)
				embed.setDescription(`<@${interaction.member.id}>`)
				await logChan.send({embeds:[embed]})
			}
			else embed.setFooter({text:"You are no longer in this location"})
			break;
		case `mention`:
			const message  = interaction.message || null;
			const footer   = (message?.embeds?.[0]?.footer?.text || "\n");
			const channels = footer?.split("\n").slice(1).map( x => CHANNEL_ROLES[x] ).filter(x => x);
			const parsed   = [...new Set(channels)]
				  roleIds  = (parsed.length > roleIds) ? parsed : roleIds;
			//Fall through once we've parsed out all the roles from the mention embed
		case `toggle`:
		case `dmtoggle`:
		case `activity`:
			const combinedRoles = [...new Set(userLocRoles.concat(roleIds))].filter(x=>x).filter(x => {
				const requirementsMet = filterRequired(x, allUserRoles);
				if (!requirementsMet)
					defaultMsg = "You lack a required guild role to enter this location."
				return requirementsMet;
			})

			let showDepart = false;
			if (roleIds.length > 0 && combinedRoles.length <= MAX)
			{
				//console.log(combinedRoles)
				result = await UpdateLocationRoles(interaction, combinedRoles)
				if (result)
				{
					showDepart = true;
					embed.addFields(result)
					embed.setDescription(`<@${interaction.member.id}>`)
					await logChan.send({embeds:[embed]})
				}
				else embed.setFooter({text:defaultMsg})
				const depart = await getDepartButton(interaction, roleIds);
				if (showDepart)
					components.push(depart)
			}
			else
			{
				embed.setTitle("Select your Locations")
				embed.setDescription(`You may have a maximum of ${MAX} location roles.`)
				const select = await getLocationSelectRow(interaction, roleIds)
				components.push(select)
			}
			break;

		//Select component
		case `locations`:
			let selectedLocations = interaction.values
			selectedLocations = selectedLocations.filter(x=>x).filter(x => {
				const requirementsMet = filterRequired(x, allUserRoles);
				if (!requirementsMet)
					defaultMsg = "You lack a required guild role to enter this location."	
				return requirementsMet;
			})
			// {
			// 	if (!requires.includes(x)) return true;
			// 	const requiredRole = ROLE_REQUIREMENTS[x];
			// 	console.log(`<@&${x}> requires role <@&${requiredRole}>`)
			// 	if (allUserRoles.includes(requiredRole)) return true;
			// 	defaultMsg = "You lack a required guild role to enter this location."
			// 	return false;
			// })

			result = await UpdateLocationRoles(interaction, selectedLocations)
			if (result) 
			{
				embed.addFields(result)
				embed.setDescription(`<@${interaction.member.id}>`)
				await logChan.send({embeds:[embed]})
			}
			else embed.setFooter({text:defaultMsg})
			break;
	}

	await interaction.editReply({embeds:[embed],components:components})
}

function filterRequired(role, allUserRoles)
{
	const requires = Object.keys(ROLE_REQUIREMENTS);
	if (!requires.includes(role)) return true;

	const requiredRole = ROLE_REQUIREMENTS[role];
	console.log(`<@&${role}> requires role <@&${requiredRole}>`)
	return allUserRoles.includes(requiredRole)
}

async function execute(interaction)
{
	//Set up for the response
	await interaction.deferReply({ephemeral:true})
	const embed = new EmbedBuilder();

	if (Utils.hasAnyRole(interaction.member, [config.role.NeedRP]))
	{
		embed.setDescription(`An approved character profile is required to view RP locations\n(<#${config.chan.pcProfile}>)`)
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
		const requires = Object.keys(ROLE_REQUIREMENTS);
		const allUserRoles = Array.from(interaction.member.roles.cache.keys())
		const userLocRoles = allUserRoles.filter(x => LOCATION_ROLES.includes(x));
		const combinedRoles = [...new Set(userLocRoles.concat(selectedLocation))].filter(x=>x).filter(x => {
				const requirementsMet = filterRequired(x, allUserRoles);
				if (!requirementsMet)
					defaultMsg = "You lack a required guild role to enter this location."
				return requirementsMet;
			})

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

const whitelistRoles = [ config.role.Builder, config.role.DMOnDuty, config.role.Moderator ]
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
		activity:activityButton,
		dmPing:dmPingButton
	},
	build:config.PRODUCTION || config.DEV
};


////// Handle autocomplete options for the location field
async function autoComplete(interaction)
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'location')
	{
		await RefreshLocationData(interaction.guild)
		const value = focusedOption.value.toLowerCase();
		const roles = Array.from(interaction.member.roles.cache.keys());
		const requires = Object.keys(ROLE_REQUIREMENTS);

		let response = LOCATION_DATA
		response = response.map(x => { x.name = x.label; return x})
		if (value.length > 0)
			response = LOCATION_DATA.filter(x => x.label.toLowerCase().includes(value))

		response = response.filter(opt => 
		{
			if (!requires.includes(opt.value)) return true;
			const requiredRole = ROLE_REQUIREMENTS[opt.value];
			if (roles.includes(requiredRole)) return true;
			return false;
		})
		console.log(response)

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