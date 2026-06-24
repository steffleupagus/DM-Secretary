const { EmbedBuilder, ButtonStyle } = require('discord.js')
const { ActionRowBuilder, MessageMentions, TextInputStyle } = require('discord.js')
const { DateTime } = require("luxon");
const { SortOrder } = require(`./enums.js`)

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils = require(`./utilFuncs.js`);
const Prompt = require(`./promptUtils.js`);
const MsgUtils = require(`./messageUtils.js`);
const ChanUtils = require(`./channelUtils.js`);
const LevelUtils = require(`./levelUtils.js`);
const Embed = require(`./EmbedPaginator.js`);
const ExpUtils = require(`./expUtils.js`);
const Mutex = require(`./mutexUtils.js`);
const Log = require(`./loggerUtils.js`);
const {	INSTRUCT, THUMB, ERROR, STEP } = require(`./constants.js`)

/// Debugging
const DEBUG = config.DEV ? {
	IGNORE_RP: true,	//Ignore the RP requirement for debugging purposes
	EMBEDDATA: false,	//Include duelData debug fields in embed output
	USEREMBED: false,	//Automatically log user-facing interaction embeds
	WATCHDATA: false,	//Log duelData to console.out at every step
	TRACESTEP: false,	//Include button components to step through each stage
} : false
const BREAKSTEP = null//STEP.APPROVE_PEND;
const DEBUGFILE = config.DEV


/// REGEX
const GROUP_REGEX	= /.* (?:was )?added to (?:combat with initiative [0-9]+ as part of )?group .*\./gim;
const EVENT_REGEX	= (() => {
	/// REGEX
	const ROLLED_DICE_PATTERN = `\\((~*(\\**\\d+\\**( -> )?)+~*(, )?)+\\)`
	// d20: 1d20 or advantage variants plus potential modifier and result after
	const D20_PATTERN = `\\d?d20(\\w+[lh<>]?\\d+)? *${ROLLED_DICE_PATTERN}( *[+-] *\\d+)?( *= *\\\`\\d+\\\`)?`
	// dice: any combination of valid dice, rolled or unrolled
	const DICE_PATTERN =
		`((\\()? *((\\d*d\\d+(\\w+[lh<>]?\\d+)?( *${ROLLED_DICE_PATTERN})?)|\\d+|( *[-+*/]))( *\\[.*\\])?)+`+
		`(\\))?( *[\\/\\*] *\\d)?( *= *\\\`\\d+\\\`)?`
	// to hit: a to-hit section of an attack
	const TO_HIT_PATTERN =
		`\\*\\*To Hit:?\\*\\*:? ((\\d?d20\\.\\.\\. = \\\`(\\d+|HIT|MISS)\\\`)|(${D20_PATTERN}${DICE_PATTERN} = \\\`\\d+\\\`)|`+
		`(Automatic (hit|miss)!))`
	// damage: a damage section of an attack
	const DAMAGE_PATTERN = `((\\*\\*Damage( \\(CRIT!\\))?:?\\*\\*:? ${DICE_PATTERN})|(\\*\\*Miss!\\*\\*))`
	// attack: to hit and damage on two lines
	const ATTACK_PATTERN = `${TO_HIT_PATTERN}\\n${DAMAGE_PATTERN}`
	// save: d20, success or failure
	const SAVE_PATTERN = `\\*\\*\\w+ Save:?\\*\\*:? ${D20_PATTERN}; (Failure|Success)!`
	// save spell: saving throw and damage on two lines
	const SAVE_SPELL_PATTERN = `${SAVE_PATTERN}\\n${DAMAGE_PATTERN}`

	const EVENT_REGEX = {
		HIT: 		new RegExp(TO_HIT_PATTERN),
		DAMAGE: 	new RegExp(DAMAGE_PATTERN),
		ATTACK: 	new RegExp(ATTACK_PATTERN),
		SAVE: 		new RegExp(SAVE_PATTERN),
		SPELLSAVE: 	new RegExp(SAVE_SPELL_PATTERN)
	}
	return EVENT_REGEX
})()
const INIT_REGEX	= (() => {
	/// REGEX
	const ROLLED_DICE_PATTERN = `\\((?:~*(?:\\**\\d+\\**(?: -> )?)+~*(?:, )?)+\\)`
	// d20: 1d20 or advantage variants plus potential modifier and result after
	const D20_PATTERN = `\\d?d20(?:\\w+[lh<>]?\\d+)? *${ROLLED_DICE_PATTERN}(?: *[+-] *\\d+)?(?: *= *\\\`?(\\d+)\\\`?)?`
	const HP_PATTERN	= `<(?:([0-9]+)\\/([0-9]+) HP(?:, [0-9]+ temp)?|([a-zA-Z]+))?>.*`
	const LIST_PATTERN	= `[\\#\\s]*([0-9]+)?[\\:\\s\\-]+`;
	const ROUND_PATTERN	= `\\(round ([0-9]+)\\)`
	const INIT_PATTERN	= `(?:with )?initiative (?:${D20_PATTERN}|([0-9]+))`
	const PING_PATTERN	= `(.*) \\(<@([0-9]+)>\\)`
	const ADD_PATTERN	= `(?:was added to combat with|added to group|removed from all)(?: ${INIT_PATTERN})?`
	const GROUP_PATTERN	= `(?:(?: as part of group)?s?(.*))?\\.`
	const INIT_REGEX = {
		CHAR_MATCH:		new RegExp(`${LIST_PATTERN} (.*) ${HP_PATTERN}`,'gim'),
		ROUND_MATCH:	new RegExp(ROUND_PATTERN,'i'),
		INIT_MATCH:		new RegExp(INIT_PATTERN,'i'),
		PING_MATCH:		new RegExp(`.*${INIT_PATTERN} ${ROUND_PATTERN}.*: ${PING_PATTERN}`,'gim'),
		ADD_MATCH:		new RegExp(`(?:✅ )?(.*) ${ADD_PATTERN}${GROUP_PATTERN}`,'gim'),
		END_MATCH:		new RegExp(`\\-*COMBAT ENDED\\-*`,'i'),
		IRRELEVANT:	[	"removed from all groups",
						"needs help with",
						"Level Summary for",
						"takes a Long Rest!",
						"Current initiative",
						"Cannot cast spell!",
						"removed from all groups",
						"Everyone roll for initiative",
						"Selection timed out or was cancelled."
					]
	}
	return INIT_REGEX
})()

const DELETE_ON_UNDO	= true
const INVALID_LEVEL		= 0;
const MIN_CHARS			= DEBUG ? 0 : 750;
const MIN_POSTS			= DEBUG ? 0 : 3;
const PING_PREFIX		= DEBUG ? "-" : "@";
const PROMPT_REACTS		= false;
const DUELTITLE			= `${config.emoji.xp} Duel Complete`;
const DUELXPTITLE		= `${config.emoji.xp} Duel`
const JSONURL			= "http://tinyurl.com/tjson?input=";
const dmPingChannel		= DEBUG ? config.debug.dmPing : config.chan.dmPing;
const _encodeDataURL	= (data) => { return JSONURL + encodeURIComponent(JSON.stringify(data)); }
///
/// Process the most recent duel in the specified channel
/// @channel: The channel in which the command was executed
/// @user: The user who executed the command
/// @message: Optionally, the message on which the menu command was run
///
async function _OLD_processDuel(channel, user, message)
{
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

	if (mechChan.isThread)
		await rpChan.send({embeds:[playerEmbed]})
	await resetDuelButton(rpChan)

	Mutex.unlock(mechChan);
	return {embeds:[playerEmbed]}
}

