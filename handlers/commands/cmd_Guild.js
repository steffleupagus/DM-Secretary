const { SlashCommandBuilder, SlashCommandStringOption, SlashCommandNumberOption, 
	    PermissionsBitField,
		EmbedBuilder, ActionRowBuilder, ButtonBuilder,
		ButtonStyle, TextInputStyle
} = require('discord.js');

const mod = process.env.mod || '';
const config = require(`../../config/${mod}_config.json`);

const GuildUtils = require(`../../utilities/guildUtils.js`);
const CharUtils = require(`../../utilities/charUtils.js`);
const Prompt = require(`../../utilities/promptUtils.js`);
const Utils = require(`../../utilities/utilFuncs.js`);

const Toggle = 
{
	Switch:		(0),
	ForceAllOff:(1 << 0),
	ForceAllOn: (1 << 1),
	ForceOn:	(1 << 2),
	Rank: 		(1 << 3),
	Guild: 		(1 << 4),
	GuildRank:	(1 << 5)
};

///// Define some constnats
const ToggleMenu = "ToggleMenu";
const UnitTestMenu = "UnitTestMenu";
const GuildRanksEmbed = "GuildRanksEmbed";
const PromptName = "<PROMPT_NAME>"
const ERROR_NO_INPUT = (cmd) => `Input timed out (\`${cmd}\`)`
const ERROR_NO_CHAR = (member, guild=null) => 
				`Cannot change ${member}'s rank in the ${guild?guild:"guild"}: No character specified.`
const ERROR_NO_GUILD = (char) => 
				`Cannot change ${char||"character"}'s guild rank: No guild specified.` 
const ERROR_SAME_RANK = (char, rank, rankStr, guild) => 
				`\`${char}\` is already rank \`${rank}\` in the \`${guild}\` (\`${rankStr}\`)`
const ERROR_PERMISSION = (char, rank, guild) => 
				`You don't have the authority to set \`${char}\` to rank \`${rank}\` in the \`${guild}\``
const ERROR_NOT_IMPLEMENTED = (cmd) => `${cmd} is not implemented.`
const ERROR_NO_VALID_CHAR_SELECT = (member) => `${member} has no valid characters to select`

const DoChangeRoles = true;


//////// Main Toggle Menu text
function getGuildToggleEmbed()
{
	// Set an overall blurb about guilds in Ost
	const desc = `Queen Sel'ani Suma'tril the Fair is known to be the ruler of Ost in Edhil. In truth, the Queen is little more than a figurehead; a noble enjoying an easy life of riches and comfort, who does very little actual governing. Most of the real power and responsibility lies with the Guilds.\nThere are six guilds in Ost, each maintaining different spheres of influence in the city. Any Citizen may join a guild (or multiple guilds) as a recruit, but moving up in the ranks will require interaction and roleplay with those of higher rank.`;
	
	// Show the main descriptions for each guild
	const fields = [
		{name:"🔮 Arcanum",value:"Most assume this guild is for those who practice Arcane magics. Though true, the Arcanum's purpose is the study of esoteric lore and arcane secrets, and is open to those with curious and inquisitive minds. Their guildhall, the Arcanum Tower, houses an extensive library of books ranging from high-minded arcane and occult studies to low-brow raunchy smut. The Arcanum is overseen by the <@&699245661295738891>, who is in turn advised by the <@&833505842178293790>."},
		{name:"🧤 ||Black Hand||",value:"There is no such guild as the ||Black Hand||, at least officially, and it exists as little more than whispered rumors. A guild of stealth, subterfuge, and secrecy, they operate in the shadows as part criminal syndicate, part espionage agency, under the watchful eye of the <@&701985965882867712> and the <@&833508689624563783>. Their domain are the slums and undercity - those places where people are beneath the notice of the reputable citizens."},
		{name:"🕯️ Faith Council",value:"The divine is everwhere in the multiverse, and the demiplane has drawn in followers of countless different faiths and gods. The council of faith honors the myriad deities and tends to their followers. The <@&766024439749148672> and their council of <@&782123983797616700>s maintain the temples, and keep the citizens of Ost in good health, making them one of the guilds closest to the common people."},
		{name:"⚔️ Guardians",value:"Ost in Edhil is largely a peaceful city, thanks in no small part to the efforts of the Guardian Guild. A guild of martial prowess, they serve as both the city guard and military arm of Ost in Edhil, under the leadership of the <@&699575897853788302> and the <@&833505914619166721>. The Colosseum serves as their recruitment, testing, and training grounds, but they can be seen patrolling the streets of Ost, keeping it safe for the average citizen."},
		{name:"🍃 Outriders",value:"A guild of scouts and explorers who venture out into the mists and guard the roads outside Ost. The <@&853348541287890994> and <@&853349316139024414> have taken it as their duty to explore, map, and protect the wilds of the Demiplane, growing closer to the primal nature of the wilderness. Their lodge is rumored to be hidden in the wilderness beyond the city walls, but only its members know the way."},
		{name:"<:silverrose:699470814356963418> Silver Thorn",value:"The most socially and politically connected of the guilds, these entertainers, courtesans, and companions service the ruling elite and commonfolk alike from their 'guildhall,' the Silver Thorn Brothel. The <@&699439189447671889> and her <@&833509439277367338> use their vast network of allies and connections to quietly deal in favors and information."}
	];
	
	const embed = new EmbedBuilder()
		.setTitle('Guilds of Ost in Edhil')
		.setDescription(desc)
		.addFields(fields)
		.setFooter({
			text: `• Use the guild buttons below to toggle your highest rank role in that guild. 
• If you have no characters in that guild, you will be able to recruit a character into that guild.
• [Guild Recruit] do NOT have full access to the guild chat or guildhalls.`
		});
	return embed;	
}

