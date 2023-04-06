const { EmbedBuilder, ButtonStyle, MessageMentions, TextInputStyle } = require('discord.js')
const { SortOrder } = require(`../utilities/enums.js`)
const LevelUtils = require(`../utilities/levelUtils.js`) 
const ChanUtils = require(`../utilities/channelUtils.js`)
const CharUtils = require(`../utilities/charUtils.js`)
const MsgUtils = require(`../utilities/messageUtils.js`)
const Prompt = require(`../utilities/promptUtils.js`)
const Embed = require(`../utilities/EmbedPaginator.js`)
const Mutex = require(`../utilities/mutexUtils.js`)
const Utils = require(`../utilities/utilFuncs.js`)
const util = require('util')
const unbapi = require("unb-api")
const unbClient = new unbapi.Client(process.env.UBTOKEN)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const MATCH_THRESHOLD = 0.9
const MIN_THRESHOLD = 0.15
const MIN_RP_THRESHOLD = 100
const NPC_RPP_AMOUNT = 1000

const ERROR_NORP_CHANNEL = "Cannot process scenes in this channel. (Not an RP channel)"
const ERROR_DUEL_CHANNEL = "Cannot process scenes in this channel.\nRun `/duel` in the mechanics thread."
const ERROR_SCENE_LOCKED = "Already processing this scene. Please be patient."
const ERROR_CMD_CANCELED = "Command cancelled."
const SCENE_BREAK_CLOSER = "``` ```"
const SCENE_COMMAND_TIME = (start, end, prefix='') => `${prefix}${Math.floor(end-start) / 1000} seconds.`

const STEP_MESSAGE_DATA  = "Gathering scene data. Please be patient."
const STEP_COLLECT_DATA  = "Gathering player & character data."
const STEP_PROCESS_DATA  = "Processing scene data. Please be patient."
const STEP_CONFIRM_DATA  = "Awaiting player confirmation."

const SCENE_EMBED_TITLE  = `${config.xpemoji} Scene Complete`;
const CONFIRM_INSTRUCTIONS = `React with 👍 if this looks correct.\n__If your level looks wrong__: \n• React with 👎 to cancel`
const REFRESH_INSTRUCTIONS = `• Go to <#${config.xpLogChannel}> and run \`!xp\`\n• Come back and do the \`scene\` command again.`
const CONFIRM_FOOTER = `👍 confirm (all players) / 👎 cancel (any player).\nWill auto-confirm after 30 seconds.`

//const JSONURL = "https://onlinejsontools.com/url-decode-json?input=";
const JSONURL = "https://d.jsonx.repl.co?x="
const SCENEURL = "https://discord.com/channels/";

const Debug = config.DEV;

const PING_PREFIX = Debug ? '~' : '@'
const dmPingChannel = Debug ? "1087957720507883521" : config.dmPingChannel;
const xpLogChannel  = Debug ? "1087958395274940446" : config.xpLogChannel;

const dmRoles = [
			config.DMRole, config.ModeratorRole,
			config._DMRole, config._ModeratorRole
		];

const interactionTimer = {};

async function sceneDebug(message)
{
	if (!Debug) return
	let startTime = performance.now()

	const channel = message.channel;
	var data
	data = await MsgUtils.getRoleplayData(channel, null);
	const start = data.start
	data = await processData(null, data)
	// data = await assignExperience(data)

	//Sort the DM's data 
	keys = { "user":SortOrder.ASC, "char":SortOrder.ASC, "level":SortOrder.DESC };
	data.sort((a,b)=>{ return Utils.priorityCompare(a, b, keys) })
	// console.log(util.inspect(rpData, false, null, true /* enable colors */))

	let endTime = performance.now()
	await sendDMApprovalMessage(message, start, data, SCENE_COMMAND_TIME(startTime, endTime));	
	// LogDebugResult(message, data, message.url, channel, SCENE_COMMAND_TIME(startTime,endTime,"Scene Processing: "))
}


/// 
/// Process the most recent duel in the specified channel
/// @channel: The channel in which the command was executed
/// @user: The user who executed the command
/// @message: Optionally, the message on which the menu command was run
///
async function processScene(interaction, message)
{	
	let startTime = performance.now()
	let endTime = startTime
	interactionTimer[interaction.id] = 0
	
	//Check to make sure it's an Exp eligible scene or early out.
	const channel = interaction.channel
	const validChannel = await CheckValidChannel(channel);
	if (!validChannel && !Debug) return SCENE_BREAK_CLOSER;

	//Lock the channel so additional attempts to end this scene will fail	
	Mutex.lock(channel, ERROR_SCENE_LOCKED);	

	//Fetch the roleplay data from the specified channel / scene.
	//If no message specified, it will search for the moost recent scene break
	//If message is specified, it will search for scene break book ends in both directions.
	var rpData
	await interaction.editReply(STEP_MESSAGE_DATA)	
	try 	  { rpData = await MsgUtils.getRoleplayData(channel, message); }
	catch(err){	Mutex.unlock(channel, err)	}
	
	const start = rpData.start;
	
/*/ ^^^ Gathering all necessary data                    \*\
|*| <<< TODO: Branch off here for informational output  |*|
\*\ vvv Proccessing data for player approval            /*/

	//All processing is complete. Now we need to wait for player input
	endTime = performance.now()

	//Take gathered stats & put them into a list of individual characters
	await interaction.editReply(STEP_COLLECT_DATA)	
	try			{ rpData = await processData(interaction, rpData) }
	catch(err)	{ Mutex.unlock(channel, err) }
	if (null == rpData) return Mutex.unlock(channel, ERROR_CMD_CANCELED);

	// Consolidate the data & combine into a single record
	// Assign experience - This will just be a multiplier based on the RP associated with each character	
	await interaction.editReply(STEP_PROCESS_DATA)	
	let pcData = JSON.parse(JSON.stringify(rpData));
	try	{ 
		pcData = consolidateData(pcData); 
		//Assign experience so we can identify those who didn't RP enough to earn any
		pcData = assignExperience(pcData);		
	}
	catch(err)  { Mutex.unlock(channel, err) }
	if (null == pcData) return Mutex.unlock(channel, ERROR_CMD_CANCELED);

	// //All processing is complete. Now we need to wait for player input
	endTime = performance.now()
	// endTime -= interactionTimer[interaction.id]
	delete interactionTimer[interaction.id]
	
	//Close out the scene and get the players to confirm their levels
	await interaction.editReply(STEP_CONFIRM_DATA)
	const confirm = await awaitConfirmation(interaction, pcData);
	if (confirm !== true) return Mutex.unlock(channel, ERROR_CMD_CANCELED);
	
/*/ ^^^ Proccessing data for player approval            \*\
|*| <<< TODO: Branch off here for informational output  |*|
\*\ vvv Player approval received. Post for DM approval  /*/

	//Once confirmed, send this to the DM ping channel
	
	//Sort the DM's data 
	keys = { "user":SortOrder.ASC, "char":SortOrder.ASC, "level":SortOrder.DESC };
	rpData.sort((a,b)=>{ return Utils.priorityCompare(a, b, keys) })
	// console.log(util.inspect(rpData, false, null, true /* enable colors */))

	try	{ 
		await sendDMApprovalMessage(interaction, start, rpData, SCENE_COMMAND_TIME(startTime, endTime));
	}
	catch(err)  { Mutex.unlock(channel, err) }
	
	// await LogDebugResult(interaction, rpData, start, interaction.channel, SCENE_COMMAND_TIME(startTime, endTime));
	// await LogDebugResult(interaction, pcData, start, interaction.channel, SCENE_COMMAND_TIME(startTime, endTime));
		
	if (interaction.ephemeral || Debug)
		await interaction.followUp({content:SCENE_BREAK_CLOSER, ephemeral:true})
	else
		await interaction.channel.send(SCENE_BREAK_CLOSER)
	return Mutex.unlock(channel);	
}