/// Handle a thrown error by logging it to the appropriate log channel
async function _handleErrorLog(args) {
	const {interaction, debugData, error} = args
	// Early out if this is just a cancel message - we don't need to log every cancellation
	if (error?.message?.includes(ERROR.CANCELLED)) return;
	// Add the duelData to the debug log embed
	if (!error.cause && debugData) error.cause = Log.DEBUGFIELDS(debugData, debugStr)
	// Log the error to the debug channel
	// Log.DEBUG(error)
	await Log.EMBED({interaction,channel:config.debug.duel,error,dataFields:error.cause})
}

/// Process the most recent duel in the specified channel in a try/catch harness
/// @interaction: The slash command interaction (where applicable)
/// @message: Optional: the message on which menu command was run.
async function processDuel(interaction, message) {
	/// Arguments will vary depending on the method of entry
	///		- User-Ended via slash command:	interaction (contains channel)
	///		- User-Ended via context menu :	interaction (contains channel & message)
	///		- Auto-ended via thread update: channel & message (interaction is null)
	const args			=	{ interaction, message }
	const channel		=	args.channel ?? interaction?.channel ?? message?.channel
	let ret 			=	null;
	let error	 		=	null;
	if (message) 			args.skipRP = true;
	try 		{ ret	=	await _closeDuelInternal(args) }
	catch(err) 	{ error =	err }

	if (error) {
		Log.DEBUG(Log.VAR(error))
		if (error.message.includes(ERROR.CANCELLED)) error.name = "Cancelled"
		const debugData = error.cause
		error.cause = debugData ? Log.DEBUGFIELDS(debugData, debugStr) : null
		_handleErrorLog({interaction, debugData, error})
		error.cause = debugData ? Log.DEBUGFIELDS(debugData, playerStr) : null
	}

	Mutex.unlock(channel, error);
	return ret;
}
async function _closeDuelInternal(args) {
	const interaction	=	args.interaction ?? null;
	const message		=	args.message ?? interaction?.message ?? null;
	const channel		=	args.channel ?? interaction?.channel ?? message?.channel;
	const autoClose		=	args.auto ?? false;
	const ephemeral		=	interaction?.ephemeral ?? false;
	const duelId		=	channel.id;
	const skipRP		=	(args.skipRP || DEBUG?.IGNORE_RP) ?? false
	const forceClose	=	null != message;// && !DEBUG;
	let progressStage	=	null;
	let rpChan			=	null;
	let mechChan		=	null;
	let duelData 		=	null;
	let rpData			=	null;
	let duelActive		=	false;
await Log.TRACE(interaction, duelData, STEP.CONFIRM_CHAN, DEBUG);	//[Auto] Confirm & lock channel
	{
		// Verify that the channel being used is a duel channel
		({rpChan, mechChan} = _verifyChannel(channel));
		// Mutex to prevent the same duel from being processed twice
		Mutex.lock(mechChan, Error(ERROR.PROCESSING_DUEL));
	}
await Log.TRACE(interaction, duelData, STEP.GET_ROLEPLAY, DEBUG);	//[Auto] Get RP data
	{
		// Get the raw RP data and throw an error if we don't have any
		if (rpChan) rpData = await MsgUtils.getRoleplayData(rpChan, message);
		// Ignore RP if we're debugging for it or forcing the closure
		if (!rpData && !forceClose && !skipRP) throw Error(ERROR.NO_RP_DATA);
	}
await Log.TRACE(interaction, duelData, STEP.EXTRACT_INIT, DEBUG);	//[Auto] Get/Parse Duel data
	{
		//Parse the duel for transcript data and participants or throw an error
		duelData = await _getDuelData(mechChan, message);
		if (!duelData) throw new Error(ERROR.NO_DUEL_DATA);

		//Check pinned messages and early exit if there's an active init
		const pins = await mechChan.messages.fetchPins()
		duelActive = (pins?.items?.some(pin => pin.message.id == duelData.message))
		//if (duelActive) throw new Error(ERROR.ACTIVE_DUEL);
	}
await Log.TRACE(interaction, duelData, STEP.FETCH_LEVELS, DEBUG);	//[Auto] Get levels for participants
	{
		//Fetch level data & exp cap from database and updates duelData
		duelData = await _fetchLevelData(duelData);
	}
await Log.TRACE(interaction, duelData, STEP.COLLATE_DATA, DEBUG);	//[Auto] Collate RP data into Duel data
	{
		//Consolidate the RP information into the Duel data
		duelData = _collateData(duelData, rpData);
	}
await Log.TRACE(interaction, duelData, STEP.CONFIRM_DATA, DEBUG);	//[Auto] Confirm participation
	{
		//Verify that all participants put in sufficient effort in their roleplay
		//Assembles errors/warnings and includes it into duelData
		duelData = _verifyParticipation(duelData, skipRP, forceClose);
	}
await Log.TRACE(interaction, duelData, STEP.TEAMS_GROUPS, DEBUG);	//[User] Group participants into teams
	{
		if (duelActive && duelData.players.length > 2)
			throw Error(ERROR.ACTIVE_DUEL, {cause:duelData})
		//Group the participants automatically / user input
		duelData = await _groupParticipants(duelData, interaction)
	}
await Log.TRACE(interaction, duelData, STEP.FIND_OUTCOME, DEBUG);
	{
		if (duelActive && !_autoDetectOutcome(duelData).valid)
			throw Error(ERROR.ACTIVE_DUEL, {cause:duelData})

		//Determine the outcome of the duel
		duelData = await _determineOutcome(duelData, interaction);
		if (null == duelData) {
			mechChan.send("``` ```")
			await resetDuelButton(rpChan)
			throw Error("Duel Aborted")
		}
	}
await Log.TRACE(interaction, duelData, STEP.CALC_WIN_EXP, DEBUG);
	{
		//Calculate the exp & Clean the data into the minimum necessary
		duelData = _calculateExp(duelData);
		duelData = _calculateGold(duelData)
	}
await Log.TRACE(interaction, duelData, STEP.CONFIRMATION, DEBUG);
	{
		if (duelActive) throw Error(ERROR.ACTIVE_DUEL, {cause:duelData})
		//Present the outcome to the players and await confirmation
		const confirm = await _awaitConfirmation(duelData, interaction);
	}
await Log.TRACE(interaction, duelData, STEP.DUEL_SUMMARY, DEBUG);
	{
		duelData = _cleanData(duelData);
		const transcript = _generateTranscriptFromData(duelData)
		if (transcript) {
			const transcriptMsg = ephemeral ? await interaction.followUp({embeds:[transcript[0]],ephemeral})
											: await mechChan.send({embeds:[transcript[0]]})
			for (let i=1; i < transcript.length; ++i) {
				if (ephemeral)	await interaction.followUp({embeds:[transcript[i]],ephemeral})
				else 			await mechChan.send({embeds:[transcript[i]]})
			}
			delete duelData.events
			duelData.urls.transcript = transcriptMsg.url
		}
		if (ephemeral) await interaction.followUp({content:"``` ```",ephemeral})
		else await mechChan.send("``` ```");
	}
await Log.TRACE(interaction, duelData, STEP.APPROVE_PEND, DEBUG);
	{
		if (DEBUGFILE) Log.FILE("./data/test/duelData.json", duelData)
		const dmEmbed = await _sendApprovalMessage(duelData, interaction);
		duelData.dmMsg = dmEmbed.url;
	}
await Log.TRACE(interaction, duelData, STEP.CLOSING_DUEL, DEBUG);
	{
		const playerEmbed = await _closeScene(duelData);
		if (mechChan.isThread && !interaction?.ephemeral) {
			await rpChan.send({embeds:[playerEmbed]})
			await resetDuelButton(rpChan)
		}
		await interaction?.editReply({content:"",embeds:[playerEmbed],components:[]})
		if (duelActive) {
			const embed = new EmbedBuilder().setTitle("Active Duel").setDescription(INSTRUCT.CLOSE_DUEL)
			await interaction.followUp({embeds:[embed]})
		}
		Mutex.unlock(mechChan);
		//return {embeds:[playerEmbed]}
	}

	return true;
}

