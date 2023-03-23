const { EmbedBuilder, ButtonStyle } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils = require(`./utilFuncs.js`)
const Prompt = require(`./promptUtils.js`);
const MsgUtils = require(`./messageUtils.js`);
const ChanUtils = require(`./channelUtils.js`);
const LevelUtils = require(`./levelUtils.js`);

const Mutex = require(`./mutexUtils.js`);
const Embed = require(`./EmbedPaginator.js`)

const DEBUG = config.DEV;
const DELETE_ON_UNDO = true
const PING_PREFIX = DEBUG ? "-" : "@";
const MIN_CHARS = DEBUG ? 0 : 750;
const MIN_POSTS = DEBUG ? 0 : 3;
const PROMPT_REACTS = false;
const DUELTITLE = `${config.xpemoji} Duel Complete`;
const DUELXPTITLE = `${config.xpemoji} Duel`
const JSONURL = "https://onlinejsontools.com/url-decode-json?input=";

/// Error Messages
const ERROR_WRONG_CHANNEL = "Cannot process duels in this channel."
const ERROR_RP_CHANNEL = "*Please run this in the Mechanics channel*"
const ERROR_ACTIVE_DUEL = "**Duel Active**\nPlease end the duel with `!i end` before running this command.\n*If there is still a pinned message after ending, please inform a DM on Duty.*"
const ERROR_PROCESS_DUEL = "Already processing this duel"
const ERROR_NO_MECH = "**No duel found**\n*Run this command in the associated Mechanics channel.*"
const ERROR_NO_DUEL = "**No duel found**\nThe most recent duel may have already been processed.\n*If this is in error, please inform a DM on Duty.*"
const ERROR_NO_RP = "**No roleplay found**\nThere is no RP found for the current duel.\n*If you need help, please ask a DM on Duty.*"
const ERROR_PARTICIPANTS = "This command only supports duels between exactly 2 player characters.\nContact a DM on Duty if this is in error.\n"
const ERROR_SETUP = "\n*If your level is wrong, you may need to run `!setup`.*"

const CONFIRM_INSTRUCTIONS = `React with 👍 if this looks correct.\n__If your level looks wrong__: \n• React with 👎 to cancel`
const REFRESH_INSTRUCTIONS = `• Go to <#704307298407022622> and run \`!xp\`\n• Come back and do the \`duel\` command again.`
const CONFIRM_FOOTER = `👍 confirm (both players) / 👎 cancel (one player).\nWill auto-confirm after 30 seconds.`
/// 

/// REGEX
const PLAYER_MATCH = /.* \(Round ([0-9]+)\).*: (.*) \(<@([0-9]+)>\).*/gim;
const CHAR_MATCH = /(?:[0-9]+:| +-) (.*) <([0-9]+)\/[0-9]+ HP>.*/gim;
const ROUND_MATCH = /.*\(round ([0-9]+)\)/i;
const INIT_REGEX = /Initiative [0-9]+ \(round [0-9]+\)/i;
const INIT_MATCH = /\-*COMBAT ENDED\-*/i;
const GROUP_REGEX = /.* (?:was )?added to (?:combat with initiative [0-9]+ as part of )?group .*\./gim;