///
///
///
async function generatePlayerXPField(interaction, data, idx)
{
	let level = data.level
	if (level == 0) level = "NPC"
	data.rp.days = data?.rp?.days || data.daily?.length || "?";
	data.rpp = data.rpp ?? 0;
	data.xpMod = data.xpMod ?? data.xp;
	data.xp = data.level > 0 ? LevelUtils.calculateRoleplayExp(level, data.xp) : 0
	data.xpMod = data.level > 0 ? LevelUtils.calculateRoleplayExp(level, data.xpMod) : 0;
	
	if (data.level && data.xpMod > 0)
	{		
		//Apply daily exp cap
		{
			const cmd = `scene${config.DEV ? "dev" : ""}`						
			const cap = 3 * LevelUtils.getRPExpCap(level);
			let xpData = {char:data.char,uid:data.user,xp:{xp:data.xpMod,cap},logDate:data.date}
				xpData = await LevelUtils.updateDailyExp(xpData, cmd, data.date);
			if (!xpData)
				throw "Something went very wrong..."
			//xpData is an object: {xp (final xp after cap applied), cap, total (cumulative daily total)}
			
			if (xpData.xp.xp < data.xpMod)
			{
				data.xp  = data.xp - data.xpMod + xpData.xp.xp;
				data.xpMod = xpData.xp.xp
			}			
			data.xpData = xpData.xp;
			console.log("\n\n\n", data, xpData)
		}
    
		const modification = `${data.char} (${data.level}) XP: +${data.xpData.xp} (${data.xpData.total} total)`
		console.log(modification)
		if (Debug)
			await interaction.followUp({content:modification, ephemeral:true});
	}
	else if (data.rpp > 0)
	{
		if (!Debug)
		{
  			//Automatically apply the amount to the user					
			await unbClient.editUserBalance(interaction.guild.id, data.user, { cash: data.rpp })
							.catch(console.error);
		}
		const modification = `${data.char} (${data.level}) RPP: +${data.rpp}`
		console.log(modification)
		if (Debug)			
			await interaction.followUp({content:modification, ephemeral:true});
	}
	else
		console.log(`== No modification for: ${data.char} (${data.level})`)
	
	let name   = `${data.char} (${level})`
	let value  = ""
	let footer = null
	if (data.name != data.char)
	{
		data.name = data.name.split("\u200B").join("`,`")
		value += `*RP as \`${data.name}\`*\n`
	}

	value += `<@${data.user}> - `;
	if ((data.level == 0)&&(!data.rpp))
		value += `\`NPC (Pending)\`\n`
	else if (data.rpp > 0 || data.rppMod)
		value += `${config.rppemoji} \`${data.rpp}\`\n`		
	else if (data.xp >= 0)
	{
		//if (!data?.xpData?.xp) data.xpData = {xp:0} 
		value += `\nGain: \`${data.xp}\`xp `
		//if (data.xpData.xp > 0)
		if (data.xp > 0)
			value += `[Cap: ||\`${data.xpData.total}\` / \`${data.xpData.cap}\`||]`
	}
	else
		value += `\`Error...\`\n`
	return {name,value}
}

///
///
///
async function generateXPEmbed(interaction, start, rpData, comment = "", footer = "")
{
	rpData = consolidateData(rpData);

	const reject = "scene.decline" == interaction.customId;
	const title = SCENE_EMBED_TITLE
	const desc = (reject ? "❌ Scene Rejected\n" : "✅ Scene Approved\n") + (comment || "")
	
	let embed = new EmbedBuilder();
		embed.setTitle(title);
		embed.setDescription(desc);
		embed.setThumbnail("https://i.imgur.com/pz8sI6M.png");

	//rpData.forEach( (data, idx) => 
	await Utils.asyncArrayForEach(rpData, async (data,idx) =>
	{
		let level = data.level
		if (level < 0 || (data.xp <= 0 && data.rpp <= 0)) return; // level = "Skip"
		
		data.rp.days = data.rp.days || data.daily?.length || "?";
		data.rpp = reject ? 0 : (data.rpp || 0);
		data.xp = reject ? 0 : (data.xp || 0);
		data.date = interaction.message.createdTimestamp;
		const field = await generatePlayerXPField(interaction, data, idx);
		embed.addFields([field]);
	});

	embed.addFields([start]);
	if (footer)
		embed.setFooter({text:footer})		
	
	return embed;
}