///// Slash command help
async function showHelp(interaction)
{
	const embed = new EmbedBuilder()
		.setTitle("/guild command help")
		.setDescription("The `/guild` slash command can be used to join or leave guilds, toggle guild roles, or used by higher-ranked guild members to promote or demote lower-ranked members. A user may update their own rank only to join a guild as a recruit, or leave the guild.\n\n__**Syntax**__\n/guild guild:`guild` user:`user` character:`name` rank:`rank`\n\n• *User*: (Optional) The user to be  affected. If omitted, will default to the user running the command.\n• *Guild*: (Optional, Required if updating a character's rank)\nOne of the guilds. If `user` and `rank` are provided, will attempt to update their rank. If the other arguments are omitted, this will toggle the user's highest rank role in that guild.\n• *Character*: (Optional) The character to be affected. If omitted while `guild`, `user`, and `rank` are provided, it will prompt you for which character should be affected. Will show a list of known characters which you may select from, or you may type any name. (Remember to check your spelling)\n• *Rank*: (Optional) The rank. You may only affect those of lower rank than you.")
		.addFields([
			{name:"Examples:", value:"** **"},
			{name:"`/guild`", value:"Show this help"},
			{name:"`/guild guild:<guild>`", value:"Toggle your highest <guild> role on or off. If none of your characters are members of the specified guild, will prompt you to join it at rank 1."},
			{name:"`/guild character:<name>`", value:"Toggle your guild rank roles to match the guilds & ranks of your named character."},
			{name:"`/guild guild:<guild> user:<@user> character:<name> rank:<x>`", value:"Specifying a user other than yourself will attempt to induct that user into the guild at the specified rank (or rank 2 if omitted). You must be higher rank than the target character and the target rank to change it."},
		])
		.setFooter({text:"/guild"})	
	await safeDefer(interaction);
	await interaction.editReply({embeds: [embed], ephemeral: true})
}

//// Slash command entry point
async function execute(interaction) 
{
	//Defer the reply so we don't time out while waiting for databases and shit
	await interaction.deferReply({ ephemeral: true });

	// Gather necessary data (or defaults) from the command
	const triggeringMember = interaction.member;
	const targetMember  = interaction.options.getMember('user') ?? triggeringMember;
	const selfUpdate = triggeringMember == targetMember;
	let	  userData = await GuildUtils.GetRosterData({user: targetMember.id});
	let	  toggleFlag;
	
	const guild = interaction.options.getString('guild') ?? null;
	let   rank = interaction.options.getNumber('rank') ?? null;
	let   char = interaction.options.getString('character') ?? null;
	let	  embed = null;

	//Hack for Builder to add permanent toggle or Unit Test menus
	if (char == ToggleMenu) return await showGuildToggleMenu(interaction, {ephemeral: false});
	else if (char == UnitTestMenu) return await showUnitTestMenu(interaction);
	else if (char == GuildRanksEmbed) return await showGuildRanksEmbed(interaction);

	if (guild && !rank)
	{
		if (selfUpdate)
		{
			let oldRank = userData.ranks[guild];
			// console.log(oldRank, userData)
			rank = rank ?? (oldRank ? null : 1);
		}
		else rank = rank ?? 2;
	}
	
	//See if we're trying to update the character's rank in a guild.	
	const updateRequested = (!selfUpdate || (guild && rank != null));
	if (updateRequested)
	{
		//Update the guild rank
		embed = await UpdateGuildRank(interaction, targetMember, guild, char, rank, userData);

		userData = await GuildUtils.GetRosterData({guild: guild, user: targetMember.id});
		toggleFlag = Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn;
		let removed = (guild && rank === 0) ? [guild] : []
		let roleFields = await UpdateGuildRoles(targetMember, userData, toggleFlag, removed);
		embed.addFields(roleFields);
		
		await interaction.channel.send({embeds:[embed]});
		const logChan = await interaction.guild.channels.fetch(config.guildLogchannel);
		await logChan.send({embeds:[embed]})
		return;
	}

	if (selfUpdate && (char || guild))
	{
		userData = await GuildUtils.GetRosterData({char: char, guild: guild, user: targetMember.id});
		toggleFlag = char ? Toggle.GuildRank | Toggle.ForceOn : Toggle.GuildRank;
					
		let roleFields = await UpdateGuildRoles(targetMember, userData, toggleFlag);
		embed = new EmbedBuilder()
			.setTitle(`Toggle roles: ${char && guild?char+" & "+guild:(char ? char : guild)}`)
			.addFields(roleFields);
		await interaction.editReply({embeds:[embed]});
	}
	else
	{
		await showHelp(interaction)
	}

	GuildUtils.clearPromptCache(targetMember.id)
}

////// Check to see if the triggeringMember has the authority to make the change
//@guild (string) : the guild the change is being applied
//@oldRank (int) : the current rank before the change
//@newRank (int) : the new rank after the change
//@targetMember (guildMember) : the user being targeted by the command may or may not be triggeringMember
//@triggeringMember (guildMember) : the user triggering the command
async function checkAuthorization(guild, oldRank, newRank, targetMember, triggeringMember)
{
	//Confirm that the user who ran the command has the authority to change the target's rank
	const userData = await GuildUtils.GetRosterData({user: triggeringMember.id});
	const triggeringRank = userData.guildRanks[guild] || 0;
	
	//Mods and Builders can override a target's rank at any time
	const overrideRoles = [config.BuilderRole, config.ModeratorRole];
						  //+config.DEV ? [config._BuilderRole, config._ModeratorRole] : [];
	const triggeringRoles = triggeringMember.roles.cache;
	const modOverride = Array.from(triggeringRoles.keys()).filter(key =>
									overrideRoles.includes(key)).length;	
	//If newRank is lower, user must be higher rank than target's *current* rank
	const authorized =
		(newRank < oldRank && triggeringRank > oldRank) ||
		//If newRank is higher, user must be higher rank than target's new rank
		(newRank > oldRank && triggeringRank > newRank) ||
		//Or if the character is just being recruited into the guild at rank 1
		(newRank == 1 && oldRank < 1 && targetMember == triggeringMember) || 
		//Or if the player is choosing to leave the guild of their own accord
		(newRank == 0 && targetMember == triggeringMember);

	// console.log(`${triggeringRank}/${guild} Rank ${oldRank}=>${rank}: ${authorized}`)
	return authorized || modOverride;
}