/// Automatic data gathering & validation
const {_verifyChannel, _fetchLevelData, _collateData, _verifyParticipation} = {
	/// Verify that the channel being used is a duel channel
	/// @channel	- the channel the command is being run in
	/// Returns		- the pair of RP and Mech channels associated
	_verifyChannel(channel) {
		//Confirm that the command is being executed in a valid channel and mutex lock it
		const channelPair = ChanUtils.getDuelChannelPair(channel)
		if (!channelPair) throw new Error(ERROR.WRONG_CHANNEL)

		//Resolve the RP/Mech pair into actual channels
		const guild = channel.guild;
		const rpChan = guild.channels.resolve(channelPair.RP);
		const mechChan = guild.channels.resolve(channelPair.MECHANICS);

		if (!rpChan) throw new Error(ERROR.NO_RP_CHAN(channelPair.RP))
		if (!mechChan) throw new Error(ERROR.NO_MECH_CHAN(channelPair.MECHANICS));
		if (channelPair.RP == channel.id) throw new Error(ERROR.IN_RP_CHAN(channelPair.MECHANICS));

		return {rpChan, mechChan};
	},

	/// Fetch the levels from the database and set the exp Cap for each character we've found
	/// @duelData		- Extant data gathered from the initiative
	async _fetchLevelData(duelData) {
		await Utils.asyncArrayForEach(duelData.chars, async (c,i) => {
			//Prep a query and get the level data to identify the levels of the character
			const query = {name:c.char, user:c.user};
			const charData = await LevelUtils.getLevelData(query);
			//Use the charData to populate fields
			const xpCap = ExpUtils.getDuelExpCap(charData?.level || 0);
			duelData.chars[i].user = c?.user || charData?.user || null;
			duelData.chars[i].level = charData?.level || INVALID_LEVEL;
			duelData.chars[i].xpCap = (xpCap || 0);
		});
		return duelData;
	},

	/// Consolidate the RP, duel, and level data into the duel data
	/// @duelData		- Extant data gathered from the initiative
	/// @rpData			- Data gathered from RP
	_collateData(duelData, rpData) {
		const players = []
		duelData.chars.forEach( c => { if (c.user && !players.includes(c.user)) players.push(c.user) });
		//Process the RP data into something usable
		duelData.players = players.map( user => {
			const chars = duelData.chars.filter( c => c.user == user ).map( c => c.char );
			const {posts,length} = (rpData?.[user] || {posts:0,length:0})
			return {user, chars, rp:{posts,length}}
		})
		duelData.urls.roleplay = rpData?.start ?? duelData.urls.duel
		return duelData;
	},

	/// Verify that there are enough participants, and that all put effort into their roleplay
	/// @duelData		- Extant data gathered from the initiative
	/// @skipRP			- If RP can be skipped
	/// @forceClose		- If closing the duel is being forced without validation
	_verifyParticipation(duelData, skipRP = false, forceClose = false) {
		const errors = [];
		const uniqueUsers = [];
		const invalidChars = [];

		//Determine valid characters and log as error anything else.
		if (duelData.chars.length < 2) errors.push({reason: ERROR.KEY.CHAR_PARTICIPANTS})
		let validChars = duelData.chars.filter(c => {
			let error = null;
			//Confirm the character has a valid player associated with it
			if (!c.user) error = ERROR.KEY.NO_PLAYER
			//Confirm the character has been setup and has a valid level, else treat them as an NPC
			else if (c.level <= 0 || c.xpCap <= 0) error = ERROR.KEY.NO_LEVEL
			//Confirm the character has a valid max HP and was not a summon or companion
			else if (c.hpMax <= 0) error = ERROR.KEY.NO_HITPOINTS

			if (null !== error) errors.push({reason: error, user:c.user, char:c.char})
			else if (!uniqueUsers.includes(c.user)) uniqueUsers.push(c.user);
			return error ? false : true
		});
		//Determine valid players and log as error anything else.
		if (duelData.players.length < 2) errors.push({reason: ERROR.KEY.USER_PARTICIPANTS})
		let validUsers = duelData.players.filter(user => {
			let error = null
			//Verify that each player roleplayed enough
			let sufficientRP = (user.rp.length >= MIN_CHARS)&&(user.rp.posts >= MIN_POSTS)
			if (!skipRP && !forceClose && !sufficientRP) error = ERROR.KEY.NEED_MORE_RP
			//Verify that this user has valid characters
			user.chars = user.chars.filter(x => validChars.find(c => c.char == x))
			if (user.chars.length < 0) error = ERROR.KEY.NO_VALID_CHAR

			if (null !== error) errors.push({reason: error, user})
			return error ? false : true
		});
		//Determine if there were characters controlled by invalid users
		validChars = validChars.filter(c => {
			let error = null
			const user = validUsers.find(u => u.user == c.user)
			if (!user) error = ERROR.KEY.NO_VALID_USER
			if (null !== error) {
				//errors.push({char:c.char, user:c.user, reason: error})
				invalidChars.push(c)
			}
			return error ? false : true;
		});

		//Process the errors into something useful
		const groupedErrors = {}
		errors.forEach((error, i) => {
			const err = ERROR[error.reason];
			errors[i] = {name:err.name, value:err.value(error)}
			groupedErrors[error.reason] = [...(groupedErrors[error.reason] || []), err.value(error)]
			Log.WARNING(`${errors[i].name}: ${errors[i].value}`)
		});

		//Log.DEBUG({GroupedErrors:groupedErrors});

		duelData.chars = validChars;
		duelData.players = validUsers;
		duelData.errors = groupedErrors;

		//Ensure we have at least two unique characters and unique players
		const isValidDuel = ((validChars.length >= 2) && (validUsers.length >= 2) &&
							 (uniqueUsers.length >= 2) && (invalidChars.length == 0))
		if (!isValidDuel && !forceClose) {
			//Throw the error with the valid duel data and removed users/chars
			throw new Error(ERROR.PARTICIPATE, {cause:duelData})
		}
		return duelData;
	}
}