module.exports = {
	processScene,
	sceneDebug,
	handleApprove,
	handleEdit,
	handleNPC,
	handleReject,
	handleUndo
}




///
///	Extract data links into raw JSON data from a DM embed
/// Valid arguments:
/// 	retrieveData(interaction))
/// 	retrieveData(interaction.message))
/// 	retrieveData(interaction.message.embeds[0]))
/// 	retrieveData(interaction.message.embeds[0].fields))
/// 
function retrieveData(source)
{
	const sanitize = /([\:\/\.\?])/g
	const url = JSONURL.replace(sanitize,"\\$1") + "\(.*\)\\)"
	const regex = new RegExp(url)

	const data  = []

	const message = source?.message || source;
	const embed  = message?.embeds?.[0] || message;
	const fields = embed?.fields || embed;
	if (!Array.isArray(fields)) return data;
	
	fields.forEach(field => 
	{
		let match = regex.exec(field.value || "");
		if (match)
		{
			match = match[1]
			match = decodeURIComponent(match)
			match = JSON.parse(match)
			data.push(match)
		}
	});
	return data;
}

///
/// Undo the accept/reject
///
async function handleUndo(interaction)
{
	const mutexId = interaction.message.id;
	Mutex.lock(mutexId, ERROR_SCENE_LOCKED);
	
	const embed  = interaction?.message?.embeds?.[0];
	const field  = {name:"Approval",value:`*Pending*`,inline:true};
	const update = EmbedBuilder.from(embed)
							   .setTitle(SCENE_EMBED_TITLE)
							   .spliceFields(-1, 1, field)	
	
	let link = (embed.fields.pop()).value.split("/");
	let msg  = link.pop().replace(")","");
	let chan = interaction.guild.channels.resolve(link.pop());
	try {
		msg = await chan?.messages?.fetch(msg) || null;
	} catch(e){ msg = null; }

	// if (msg)
	// 	await handleUndoExp(interaction, msg);
	
	if (chan && msg && msg.author.id == process.env.clientid)
		await msg.delete()
	const row = getApprovalButtonRow();	
	await interaction.update({embeds:[update], components:[row]})	

	return Mutex.unlock(mutexId);
}

async function handleUndoExp(interaction, message)
{
	const cmd = `scene${config.DEV ? "dev" : ""}`							
	const xpEmbed = message?.embeds[0];
	xpEmbed.fields.pop()

	await Utils.asyncArrayForEach(xpEmbed.fields, async (field) =>
	{
		let data = {}
		if (!field.value.includes("Pending"))
		{
			const mention = new RegExp(MessageMentions.UsersPattern,"gim")
			const exp     = new RegExp("Gain: `([0-9]+)`xp","gim")	
			const cap     = new RegExp("Cap:.*\/ `([0-9]+)`","gim")
			try{
				data.char = field.name.replace(/ \([0-9]+\)$/gi,"")
				data.user = mention.exec(field.value)[1];
				data.xp   = {xp: -1 * parseInt(exp.exec(field.value)[1]),
							 cap:     parseInt(cap.exec(field.value)[1]) };
				data.date = interaction.message.createdTimestamp;
				data = await LevelUtils.updateDailyExp(data, cmd, data.date)
			}
			catch (e)
			{
				console.error(e); 
				console.error(field);
				data = null 
			}			
		}		
		console.log(data)
	});
}


///
/// Let DMs reject a scene
///
async function handleApprove(interaction)
{
	const mutexId = interaction.message.id;
	Mutex.lock(mutexId, ERROR_SCENE_LOCKED);

	await interaction.deferUpdate();
	const embed = interaction?.message?.embeds?.[0];
	const data  = retrieveData(embed)

	const comment = null;
	const assignNPC = [];
	if (data.find(x => unassignedNPC(x)))
	{
		const npcButton = Prompt.createButtonRow([{style:ButtonStyle.Secondary, emoji:"👥", label:"Assign NPC XP", custom_id:"scene.npc"}])
		assignNPC.push( npcButton )
	}

	const newField = {name:"✅ Scene Approved",value:`${interaction.user}`};
	const start = embed?.fields?.find( x => x.name === "Scene" || x.name === "Start");
	const footer = interaction.message.id;

	const players = [];
	data.map(x => { if (!players.includes(x.user)) players.push(x.user); })
	const pings = `<${PING_PREFIX}${players.join("> <"+PING_PREFIX)}>`;
	
	const xpEmbed = await generateXPEmbed(interaction, start, data, comment, footer)
	var xpChan = await interaction.guild.channels.resolve(xpLogChannel);
	const message = await xpChan.send({content: pings, embeds:[xpEmbed], components:assignNPC});
	newField.value += ` [Link](${message.url})`

	const update = EmbedBuilder.from(embed)
							   .spliceFields(-1, 1, newField)
	const undo = [Prompt.createButtonRow([{style:ButtonStyle.Primary, emoji:"↩️", label:"Undo", custom_id:"scene.undo"}])]
	await interaction.editReply({embeds:[update], components:undo})

	return Mutex.unlock(mutexId);
}