////// Update a character's guild rank. 
//@Interaction (required interaction)
//@targetMember (required member)
//@guild (required string) : the guild the change is being applied
//@char (required string) : the character name
//@rank (required int) : the new rank after the change
//@userData (required object) : existing user data
async function UpdateGuildRank(interaction, targetMember, guild, char, rank, userData)
{
	const triggeringMember = interaction.member;
	targetMember = targetMember || triggeringMember;
	const selfUpdate = targetMember == triggeringMember;
	const filter = ((item) => !item.description);
	let embed;
	
	//Guild is required. If we don't have one error out before trying to prompt for character
	if (!guild) throw ERROR_NO_GUILD(char);

	//Character is required. If we don't have one, prompt for it or error out
	if (!char)
	{
		if (rank != null && rank > 0)
		{
			embed = new EmbedBuilder()
				.setTitle(`Joining ${guild}`)
				.setDescription(`Select which of <@${targetMember.id}>'s characters is joining the ${guild}`)		
				.setFooter({text:`Dismiss this message to cancel`})
			interaction.editReply({embeds:[embed]});
		}
		char = char || await promptCharacter(interaction, targetMember, guild, true, filter);

		if (!char)
		{
			let error = ERROR_NO_CHAR(targetMember, guild)
			embed.setTitle("").setDescription(error)
			await interaction.editReply({embeds:[embed]});
			throw error;
		}
	}

	let oldRank = userData?.guilds?.[guild]?.[char] ?? 0;
	rank = rank ?? Math.max(oldRank, (selfUpdate ? 1 : 2));
		
	//Do nothing if they're already the targeted rank
	let rankStr = (GuildUtils.GetRoleNames(interaction.guild))[guild][rank];
	if (rank == oldRank) throw ERROR_SAME_RANK(char, rank, rankStr, guild);		

	//Check to see if the user is authorized to make the requested change
	const authorized = await checkAuthorization(guild, oldRank, rank, targetMember, triggeringMember);
	if (!authorized) throw ERROR_PERMISSION(char, rank, guild);

	// Update the database with the new guild rank	
	const record = await GuildUtils.UpdateRoster({ guild:guild, user:targetMember.id, 
													char:char,  rank:rank });
	//Generate the output
	let action = "[something?]";
	if ((oldRank <= 0)&&(rank == 1)) 			action = "been recruited into"
	else if ((oldRank <= 1)&&(rank >= 2)) 		action = "been initiated into"		
	else if ((rank > oldRank)&&(oldRank > 0))	action = "been promoted in"
	else if ((rank < oldRank)&&(rank >= 1))		action = "been demoted in"
	else if ((oldRank > 0)&&(rank <= 0))		action = selfUpdate ? "left" : "been removed from"
	let newRank = rank <= 0 ? "[None]" : `<@&${GuildUtils.guildData[guild].ranks[rank]}>`;
	oldRank = oldRank <= 0 ? "[None]" : `<@&${GuildUtils.guildData[guild].ranks[oldRank]}>`;

	//Return the embed
	embed = new EmbedBuilder()
				.setTitle(`${char} has ${action} the ${guild}`)
				.addFields([
					{name:"Updated By",value:`${triggeringMember}`,inline:true},
					{name:"Player",    value:`${targetMember}`,inline:true},
					{name:"** **",value:"** **",inline:true},
					{name:"Old Rank",value:oldRank,inline:true},
					{name:"New Rank",value:newRank,inline:true},
					{name:"** **",value:"** **",inline:true}						
				])

	await interaction.editReply(`${targetMember}: ${char}'s rank in ${guild} updated to ${rank}`)
	return embed;
}