/// DUEL EVENT PARSER METHODS
const { _getDuelData, _parseInitiative, _parseDuel, _parseEventEmbed, _parseEventRound,
		_parseEventInitGroupAdd, _parseEventPlayer, _parseIrrelevantEvent } = {

	/// Get the duel data
	/// @mechChan		- the mechanics thread that contains the duel info
	/// @message		- the message for the context menu force
	async _getDuelData(mechChan, message=null) {
		let duel = null;
		if (message) {
			if (_parseInitiative(message))
				duel = await MsgUtils.findNextBreak(mechChan, message)
			else
				duel = await MsgUtils.findFenceposts(mechChan, message, 5000)
		}
		else {
			duel = await MsgUtils.findLastBreak(mechChan, 1000);
		}
		if (!duel) return null;

		var duelData = _parseDuel(duel.messages);
		if (duelData) {
			message = duel.messages[0];
			duelData.message = message.id;
			duelData.urls.duel = message.url;
			duelData.chars.forEach((c,i) => { duelData.chars[i] =
				{char:c.char, user:c.user, hpMax:(c.hpMax??0), hpCur:(c.hpCur??0), level:(c.level??INVALID_LEVEL)}
			})
		}

		return duelData;
	},

	/// Parse the initiative message to create duel data from it
	/// @message		- The initiative message to parse
	_parseInitiative(message) {
		const logDate = DateTime.now().toUnixInteger();
		const startDate = DateTime.fromJSDate(message.createdAt).toUnixInteger();
		const duelData = {
			type:"duel",
			matchup:null,
			rounds:0,
			channel:message.channel.id,
			message:null,
			startDate,
			logDate,
			chars:[],
			players:[],
			events:[],
			urls:{roleplay:"",duel:"",transcript:""}
		};
		//Test to see if the initiative message matches what we expect form an initiative post
		if (!INIT_REGEX.END_MATCH.test(message.content)) return null;

		//Get the duration (in rounds)
		if (!INIT_REGEX.ROUND_MATCH.test(message.content)) return null;
		duelData.rounds = _parseEventRound(message);

		const user = 0;
		const level = INVALID_LEVEL;
		//Parse for participants with hidden HP data
		const matches = [...message.content.matchAll(INIT_REGEX.CHAR_MATCH)];
		matches.forEach(match=>{
			const init	= match[1] ?? 0;
			const char	= match[2].replace(/\"/g,'');
			const hpCur = parseInt(match[3]) || 0;
			const hpMax = parseInt(match[4]) || 0;
			const condition = match[5] ?? null;
			duelData.chars.push({ char, init, hpCur, hpMax, user, level });
		});
	
		return duelData;
	},

	/// Parse all provided messages for duel events
	/// @messages		- Data gathered from duel
	_parseDuel(messages) {
		//Start with the Initiative - if we don't have an init header message, no duel
		var duelData = _parseInitiative(messages[0]);
		if (!duelData) return null;

		let round = '0';
		duelData.events = [];
		//Parse each message for relevant data
		for (const message of messages) {
			//We only care about Avrae messages, skip everything else
			if (message.author.id != config.bots.avrae) continue;

			let actor = null;
			let targets = [];
			const event = {round:round, msg:message.url};

			//If it's an embed, it's an Avrae response to an action. Save it.
			if ((message.embeds.length > 0)&&(message.embeds[0].title)) {
				_parseEventEmbed(duelData, event, message.embeds[0])
			}
			//If it's not an embed, try to see if it's a Next Turn message
			else if (message.content) {
				round	 = _parseEventRound(message) || round;
				duelData = _parseEventInitGroupAdd(duelData, message);
				duelData = _parseEventPlayer(duelData, message);
				//Save everything else as an event (no result)
				event.event = message.content;
			}
			else {	//No embed and no content... not sure what this is
				event.event = "*Unknown event*";
				continue
			}

			//Skip known irrelevant messages & massage the data a little
			if (_parseIrrelevantEvent(event.event)) continue;
			//const AddInitRegex = /with initiative 1d20 .*/i;
			event.event = event.event.replace(INIT_REGEX.INIT_MATCH, "...");

			duelData.events.push(event);
			if (event.event == "Combat ended.") break;
		};
		return duelData;
	},

	/// Parse an Avrae embed for event transcript data
	/// @duelData		- current duel data for back-referencing characters
	/// @event			- the existing event data
	/// @embed			- the embed
	_parseEventEmbed(duelData, event, embed) {
		const result = embed?.footer?.text.replaceAll('\n',' | ');
		event.event = embed?.title;
		if (result) event.result = result;

		// Special case hack to force teams into a specific configuration
		if (embed?.title == "Teams") {
			duelData.teams = embed?.fields?.map(field => field.value.split("\n")
											.map(user => user.replaceAll(/\D/g,"")));
			return duelData;
		}
	
		// Check for actors in the event title
		const actor = duelData.chars.find(c => embed?.title?.includes(c.char)) ||
					  duelData.chars.find(c => embed?.description?.includes(c.char));
	
		// Check for targets in the fields and use to track aggressors for later grouping
		targets = []
		embed?.fields?.forEach(field => {
			const char = duelData.chars.find(c => field?.name == c.char);
			if (char)
			{
				let act = {mod:0,type:null}
				if (field?.value?.includes("Healing")){ act = {mod:1,type:"HEAL"} } //Healing = Ally
				else
				{
					Object.entries(EVENT_REGEX).some(([key, value]) => {
						if (value.test(field?.value)) {
							act = {mod:-1,type:key}
							return true
						}
					});
				}
				// - Non-Save Effect Could be buff or something like Sleep, don't track it
	
				//Don't add this to events where the actor targets themselves
				if (act.mod && act.type && char && char.char && actor &&
					char.char != actor.name && char.user != actor.user)
					targets.push({name:char.char, user:char.user, ...act});
			}
		});
	
		//Only add actor/targets to event if we have both, otherwise they're useless on their own
		if (actor && targets.length > 0)
		{
			event.actor = {name:actor.name,user:actor.user}
			event.targets = targets;
		}
	},

	/// Check for the round from the current message and return it
	/// @message		- the message containing the content to parse
	_parseEventRound(message) {
		if (!INIT_REGEX.ROUND_MATCH.test(message.content)) return null;
		return message.content.match(INIT_REGEX.ROUND_MATCH)[1];
	},

	/// Check for commands adding PCs/NPCs to init or groups to help track the players
	/// @duelData		- current duel data for back-referencing characters
	/// @message		- the message containing the content to parse
	_parseEventInitGroupAdd(duelData, message) {
		INIT_REGEX.ADD_MATCH.lastIndex = 0;
		let addMatch = [...message.content.matchAll(INIT_REGEX.ADD_MATCH)];
		if (addMatch.length > 0)
		{
			//We have a match, extract the data
			const name	= addMatch[0][1].replace(/\"/g,'').trim();
			const init	= parseInt((addMatch[0][2] || addMatch[0][3] || "0")?.trim());
			const group = addMatch[0][4]?.trim();

			const char = {char:name, user:0}
			if (group) char.group = group

			const cIdx = duelData.chars.findIndex(c => c.char == name)
			if (cIdx >= 0) {
				if (group) duelData.chars[cIdx].group = group;
				else delete duelData.chars[cIdx].group;
			}
			else duelData.chars.push(char)
		}

		return duelData
	},

	/// Map player ID to characters by name or group
	/// @duelData		- current duel data for back-referencing characters
	/// @message		- the message containing the content to parse
	_parseEventPlayer(duelData, message) {
		//Reset the regex & Parse the message
		INIT_REGEX.PING_MATCH.lastIndex = 0;
		match = [...message.content.matchAll(INIT_REGEX.PING_MATCH)];
		if (match.length > 0) {
			const init	= parseInt(match[0][2].trim());
			const round	= match[0][3].trim();
			const name	= match[0][4].replace(/\"/g,'').trim();
			const id	= match[0][5].trim();

			// See if we have a character by this name in init with no user and set it
			let cIdx = duelData.chars.findIndex(c => (c.char == name||c.group == name) &&
													 (c.user == 0 || c.user == id));
			if (cIdx < 0) duelData.chars.push({char:name,user:id});
			duelData.chars.forEach((c,cIdx) => {
				if ((c.char == name || c.group == name) && (c.user == 0 || c.user == id))
					duelData.chars[cIdx].user = id;
			});
		}

		return duelData
	},

	/// Parse an event to determine if it's irrelevant
	/// @event			- the event string to check
	_parseIrrelevantEvent(event) {
		const IsIrrelevant = INIT_REGEX.IRRELEVANT.some((element) => event.includes(element));
		return  (INIT_REGEX.ROUND_MATCH.test(event)) || IsIrrelevant ||
				(event.includes("removed from all groups"))||
				(event.includes("needs help with"))||
				(event.includes("Level Summary for"))||
				(event.includes("takes a Long Rest!"))||
				(event.includes("Current initiative"))||
				(event.includes("Cannot cast spell!"))||
				(event.includes("removed from all groups"))||
				(event.includes("Everyone roll for initiative"))||
				(event.includes("Selection timed out or was cancelled."))
	}
}

/// PARTICIPANT GROUP METHODS
const { _resetTeams, _aggregateTeams, _getTeamsEmbed, _getTeamsComponents,
		_groupParticipants, _editParticipantGroups } = {
	/// Automatically group the user participants in the duel into teams
	/// Uses event log to determine a mutual aggression score
	/// @duelData		- Extant data parsed and consolidated
	_resetTeams(duelData) {
		// Reset to 1(v1)*
		duelData.teams = duelData.players.map(x => ([x.user]))
		// Remove any warning that the grouping was manually edited
		delete duelData.errors?.MANUAL_GROUP
		return duelData;
	},

	/// Populate the teams data from a list of users into the characters and total xpCap
	/// @duelData		- Extant data parsed and consolidated
	_aggregateTeams(duelData) {
		//At this stage the teams are just a list of players.
		//Aggregate the team data from multiple sources: user list, total HP, and total XP cap
		let groupId = 0;
		duelData.teams = duelData.teams.map((users,i) => {
			users = users.users ?? users
			//Find all characters of this user sorted by level
			const chars = duelData.chars.filter(x => users.includes(x.user));
			if (chars.length > 1) duelData.errors.USER_GROUP = ERROR.USER_GROUP.value
			chars.sort((a,b) => b.level - a.level);
			const names = chars.map(x => x.char)
			//Determine the team name - the highest level character of the user, or "Group X"
			const team = ((users.length == 1 && chars.length == 1) ? chars[0].char : null) ?? `Group ${++groupId}`
			//Total up all of the HP and XP Cap for this group from all characters in it
			const totalHP = chars.reduce((total,char) => total + Math.max(0, char.hpCur || 0),0);
			const xpCap = chars.reduce((total,char) => total + char.xpCap, 0);
			const win = chars.reduce((w, c) => c.win && w, true);
			//Push this into the teams array
			return {team, users, chars:names, totalHP, xpCap, win};
		})
		.filter(t => t.users.length > 0 && t.chars.length > 0 && t.xpCap > 0)
		duelData.teams.sort((a,b) => b.totalHP - a.totalHP)

		duelData.chars.map(c => c.team = duelData.teams.findIndex(t => t.users.includes(c.user)));
		const sortKeys = {team:SortOrder.ASC,level:SortOrder.DESC,hp:SortOrder.DESC}
		duelData.chars.sort((a,b) => Utils.priorityCompare(a, b, sortKeys))

		return duelData;
	},

	/// Generate an embed to get team confirmation
	/// @duelData		- Extant data parsed and consolidated
	/// @debug			- optional param to show debug JSON data as part of the embed
	_getTeamsEmbed(duelData, debug = null) {
		const {d20}		= config.emoji
		const fields	= duelData.teams.map(t => {
			const chars = duelData.chars.filter(c => t.users.includes(c.user))
			const list	= ` [${chars.map(c => `\`${c.char}\``).join(' | ')}]`
			const name	= `${d20} ${t.team} ${(chars.length > 1 ? list : ``)}`
			const value	= `${_teamToString(t, duelData)}`
			return {name, value}
		});
		if (debug) fields.push({name:"debug",value:`\`\`\`json\n${debug}\n\`\`\``})

		// Create and post the Embed
		const matchup = duelData.teams.map(t => t.chars.length).join(' v ');
		const title = `Confirm Teams: ${matchup}`
		const footer = INSTRUCT.CONFIRM_TEAM_FOOTER
		const embed = new EmbedBuilder().setTitle(title).setDescription(INSTRUCT.CONFIRM_TEAM)
										.setThumbnail(THUMB.DUEL).setFields(fields).setFooter({text:footer})
		return embed
	},

	/// Get the components for editing the teams
	/// @duelData		- Extant data parsed and consolidated
	/// @editTarget		- Status reflecting the currentgiven step fo the edit process
	_getTeamsComponents(duelData, editTarget = null) {
		//Create button row
		const {yes, no, edit, undo} = config.emoji;
		const buttonRow = Prompt.createButtonRow([
			{style:ButtonStyle.Success, emoji:yes, label:"Accept", custom_id:"accept"},
			{style:ButtonStyle.Secondary, emoji:no, label:"Cancel", custom_id:"cancel"},
			{style:ButtonStyle.Secondary, emoji:edit, label:"Edit", custom_id:"edit"},
			{style:ButtonStyle.Primary, emoji:undo, label:"Reset", custom_id:"reset"}
		])
		const components = [buttonRow];

		//Create a select dropdown of each character showing their current team
		const charOpts = duelData.chars.map(c => {
			const team	= duelData.teams[c.team]?.chars ?? ``
			const desc	= "Team: " + (team.length > 1 ? team?.join(' | ') : `solo`);
			//Omit any characters if they are the only one on their team and moving them would leave only one team
			const users = duelData.teams[c.team]?.users ?? []
			const valid = users.length > 1 || duelData.teams.length > 2
			return valid ? Prompt.createSelectOption(c.char, desc, c.char) : null
		}).filter(x => x);
		const charSelect = Prompt.createSelectRow("char", charOpts, null, null, "Select character to move");

		//Create a select dropdown of destination teams and the embed fields
		const teamOpts = duelData.teams.map(t => {
			const chars = duelData.chars.filter(c => t.users.includes(c.user))
			const {team} = t
			const teamDesc	= _teamToOption(chars)
			return Prompt.createSelectOption(team, teamDesc, team);
		});

		//Add a "solo" option if the player isn't already solo
		if (editTarget?.char) {
			const char = duelData.chars.find(c => c.char == editTarget.char)
			const team = duelData.chars.filter(c => c.team == char.team)
			if (team.length > 1) teamOpts.unshift(Prompt.createSelectOption("Solo", char.char, char.char))
		}
		const teamSelect = (editTarget?.char) ? Prompt.createSelectRow("team", teamOpts, null, null, "Select destination team") : null

		if (editTarget) components.push( editTarget.char ? teamSelect : charSelect )
		return components;
	},

	/// Group participants according to event aggregation
	/// @duelData		- Extant data gathered from the initiative
	/// @interaction	- The user command interaction for interactive editing
	/// @forceEdit		- If user is manually entering group edit mode
	async _groupParticipants(duelData, interaction, forceEdit = null) {
		//Default behavior: Every participant for themselves 1(v1)*
		if (!duelData.teams) duelData = _resetTeams(duelData)
		duelData = _aggregateTeams(duelData)
		if (duelData.players.length > 2) {
			try { duelData = await _editParticipantGroups(duelData, interaction, forceEdit) }
			catch (e) { throw e }
		}
		return duelData;
	},

	/// Interactively edit the participant groups
	/// @duelData		- Extant data gathered from the initiative
	/// @interaction	- The user command interaction for interactive editing
	/// @forceEdit		- If user is manually entering group edit mode
	async _editParticipantGroups(duelData, interaction, forceEdit = null) {
		const cancelled = `${ERROR.CANCELLED}\n${INSTRUCT.SETUP}\n${INSTRUCT.CONTACT}`;
		let edit = forceEdit ? { char:false } : null;
		let response = null;

		//Continue as long as there are edits to be done
		let approved = false
		while (!approved) {
			// Get the embed and components
			const embed = _getTeamsEmbed(duelData, response)
			const components = _getTeamsComponents(duelData, edit)
			const prompt = await interaction.editReply({embeds:[embed],components})

			// Prompt the user and wait for reply
			response = await Prompt.collectComponents(prompt)
			const input = response.values ? response.values[0] : null
			response = null

			// Handle the response
			if (input == "accept" || !input) approved = true
			else if (input == "cancel") throw Error(cancelled, {cause:duelData})
			else if (input == "edit") edit = edit ? null : { char: false }
			else if (input == "reset") {
				duelData = _resetTeams(duelData)
				duelData.chars.map(c => delete c.win)
				duelData = _aggregateTeams(duelData)
				edit = null
			}
			else if (edit && edit.char) {
				edit.team = input
				edit.char = duelData.chars.find(c => c.char == edit.char)
				edit.user = edit.char.user
				edit.oldTeam = duelData.teams.findIndex(t => t.users.includes(edit.user))
				edit.newTeam = duelData.teams.findIndex(t => t.team == edit.team)

				duelData.teams = duelData.teams.map(t => t.users)
				duelData.teams[edit.oldTeam] = duelData.teams[edit.oldTeam].filter(u => u != edit.user)
				if (edit.newTeam < 0) duelData.teams.push([edit.user])
				else duelData.teams[edit.newTeam].push(edit.user)

				duelData.errors.MANUAL_GROUP = ERROR.MANUAL_GROUP.value
				Log.WARNING(`${ERROR.MANUAL_GROUP.name}: ${ERROR.MANUAL_GROUP.value}`)
				duelData.chars.map(c => delete c.win)
				duelData = _aggregateTeams(duelData)
				edit = null
			}
			else if (edit) edit.char = input
		}

		await interaction.editReply({components:[]})
		return duelData
	}
}


