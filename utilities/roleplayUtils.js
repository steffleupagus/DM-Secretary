const { EmbedBuilder, ButtonStyle, MessageMentions, TextInputStyle } = require('discord.js')
const { SortOrder } = require(`../utilities/enums.js`)
const ChannelMeta = require(`../database/chanMetaSchema.js`)
const LevelUtils = require(`../utilities/levelUtils.js`) 
const ChanUtils = require(`../utilities/channelUtils.js`)
const CharUtils = require(`../utilities/charUtils.js`)
const MsgUtils = require(`../utilities/messageUtils.js`)
const Prompt = require(`../utilities/promptUtils.js`)
const Embed = require(`../utilities/EmbedPaginator.js`)
const Mutex = require(`../utilities/mutexUtils.js`)
const Utils = require(`../utilities/utilFuncs.js`)





///
/// Take the gathered stats and put them all into a list of individual characters
/// @rpData: The raw stats gathered from parsing the scene
/// @interaction: May be null? TBD
/// @thread: The channel of the table RP to process
/// Returns: array of character objects containing: char, user, level, & earned exp
///
async function processRoleplayData(rpData, interaction = null, thread = null) {
	console.log("\nPre-processed RP data:\n", rpData)

	const  allData = rpData[0].char;
	delete rpData[0]
	delete rpData.tupperMap
	// Loop through all the data
	//  - those with user IDs (users & identified Tuppers)
	//  - those without uIds (unidentified tupper proxies)
	// End Goal: identify USER, CHAR, & LEVEL of every scene participant
	let expData = [];
	for (const char in allData)
	{
		let user = allData[char].uId ?? null;
		let tup  = allData[char].t || false

		//If we have a uId associated with it, clean up some extraneous data
		let charRPData = user ? rpData[user].char[char] : allData[char]
			charRPData = {
				name:char,
				char:null,
				user:user,
				level:SKIP,
				t:tup,
				rp:{ length: charRPData.length, posts: charRPData.posts },
				daily:Object.keys(charRPData.dates),
				...charRPData		
			}

		if (user) 
		{
			delete rpData[user].char[char];
			if (0 == Object.keys(rpData[user].char).length)
				delete rpData[user]
		}
		if (charRPData.length < MIN_RP_THRESHOLD) continue;
		charRPData = await processCharData(charRPData, interaction, thread);
		expData.push(charRPData)
	}

	console.log("\nPost-process Data:\n",expData)

	return expData
}

async function processCharData(charRPData, interaction = null, thread = null, forcePrompt = false, npcAssign = false) {
	//If necessary, prompt the players to identify the user who played an unknown character
	if (interaction && !charRPData.user)
		charRPData.user = await assignUnknownUser(interaction, charRPData.name)	

	//Find a match for this character based on the user
	if (charRPData.user)
	{
		const charDBData = await CharUtils.findClosestMatch(charRPData.name, charRPData.user, forcePrompt);
		charRPData.match =  charDBData?.match;
		charRPData.matches = charDBData?.matches;

		if (charRPData.sameUser)
		{
console.log(`\n\n\nI DON'T REMEMBER WHAT .sameUser IS FOR: ${charRPData.sameUser}\n\n\n`)
			charRPData.matches = charRPData.matches ?? [];
			charRPData.sameUser.forEach(x => 
			{
				if (!charRPData?.matches?.find(y => y.name == x.name))
					charRPData.matches.push({...x, rating:0})
			})
			delete charRPData.sameUser;
		}

console.log(`\nChar RP Data: ${charRPData.name}\n`, charRPData)

		const matchRating = charRPData.match?.rating || 0;
		if (matchRating < MATCH_THRESHOLD || forcePrompt)
		{
			const numChars = charRPData.matches?.length || 0;
			if (numChars > 0)
			{
				try {
					console.log(`\n\n\nASSIGN UNKNOWN PC: ${charRPData.name}\n\n\n`)
					charRPData.match = await assignUnknownCharacter(charRPData, interaction, npcAssign) 	
				}
				catch (err) { throw err; }
			}
			else
			{
				charRPData.match = "npc"
				charRPData.rpp = 1
			}

			if (charRPData.match == "npc")
				charRPData.match = { name:charRPData.name, level:NPC }
			else if (!charRPData.match)
				charRPData.match = { name:charRPData.name, level:SKIP }
		}

		//Apply the matched character to the data
		if (charRPData.match)
		{
			charRPData.char  = charRPData.match.name
			charRPData.level = charRPData.match.level
		}
	}
	else
	{
		charRPData.user = "Unknown";
	}	

	if (!charRPData.char) charRPData = { char:charRPData.name,level:SKIP,...charRPData }
	// {
	// 	charRPData.char = charRPData.name;
	// 	charRPData.level = SKIP;
	// }

	//Cleanup
	['chan','dates','posts','length','match','matches','t'].forEach( k => delete charRPData[k] );

	return charRPData
}