////// Update the user's roles
// End goal: Set roles on the target member
// * One role that represents the highest rank that user has in any guild
// * (Each guild) The highest-rank role of all user's characters that are in that guild
// * (Each guild) General guild role if they have at least one character in that guild
async function UpdateGuildRoles(member, userData, toggleFlag = null, removedGuild = [])
{
	if (!GuildUtils.isReady)
		return [{name: "Error", value: "The bot is still loading...\nWait a minute and try again.\nThank you for your patience."}]
	
	// console.log(userData)
	
	//The user's starting roles
	let roles = Array.from(member.roles.cache.keys());
	// Prepare the roles that we want to toggle off
	let rankRoles = (toggleFlag & Toggle.Rank) ? Object.values(GuildUtils.rankData) : [];
	let guildRoles = [];
	let guildRankRoles = [];
	let guildDataKeys  = Object.keys(userData.guildRanks);
	for (const [guild, data] of Object.entries(GuildUtils.guildData)) 
	{
		//If we care about this guild
		if (guildDataKeys.includes(guild) || removedGuild.includes(guild) ||
			(toggleFlag & Toggle.ForceAllOff) || (toggleFlag & Toggle.ForceAllOn))
		{
			const ranks = Object.values(data.ranks);
			if (toggleFlag & Toggle.Guild)		//If we want to toggle the guild role
				guildRoles = guildRoles.concat(ranks.filter((x,y) => y == 0))
			if (toggleFlag & Toggle.GuildRank)	//If we want to toggle guild rank roles
				guildRankRoles = guildRankRoles.concat(ranks.filter((x, y) => y != 0))
		}
	}

	// Remove roles corresponding to all the guild ranks we want to toggle
	let removed = [];
	roles = roles.filter( ( role ) => 
	{
		//Default to keep all the roles
		let keep = true
		//But strip out all the toggle-off roles
		if ((rankRoles.includes( role ) && ( toggleFlag & Toggle.Rank )) ||
			(guildRoles.includes( role ) && ( toggleFlag & Toggle.Guild )) ||
			(guildRankRoles.includes( role ) && ( toggleFlag & Toggle.GuildRank))) 
		{
			keep = false;			
		}
		if (!keep) removed.push(role)
		return keep;
	});

	// Add required roles to the user
	let added = [];
	let data = userData.guildRanks;	
	for (const [guild, rank] of Object.entries(data)) 
	{
		const role = GuildUtils.guildData[guild].ranks[rank]
		//Don't include ones we just removed unless we're forcing them on
		if (toggleFlag & Toggle.GuildRank && !(toggleFlag & Toggle.ForceAllOff) && 
			(!removed.includes(role) || toggleFlag & Toggle.ForceAllOn || toggleFlag & Toggle.ForceOn) &&
		    (!roles.includes(role)))
		{
			added.push(role);
		}
	}

	//Add general roles. 
	let maxRank = -1
	data = userData.ranks;
	for (const [guild, rank] of Object.entries(data)) 
	{
		//General role for the Guild
		let role = GuildUtils.guildData[guild].ranks[0]
		if (rank > 1 && (toggleFlag & Toggle.Guild) && !roles.includes(role))
			added.push(role)
		if (rank > maxRank)
			maxRank = rank;
	}
	//General role for highest Rank
	let role = GuildUtils.rankData[maxRank]
	if (maxRank > 0 && (toggleFlag & Toggle.Rank) && !roles.includes(role))
	{
		added.push(role)
	}
	
	//Set the updated roles on the user if that function is enabled.
	if (DoChangeRoles)
	{
		roles = roles.concat(added);
		await member.roles.set(roles);
	}

	//Return fields to display the changes to the user
	let common = added.filter(val => removed.includes(val))
	removed = removed.filter(val => !common.includes(val));
	removed = removed.length == 0 ? "[None]" : `<@&${removed.join(">\n<@&")}>`

//	if (!(toggleFlag & Toggle.ForceOn || toggleFlag & Toggle.ForceAllOn))
		added = added.filter(val => !common.includes(val));
	added = added.length == 0 ? "[None]" : `<@&${added.join(">\n<@&")}>`

	common = common.length == 0 ? "[None]" : `<@&${common.join(">\n<@&")}>`
	
	//Return the fields
	const fields = [
		{name:"Toggled Off", value: removed, inline:true},
		{name:"Toggled On", value: added, inline:true},
		{name:"** **",value:"** **",inline:true},
		{name:"Unchanged", value: common, inline:false}
	];
	return fields;	
}

/////////////////////////////////////////////////
/////// Character Prompt Functions
//////   - Central to joining / leaving guilds
/////////////////////////////////////////////////



////// Prompt the user to select one of their characters
//@interaction (required interaction)
//@member (required member)
//@guild (optional string)
//@includeNPC (optional bool)
//@filter (optional function)
async function promptCharacter(interaction, member, guild, includeNPC = false, filter = null)
{
	//Get the character list
	let charList = await getCharacterPromptList(interaction, member, guild, includeNPC)
	//Filter the character list if necessary
	if (filter) charList = charList.filter(filter);
	//Add an unlisted NPC option if appropriate
	if (includeNPC)
		charList.push(Prompt.createSelectOption("Unlisted / NPC", "Will prompt you for their name. Check your spelling!", PromptName))

	//Error out if the list is empty as a safety precaution
	if (charList.length <= 0) throw ERROR_NO_VALID_CHAR_SELECT(member)

	// console.log(charList)
	//Create the character selection
	const charSelect = [ Prompt.createSelectRow(interaction.id, charList, 1, 1, 'Select Character...') ]
	await interaction.editReply({components: charSelect})
	const components = getOptionComponents();

	//collect responses
	let callbacks = includeNPC ? ({ [PromptName]: { func:promptCharacterName, args:{guild:guild} } }) : {};
	let char = await Prompt.collectSelectInteractions(interaction, callbacks)
		.catch(async error => {
									embed.setDescription(error)
									await interaction.editReply({embeds:[embed], components: components});
							  });
	if (null == char) throw ERROR_NO_INPUT("Character select")
	char = (Array.isArray(char)) ? char[0] : char;		
	//Cleanup after ourselves and return
	GuildUtils.clearPromptCache(member.id)
	await interaction.editReply({components: []})
	return char;
}

//// If the user picked the NPC option show a modal to enter the name
async function promptCharacterName(interaction, args)
{
	//Show the prompt and wait for input
	const input = Prompt.createTextInputRow("char", "NPC Name", "Enter the character's name. Check your spelling!", 
											TextInputStyle.Short, 3, 32)
	const output = await Prompt.promptModal(interaction, `Joining the ${args.guild}`, interaction.id, [input]);	
	if (output)
	{
		await output.deferUpdate()
		let result = {};
		output.fields.fields.map(field => { result[field.customId] = field.value; })
		return result.char;
	}

	//No input, throw the exception
	throw ERROR_NO_INPUT("modal")
}

/////
async function showCharToggle(interaction)
{
	let embed = new EmbedBuilder()
		.setTitle(`Character Guild Toggle`)
		.setDescription(`Select which of your characters to activate guild roles`)
		.setFooter({text:`Dismiss this message to cancel`})
	await interaction.update({embeds:[embed]});
	const components = getOptionComponents()
	
	const character = await promptCharacter(interaction, interaction.member, null, false)
		.catch(async error => {
									embed.setDescription(error)
									await interaction.editReply({embeds:[embed], components: components});
							  });
	
	if (character)
	{
		const memberId = interaction.member.id;
		let userData = await GuildUtils.GetRosterData({char: character, user: memberId});
		let fields = await UpdateGuildRoles(interaction.member, userData, Toggle.GuildRank | Toggle.ForceAllOn);
		embed.setTitle(`Toggling on ${character}'s guild ranks`)
			 .setDescription(null)
			 .addFields(fields)
		await interaction.editReply({embeds : [embed], components: [...components] });		
	}
}