/// Determine the outcome of a duel
/// @duelData		- Extant data gathered from the initiative
/// @interaction	- Original interaction, needed for player input
function _autoDetectOutcome(duelData) {
	//Determine victors (teams with HP left) and defeats (those with no HP remaining)
	const hasWinners = duelData.teams.filter(x => x.win).length > 0
	let victors  = duelData.teams.filter(x => hasWinners ?  x.win : x.totalHP >  0)
	let defeats	 = duelData.teams.filter(x => hasWinners ? !x.win : x.totalHP <= 0)
	//Determine the total cap of all defeats teams
	let totalCap = defeats.reduce((total,team) => total + team.xpCap, 0)

	const outcome = {victors, defeats, totalCap}
	outcome.valid = (defeats.length > 0 && totalCap > 0)

	return outcome
}

async function _determineOutcome(duelData, interaction, edit = false, forceSelect = false) {
	let {victors, defeats, totalCap, valid} = _autoDetectOutcome(duelData)
	const {chars,players,teams} = duelData
	const debugData = {chars,players,teams}

	// Ideal case: clearly defined victors/defeats - One (or more) victors and one (or more) defeats
	// Deviant case: All defeats, no victors - Draw, each earning the minimum (25%) amount
	// Deviant case: No defeats teams means no totalCap exp pool to award
	//	- Duel ended early / player bailed (no one should get any award)
	//	- Player fuckup and healed before ending duel (select winner/loser teams)
	////if (defeats.length == 0 || totalCap == 0 || forceSelect)
	if (!valid || forceSelect) {
		delete duelData.errors.INVALID_OUTCOME
		if (!valid) duelData.errors.INVALID_OUTCOME = ERROR.INVALID_OUTCOME.invalid

		victors = (victors.length > 0) ? victors?.map(t => t.team) : [];
		outcome = await _promptWinners(duelData, interaction, victors, edit, forceSelect)

		if (!outcome || "cancel" == outcome)
			throw Error(`${ERROR.CANCELLED}\n${CONTACT}`, {cause:debugData})
		else if ("abort" == outcome) return null;
		else if ("default" == outcome) outcome = victors

		victors = duelData.teams.filter(t => outcome.includes(t.team));
		defeats = duelData.teams.filter(t => !outcome.includes(t.team));

		if (defeats.length > 0) duelData.errors.INVALID_OUTCOME = ERROR.INVALID_OUTCOME.manual
	}
	outcome = {victors, defeats};

	const v = victors.map(x => x.users).flat()
	duelData.chars.forEach(c => c.win = v.includes(c.user) ? 1 : 0)

	duelData.outcome = outcome;
	return duelData;
}