function getCharacterPromptButtons(skippable = false)
{
	let buttons = [
				{style:ButtonStyle.Primary,   emoji:"☑️", label:"Default", custom_id:"default"},
				{style:ButtonStyle.Secondary, emoji:"👥", label:"NPC", custom_id:"npc"},			
				{style:ButtonStyle.Secondary, emoji:"⏭️", label:"Skip", custom_id:"skip"},
				{style:ButtonStyle.Secondary, emoji:"❌", label:"Cancel", custom_id:"cancel"},	
			  ];
	if (skippable) buttons.splice(2,1);
	return buttons;
}

///
/// Prompt the user to select one of their characters
/// @interaction (required interaction)
/// @charRPData (required object)
///
async function assignUnknownCharacter(charRPData, interaction = null, npcAssign = false)
{
	let showPctMatch = true;
	let response = null

	if (interaction)
	{	
		//Get the character list
		let charList = []
		let charData = {}
		charRPData.matches.forEach(option => 
		{
			const value = option.name
			const label = `${value} (Level: ${option.level})`
			const match = (showPctMatch && option.rating) ? `(${Math.round(option.rating * 100) || 0}% Match)` : null
			charList.push(Prompt.createSelectOption(label, match, value))
			charData[value] = option
		})
		
		//Create the character selection & button row
		const selectId = interaction.id + charRPData.name
		const charSelect = Prompt.createSelectRow(selectId, charList, 1, 1, 'Select Character...');
		const buttons = Prompt.createButtonRow(getCharacterPromptButtons(npcAssign));
		const embed = constructLevelQuery(charRPData, showPctMatch, npcAssign)
		const pings = interaction.user.id != charRPData.user ? `<@${charRPData.user}>` : ""
		
		//Post the emebed and collect responses	
		const time = (Debug && interaction.isContextMenuCommand()) ? Prompt.Time.Debug : Prompt.Time.Std
		let prompt = await interaction.editReply({	content:`${interaction.user}${pings}`,			//.followUp(
													embeds:[embed], components:[charSelect,buttons], 
													ephemeral: interaction.ephemeral	});
		response   = await Prompt.collectAllInteractions(prompt, {}, null, time)
								  .catch(async error => {
									  		embed.setDescription(error)
											await prompt.edit({embeds:[embed], components: []});
										});

		response = (Array.isArray(response)) ? response[0] : response;
		if (("cancel").includes(response))	throw new Error(ERROR_CMD_CANCELED);
		if (("default").includes(response)) response = null;
		// if (!Debug) await prompt.delete();
	}

	if (!response)
	{
		if (charRPData.match) 						return charRPData.match;
		else if (charRPData.matches?.length == 1)	return charRPData.matches[0]
		response = charRPData.t ? 'npc' : 'skip'
	}

	if (("skip").includes(response)) 	return null;
	if (("npc").includes(response))		return response
	if (("cancel").includes(response))
		throw new Error(ERROR_CMD_CANCELED);

	return charData[response] || null		
}

module.exports = 
{
	processRoleplayData,
	processCharData
}