/////
async function showGuildMembershipToggleMenu(interaction, join)
{
	const member = interaction.member
	let userData = await GuildUtils.GetRosterData({user: member.id});
	let embed   = new EmbedBuilder().setTitle(`Membership Toggle: ${join ? "Joining" : "Leaving"} a Guild`)
	let enabled = null;
	let style   = null;
	let guild   = null;
	let char    = null;
	let rank    = join ? 1 : 0;
	const filter = ((item) => item.description);
	await interaction.deferUpdate();
	
	//If leaving a guild, prompt for the character first 
	if (!join)
	{
		embed.setDescription(`Which of your characters is leaving the guild?`)
		await interaction.editReply({embeds: [embed]})
		char = await promptCharacter(interaction, member, guild, false, filter)
			.catch(async error => {
				embed.setDescription( error )
				await interaction.editReply({embeds:[embed], components:getOptionComponents()})
				return null;
			});
		if (!char) return;
		
		//Update the enabled / style lists according to the guild(s) of the selected character
		enabled = style = {}
		Object.keys(userData.chars[char]).map( x => { enabled[x] = true; style[x] = ButtonStyle.Primary; })
	}

	//Prompt for the guild. If Joining, this will come first.
	const components = getGuildButtonRows("", enabled, style)
	embed.setDescription(`Select the guild you wish${char?" \`"+char+"\` ":" "}to ${join ? "join" : "leave"}.`)
	await interaction.editReply({embeds:[embed], components: components});
	guild = await Prompt.collectButtonInteractions(interaction)
			.catch(async error => {
				embed.setDescription( error )
				return await interaction.editReply({embeds:[embed], components:getOptionComponents()})
			});

	if (guild)
	{
		//If we have a guild, we can update the guild rank. If joining, let the UpdateGuildRank ask for the character
		console.log("Update Guild Rank")
		userData = await GuildUtils.GetRosterData({guild: guild, user: member.id});
// console.log(userData)
		embed = await UpdateGuildRank(interaction, interaction.member, guild, char, rank, userData);
		userData = await GuildUtils.GetRosterData({guild: guild, user: member.id});
// console.log(userData)
		console.log("Update Guild Roles")	
		let toggleFlag = Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn;
		let removed = (guild && rank === 0) ? [guild] : [];
		let roleFields = await UpdateGuildRoles(interaction.member, userData, toggleFlag, removed);
		
		embed.setDescription(null)
			 .addFields(roleFields)
		const logChan = await interaction.guild.channels.fetch(config.guildLogchannel);
		await logChan.send({ embeds: [embed] })
	}
	await interaction.editReply({embeds:[embed], components:getOptionComponents()})
}

/////////////////////////////////////////////////
// MENU INTERACTIONS
/////////////////////////////////////////////////

// MENU BUTTON INTERACTIONS
async function handleButton(interaction)
{
	//Special case for guild roster buttons
	const client = interaction.client;
	if (interaction.customId.startsWith("guildroster"))
		return client.commands.get('guildroster').button(interaction)

	//Gather known data from the button
	const memberId = interaction.member.id;
	let   customId = interaction.customId
	let	  embed, title, fields, footer, toggleFlags = null;
	
	if (customId.startsWith("guild.unitTest:"))
	{
		await interaction.deferReply({ephemeral: true});		
		var unitTestId = customId.split(":").pop();
console.log(unitTestId)
		let embed = await unitTest(interaction, unitTestId); 
		await interaction.editReply({embeds: [ embed ]});
		return;
	}

	switch(customId)
	{
		//Guild Buttons
		case "guild.Arcanum":
		case "guild.Black Hand":
		case "guild.Faith Council":
		case "guild.Guardians":
		case "guild.Outriders":
		case "guild.Silver Thorn":
			customId = customId.replace(`${data.name}.`,'');
			return await handleGuildButton(interaction, customId)

		//Guild Roster & Ranks
		case "guild.showRosterMenu":
			return await showRosterMenu(interaction);
		case "guild.showGuildRanks":
			return await showGuildRanks(interaction);

		//Options Menu
		case "guild.showOptionMenu":
			return await showOptionMenu(interaction);
		case "guild.showOptionHelp":
			return await interaction.update({embeds:[getOptionHelp()]})
		case "guild.toggleAllOn":
			toggleFlags = toggleFlags ?? Toggle.GuildRank | Toggle.ForceAllOn;
			title = title ?? `Toggling ON all highest guild rank roles`;
		case "guild.toggleAllOff":
			toggleFlags = toggleFlags ?? Toggle.GuildRank | Toggle.ForceAllOff;		
			title = title ?? `Toggling OFF all guild rank roles`;
			let userData = await GuildUtils.GetRosterData({user: memberId});
			fields = await UpdateGuildRoles(interaction.member, userData, toggleFlags);
			embed = new EmbedBuilder().setTitle(title).addFields(fields)
			return await interaction.update({ embeds: [embed] });			
		case "guild.toggleChar":
			return await showCharToggle(interaction);
		
		case "guild.joinGuild":
		case "guild.leaveGuild":
			let join = customId.includes("join")
			return await showGuildMembershipToggleMenu(interaction, join)
		case "guild.showHelp":
			return await showHelp(interaction);
		default:
			throw ERROR_NOT_IMPLEMENTED(customId) 
	}
}