/// Prompt the user for a winner via select box
/// @duelData		- Extant data gathered from the initiative
/// @interaction	- Original interaction, needed for player input
async function _promptWinners(duelData, interaction, victors = [], edit = false, forceSelect = false) {
	//Generate the prompt fields & options
	const opts		= [];
	const fields	= [];
	const users		= duelData.players.map(x => x.user)
	const content	= users.map(x => `<${PING_PREFIX}${x}>`).join(" ");
	const {trophy,skull,scale,play,no}	= config.emoji
	duelData.teams.forEach(t => {
		const victor = victors.includes(t.team)
		const icon = victors ? (victor ? trophy : skull) : ``
		const type = victors ? `-# *\`Default:\`* \`${icon}\`` : ``
		const list = t.chars.length > 1 ? ` [${t.chars.map(c => `\`${c}\``).join('|')}]` : ``
		const name = `${t.team} ${list}`
		const value = `${_teamToString(t, duelData)}\n${type}`
		fields.push({name, value})

		const charList = duelData.chars.filter(c => t.users.includes(c.user))
		const optName = `${icon} ${t.team}`
		const optDesc = _teamToOption(charList)
		opts.push(Prompt.createSelectOption(optName, optDesc, t.team));
	});
	fields.push(..._errorsToFields(duelData.errors,true))

	//Create the embed
	const embeds = new EmbedBuilder().setTitle("Select the Winner...").setThumbnail(DUELTHUMB).addFields(fields)
									 .setDescription(forceSelect ? INSTRUCT.SELECTWIN : ERROR.NO_OUTCOME)
	//Create button components
	const buttons = []
	if (victors.length > 0) buttons.push({style:ButtonStyle.Primary, emoji:play, label:"Default", custom_id:"default"})
	if (edit || forceSelect) buttons.push({style:ButtonStyle.Secondary, emoji:scale, label:"Draw", custom_id:"draw"})
	buttons.push({style:ButtonStyle.Secondary, emoji:no, label:"Cancel", custom_id:"cancel"})
	const modDM = interaction?.member && Utils.hasAnyRole(interaction.member, dmRoles);
	if (modDM) buttons.push({style:ButtonStyle.Danger, emoji:no, label:"Abort", custom_id:"abort"})

	//Create select components
	const components = []
	if (opts.length)
		components.push(Prompt.createSelectRow(customId="winners", opts, 1, opts.length-1, "Select winner..."))
	components.push(Prompt.createButtonRow(buttons))

	//Present to the user and await the response
	const {ephemeral} = interaction
	const prompt = await interaction.editReply({content,embeds:[embeds],components,ephemeral});
	if (DEBUG?.USEREMBED) await interaction.channel.send({embeds:[embeds]})
	const promptArgs = {users, returnFirst:true,
						failOptions:["default","cancel","abort"]}
	let   result = await Prompt.collectComponents(prompt, promptArgs);

	//Response received (or time ran out) - remove the components and return the result
	await interaction.editReply({components:[]})
	if (!result?.values) result.values = victors
	else if (result.fail) result.values = result.values[0];

	return result.values;
}







///
/// Calculate the exp split between the two players based on the loser's level
///
function calculateExp(duelData)
{
	const winuid  = duelData.outcome.winner.uid;
	const winName = duelData.outcome.winner.char;	//players[winuid].char;
	const winner  = duelData.characters[winName];
	const winCap  = ExpUtils.getDuelExpCap(winner.level);

	const losuid  = duelData.outcome.loser.uid;
	const lossName= duelData.outcome.loser.char;	//players[losuid].char;
	const loser   = duelData.characters[lossName];
	const lossCap = ExpUtils.getDuelExpCap(loser.level);

	const exp = ExpUtils.getDuelExp(loser.level);

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
		.setThumbnail(THUMB.DUEL)
		.addFields([
			{name: `👑 Win: ${winner.char} (Level ${winner.level})`, value:win},
			{name: `💀 Loss: ${loser.char} (Level ${loser.level})`, value:loss},
			{name: "Start Links", value:`[Roleplay](${rpLink})\n[Duel](${duelLink})`, inline: true},
			{name: "Transcript", value: transcript, inline: true},
			{name: "Data",value:"[Data]("+(JSONURL+encoded)+")",inline: true}
		])
		.setFooter({text:`Logged at (server time): ${fullDate}\n✅ Approve | ❌ Reject (no exp)\n👑 Winner exp only | ⏸️ 50% to each | 💀 Loser exp only`});

	const dmChan = guild.channels.resolve(dmPingChannel);
	dmEmbed = await dmChan.send({content:`<@&${config.role.Helper}>`,embeds:[dmEmbed]})
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
		.setDescription(`***Please wait** for a [@Helper](${duelData.link}) to verify this before you add your exp.\nIf anything looks incorrect, please notify a <@&${config.role.Helper}> immediately*`)
		.addFields([
			{name:`👑 Win: ${duelData.winner.char} (Level ${duelData.winner.level})`, value:win},
			{name:`💀 Loss: ${duelData.loser.char} (Level ${duelData.loser.level})`, value:loss},
			{name:`Awards`, value:`Awards will be posted in <#${config.chan.xpLog}> once the duel has been reviewed by the DM staff.`}			
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
		const exp = ExpUtils.getDuelExpCap(duelData.loser.level)
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
	const winner = await ExpUtils.updateDailyExp(duelData.winner, cmd, date);
	const loser  = await ExpUtils.updateDailyExp(duelData.loser, cmd, date);	
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

	var pingChan = message.guild.channels.resolve(config.chan.xpLog);
	if (DEBUG) pingChan = message.channel;

	const pings = `<@${duelData.winner.uid}> <@${duelData.loser.uid}> - _Log in <#${config.chan.xpSpam}>_`
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