///
/// Let DMs forcibly update any record prior to approving it
///
async function handleEdit(interaction)
{
	const mutexId = interaction.message.id;
	Mutex.lock(mutexId, ERROR_SCENE_LOCKED);

	const ephemeral = interaction.channel.id == xpLogChannel;	
	await interaction.deferReply({ephemeral:ephemeral});

	const embed = interaction?.message?.embeds?.[0];
	const data  = retrieveData(embed)
	
	const newEmbed = generateDMEmbed(null, null, data, "").embeds()
	await interaction.editReply({embeds:[newEmbed[0]]})

	const names = data.map(x => x.char)
	const options = names.map( x => Prompt.createSelectOption(x, "", x) )
	const cancel = Prompt.createSelectOption("❌ Cancel", "", "null")
	const selectId = interaction.id + interaction.customId
	const select = Prompt.createSelectRow(selectId, [...options, cancel], 1, 1, 'Select Record to Edit...');	

	//Post the emebed and collect responses
	const prompt = await interaction.editReply({components:[select]});
	let response = await Prompt.collectAllInteractions(prompt, {}, null)	
								.catch(async error => console.error(error))
		response = (Array.isArray(response)) ? response[0] : response;
	if (!response || response == "null")
	{
		await interaction.editReply({content: "Cancelled Edit", embeds:[], components:[]})
		return Mutex.unlock(mutexId);
	}

	var index = data.findIndex(x => x.char === response);
	let editData = data[index]

	let sameUser = data.filter(x => x.user === editData.user && x.char != editData.char)
					   .map(x => { return {name:x.char,level:x.level} })
	editData.sameUser = sameUser;
	
	try {	editData = await processCharData(interaction, editData, true); }
	catch(err) { 
		console.error(err)
		await interaction.editReply({content: "Cancelled Edit", embeds:[], components:[]})
		return Mutex.unlock(mutexId);
	}
	
		data[index] = editData //{...editData, edit:response}

	const update = (generateDMEmbed(null, null, data, "").embeds())[0];
	const fields = embed?.fields?.slice(-2);
		  update.addFields(...fields)
		  update.setFooter(embed.footer)
	await interaction.message.edit({embeds:[update]})

	const edit = response != editData.char ? `${response} => ${editData.char}` : editData.char
	response = new EmbedBuilder().setTitle("Edit Complete")
								 .setDescription(`${edit} [Updated](${interaction.message.url})`)
								 .setFooter({text:`${interaction.member.displayName}`})
	await interaction.editReply({content:"",embeds:[response], components:[]})
	return Mutex.unlock(mutexId);
}

///
/// Let DMs reject a scene
///
async function handleReject(interaction)
{
	const mutexId = interaction.message.id;
	Mutex.lock(mutexId, ERROR_SCENE_LOCKED);
	
	await interaction.deferUpdate();
	const embed = interaction?.message?.embeds?.[0];
	const data  = retrieveData(embed)

	const comment = null;
	const assignNPC = [];

	const options = [
		{label:"Explain",description:"Provide a reason for the rejection (will prompt)", value:"explain"},
		{label:"None",   description:"Reject the scene without providing a reason.", value:"none"},
		{label:"Silent", description:"Silently reject the scene without posting to Loot Log.", value:"silent"},
		{label:"❌ Cancel",value: "cancel"}
	]
	
	let promptModal = async function(selectInteraction, args)
	{
		//Show the prompt and wait for input
		const input = Prompt.createTextInputRow("reason", "Explanation", "Why was this scene rejected?", 
												TextInputStyle.Paragraph, 0, 1000)
		const output = await Prompt.promptModal(selectInteraction, `Rejection Explanation`, interaction.id, [input]);	
		if (output)
		{
			let result = {}
			await output.deferUpdate()
			output.fields.fields.map(field => { result[field.customId] = field.value; })			
			return result.reason;
		}
		return null
	}
	const callbacks = { "explain": {func:promptModal, args:null}};	
	
	const selectId = interaction.id + interaction.customId
	const select = Prompt.createSelectRow(selectId, options, 1, 1, 'Reason for Rejection');	
	await interaction.editReply({components:[select]})
	const prompt = await interaction.editReply({components:[select]});
	let response = await Prompt.collectAllInteractions(prompt, callbacks, null, Prompt.Time.Long)	
								.catch(async error => console.error(error))
		response = (Array.isArray(response)) ? response[0] : response;
	
	if (!response || "cancel" == response)
	{
		const row = getApprovalButtonRow();	
		await interaction.editReply({components:[row]})
		return Mutex.unlock(mutexId);
	}

	const newField = {name:"❌ Scene Rejected",value:`${interaction.user}`};
	const start = embed?.fields?.find( x => x.name === "Scene" || x.name === "Start");
	const footer = ("none" != response) ? `DM Note: ${response}` : "DM Note: [None]";
	if ("silent" != response)
	{
		const xpEmbed = await generateXPEmbed(interaction, start, data, comment, footer)
		var xpChan = await interaction.guild.channels.resolve(xpLogChannel);
		const message = await xpChan.send({content: "", embeds:[xpEmbed], components:assignNPC});		
		newField.value += ` [Link](${message.url})`
	}

	const update = EmbedBuilder.from(embed)
							   .spliceFields(-1, 1, newField)
	const undo = Prompt.createButtonRow([{style:ButtonStyle.Primary, emoji:"↩️", label:"Undo", custom_id:"scene.undo"}])
	await interaction.editReply({embeds:[update], components:[undo]})

	return Mutex.unlock(mutexId);
}



function unassignedNPC(data)
{
	const isUnassignedNPC = data.level == 0 && data.xp > 0 && !data.rpp
	return isUnassignedNPC
}