/////////////////////////////////////////////////
/////// Guild toggle menu
/////////////////////////////////////////////////
async function showGuildToggleMenu(interaction, config) 
{
	await safeDefer(interaction)	
	await interaction.editReply({ content: 'Guild Role Toggle Menu' });

	//Show the menu embed
	const embed = getGuildToggleEmbed()
	const components = getGuildToggleComponents()

	if (config.ephemeral)
		await interaction.editReply({ embeds: [embed], components: components })
	else
		await interaction.channel.send({ embeds: [embed], components: components })
}

//////// Get all the buttons
function getGuildToggleComponents()
{
	const optionButton = new ButtonBuilder()
		.setCustomId(`guild.showOptionMenu`)
		.setEmoji('⚙️')
		.setLabel('More Options')
		.setStyle(ButtonStyle.Secondary);
	const rosterButton = new ButtonBuilder()
		.setCustomId(`guild.showRosterMenu`)
		.setEmoji('📜')
		.setLabel('Rosters')
		.setStyle(ButtonStyle.Secondary);
	const helpButton = new ButtonBuilder()
		.setCustomId(`guild.showHelp`)
		.setEmoji('❓')
		.setLabel('Help')
		.setStyle(ButtonStyle.Secondary);
		const optionRow = new ActionRowBuilder().addComponents([rosterButton, optionButton, helpButton]);
	const rows = [...getGuildButtonRows("guild."), optionRow];
	return rows;
}

//////// Get the guild buttons
function getGuildButtonRows(cmd="guild.", enabled = null, style = null)
{
	let rows = []
	let count = 0
	let row = new ActionRowBuilder()
	for (const [guild, data] of Object.entries(GuildUtils.guildData)) 
	{
		const button = new ButtonBuilder()
			.setCustomId(`${cmd}${guild}`)
			.setEmoji(data.emoji)
			.setLabel(guild)
			.setStyle(style?.[guild] ?? ButtonStyle.Secondary)
			.setDisabled(enabled ? !(enabled[guild]) : false);

		row.addComponents([button])
		if (++count == 3)
		{
			rows.push(row)
			row = new ActionRowBuilder()
		}
	}
	rows.push(row)
	return rows
}

////////////// Handle when a user touches one of the guild buttons on the menu
async function handleGuildButton(interaction, guild)
{
	await safeDefer(interaction)
	if (!CharUtils.charCache)
		return interaction.editReply("\nThe bot is still loading...\nWait a minute and try again.\nThank you for your patience.")
	
	const memberId = interaction.member.id;
	let userData = await GuildUtils.GetRosterData({guild: guild, user: memberId});
	
	let embed = new EmbedBuilder().setTitle(`Toggling highest ${guild} rank`)
	let toggleFlag = Toggle.GuildRank;
	let logResult = false;
	if (!userData.ranks[guild])
	{
		console.log("Update Guild Rank")
		embed = await UpdateGuildRank(interaction, interaction.member, guild, null, 1, userData);
		userData = await GuildUtils.GetRosterData({guild: guild, user: memberId});
		toggleFlag = Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn
		logResult = true
	}

	console.log("Update Guild Roles")
	let roleFields = await UpdateGuildRoles(interaction.member, userData, toggleFlag);
	embed.addFields(roleFields)

	if (logResult)
	{
		const logChan = await interaction.guild.channels.fetch(config.guildLogchannel);
		await logChan.send({ embeds: [embed] })
	}	
	await interaction.editReply({ embeds: [embed] });
}


/////////////////////////////////////////////////
/////// Guild Roster menu
/////// Menu option to display a menu to show the desired guild's roster in an ephemeral message
/////////////////////////////////////////////////
async function showRosterMenu(interaction) 
{
	const personalButton = new ButtonBuilder()
		.setCustomId(`guildroster.personalRoster`)
		.setEmoji('👥')
		.setLabel('Personal')
		.setStyle(ButtonStyle.Secondary);
	const ranksButton = new ButtonBuilder()
		.setCustomId(`guild.showGuildRanks`)
		.setEmoji('📜')
		.setLabel('Guild Ranks')
		.setStyle(ButtonStyle.Secondary);	
	const optionRow = new ActionRowBuilder().addComponents([personalButton, ranksButton]);
	const components = [...getGuildButtonRows("guildroster."), optionRow];

	title = 'Guild Roster'
	description = `• Use the guild buttons to show the roster for that guild. 
• **👥 Personal** will show the guild ranks for your characters.
• **📜 Guild Ranks** will show all the guild rank roles`

	//Show the submenu embed
	await safeDefer(interaction)
	let embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(description);
	await interaction.editReply({embeds : [embed], components: components});
}

//// Show an embed with the guild ranks
async function showGuildRanks(interaction)
{
	let embed = new EmbedBuilder().setTitle(`Guild Ranks`).addFields(getGuildRankFields())
	return await interaction.update({ embeds: [embed] });	
}

async function showGuildRanksEmbed(interaction)
{
	let embed = new EmbedBuilder().setTitle(`Guild Ranks`).addFields(getGuildRankFields())
	interaction.channel.send({embeds:[embed]})
}

//// Get a generated list of rank roles for each guild
function getGuildRankFields() 
{
	//Generate the guild rank fields
	let fields = [];
	let fieldBreak = 0;
	for (const [guild, data] of Object.entries(GuildUtils.guildData)) 
	{
		let ranks = [];
		ranks.push(`${data.emoji} <@&${data.ranks[0]}>`);
		for (const [rank, role] of Object.entries(data.ranks).reverse()) 
		{
			if (rank > 0) ranks.push(`\`${rank}:\` <@&${role}>`);
		}
		ranks = ranks.join('\n');
		const field = { name: '** **', value: ranks, inline: true };
		fields.push(field);
		if (++fieldBreak >= 2) 
		{
			fields.push({ name: '** **', value: '** **', inline: true });
			fieldBreak = 0;
		}
	}
	return fields;
}