/// Reset the duel button and break in the specified rp channel
/// @rpChan			- The channel to add the duel button into
async function resetDuelButton(rpChan) {
	let button = Prompt.createButtonRow([
		{style:ButtonStyle.Secondary, emoji:config.emoji.duel, label:"Start New Duel", custom_id:"duel.startDuel"}
	])
	button = [button]
	await rpChan.send({content:"``` ```",components:button});
}













const charStrFormat = { team:true, user:true, xp:true, gp:true, hp:true,
						defeat:true, calc:false, string:true, data:false, shownull:true }
const playerStr = { ...charStrFormat, xp:false, gp:false, shownull:false }
const debugStr = { ...charStrFormat, shownull:false }
/// DATA TYPE STRING CONVERSION METHODS
const {	_teamToString, _teamToOption, _charTeamString, _defeatedCharList, _charOutcomeString,
_charToString, _charToStringElements, _charExpDetails, _charGoldDetails } = {
	/// Convert team data into a human-readable output format
	_teamToString(t, data, includeList) {
		const team = []
		const args = {team:false, xp:false, gp:false}
		//Find all characters of this group
		const users = t.users.map(u => {
			let chars = data.chars.filter(c => c.user == u);
			let names = chars.map(c => `\`${c.char}\``)
			team.push(...names)
			return chars.map(c => `${_charToString(c,chars,args)}`).join('\n');
		})
		const teamStr	= (includeList && team.length > 1) ? `\n-# ${team.join("|")}\n` : ``
		const value		= `${teamStr}${users.join('\n')}`.trim()
		return value
	},
	/// Generate an option description string from a given team data
	_teamToOption(charList) {
		const full = charList.length <= 3;
		charList.sort((a,b) => {
			return (a.hpCur == b.hpCur) ? b.level - a.level : b.hpCur - a.hpCur
		})
		charList = charList.map( c => {
			const level = full ? `Level ` : ``
			const hitpoints = full ? ` <${c.hpCur}/${c.hpMax} HP>` : ``
			return `${c.char} (${level}${c.level})${hitpoints}`
		}).join(" | ");
		return charList
	},

	/// Convert user data into a human-readable output format
	_charToString(char, charList, args = charStrFormat) {
		args = {...charStrFormat, ...args}
		let {type, team, xp, gp, hp, defeat, xpcalc, gpcalc, data} = _charToStringElements(char, charList, args)
		type	= (type) ? `**${type}**` : ``
		user	= (args.user) ? `${args.string ? '-# - ' : ''}<@${char.user}>` : ``
		data	= (args.data && data) ? ` | [[\`Data\`](${data})]` : ``
		hp		= (args.hp) ? ` | HP: ${hp}` : ``
		gp		= (args.gp && gp/* !== null */) ? `\n- ${config.emoji.gp} ${gp}` : ``
		xp		= (args.xp && xp) ? `\n- ${config.emoji.xp} ${xp}` : ``
		team	= (args.team && team) ? `\n-# *Team:* ${team}` : ``
		xpcalc	= (args.calc && xpcalc) ? xpcalc : ``
		gpcalc	= (args.calc && gpcalc) ? gpcalc : ``
		defeat	= (args.defeat && defeat) ? `\n-# \t*Defeated:* ${defeat}` : ``
		const name	= `${type}\`${char.char}\` (Level \`${char.level}\`)`
		const value = `${user}${hp}${data}${team}${defeat}${xp}${xpcalc}${gp}${gpcalc}`
		return args.string ? `${name}\n${value}` : { name, value }
	},
	_charToStringElements(char, charList, args) {
		const type	= _charOutcomeString(char)
		const team	= _charTeamString(char, charList)
		const xpAmt = char.xpSet ?? char.xpMod ?? char.xpAmt ?? null
		const gpAmt = char.gpSet ?? char.gpMod ?? char.gpAmt ?? null
		const xpCum = char.xpCum ? `\`Cap\`: ||${char.xpCum} / ${char.xpCap}||` : `of \`${char.xpCap ?? '??'}\` cap`
		const xp	= (xpAmt === null) ? (args.shownull ? `\`No xp data\`` : ``) : `\`${xpAmt}\`xp [${xpCum}]`
		const hp	= `<\`${char.hpCur}\`/\`${char.hpMax}\`>`
		const gp	= (gpAmt/* !== null*/) ? `\`${gpAmt}\`gp` : null
		const defeat = _defeatedCharList(char, charList)
		const xpcalc = _charExpDetails(char)
		const gpcalc = (gpAmt === null) ? null : _charGoldDetails(char)
		const {xpData, xpCap, gpData, ...encode} = char
		const data  = _encodeDataURL(encode)
		return {type, team, xp, gp, hp, defeat, data, xpcalc, gpcalc}
	},
	_charOutcomeString(char) {
		const {trophy, skull, scale} = config.emoji;
		const xpAmt = char.xpSet ?? char.xpAmt ?? null
		const types = { 0: `${skull} Defeat: `, 1: `${trophy} Victor: ` }
		const noWin	= !char.hasOwnProperty('win') || !char.hasOwnProperty('xpAmt')
		const type	= noWin ? null : types[char.win]
		return type;
	},
	_charTeamString(char, charList) {
		let result = null;
		if (char.hasOwnProperty("team")) {
			const team	= charList?.filter(t => t.team == char.team)?.map(c => `\`${c.char}\``) ?? []
			if (team?.length > 1) result = team.join("|")
		}
		return result
	},
	_charExpDetails(char) {
		if (!char?.xpData) return null
		let { capTotal, totalPool, poolPct, xpMult, unCapExp, partial } = char.xpData
		type = partial ? "partial victory" : (char.win ? "victor" : "defeat")
		xpMult = Utils.precise(100 * xpMult,1)
		poolPct = Utils.precise(100 * poolPct,1)
		unCapExp = Math.round(unCapExp)
		capExp = (unCapExp>char.xpAmt) ? ` => Capped: \`${char.xpAmt}\`` : ``
		xpSet = char.hasOwnProperty("xpSet") ? `\n-# -\t• \`Manual Override\`: \`${char.xpSet}\`` : ``
		const summary = `
			-# - \`${char.xpCap}\` (*xp Cap*) / \`${capTotal}\` (*team cap*) = \`${poolPct}%\` (*pool %*)
			-# - \`${totalPool}\` (*exp pool*) * \`${xpMult}%\` (*${type}*) * \`${poolPct}%\` (*pool %*) = \`${unCapExp}\`${capExp}xp${xpSet}`
		return summary
	},
	_charGoldDetails(char) {
		if (!char?.gpData || !char?.xpData) return null
		let { cap, capTotal, totalPurse, poolPct, uncapGold } = char.gpData
		let { partial } = char.xpData
		type = char.xpData.partial ? "partial victory" : (char.win ? "victor" : "defeat")
		gpSet = char.hasOwnProperty("gpSet") ? `\n-# -\t• \`Manual Override\`: \`${char.gpSet}\`` : ``
		gpMult = partial ? PARTIAL_XP : (char.win ? VICTOR_XP : DEFEAT_XP)
		gpMult = Utils.precise(100 * gpMult,1)
		poolPct = Utils.precise(100 * poolPct,1)
		upcapGold = Math.round(uncapGold)
		capGold = (uncapGold>char.gpAmt) ? ` => Capped: \`${char.gpAmt}\`` : ``
		const summary = `
			-# - \`${cap}\` (*gp Cap*) / \`${capTotal}\` (*team cap*) = \`${poolPct}%\` (*pool %*)
			-# - \`${totalPurse}\` (*purse*) * \`${gpMult}%\` (*${type}*) * \`${poolPct}%\` (*pool %*) = \`${uncapGold}\`${capGold}gp${gpSet}`
		return summary
	},
	_defeatedCharList(char, charList) {
		let result = null;
		charList = charList.filter(c => (c.hpCur == 0 && c.hpMax > 0))
		if (char.win) charList = charList.filter(c => c.team != char.team);
		else charList = charList.filter(c => c.win)
		if (charList.length > 0) result = charList.map(c => `\`${c.char}\``).join('|')
		return result
	}
}