///
/// Process the most recent duel in the specified channel
/// @channel: The channel in which the command was executed
/// @user: The user who executed the command
/// @message: Optionally, the message on which the menu command was run
///
async function processDuel(channel, user, message)
{
	//Resolve the RP/Mech pair into actual channels
	var channelPair = ChanUtils.getDuelChannelPair(channel)	
	if (!channelPair) return Mutex.unlock(channel, ERROR_WRONG_CHANNEL)
	
	const guild = channel.guild
	const rpChan = guild.channels.resolve(channelPair.RP);
	const mechChan = guild.channels.resolve(channelPair.MECHANICS);
	
	if (!mechChan) return Mutex.unlock(rpChan, ERROR_NO_MECH);
	if (channelPair.RP == channel.id) return Mutex.unlock(mechChan, ERROR_RP_CHANNEL);

	//Check pinned messages and early exit if there's an active init
	const pins = await mechChan.messages.fetchPinned()
	if (pins.size > 0) return Mutex.unlock(mechChan, ERROR_ACTIVE_DUEL);
	//Mutex to prevent the same duel from being processed twice
	Mutex.lock(mechChan, ERROR_PROCESS_DUEL);

	//Get the raw duel & RP data and throw an error if we don't have any
	const rpData = await MsgUtils.getRoleplayData(rpChan, message);	
	let duelData = await getDuelData(mechChan, message);
	if (!duelData) return Mutex.unlock(mechChan, ERROR_NO_DUEL);
	if (!rpData) return Mutex.unlock(mechChan, ERROR_NO_RP); 
	
/*/ ^^^ Gathering all necessary data                    \*\
|*| <<< TODO: Branch off here for informational output  |*|
\*\ vvv Proccessing data for approval                   /*/

	//Consolidate the RP and Duel data
	duelData = await consolidateData(duelData, rpData);
	
	//Verify that there were exactly two participants
	const participants = await verifyParticipants(duelData);	
	if (null == message && participants !== true) 
		return Mutex.unlock(mechChan, participants);
	
	//Verify that both participants put in sufficient effort in their roleplay
	//Override / ignore this if the duel is being force-validated by a mod.
	const rpValid = await verifyRoleplay(duelData);
	if (null == message && rpValid !== true)
		return Mutex.unlock(mechChan, rpValid.errors);

	//Determine the winner of the duel
	const outcome = await determineWinner(duelData, channel, user);
	if (!outcome.winner || !outcome.loser)
		return Mutex.unlock(mechChan, outcome);
	duelData.outcome = outcome
	duelData = calculateExp(duelData);

/*/                                                    \*\ 
|*| ^^^ Processed all necessary data                   |*|
|*| <<< TODO: Branch off here for informational output |*|
\*\                                                    /*/

	const cleanedData = cleanData(duelData);
	const confirm = await awaitConfirmation(channel, cleanedData);
	if (confirm !== true)
		return Mutex.unlock(mechChan, confirm.error);

	cleanedData.channel = mechChan.id
	cleanedData.id = duelData.startId
	cleanedData.links = {
		rp:rpData.start,
		duel:duelData.start
	}

	const transcript = generateTranscriptFromData(duelData)
	if (transcript)
	{		
		const transcriptLink = await mechChan.send({embeds:[transcript[0]]})
		cleanedData.transcript = transcriptLink.url

		for (let i=1; i < transcript.length; ++i)
			await mechChan.send({embeds:[transcript[i]]})
	}
	mechChan.send("``` ```");
	const dmEmbed = await sendApprovalMessage(cleanedData, guild);	
	await attachButtons(dmEmbed);

	cleanedData.link = dmEmbed.url;
	const playerEmbed = await closeScene(cleanedData);

	let button = []
	if (mechChan.isThread)
	{			
		button = Prompt.createButtonRow([
			{style:ButtonStyle.Secondary, emoji:"⚔️", label:"Start New Duel",
			 custom_id:"duel.startDuel"}
		])
		button = [button]
		await rpChan.send({embeds:[playerEmbed]})
	}
	await rpChan.send({content:"``` ```",components:button});
	
	Mutex.unlock(mechChan);
	return {embeds:[playerEmbed]}
}

///
/// Get the duel data
///
async function getDuelData(mechChan, message=null)
{
	let duel = null;
	if (message)
	{
		if (parseInitiative(message))
			duel = await MsgUtils.findNextBreak(mechChan, message)
		else
			duel = await MsgUtils.findFenceposts(mechChan, message)
	}
	else
	{
		duel = await MsgUtils.findLastBreak(mechChan);
	}
	if (!duel) return null;

	var duelData = parseDuel(duel.messages);
	if (duelData)
	{
		const start = duel.messages[0];
		duelData.startId = start.id;
		duelData.start = start.url;
	}
	return duelData;
}