/////////////////////////////////////////////////
/////// Guild Options menu
/////// More toggle options, 
/////////////////////////////////////////////////
async function showOptionMenu(interaction)
{
	await safeDefer(interaction)

	const embed = getOptionHelp()
	const components = getOptionComponents()
	
	if (interaction.replied || interaction.deferred)
		await interaction.editReply({embeds : [embed], components: components});
}

//////// Help guide to show what each Option button does
function getOptionHelp()
{
	title = 'Additional Guild Options Help'
	fields = [
		{name:"⬇️ All Off", value:"Turn off all rank roles (you will still be part of your guilds)"},
		{name:"👥 Char Roles", value:"Set guild roles to match the ranks of your selected character"},
		{name:"⬆️ All On",value:"Turn on the highest rank roles you have in all guilds"},
		{name:"✅ Join Guild", value:"You will be prompted for which character is joining which guild as a recruit**\***."},	
		{name:"❌ Leave Guild", value:"You will be prompted for which character is leaving which guild."},
		{name:"❓ Help", value:"Show this guide"}
	]

	let embed = new EmbedBuilder()
	.setTitle(title)
	.addFields(fields)
	.setFooter({text: "* A [Guild Recruit] does not have access to the private sections of a guild hall\nA [Guild Member] (or higher) must initiate them fully."})
	return embed;
}

//////// All the option components
function getOptionComponents()
{
	const allOnButton = new ButtonBuilder()
		.setCustomId(`guild.toggleAllOn`)
		.setEmoji('⬆️').setLabel('All On')
		.setStyle(ButtonStyle.Secondary);
	const charButton = new ButtonBuilder()
		.setCustomId(`guild.toggleChar`)
		.setEmoji('👥').setLabel('Char Roles')
		.setStyle(ButtonStyle.Secondary);	
	const allOffButton = new ButtonBuilder()
		.setCustomId(`guild.toggleAllOff`)
		.setEmoji('⬇️').setLabel('All Off')
		.setStyle(ButtonStyle.Secondary);

	const joinButton = new ButtonBuilder()
		.setCustomId(`guild.joinGuild`)
		.setEmoji('✅').setLabel('Join Guild')
		.setStyle(ButtonStyle.Success);	
	const leaveButton = new ButtonBuilder()
		.setCustomId(`guild.leaveGuild`)
		.setEmoji('❌').setLabel('Leave Guild')
		.setStyle(ButtonStyle.Danger);
	const helpButton = new ButtonBuilder()
		.setCustomId(`guild.showOptionHelp`)
		.setEmoji('❓').setLabel('Help')
		.setStyle(ButtonStyle.Secondary);	
	const row1 = new ActionRowBuilder().addComponents([allOffButton, charButton, allOnButton])
	const row2 = new ActionRowBuilder().addComponents([joinButton, leaveButton, helpButton]);
	return [row1, row2]
}




///// Get the list of characters populated into select options
async function getCharacterPromptList(interaction, member, guild = null, includeAll = false)
{
	const roleNames = GuildUtils.GetRoleNames(interaction.guild);
	//Get a list of options of characters from the prompt data
	let charList = getPromptData(member.id, null, guild, includeAll);
	charList = Object.keys(charList).map(choice => 
	{
		const details = charList[choice];
		return Prompt.createSelectOption(choice, details, choice);
	});
	return charList
}

////// Gather up data to populate the character prompt / autocomplete
function getPromptData(user = null, value = null, guild = null, includeAll = true) 
{
	//Use the GuildUtils to grab characters that are part of guilds
	let result = GuildUtils.getAutoCompleteData(user, value, guild);
	if (includeAll)
		//Use the CharUtils cache to make a list of all the other chars registered to the target user
		result = CharUtils.getUserCharData(user, value, guild, result);
	return result;
}

////// Handle autocomplete options for the Character field
async function autoComplete(interaction) 
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'character') 
	{
		const roleNames = GuildUtils.GetRoleNames(interaction.guild);
		const value = focusedOption.value.toLowerCase();
		const user = interaction.member.id;
		const target = interaction.options.get('user') ?.value || user;
		const guild = interaction.options.get('guild') ?.value || null;

		let response = getPromptData(target, value, guild);
		console.log(response)
		response = Object.entries(response).map(([choice,details]) => 
		({
			name: `${choice} ${details ? '('+details+')' : ""}`,
			value: choice
		}));
//			Object.keys(response).map(choice => 

		//Add an "Other" option to the autocomplete list
		response.push({ name: 'NPC / Other Not Listed', value: 'null' });
		//Add menu options to the autocomplete list for owner.
		if (config.OWNERID == user)
		{
			response.push({ name: 'Builder: Unit Test Menu', value: UnitTestMenu });
			response.push({ name: 'Builder: Guild Ranks', value: GuildRanksEmbed });
			response.push({ name: 'Builder: Create Toggle Menu', value: ToggleMenu });
		}

		try {
			interaction.respond(response.length <= 25 ? response : []);
		}
		catch (e) {}
	}
}

/////////////////////////////////////////////////
/// Define the slash command & parameters
/////////////////////////////////////////////////
const guildOption = new SlashCommandStringOption()
	.setName('guild')
	.setDescription('Which guild is being toggled')
	.setRequired(false)
	.addChoices(
		{ name: 'Arcanum', value: 'Arcanum' },
		{ name: 'Black Hand', value: 'Black Hand' },
		{ name: 'Faith Council', value: 'Faith Council' },
		{ name: 'Guardians', value: 'Guardians' },
		{ name: 'Outriders', value: 'Outriders' },
		{ name: 'Silver Thorn', value: 'Silver Thorn' }
	);