///
/// Let DMs forcibly update any record prior to approving it
///
async function handleNPC(interaction)
{
	const ephemeral = interaction.channel.id == xpLogChannel;
	await interaction.deferReply({ephemeral:ephemeral});
	const mutexId = interaction.message.id;
	Mutex.lock(mutexId, ERROR_SCENE_LOCKED);

	const modDM   = Utils.hasAnyRole(interaction.member, dmRoles)
	const dmChan  = await interaction.guild.channels.resolve(dmPingChannel);	

	//Extract the embed data we need from the exp embed and the DM embed
	const xpEmbed = interaction?.message?.embeds?.[0];
	const footer  = xpEmbed?.footer?.text;
	const dmMsgId = footer.split('|')[0] || null;
	const dmEmbed = await dmChan?.messages?.fetch(dmMsgId) || null;
	const xpData  = retrieveData(dmEmbed);
	const start   = xpEmbed?.fields?.find( x => x.name === "Scene" || x.name === "Start");
	//Extract a list of pending NPCs and filter the data by the ones this person can edit
	let   pending = xpEmbed.fields.filter( field => field.name.includes("(NPC)") && field.value.includes("Pending") )
								  .map( field => field.name.replace(" (NPC)","") )
	let   data    = xpData.filter( x => unassignedNPC(x) && pending.includes(x.name) && (modDM ||
										(x.user == interaction.user.id)))
	let	 response = null
	//Early out if we have no pending NPCs this user can edit
	if (!data.length)
	{
		const embed = new EmbedBuilder().setDescription("You do not have any pending NPCs in this scene.")		
		await interaction.editReply({embeds:[embed]});
		return Mutex.unlock(mutexId);
	}
	//Have them select which one to edit if they have more than one (rare, probably)
	else if (data.length > 1)
	{
		const promptEmbed = await generateXPEmbed(interaction, start, data, "", "");
		await interaction.editReply({embeds:[promptEmbed]})
		const options = data.map( x => Prompt.createSelectOption(x.char, "", x.char) )
		const cancel = Prompt.createSelectOption("❌ Cancel", "", "null")
		const selectId = interaction.id + interaction.customId
		const select = Prompt.createSelectRow(selectId, [...options, cancel], 1, 1, 'Select which pending NPC to Edit...');
		const prompt = await interaction.editReply({components:[select]});
			response = await Prompt.collectAllInteractions(prompt, {}, null).catch(async error => console.error(error))
			response = (Array.isArray(response)) ? response[0] : response;
		if (!response || response == "null")
		{			
			await interaction.editReply({content: "...Cancelled Edit", embeds:[], components:[]})
			return Mutex.unlock(mutexId);
		}
	}
	//Otherwise, default to the only one
	else response = data[0].char

	//Re-process this NPC and update the xpData with the new information
	var index = xpData.findIndex(x => x.char === response);
	let editData = xpData[index]
	try {	editData = await processCharData(interaction, {...editData, t:true}, true, true);	}
	catch(err) { 
		await interaction.editReply({content: "Cancelled Edit...", embeds:[], components:[]})
		return Mutex.unlock(mutexId);		
	}

	let dupes = null;
	if (editData.level == 0)	//They chose NPC again, award RPP instead of Exp
	{		
		editData = assignExperience([editData])[0];
		editData.rpp = NPC_RPP_AMOUNT * editData.xp;
		editData.rppMod = 1;
		editData.xp = 0;
	}
	else	//They chose a PC to award their RP exp to. 
	{
		//Extract all the records from the original data that have been applied to this character
			dupes = Utils.findAllIndexes(xpEmbed.fields, (field) => field.name.replace(` (${editData.level})`,"") == editData.char)
		let cData = xpData.filter( (x,idx) => x.char == editData.char || dupes.includes(idx) )
						  .map(({char,level,...x}) => ({char:editData.char,level:editData.level,...x }));
			// console.log(cData)
			cData = JSON.stringify(cData)
		let before = JSON.parse(cData)
			before = consolidateData(before);
			before = assignExperience(before);
			// console.log(before,"\n\n")
		//Add the new data in and consolidate it		
		let after  = JSON.parse(cData)
			after.push(editData);
			after = consolidateData(after);
			after = assignExperience(after);
			// console.log(after,"\n\n")			
		editData = after[0];
		//Only award the difference in xp
		const diff  = Utils.precise(editData.xp - (before?.[0]?.xp || 0) + 0.001, 1)
		editData.xpMod = Math.max(0, diff);
	}
	
	xpData[index] = {...editData, edit:response}

	//Re-generate the xp embed with the updated NPC data
	editData.date = interaction.message.createdTimestamp;
	const updateField = await generatePlayerXPField(interaction, editData, index);	
	const update = EmbedBuilder.from(xpEmbed)
							   .spliceFields(index,1,updateField)
	if (dupes && Array.isArray(dupes) && dupes.length > 0)
	{
		update.spliceFields(dupes[0],1,updateField)
		update.spliceFields(index, 1, {name:updateField.name, value:"`Merged with previous`"})
	}
	
	//Check if we have any more NPCs we'll need to edit
	pending = pending.filter( x=> x != editData.name )
	data    = xpData.filter( x => unassignedNPC(x) && pending.includes(x.name) )
	const hasNPC = data.length > 0
	const component = [];
	const npcButton = [{style:ButtonStyle.Secondary, emoji:"👥", label:"Assign NPC XP", custom_id:"scene.npc"}];	
	if (hasNPC) component.push( Prompt.createButtonRow(npcButton) )
	
	await interaction.message.edit({embeds:[update], components:component})

	const edit = response != editData.char ? `${response} => ${editData.char}` : editData.char
	response = new EmbedBuilder().setTitle("Edit Complete")
								 .setDescription(`${edit} [Updated](${interaction.message.url})`)
								 .setFooter({text:`${interaction.member.displayName}`})
	await interaction.editReply({content:"",embeds:[response], components:[]})
	// await interaction.editReply({content:`Edit Complete: ${response} => ${editData.char}`,embeds:[], components:[]})
	
	return Mutex.unlock(mutexId);
}