//
// Parse the initiative message to create duel data from it
//
function parseInitiative(message)
{
	var duelData = {	
						guild:message.channel.guild.id,
						channel:message.channel.id,
						rounds:0,
						characters:{},
						players:{},
						events:[]
				   };

	if (!INIT_MATCH.test(message.content)) return null;

	//Get the duration (in rounds)
	if (!ROUND_MATCH.test(message.content)) return null;
	duelData.rounds = message.content.match(ROUND_MATCH)[1];

	//Parse for character names & generate the char data for the duel
	var matches = [...message.content.matchAll(CHAR_MATCH)];
	matches.forEach(match=>{
		var name = match[1].replace(/\"/g,'');
		var hp   = match[2];
		duelData.characters[name] = { name: name, hp: hp, user: 0};
	});

	return duelData;
}

//
// Parse all provided messages for duel events
//
function parseDuel(messages)
{
	//Start with the Initiative
	var duelData = parseInitiative(messages[0]);
	if (!duelData) return null;

	let round = '0';
	duelData.events = [];	
	//Parse each message for relevant data
	for (let message of messages)
	{
		//We only care about Avrae messages, skip everything else
		if (message.author.id != config.avraeId) continue;

		let event = {round:round, msg:message.url};

		//If it's an embed, it's an Avrae response to an action. Save it.
		if ((message.embeds.length > 0)&&(message.embeds[0].title))
		{	
			var embed = message.embeds[0];
			event.event = embed?.title;
			event.result = embed?.footer?.text.replaceAll('\n',' | ');
		}
		//If it's not an embed, try to see if it's a Next Turn message
		else if (message.content)
		{				
			//Use it to track the round, and map the UID to the character
			var match = [...message.content.matchAll(PLAYER_MATCH)];
			if (match.length > 0)
			{	
 					 round = match[0][1];
				const name = match[0][2];
				const id   = match[0][3];
				if (duelData.characters.hasOwnProperty(name))
					duelData.characters[name].user = id;
			}
			//Save everything else as an event (no result)
			event.event = message.content;
		}
		else
		{
			event.event = "*Unknown event*";
			continue
		}
		
		//Skip known irrelevant messages & massage the data a little
		if ((INIT_REGEX.test(event.event))||
			(GROUP_REGEX.test(event.event))||
			(event.event.includes("removed from all groups"))||						
			(event.event.includes("Everyone roll for initiative"))||
			(event.event.includes("Current initiative"))||
			(event.event.includes("takes a Long Rest!"))||
			(event.event.includes("Cannot cast spell!"))||
			(event.event.includes("Level Summary for"))||
			(event.event.includes("needs help with"))||
			(event.event.includes("Selection timed out or was cancelled.")))
			continue;

		const AddInitRegex = /with initiative 1d20 .*/i;
		event.event = event.event.replace(AddInitRegex, "...");

		duelData.events.push(event);
		if (event.event == "Combat ended.") break;
	};
	return duelData;
}

///
/// Consolidate the RP, duel, and level data into the duel data
///
async function consolidateData(duelData, rpData)
{
	duelData.players = duelData.players || {};	
	var chars = duelData.characters;
	var charNames = Object.keys(chars)
	await Utils.asyncArrayForEach(charNames, async (name)=>
	{			
		//Identify the levels of the characters
		const char = chars[name];
		const query = {name:char.name, user:char.user};
		const charData = await LevelUtils.getLevelData(query);

		//If the database doesn't have any level, bail
		if (!charData||!charData.user||!charData.level)
			return null;
		
		duelData.characters[name].user = charData.user;
		duelData.characters[name].level = charData.level;
		var user = charData.user;

		//Organize the participants by player rather than character
		duelData.players[user] = duelData.players[user] || {chars:[],rp:{}};
		duelData.players[user].chars.push(name);
		duelData.characters[name].pc = true;
	});

	//Bring in the RP data	
	var players = Object.keys(duelData.players);
	players.forEach( user => 
	{
		const record = rpData?.[user] || {posts:0, length:0};
		duelData.players[user].rp = {posts:record.posts, length:record.length};
	});
	return duelData;
}

///
/// Check for number of player/PC participants (should be exactly 2)
///
function verifyParticipants(duelData)
{
	const players = Object.keys(duelData.players);
	const playerCount = players.length;
	const characters = Object.keys(duelData.characters);
	const pcs = characters.filter(char => duelData.characters[char].pc);
	const pcCount = pcs.length;

	if ((playerCount != 2)||(pcCount != 2))
	{	//Too many: Alert them and don't send the second ping.
		//Too few: either never got a turn and/or char never got registered 
		//TODO: Match player to character
		//get a player ping for any character missing their player
		var error = ERROR_PARTICIPANTS;
		error+= "**Players**: <@" + players.join("> / <@") + ">\n";
		error+= "**PCs**: " + pcs.join(" / ") + "\n";
		characters.forEach( (name, idx)=> {
			characters[idx] += ` (Level ${duelData.characters[name].level})`;
		});	
		error+="**In Init**: " + characters.join(" / ") + "\n";
		error+= ERROR_SETUP;
		return error;
	}

	//Once we've verified the PCs, we can throw away the companions and shit
	characters.map(char => {
		if (!duelData.characters[char].pc) delete duelData.characters[char];
	})

	players.map(user => {
		duelData.players[user].char = duelData.players[user].chars[0]
		delete duelData.players[user].chars
	});

	return true;
}

///
/// Verify that both participants put in sufficient effort in their roleplay
///
function verifyRoleplay(duelData)
{
	//Check for RP from all participants
	const players = Object.keys(duelData.players);
	let pings = [];	
	let errors = [];
	players.forEach( uid => 
	{
		var rpData = duelData.players[uid].rp;
		if ((rpData.length < MIN_CHARS)||(rpData.posts < MIN_POSTS))
		{
			var error = "<@"+uid+"> - Your roleplay was insufficient.\n";
			error += " Add roleplay and re-call the command\n";
			error += "||*"+rpData.length+" chars|"+rpData.posts+" post(s)*||";
			errors.push(error);
			if (!pings.includes(uid)) pings.push(uid);
		}
	});

	if (errors.length > 0)
		return {errors: errors, pings: pings}
	return true
}

///
/// Determine the winner
///
async function determineWinner(duelData, channel, sender)
{
	let outcome = {winner:0,loser:0};
	const chars = Object.keys(duelData.characters)
						.filter(c=>duelData.characters[c].pc)	
	chars.forEach( char => 
	{
		const charData = duelData.characters[char];
		//Figure out the winner / loser based on HP remaining
		if ((charData.hp > 0)&&(0 == outcome.winner))
			outcome.winner = {uid:charData.user, char:char};
		else if ((charData.hp <= 0)&&(0 == outcome.loser))
			outcome.loser = {uid:charData.user, char:char};
		else
			outcome = {winner: -1, loser: -1};
	})

	//If we can't figure out the winner, prompt the player to select them
	if ((outcome.winner <= 0)||(outcome.loser <= 0))
	{
		outcome = await promptWinner(duelData, channel, sender)
	};

	return outcome;
}


///
/// If we couldn't find the winner automatically, prompt for it
///
async function promptWinner(duelData, channel, sender)
{
	const players = Object.keys(duelData.players);
	const options = ["1️⃣","2️⃣","❌"];	
	let prompt = "";
	// players.forEach( (uid, idx)=>
	// {
	// 	const char = duelData.players[uid].char;
	const chars = Object.keys(duelData.characters)
						.filter(c=>duelData.characters[c].pc)
	chars.forEach( (char, idx) => 
	{
		const level = duelData.characters[char].level;
		if (PROMPT_REACTS)
			prompt += `${options[idx]} - \`${char}\` (Level ${level})\n`
		else
			prompt += `\`${idx+1}\` - \`${char}\` (Level ${level})\n`		
	});

	const users = players;
	if (!users.includes(sender.id)) users.push(sender.id);
	console.log("Authorized responders: ", users);
	const pings = `<${PING_PREFIX}${users.join("> <"+PING_PREFIX)}>`;
	var embed = new EmbedBuilder();
		embed.setTitle("Select the Winner...");
		embed.setDescription(prompt);

	let response = null;
	if (PROMPT_REACTS)
		response = await promptWinnerReact(channel, pings, embed, users, options)
	else
		response = await promptWinnerInput(channel, pings, embed, users)

	if (typeof response !== 'number')
		return response;
	if ((response < 0)||(response >= chars.length ))
		return "Invalid input. Command canceled.";

	const winName = chars[response];
	const lossName = chars[1-response];
	let outcome = {
		winner:{uid: duelData.characters[winName].user, char:winName },
		loser:{uid: duelData.characters[lossName].user, char:lossName }
	};

	return outcome;
}

///
/// Prompt user to type their response
///
async function promptWinnerInput(channel, pings, embed, users)
{
	embed.setFooter({text: "Type the number or `c` to cancel."});
	embed = await channel.send({content:pings,embeds:[embed]});
	let response = await Prompt.promptUserInputOption(channel, embed, users)
	embed.delete();
	if (null === response)
		return "Input Timeout. Command canceled.";
	if (["c","cancel"].includes((''+response).toLowerCase()))
		return "Command canceled.";
	if (typeof response !== 'number')
		response = parseInt((''+response).replace(/\D/g,''));
	--response;	//Offset by 1 since we showed 1-based instead of 0-based
	return response;
}

///
/// Prompt user to react with their response
///
async function promptWinnerReact(channel, pings, embed, users, options)
{
	embed.setFooter({text:"Select the winner's reaction, or ❌ to cancel."});
	embed = await channel.send({content:pings,embeds:[embed]});	
	let response = await Prompt.promptUserReaction(channel, embed, users, 
										 options,"❌",options,true);
	embed.delete();	
	if (null === response)
		return "Input Timeout. Command canceled.";
	if (response.react == "❌")
		return "Command cancelled."
	return response.idx;	
}

///
/// Calculate the exp split between the two players based on the loser's level
///
function calculateExp(duelData)
{
	const winuid  = duelData.outcome.winner.uid;
	const winName = duelData.outcome.winner.char;	//players[winuid].char;
	const winner  = duelData.characters[winName];
	const winCap  = LevelUtils.getDuelExpCap(winner.level);

	const losuid  = duelData.outcome.loser.uid;
	const lossName= duelData.outcome.loser.char;	//players[losuid].char;
	const loser   = duelData.characters[lossName];
	const lossCap = LevelUtils.getDuelExpCap(loser.level);

	const exp = LevelUtils.getDuelExp(loser.level);

	const date = Utils.getDate();
	duelData.logDate = date.getTime();

	const winRaw = exp[0];
	const winExp = Math.min(winRaw, winCap);

	const lossRaw = exp[1];
	const lossExp = Math.min(lossRaw, lossCap);

	duelData.characters[winName].xp = { xp:winExp,	 cap:winCap	 }
	duelData.characters[lossName].xp = { xp:lossExp, cap:lossCap }

	return duelData;
}

///
/// Cleanup the data into a small manageable chunk
///
function cleanData(duelData)
{
	var cleanData = {};
	//Winner
	var uid    = duelData.outcome.winner.uid;
	var player = duelData.players[uid]
	var name   = duelData.outcome.winner.char;	//player.char;
	var char   = duelData.characters[name];
	cleanData["winner"] = {
		uid: uid,
		char: name,
		level: char.level,
		rp: player.rp,
		xp: char.xp
	};

	//loser
	uid    = duelData.outcome.loser.uid;
	player = duelData.players[uid];
	name   = duelData.outcome.loser.char;	//player.char;
	char   = duelData.characters[name];
	cleanData["loser"] = {
		uid: uid,
		char: name,
		level: char.level,
		rp: player.rp,
		xp: char.xp
	};

	cleanData.command = "duel";
	cleanData.logDate = duelData.logDate;
	duelData = cleanData;
	return duelData;
}

///
/// Pause and wait for confirmation from the player(s) before continuing
///
async function awaitConfirmation(channel, duelData)
{	
	const winner = duelData.winner
	const loser = duelData.loser	
	const players = [winner.uid,loser.uid];
	const pings = `<${PING_PREFIX}${players.join("> <"+PING_PREFIX)}>`;
	const inst = REFRESH_INSTRUCTIONS;
	const title = "Confirmation";
	const desc = CONFIRM_INSTRUCTIONS + '\n' + REFRESH_INSTRUCTIONS;
	const footer = CONFIRM_FOOTER;
	const win = `${winner.char} (Level ${winner.level})`;
	const loss = `${loser.char} (Level ${loser.level})`;

	let embed = new EmbedBuilder();
	  	embed.setTitle(title);
	  	embed.setDescription(desc);
		embed.addFields([
				{name:`👑 Win: ${win}`, value:`<@${winner.uid}>`},		
				{name:`💀 Loss: ${loss}`, value:`<@${loser.uid}>`}
			]);
		embed.setFooter({text:footer});
		embed = await channel.send({content:pings,embeds:[embed]});

	let react;
	if (PROMPT_REACTS)
	{
		const reacts = ["👍","👎"];
		react = await Prompt.promptUserReaction(channel, embed, players, reacts, "👍","👎");
	}
	else
	{
		const reacts = [
			{style:ButtonStyle.Success, emoji:"👍", label:'Approve', custom_id:"👍"},
			{style:ButtonStyle.Danger, emoji:"👎", label:'Decline', custom_id:"👎"}		
		]
		react = await Prompt.promptUserButton(channel, embed, players, reacts, "👍", "👎");
	}
	
	embed.delete();
	if (react.react == "👎")
	{
		return {error:`${react.user} If your level was wrong:\n${inst}`,
				user:react.user.id};
	}
	return true;
}

///
/// Close the scene, sends a message to the DM channel
///
async function sendApprovalMessage(duelData, guild)
{
	const date     = new Date(duelData.logDate)
	const fullDate = Utils.formatDate(date, "DD MMMM YYYY [ hh:mmpm ]")	
	const winner   = duelData.winner;
	const loser    = duelData.loser;
	const win 	   = getExpField(duelData.winner, true, true)
	const loss     = getExpField(duelData.loser, true, true)
	const rpLink   = duelData.links.rp
	const duelLink = duelData.links.duel
	let transcript = duelData.transcript
	transcript = transcript ? `[Transcript](${transcript})` : "None"
	
	delete duelData.links
	delete duelData.winner.rp
	delete duelData.loser.rp
	delete duelData.transcript
	const encoded = encodeURIComponent(JSON.stringify(duelData));
	var dmEmbed = new EmbedBuilder() 
		.setTitle(DUELTITLE)
		.setThumbnail("https://i.imgur.com/2U90DwW.png")
		.addFields([
			{name: `👑 Win: ${winner.char} (Level ${winner.level})`, value:win},
			{name: `💀 Loss: ${loser.char} (Level ${loser.level})`, value:loss},
			{name: "Start Links", value:`[Roleplay](${rpLink})\n[Duel](${duelLink})`, inline: true},
			{name: "Transcript", value: transcript, inline: true},
			{name: "Data",value:"[Data]("+(JSONURL+encoded)+")",inline: true}
		])
		.setFooter({text:`Logged at (server time): ${fullDate}\n✅ Approve | ❌ Reject (no exp)\n👑 Winner exp only | ⏸️ 50% to each | 💀 Loser exp only`});

	const dmChan = guild.channels.resolve(config.dmPingChannel);
	dmEmbed = await dmChan.send({content:`<@&${config.DMOnDutyRole}>`,embeds:[dmEmbed]})
	return dmEmbed;
}


///
/// Close the scene, sends a message to the DM channel
///
async function closeScene(duelData)
{
	const date     = new Date(duelData.logDate);
	const fullDate = Utils.formatDate(date, "DD MMMM YYYY [ hh:mmpm ]")
	const win 	   = getExpField(duelData.winner, false)
	const loss 	   = getExpField(duelData.loser, false)
	const playerEmbed = new EmbedBuilder()
		.setTitle(DUELTITLE)
		.setDescription(`***Please wait** for a [@DM](${duelData.link}) to verify this before you add your exp.\nIf anything looks incorrect, please notify a <@&${config.DMOnDutyRole}> immediately*`)	
		.addFields([
			{name:`👑 Win: ${duelData.winner.char} (Level ${duelData.winner.level})`, value:win},
			{name:`💀 Loss: ${duelData.loser.char} (Level ${duelData.loser.level})`, value:loss},
			{name:`Awards`, value:`Awards will be posted in <#${config.xpLogChannel}> once the duel has been reviewed by the DM staff.`}			
		]);
	playerEmbed.setFooter({text:"Logged at (Server Time): " + fullDate});

	return playerEmbed;
}

function getExpField(record, includeXP = true, includeRP = false)
{
	const uid    = record.uid;
	const name   = record.char;
	const level  = record.level;
	const xp     = record.xp;
	const gain   = xp.total ? "Gain: " : "";
	var ret = `<@${uid}>`;

	if (includeXP)
	{
		ret += `- ${gain}\`${xp.xp}\`xp `;
		if (xp.total)
			ret += `[Cap: ||\`${xp.total}\` / \`${xp.cap}\`||]`
		else
			ret += `[of \`${xp.cap}\` cap]`
	}
	else
	{
		//ret += "`Pending DM approval`"
	}

	if (includeRP && record.rp)
		ret += `\nRP: \`${record.rp.posts}\` Posts, \`${record.rp.length}\` Chars`;	
	return ret;
}

///
/// Attach the buttons to the DM 
///
async function attachButtons(embed)
{
	const rows = getApprovalButtons();
	await embed.edit({ components:rows })
}

function getApprovalButtons()
{
	const row = Prompt.createButtonRow([
		{style:ButtonStyle.Success, emoji:"✅", label:"Approve", custom_id:"duel.approve"},
		{style:ButtonStyle.Danger, emoji:"❌", label:"Reject", custom_id:"duel.decline"},	
//		{style:ButtonStyle.Secondary, emoji:"📜", label:"Transcript", custom_id:"duel.transcript"}
	])
	const row2 = Prompt.createButtonRow([
		{style:ButtonStyle.Secondary, emoji:"👑", custom_id:"duel.winOnly"},
		{style:ButtonStyle.Primary, emoji:"⏸️", custom_id:"duel.draw"},		
		{style:ButtonStyle.Secondary, emoji:"💀", custom_id:"duel.lossOnly"},
		{style:ButtonStyle.Primary, emoji:"🔀", custom_id:"duel.reverse"}
	])	
	return [row,row2]
}

///
///  
///
function retrieveDuelData(duelLogMessage)
{
	const fields = duelLogMessage?.embeds?.[0]?.fields
	const dataField = fields?.find(field => field.name == "Data");
	
	let data = dataField.value;
	//let data = fields?.[fields.length-1]?.value
	if (data)
	{
		data = data.replace("[Data]("+JSONURL,"");	//Strip the URL leaving just data
		data = data.substring(0, data.length - 1);	//Strip the trailing )
		data = decodeURIComponent(data);			//Decode the data into json string
		data = JSON.parse(data);					//Parse it into an object
	}
	return data;
}

///
///
///
function getWinLossRatio(subCommand)
{
	let winRatio=1
	let lossRatio=1
	switch(subCommand)
	{
		case "duel.approve":  winRatio = 1.0, lossRatio = 1.0; break;
		case "duel.reverse":  winRatio = 1.0, lossRatio = 1.0; break;			
		case "duel.winOnly":  winRatio = 1.0, lossRatio = 0.0; break;
		case "duel.lossOnly": winRatio = 0.0, lossRatio = 1.0; break;
		case "duel.draw":     winRatio = 0.5, lossRatio = 0.5; break;
		case "duel.decline":  winRatio = 0.0, lossRatio = 0.0; break;
	}
	return [winRatio, lossRatio]
}

///
/// Handle reactions to the exp log message for ease of DM validation
///
async function approveDuel(duelLogMessage, user, subCommand)
{
	const channel = duelLogMessage.channel;
	const duelData = retrieveDuelData(duelLogMessage);	
	const date = duelData.logDate;
	const cmd = duelData.command;
	const [winRatio, lossRatio] = getWinLossRatio(subCommand)
	
	//Update the exp being awarded by the ratio
	if ((winRatio == 0.5)||(lossRatio == 0.5))
	{
		const exp = LevelUtils.getDuelExpCap(duelData.loser.level)
		duelData.loser.xp.xp = exp;
		duelData.winner.xp.xp = exp;
	}
	duelData.winner.xp.xp *= winRatio;
	duelData.loser.xp.xp *= lossRatio;

	if (subCommand == "duel.reverse")
	{
		[duelData.loser.xp.xp, duelData.winner.xp.xp] = [duelData.winner.xp.xp, duelData.loser.xp.xp];
		[duelData.winner,duelData.loser]=[duelData.loser,duelData.winner]
	}
	
	//Update the daily total in the DB
	const winner = await LevelUtils.updateDailyExp(duelData.winner, cmd, date);
	const loser  = await LevelUtils.updateDailyExp(duelData.loser, cmd, date);	
	if (winner == null || loser == null)
		return "Something went wrong";
	duelData.winner = winner;
	duelData.loser  = loser;
	duelData.subCommand = subCommand;
	duelData.winner.ratio = winRatio;
	duelData.loser.ratio = lossRatio;
	duelData.comment = null;
	
	if (winRatio < 1 || lossRatio < 1 || (subCommand == "duel.reverse"))
	{
		const prompt = await channel.send("Please provide a reason for the decision:")
		duelData.comment = await Prompt.promptUserInput(channel, prompt, [user.id])
		await prompt.delete();
	}
	
	await postApprovedExp(duelLogMessage, duelData, user);
}

//Post the approved exp message to the Log channel
async function postApprovedExp(message, duelData, user)
{
	const guild 	= message.guild;
	const channel	= await guild?.channels.resolve(duelData.channel);	
	const date      = new Date(duelData.logDate);
	const veriDate  = Utils.formatDate(Utils.getDate(), "DD MMMM YYYY [ hh:mmpm ]")
	const shortDate = Utils.formatDate(date, "DD MMM YYYY");
	const fullDate  = Utils.formatDate(date, "DD MMMM YYYY [ hh:mmpm ]")
	const winRatio  = duelData.winner.ratio;
	const lossRatio = duelData.loser.ratio;
	
	const win       = getExpField(duelData.winner)
	const winNote   = (winRatio==1)?"":`\n*Exp reduced to ${winRatio * 100}% pre-cap*`
	const loss      = getExpField(duelData.loser)
	const lossNote  = (lossRatio==1)?"":`\n*Exp reduced to ${lossRatio * 100}% pre-cap*`

	let emoji,reply;
	switch(duelData.subCommand)
	{			
		case "duel.approve": emoji = "✅"; reply = "Duel Approved"; break;
		case "duel.winOnly": emoji = "👑"; reply = "Duel Semi-Approved"; break;
		case "duel.lossOnly": emoji = "💀"; reply = "Duel Semi-Approved"; break;
		case "duel.reverse": emoji = "🔀"; reply = "Duel Reversed"; break;				
		case "duel.draw": emoji = "⚖️"; reply = "Draw Declared"; break;    
		case "duel.decline": emoji = "❌"; reply = "Duel Rejected"; break
	}

	// /////
	// const unbClient = new unbapi.Client(process.env.UBTOKEN);
	// const bonus = channel?.isThread ? 500 : 250;
	// await unbClient.editUserBalance(guild.id, duelData.winner.uid, { cash: bonus })
	// await unbClient.editUserBalance(guild.id, duelData.loser.uid, { cash: bonus })
	// /////
	
	let logEmbed = new EmbedBuilder().setTitle(`${DUELXPTITLE} - ${shortDate}`)
		.setDescription(`${emoji} ${reply}`)
		.addFields([
			{name:`👑 Win: ${duelData.winner.char} (Level ${duelData.winner.level})`, 
			 value: win + winNote},
			{name:`💀 Loss: ${duelData.loser.char} (Level ${duelData.loser.level})`, 
			 value: loss + lossNote},
			{name:"DM Comment",value:duelData.comment ? duelData.comment : "[None]"}
		]);
	
	var pingChan = message.guild.channels.resolve(config.xpLogChannel);
	if (DEBUG)
		pingChan = message.channel;

	const pings = `<@${duelData.winner.uid}> <@${duelData.loser.uid}> - _Log in <#${config.xpSpamChannel}>_`
	pingChan.send({content:pings,embeds:[logEmbed]}).then(async (msg)=>
	{
		let embed = EmbedBuilder.from(message.embeds[0].toJSON());
		let link = `<@${user.id}> [Link](${msg.url})`
		
		embed.addFields([{name:`${emoji} ${reply}`, value:link}]);
		embed.setFooter({text:`Logged at (server time): ${fullDate}\nVerified at: ${veriDate} by ${user.id}`})
		const row = Prompt.createButtonRow([
//			{style:ButtonStyle.Primary, emoji:"↩️", label:"Undo", custom_id:"duel.undo"},	
			{style:ButtonStyle.Secondary, emoji:"📜", label:"Transcript", custom_id:"duel.transcript"}
		])
		await message.edit({embeds:[embed], components:[]})	//,components:[row]});

		//Add a react to the original initiative post when approved by a DM
		const initMsg = await channel?.messages.fetch(duelData.id);
		await initMsg?.react(emoji);
	});
}

async function undoApproval(logMessage, client)
{
	let embed = logMessage.embeds[0];
	let removed = embed.fields.pop();
		removed = removed.value.split("/");
	let message = removed.pop().replace(")","");
	let channel = removed.pop();
		channel = await logMessage.guild.channels.resolve(channel);
	if (channel)
	{
		try {
			message = await channel.messages.fetch(message);
		} catch (error) {
			message = null;
		}
		if (DELETE_ON_UNDO && message && message.author.id == client.user.id)
			message.delete();
	}
	const rows = getApprovalButtons()
	logMessage.edit({embeds:[embed], components:rows});
}
	
// 	clearDailyExp(message)
// 	{
// 		this.dailyExp.clearItems();
// 		this.dailyExp.save();

// 		var veriDate  = this.bot.getDate();
// 		var shortDate = this.bot.formatDate(veriDate, "DD MMM YYYY");
// 			veriDate  = this.bot.formatDate(veriDate, "DD MMMM YYYY [ hh:mmpm ]")

// 		message.channel.send("🕛 - Daily Exp Reset - " + veriDate);

// 		var pingChan = message.guild.channels.resolve(this.bot.config.xpLogChannel);
// 		pingChan.send("```\n" + shortDate + "\n```");
// 	}


///
/// Using the parsed event data, generate a transcript
///
async function generateTranscriptFromLog(duelLogMessage)
{
	const data = retrieveDuelData(duelLogMessage);
	const guild = duelLogMessage.guild;
	const mechChan = guild?.channels?.resolve(data.channel);
	const message = await mechChan?.messages?.fetch(data.id);
	return await generateTranscript(mechChan, message)
}	

async function generateTranscript(channel, message)
{	
	//Get the raw duel data and throw an error if we don't have any
	const duelData = await getDuelData(channel, message);
	if (!duelData || !duelData.events)
	{
		const embed = new EmbedBuilder().setTitle("Error: No Duel Data Found")
					.setDescription("Must be done in a mechanics channel")
		return [embed]	
	}
	return generateTranscriptFromData(duelData)
}

function generateTranscriptFromData(duelData)
{
	if (!duelData.events) return null;
	
	let embed = new Embed()
		embed.setTitle("Duel Transcript")
//	embed.setDescription("")
	for (let round=0; round <= duelData.rounds; ++round)
	{
		let events = duelData.events.filter(event => (event.round == round));
		if (events.length > 0)
		{
			embed.addField(`Round ${round}`, "")
			events.forEach(event => 
			{
				let field = `[[jump](${event.msg})] \`${event.event}\``
				if (event.result)
					field += `\n • *${event.result}*`
				embed.extendField(field, `Round ${round} cont.`)
			})
			embed.closeField();
		}
	}

	return embed.embeds();
}

module.exports = {
	processDuel,
	approveDuel,	
	undoApproval,
	generateTranscript,
	generateTranscriptFromLog
}