const rankOption = new SlashCommandNumberOption()
	.setName('rank')
	.setDescription('The guild rank to apply (If unspecified defaults to 1)')
	.setRequired(false)
	.addChoices(
		{ name: '5: Leader', value: 5 },
		{ name: '4: Council', value: 4 },
		{ name: '3: Member', value: 3 },
		{ name: '2: Initiate', value: 2 },
		{ name: '1: Recruit', value: 1 },
		{ name: 'Remove', value: 0 }
	);
const data = new SlashCommandBuilder()
	.setName('guild')
	.setDescription('Manage your guild roles! Join (or recruit someone to) a guild!')
	.addStringOption(guildOption)
	.addUserOption(option => option
			.setName('user')
			.setDescription('A user. If omitted, defaults to the person running the command')
			.setRequired(false)
		)
	.addStringOption(option => option
			.setName('character')
			.setDescription('Select from registered characters, or type a name not listed. Check your spelling!')
			.setRequired(false)
			.setAutocomplete(true)
		)
	.addNumberOption(rankOption)

const userPermissions = [PermissionsBitField.Flags.SendMessages];
module.exports = 
{
	data: data,
	userPermissions: userPermissions,
	execute: execute,
	autoComplete: autoComplete,
	button: handleButton,
	select: handleSelect,
	build: config.PRODUCTION //|| config.DEV
};









async function handleSelect(interaction)
{
}


async function safeDefer(interaction)
{
	if (!interaction.deferred && !interaction.replied)
		await interaction.deferReply({ ephemeral: true })
}























/////////////////////////////////////////////////
/// Unit Tests
/////////////////////////////////////////////////
const unitTests = [
	{
		name:"Test 1", value:"**User is toggling their own role for a given guild**", 
		button:true, guild: "Outriders", toggleFlag: Toggle.GuildRank 
	},
	{	
		name:"Test 2", value:"**User is toggling their own roles to match a character**", 
		button:true, char:"Test NPC", toggleFlag: Toggle.GuildRank | Toggle.ForceOn 
	},
	{
		name:"Test 3", value:"**User is toggling their own roles On**", 
		button:true, toggleFlag: Toggle.GuildRank | Toggle.ForceAllOn 
	},
	{
		name:"Test 4", value:"**User is toggling their own roles Off**", 
		button:true, toggleFlag: Toggle.GuildRank | Toggle.ForceAllOff 
	},	
	{
		name:"Test 5", value:"**Character rank within a guild is changing**", button:false},
	{
		name:"Test 5a", value:"**Join guild at rank 1**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 1, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: true 
	},
	{
		name:"Test 5b", value:"**Promote to rank 2**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 2, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: true 
	},
	{
		name:"Test 5c", value:"**Promote to rank 3**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 3, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: true 
	},
	{
		name:"Test 5d", value:"**Demote to rank 1**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 1, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: true 
	},
	{
		name:"Test 5e", value:"**Remove from guild**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 0, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: true 
	},
	{
		name:"Test 6a", value:"**Join guild at rank 1\n(With other guilds)**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 1, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: false 
	},
	{
		name:"Test 6b", value:"**Promote to rank 2\n(With other guilds)**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 2, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: false 
	},
	{
		name:"Test 6c", value:"**Promote to rank 4\n(With other guilds)**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 4, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: false 
	},
	{
		name:"Test 6d", value:"**Demote to rank 1\n(With other guilds)**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 1, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: false
	},
	{
		name:"Test 6e", value:"**Remove from guild\n(With other guilds)**", inline:true, 
		button:true, guild: "Arcanum", char: "Test NPC", rank: 0, 
		toggleFlag: Toggle.GuildRank | Toggle.Guild | Toggle.Rank | Toggle.ForceOn, override: false 
	}
]
	
async function showUnitTestMenu(interaction) 
{
	if (!interaction.replied && !interaction.deferred)
		await interaction.deferReply({ ephemeral: true });
	await interaction.editReply({ content: 'Guild Role Unit Test Menu' });
	
	//Show the menu embed
	let embed = new EmbedBuilder()
		.setTitle('Guild Toggle')
		.addFields(unitTests)

	let row  = []
	let rows = []
	for (let i=0; i < unitTests.length; ++i)
	{
		let test = unitTests[i];
		const unitTestButton = new ButtonBuilder()
			.setCustomId(`guild.unitTest:${i}`)
			.setLabel(test.name)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!test.button);
		row.push(unitTestButton)
		if (row.length >= 5)
		{
			row = new ActionRowBuilder().addComponents(row);
			rows.push(row);
			row = [];
		}
	}
	await interaction.channel.send({ embeds: [embed], components: rows });
}

async function unitTest(interaction, testToRun)
{
	const member   = interaction.member;
	const memberId = member.id;
	let embed = new EmbedBuilder();
	let result;
	let mockData = await GuildUtils.GetMockRosterData({user: memberId});

	const unitTestData = unitTests[testToRun];
	unitTestData.inline = false;
	mockData = await GuildUtils.GetMockRosterData({guild: unitTestData.guild || null, 
												   char: unitTestData.char || null, 
												   user: memberId});
	if (unitTestData.rank)
	{
		if (unitTestData.override)
			mockData.raw = [{ user: memberId, char: unitTestData.char, guild: unitTestData.guild, rank: unitTestData.rank }]
		else
			mockData.raw.push({ user: memberId, char: unitTestData.char, guild: unitTestData.guild, rank: unitTestData.rank })
		mockData = await GuildUtils.ProcessRosterData(mockData.raw, {guild: unitTestData.guild, user: memberId});
	}
	else if (unitTestData.rank !== undefined && unitTestData.override)
		mockData = await GuildUtils.ProcessRosterData([], {guild: unitTestData.guild, user: memberId});

	let removed = (unitTestData.guild && unitTestData.rank === 0) ? [unitTestData.guild] : []
	result   = await UpdateGuildRoles(member, mockData, unitTestData.toggleFlag, removed)
	embed.addFields( [unitTestData, ...result] );

	return embed;
}