///
///
///
function generateDMEmbed(interaction, start, rpData, footer)
{
	const date 		= Utils.getDate();
	const shortDate = Utils.formatDate(date, "DD MMM YYYY");
	const fullDate  = Utils.formatDate(date, "DD MMMM YYYY [ hh:mmpm ]")
	
	rpData = consolidateData(rpData);
	rpData = assignExperience(rpData);
 	start  = `${interaction?.channel.name}\n${interaction?.channel} [Start](${start})`;
	footer = `Logged at (Server Time): ${fullDate}\nProcTime: ${footer}`;

	const title = SCENE_EMBED_TITLE;
	
	const embed = new Embed();
	const openEmbed = (embed) => 
	{
		embed.setTitle(title);
		embed.setThumbnail("https://i.imgur.com/pz8sI6M.png");
	}

	const reservedLength =	interaction ? 
							embed.calcFieldLength("Scene",start,true) + 
						  	embed.calcFieldLength("X Approved",start,true) + footer.length
							: 0

	const closeEmbed = (embed) => {
		if (!interaction) return
		embed.addField("Scene",start,true);
		embed.addField("Approval","*Pending*",true)
		embed.setFooter({text:footer})
		embed.close_field();
		embed.close_footer();		
	}

	openEmbed(embed)
	rpData.forEach( (data, idx) =>
	{
		let level = data.level
		if (data.xp <= 0 || level < 0) level = "Skip"
		else if (level == 0) level = "NPC"
		data.rp.days = data.rp.days || data.daily?.length || 0;
		
		let title  = `${data.char} (${level})`
		let encode = encodeURIComponent(JSON.stringify(data));
		let value  = ""
		if (data.name != data.char)
		{
			data.name = data.name.split("\u200B").join("`,`")
			value += `*RP as \`${data.name}\`*\n`
		}
		if (data.rpp >= 0)
			value += `<@${data.user}>: ${config.rppemoji}\`${data.rpp}\` RPP\n`
		else //if (data.xp >= 0)
			value += `<@${data.user}>: \`${data.xp}x\` Cap\n`
			
			value += `**Days:** \`${data.rp.days}\` | **Posts:** \`${data.rp.posts}\` | **Length:** \`${data.rp.length}\``
			value += ` | [Data](${JSONURL}${encode})`

		const totalLen = embed.length() + (2 * reservedLength) + embed.calcFieldLength(title,value)
		if (totalLen >= embed.MAX.EMBED)
		{
			closeEmbed(embed)
			if (idx < rpData.length)
				embed.close_embed();
			openEmbed(embed)
		}	
		embed.addField(title, value);
	});
	closeEmbed(embed)
	
	return embed;
}

///
/// Send the exp ping to the DMs
///
async function sendDMApprovalMessage(interaction, start, rpData, footer="")
{	
	const embed = generateDMEmbed(interaction, start, rpData, footer)
	var dmPingChan = await interaction.guild.channels.resolve(dmPingChannel);
	await embed.send(dmPingChan, "<@&699439189447671889><@&694285067723210843>", //attachButtons);
					 (message) => message.edit({ components:[getApprovalButtonRow()] }))
}

function getApprovalButtonRow()
{
	const row = Prompt.createButtonRow([
		{style:ButtonStyle.Success, emoji:"✅", label:"Approve", custom_id:"scene.approve"},
		{style:ButtonStyle.Danger, emoji:"❌", label:"Reject", custom_id:"scene.decline"},	
		{style:ButtonStyle.Secondary, emoji:"📝", label:"Edit", custom_id:"scene.edit"}
	])	
	return row;
}





///
/// Pause and wait for confirmation from the player(s) before continuing
///
async function awaitConfirmation(interaction, expData)
{	
	const players = [];
	expData.map(x => { if (!players.includes(x.user)) players.push(x.user); })
	const pings = `<${PING_PREFIX}${players.join("> <"+PING_PREFIX)}>`;

	let embed = new Embed();
	embed.setTitle(SCENE_EMBED_TITLE);
	embed.setFooter({text:"If any of this information looks incorrect, inform a `@DM On Duty`."});

	const data = expData.filter(x=>(x.level > 0 && x.xp > 0));
	const npcs = expData.filter(x=>(x.level == 0 && x.xp > 0)).map(x=>`${x.char} (<@${x.user}>)`).join('\n').trim();
	const skip = expData.filter(x=>(x.level < 0 && x.xp > 0)).map(x=>`${x.char} (<@${x.user}>)`).join('\n').trim();
	const norp = expData.filter(x=>(x.xp <= 0)).map(x=>`${x.char} (<@${x.user}>)`).join('\n').trim();

	const inline = data.length > 5;
	data.forEach( char => 
	{
		embed.addField(`${char.char} (${char.level})`, `<@${char.user}>`, inline)
	});	
	if (npcs) embed.addField(`NPCs`, npcs)
	if (skip) embed.addField(`Skipped`, skip)	
	if (norp) embed.addField(`Insufficient RP`, norp);
		
	let embeds = embed.embeds();
		embed = embeds.shift();
	await interaction.editReply({content:pings, embeds:[embed], components:[]})	
	Utils.asyncArrayForEach(embeds, async embed => {
		await interaction.followUp({embeds:[embed], ephemeral: interaction.ephemeral})
	})			

	if (interaction.isContextMenuCommand())
		return true;

	const inst = REFRESH_INSTRUCTIONS;
	const desc = CONFIRM_INSTRUCTIONS + '\n' + REFRESH_INSTRUCTIONS;
	const footer = CONFIRM_FOOTER;
	embed = new EmbedBuilder();
	embed.setDescription(desc);
	embed.setFooter({text:footer});	
	embed = await interaction.followUp({content:pings, embeds:[embed], ephemeral: false});
	const confirm = await Prompt.confirmDialog(embed,players);	
	embed.delete();

	if (!confirm)
	{
		embed = new EmbedBuilder();
		embed.setDescription(`If your level was incorrect:\n${inst}\nIf you need help, please ask a <@&${config.DMOnDutyRole}>`);
		interaction.editReply({embeds:[embed],components:[]})
	}
	
	return confirm;
}

///
/// Consolidate the data to merge multiple instances of identical characters into a single entry
///
function consolidateData(expData)
{
	for (var i=0; i<expData.length; ++i)
	{
		var dataI = expData[i];
		if (dataI)
		{
			for (var j=i+1; j<expData.length; ++j)
			{
				var dataJ = expData[j];
				if (dataJ && 
					(dataI.char == dataJ.char)&&
					(dataI.user == dataJ.user))
				{
					dataI.name += "\u200B" + dataJ.name;
					dataI.rp.length += dataJ.rp.length;
					dataI.rp.posts += dataJ.rp.posts;
	
					dataJ.daily.forEach( date => 
					{
						if (!dataI.daily.includes(date))
							dataI.daily.push(date)
					})
					expData[j] = undefined
				}
			}
		
			dataI.rp.days = dataI?.daily?.length || 0;
			// (['name','daily'].forEach( x => delete dataI[x] ));
			expData[i] = dataI;
		}
	}

	expData = expData.filter(e => e)
	expData.sort(function(a, b){ return b.level - a.level })	
	
	return expData;
}