/// LOG WRAPPERS AND DEBUGGING
const {_errorsToFields, _errorToString, DebugFn, DEBUGFIELDS, DEBUGTHROW} = {
	_errorsToFields(errors, verbose = false) {
		const fields = Object.keys(errors).map( k => {
			const msg = (verbose ? (ERROR[k]?.msg || ``) : ``)
			const name = `${config.emoji.warn} Warning: ${ERROR[k].name}`
			const value = `${msg}\n${_errorToString(errors[k])}`.trim()
			return {name,value}
		}).filter(e => e)
		return fields
	},
	_errorToString(error) {
		if (Array.isArray(error)) error = error.map(e => `-# - ${e}`).join("\n")
		else error = `-# - ${error}`
		return error
	},
	DebugFn(args=debugStr) {
		return {
			players: (players) => {
				players = players.map(u => `- <@${u.user}>: ${u.chars.map(c=>`\`${c}\``).join(',')}`).join('\n')
				if (players.length > 0) return {name:`${config.emoji.blueok} Players`,value:players}
			},
			chars: (chars) => {
				chars = chars.map(c => _charToString(c, chars, args)).join('\n')
				if (chars.length > 0) return {name:`${config.emoji.blueok} Characters`,value:chars}
			},
			errors: (errors) => { return _errorsToFields(errors) }
		}
	},
	DEBUGFIELDS(data,args) {
		if (!data) Log.ERROR(Error().stack)
		const {events, ...debugData} = data;
		return Log.DEBUGFIELDS(data, DebugFn(args));
	},
	DEBUGTHROW(data) {
		if (!data) Log.ERROR(Error().stack)
		const {events, ...debugData} = data;
		Log.DEBUGTHROW(debugData, DebugFn())
	}
}

module.exports = {
	processDuel,
	approveDuel,
	undoApproval,
	resetDuelButton,
	generateTranscript,
	generateTranscriptFromLog
}