//Calculate and assign the experience based on level and the amount of RP
function assignExperience(expData)
{
	expData.forEach((charRPData, idx) =>
	{	
		//Calculate the RP exp multiplier which can be used to calculate a total exp based on final applied level
		len  = charRPData.rp.length;
		days = charRPData.rp.days || charRPData.daily.length;
		mult = LevelUtils.calculateHybridRPMult(len, days);
		if (mult < 0) mult = 0
		expData[idx].xp = mult;
		if (charRPData.rpp && mult > 0)
			expData[idx].rpp = mult * NPC_RPP_AMOUNT;

		if (mult <= 0)
			expData[idx].level = -1;
	});

	return expData;
}









///
/// Check the channel to see if it's a valid channel to process exp scenes.
/// @channel: The channel in which the command was executed.
///
async function CheckValidChannel(channel)
{
	//Check to make sure the channel is one that will award scene exp
	if (ChanUtils.isDuelRPChannel(channel))
		throw new Error(ERROR_DUEL_CHANNEL)
	if (!ChanUtils.isRoleplayChannel(channel) && 
		!ChanUtils.isRoleplayThread(channel))
		throw new Error(ERROR_NORP_CHANNEL)
	const expScene = await ChanUtils.isRPExpEligible(channel);	
	return expScene;
}

///
/// Collect user IDs for unknown tupper messages - SHOULD be unnecessary in most cases
/// @interaction: The interaction passed down from the handler
/// @data: the name of the character / tupper we're inquiring about
///
async function assignUnknownUser(interaction, name)
{
	let channel = interaction.channel
	let guild = interaction.guild
	
	let embed = new EmbedBuilder()	
		embed.setTitle("Who played `" + name + "`?");
		embed.setDescription("Couldn't automatically match a character in the scene to the player.\n**@ping** the person who played `"+name+"`\n`s` to `skip` this character\n`c` to `cancel` the command entirely");
	
	let message = await interaction.editReply({embeds:[embed], ephemeral: interaction.ephemeral});	//.followUp(
	let response = await Prompt.promptUserPing(channel, message, null)

	// if (!Debug)
	// 	await message.delete();	
	let authorId = null
	if (response)
	{
		if (("cancel").includes(response))
			throw new Error(ERROR_CMD_CANCELED);
		if (("skip").includes(response))
			return authorId;
		authorId = response.match(/[0-9]+/g)[0];
		
		//Verify the author ID
		var member = guild.members.resolve(authorId);
		if (member) return authorId;
		console.error(`User ID ${authorId} is not a member of the server`)
	}
	else console.error(`assignUnknownUser NO RESPONSE`)
	return authorId;
}



//Build the embed listing the options for the user to select from
function constructLevelQuery(charRPData, showPctMatch=true, npcAssign=false)
{
	let title  = "Couldn't find an exact match for `"+charRPData.name+"`";
	let desc   = "";
	if (charRPData.char)
	{
		title  = `Updating Character: \`${charRPData.char}\``;
		desc   = `*RP as \`${charRPData.name}\`*\n\n`
	}
	let footer = "Select the character from the drop down.\n";
	if (charRPData.char)
		footer += "❌ Cancel update.\n"	
	else
		footer += "❌ Cancel to stop processing the scene.\n"	
	footer += "☑️ Default will be chosen if no selection is made in 30 seconds."	
	
	charRPData.matches.forEach(function(match,idx)
	{
		var line = ` • \`${match.name}\` (Level ${match.level})`;
		const pct = match.rating ? ` - ${Math.round(match.rating * 100) || 0}% Match` : null
		if (showPctMatch && pct) line += pct
		desc += line + "\n";		
	});
	if (npcAssign)
		desc += ` • \`NPC\` Earn bonus ${config.rppemoji} RPP instead of ${config.xpemoji} Exp\n`
	else
	{
		desc += ` • \`NPC\` (No level)\n`
		desc += ` • \`Skip\` - Exclude character from Scene awards\n`
	}
	desc += "*If a character is missing from the list, they may not have been `!setup`.*\n"
		
	let defaultOption = "Will `skip` this character."
	if (charRPData.match)
	 	defaultOption = `Will choose the highest % match (\`${charRPData.match.name}\`)`;
	else if (charRPData.matches?.length == 1)
		defaultOption = `Will choose the only registered PC (\`${charRPData.matches?.[0]?.name}\`)`;
	else if (charRPData.t)
		defaultOption = "Will treat this character as an `NPC`.";
	defaultOption = {name:"`☑️` Default",value:defaultOption}
	
	var embed = new EmbedBuilder();
	embed.setTitle(title);
	embed.setDescription(desc);
	embed.addFields([defaultOption]);
	embed.setFooter({text:footer});
	return embed;		
}

///
/// Prompt the user to select one of their characters
/// @interaction (required interaction)
/// @charRPData (required object)
///
async function assignUnknownCharacter(interaction, charRPData, npcAssign = false)
{
	let showPctMatch = true; //!charRPData.char
	
	//Get the character list
	let charList = []
	let charData = {}
	for(let i = 0; i < charRPData.matches.length; ++i)
	{
		let option = charRPData.matches[i]
		const value = option.name
		const label = `${value} (Level: ${option.level})`
		const match = (showPctMatch && option.rating) ? `(${Math.round(option.rating * 100) || 0}% Match)` : null
		charList.push(Prompt.createSelectOption(label, match, value))
		charData[value] = option
	}

	let response = null;
	if (interaction)
	{
		let buttons = [
					{style:ButtonStyle.Primary,   emoji:"☑️", label:"Default", custom_id:"default"},
					{style:ButtonStyle.Secondary, emoji:"👥", label:"NPC", custom_id:"npc"},			
					{style:ButtonStyle.Secondary, emoji:"⏭️", label:"Skip", custom_id:"skip"},
					{style:ButtonStyle.Secondary, emoji:"❌", label:"Cancel", custom_id:"cancel"},	
				  ];
		if (npcAssign) buttons.splice(2,1);
		//Create the character selection
		const selectId = interaction.id + charRPData.name
		const charSelect = Prompt.createSelectRow(selectId, charList, 1, 1, 'Select Character...');
		const buttonRow = Prompt.createButtonRow(buttons);
	
		//Post the emebed and collect responses
		let userping = interaction.user.id != charRPData.user ? `<@${charRPData.user}>` : ""
		let embed = constructLevelQuery(charRPData, showPctMatch, npcAssign)
		let prompt = await interaction.editReply({	content:`${interaction.user}${userping}`,				//.followUp(
													embeds:[embed], components:[charSelect,buttonRow], 
													ephemeral: interaction.ephemeral });		

		const time = (Debug && interaction.isContextMenuCommand()) ? Prompt.Time.Debug : Prompt.Time.Std
		
		response = await Prompt.collectAllInteractions(prompt, {}, null, time)
								.catch(async error => {
										embed.setDescription(error)
										await prompt.edit({embeds:[embed], components: []});
								  	});		
		// if (!Debug)
		// 	await prompt.delete();
	}
	
	if (!response || ("default").includes(response))
	{
		if (charRPData.match)
			return charRPData.match;
		else if (charRPData.matches?.length == 1)
			return charRPData.matches[0]
		response = charRPData.t ? 'npc' : 'skip'
	}
	
	if (("skip").includes(response))
		return null;
	if (("npc").includes(response))
		return response
	if (("cancel").includes(response))
		throw new Error(ERROR_CMD_CANCELED);
	
	response = (Array.isArray(response)) ? response[0] : response;
	return charData[response] || null		
}

///
/// Take the gathered stats and put them all into a list of individual characters
/// @channel: The channel of the scene to process
/// @stats: The raw stats gathered from parsing the scene
/// Returns: array of character objects containing: char, user, level, & earned exp
///
async function processData(interaction, stats)
{
	let expData = [];
	let allData = stats[0].char;
	delete stats[0]
	delete stats.tupperMap

	// Loop through all the data
	//  - those with user IDs (users & identified Tuppers)
	//  - those without uIds (unidentified tupper proxies)
	// End Goal: identify USER, CHAR, & LEVEL of every scene participant
	for (const char in allData)
	{
		let user = allData[char].uId ?? null;
		let tup  = allData[char].t || false

		// console.log(char, user)
		
		//If we have a uId associated with it, clean up some extraneous data
		let charRPData = user ? stats[user].char[char] : allData[char]
			charRPData.name  = char;
			charRPData.char  = null;
			charRPData.user  = user;
			charRPData.level = -1;
			charRPData.t     = tup;
			charRPData.rp	 = { length: charRPData.length, posts: charRPData.posts };
			charRPData.daily = Object.keys(charRPData.dates);
		if (user) delete stats[user].char[char];
		if (charRPData.length < MIN_RP_THRESHOLD)
			continue;

		charRPData = await processCharData(interaction, charRPData);
		expData.push(charRPData)
	}
	
	if (null == expData) return null;
	return expData	
}


async function processCharData(interaction, charRPData, forcePrompt = false, npcAssign = false)
{
	let startTime, endTime;
	//Prompt the players to identify the user who played an unknown character
	if (interaction && !charRPData.user)
	{
		startTime = performance.now()
		charRPData.user = await assignUnknownUser(interaction, charRPData.name)
		endTime = performance.now()
		interactionTimer[interaction.id] += (endTime - startTime)		
	}
	
	//Find a match for this character based on the user
	if (charRPData.user)
	{
		const charDBData = await CharUtils.findClosestMatch(charRPData.name, charRPData.user, forcePrompt);
		charRPData.match =  charDBData?.match;
		charRPData.matches = charDBData?.matches;

		if (charRPData.sameUser)
		{
			charRPData.matches = charRPData.matches ?? [];
			charRPData.sameUser.forEach(x => 
			{
				if (!charRPData?.matches?.find(y => y.name == x.name))
					charRPData.matches.push({...x, rating:0})
			})
			delete charRPData.sameUser;
		}
		
console.log(charRPData)
		
		const matchRating = charRPData.match?.rating || 0;
		if (matchRating < MATCH_THRESHOLD || forcePrompt)
		{
			const numChars = charRPData.matches?.length || 0;
			if (numChars > 0)
			{
				try {
					startTime = performance.now()					
					charRPData.match = await assignUnknownCharacter(interaction, charRPData, npcAssign) 
					endTime = performance.now()
					if (interaction) interactionTimer[interaction.id] += (endTime - startTime)							
				}
				catch (err) { throw err; }
			}
			else
			{
				charRPData.match = "npc"
				charRPData.rpp = 1
			}
			
			if (charRPData.match == "npc")
				charRPData.match = { name:charRPData.name, level:0 }
			else if (!charRPData.match)
				charRPData.match = { name:charRPData.name, level:-1 }
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

	if (!charRPData.char)
	{
		charRPData.char = charRPData.name;
		charRPData.level = -1;
	}

	//Cleanup
	['chan','dates','posts','length','match','matches','t'].forEach( k => delete charRPData[k] );
	
	return charRPData
}


///
///
///
async function LogDebugResult(message, data, url = null, channel = null, footer = null)
{
	let embed = new Embed();
		embed.setTitle("Scene Data")

	let desc = ''
	if (message.user) desc += `${message.user}\n\n`
	if (url) desc += `[Scene](${url})\n`
	if (channel) desc += `${channel}\n`

	if (desc)
		embed.setDescription(desc)
	if (footer)
		embed.setFooter({text:footer})

	if (data)
	{		
		data?.forEach((charData, idx) =>
		{
			delete charData.t;
			let name = charData.name || charData.char;
			let value = `<@${charData.user}>`+"```json\n" + JSON.stringify(charData, null, 2) + "\n```";
			if (value.length < embed.MAX.FIELD)
			{
				try{	embed.addField(name, value);	}
				catch(error){ console.error(name, value); throw(error) }				
			}
			else
			{
				console.error(value.length + "\n" + value + "\n\n")
				return
			}
		});
	}
	const guild = message.guild;
	const debugChan = await guild?.channels?.fetch(config.debugLogChannel);
	if (debugChan) await embed.send(debugChan, `<@${config.OWNERID}>`);
}
