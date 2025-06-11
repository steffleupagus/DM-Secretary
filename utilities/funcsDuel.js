const { ActionRowBuilder, EmbedBuilder, ButtonStyle, MessageMentions, TextInputStyle } = require('discord.js')
const { DateTime } = require("luxon");
const { SortOrder } = require(`./enums.js`)

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`)
const Utils = require(`./utilFuncs.js`)
const Prompt = require(`./promptUtils.js`)
const MsgUtils = require(`./messageUtils.js`)
const ChanUtils = require(`./channelUtils.js`)
const LevelUtils = require(`./levelUtils.js`)
const Embed = require(`./EmbedPaginator.js`)
const ExpUtils = require(`./expUtils.js`)
const Mutex = require(`./mutexUtils.js`)
const Log = require(`./loggerUtils.js`)

const MIN_CHARS = 750;
const MIN_POSTS = 3;
const VICTOR_XP = 0.75;
const PARTIAL_XP = 0.5;
const DEFEAT_XP = 0.25;
const INVALID_LEVEL = 0;	//-1;
const DUELTITLE = `${config.emoji.duel} Duel Complete`;
const DUELTHUMB = "https://i.imgur.com/2U90DwW.png";
const JSONURL = "http://tinyurl.com/tjson?input="
const PING_PREFIX = config.DEV ? "-" : "@";
const dmPingChannel = config.DEV ? config.debug.dmPing : config.chan.dmPing;
const xpLogChannel = config.DEV ? config.debug.xpLog : config.chan.xpLog;
const dmRoles = [config.role.DM, config.role.DMOnDuty, config.role.Moderator, config.role.Builder];

const BR = `\n\`${' '.repeat(69)}\``
const DM_PING = `<${PING_PREFIX}&${config.role.DMOnDuty}>`
const CONTACT = `*If you need help, contact ${DM_PING} for assistance.*\n${BR}\n`

/// Execution Stages & grouped variables
const STEP = {
	CONFIRM_CHAN: "Verifying channels & threads.",
	GET_ROLEPLAY: "Gathering RP posts and compiling roleplay data.",
	EXTRACT_INIT: "Parsing duel events and compiling character data & transcript.",
	FETCH_LEVELS: "Fetching level data from database and calculating exp caps.",
	COLLATE_DATA: "Processing & combining data from duel and RP.",
	CONFIRM_DATA: "Validating and confirming participant data.",
	TEAMS_GROUPS: "Grouping participants into teams.",
	FIND_OUTCOME: "Determining duel outcome.",
	CALC_WIN_EXP: "Calculating particpant experience.",
	CONFIRMATION: "Awaiting player confirmation.",
	DUEL_SUMMARY: "Generating duel transcript.",
	APPROVE_PEND: "Sending to DMs for approval.",
	CLOSING_DUEL: "Closing duel & scene."
}
const INSTRUCT = {
//
	CLOSE_DUEL: `**The previous duel is still active.**\nPlease close it with \`!i end\` before continuing.\n${CONTACT}`,
//Team Confirmation
	CONFIRM_TEAM: `${CONTACT}`,
	CONFIRM_TEAM_FOOTER: `${config.emoji.yes} Accept teams | ${config.emoji.no} Cancel command\n`+
						 `${config.emoji.edit} Move participant to team | ${config.emoji.undo} Reset all participants`,
//Winner confirmation
	SELECTWIN: `Select the winner(s), or \`${config.emoji.no} Cancel\`.`,
	SETUP: `*If your level is incorrect or your character is missing, you may need to run \`!setup\` in <#${config.chan.xpSpam}>*`,
//Confirmation screen
	CONFIRM: (yes,no) => `Review the information below.\n\`${yes} Approve\` if it looks correct.\n\`${no} Cancel\` if anything looks wrong.`,
	REFRESH: `- Go to <#${config.chan.xpSpam}> and run \`!xp\`\n- Come back and run the command again.\n- `,
	CONFIRM_FOOTER: (yes,no) => `${yes} approve (all particpants) / ${no} cancel (any participant).\nWill auto-confirm after 30 seconds.`,
//DM Approval Screen
	APPROVE_FOOTER: `${config.emoji.yes}  Approve | ${config.emoji.no} Reject (no exp) | ${config.emoji.edit} Comment | Toggle Exp Calc | Edit`,
	PENDING_APPROVAL: (msg) => `***Please wait** a [@Helper](${msg}) will review your duel as soon as possible. Awards will be posted in <#${xpLogChannel}> once the duel has been reviewed.*\n*If anything looks incorrect, contact ${DM_PING} for assistance.*\n${BR}\n`,
//Duel Approved
	LOG_FOOTER: `-# Log your gains in <#${config.chan.xpSpam}>\n-# - ${config.emoji.xp} \`!xp <#>\`\n-# - ${config.emoji.gp} \`!coins <#>\`\n`
}
const ERROR = {
	//Data acquisition & state flow errors
	WRONG_CHANNEL: `Cannot process duels in this channel.\n${BR}`,
	PROCESSING_DUEL: `Already processing this duel\n${CONTACT}`,
	ACTIVE_DUEL: `**Duel Active**\nEnd the duel with \`!i end\` and run this command again.\n${CONTACT}`,
	NO_MECH_CHAN: (chan) => `**No duel found**\n*No mechanics thread found. (<#${chan}>)*\n${CONTACT}`,
	NO_DUEL_DATA: `**No duel found**\nThe most recent duel may have already been processed.\n${CONTACT}`,
	IN_RP_CHAN: (chan) => `**No duel found**\n*You must run this command in the Mechanics thread (<#${chan}>)*`,
	NO_RP_CHAN: (chan) => `**No roleplay found**\n*No roleplay channel found. (<#${chan}>)*\n${CONTACT}`,
	NO_RP_DATA: `**No roleplay found**\nThere is no RP found for the current duel.\n${CONTACT}`,
	PARTICIPATE: `Could not confirm sufficient participation to process this duel.\n${INSTRUCT.SETUP}\n${CONTACT}`,
	NO_OUTCOME: `Could not determine the duel outcome.\n${INSTRUCT.SELECTWIN}\n${CONTACT}`,
	CANCELLED: `Command cancelled.`,
	ABORTED: `Duel aborted.`,

	//DM Alerts
	USER_GROUP: {name:"Auto Group", value:`Characters played by the same user are auto-grouped.`},
	MANUAL_GROUP: {name:"Manual Groups", value:`Groups manually modified.`},
	INVALID_OUTCOME: {name:"Invalid Outcome", invalid:`Duel ended without clear conclusion.`, manual:`Outcome manually modified.`},


	//Data validation warnings
	NO_PLAYER: { name:"No Player", value:(err) => `Was not able to identify player for \`${err.name}\``},
	NO_VALID_USER: {name:"Invalid Player", value:(err) => `Player flagged <@${err.user}> (\`${err.name}\`)`},
	NO_LEVEL: { name:"No Level", value:(err) => `\`${err.name}\` (<@${err.user}>)`, msg:`${INSTRUCT.SETUP} *Monsters added as companions, summons, or shapeshifting should not be counted and can be safely ignored.*` },
	NO_HITPOINTS: { name:"No HP", value:(err) => `\`${err.name}\` had no HP value.`},
	NEED_MORE_RP: {name:"Insufficient RP", value:(err) => `<@${err.user.user}> (||*${err.user.rp.length} chars|${err.user.rp.posts} posts*||)`, msg:"*Roleplay was insufficient.\nAdd additional roleplay and run the command again.*"},
	NO_VALID_CHAR: {name:"No Character", value:(err) => `<@${err.user.user}>`, msg:"*Has no valid character in this duel.*"},
	USER_PARTICIPANTS: {name:"Participants", value: (err) => `Requires at least two players.`},
	CHAR_PARTICIPANTS: {name:"Participants", value: (err) => `Requires two or more characters.`},
	INVALID_CHARS: {name:"Invalid Chars", value: (err) => `Found invalid characters.`}
}
const EVENT_REGEX = (() => {
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
const INIT_REGEX = (() => {
	/// REGEX
	const ROLLED_DICE_PATTERN = `\\((?:~*(?:\\**\\d+\\**(?: -> )?)+~*(?:, )?)+\\)`
	// d20: 1d20 or advantage variants plus potential modifier and result after
	const D20_PATTERN = `\\d?d20(?:\\w+[lh<>]?\\d+)? *${ROLLED_DICE_PATTERN}(?: *[+-] *\\d+)?(?: *= *\\\`?(\\d+)\\\`?)?`
	const HP_PATTERN	= `<(?:([0-9]+)\\/([0-9]+) HP(?:, [0-9]+ temp)?|([a-zA-Z]+))?>.*`
	const LIST_PATTERN	= `[\\#\\s]*([0-9]+)?[\\:\\s\\-]+`;
	const ROUND_PATTERN	= `\\(round ([0-9]+)\\)`
	const INIT_PATTERN	= `initiative (?:${D20_PATTERN}|([0-9]+))`
	const PING_PATTERN	= `(.*) \\(<@([0-9]+)>\\)`
	const ADD_PATTERN	= `(?:was added to combat with|added to group|removed from all)(?: ${INIT_PATTERN})?`
	const GROUP_PATTERN	= `(?:(?: as part of group)?s?(.*))?\\.`
	const INIT_REGEX = {
		CHAR_MATCH:		new RegExp(`${LIST_PATTERN} (.*) ${HP_PATTERN}`,'gim'),
		ROUND_MATCH:	new RegExp(ROUND_PATTERN,'i'),
		PING_MATCH:		new RegExp(`.*${INIT_PATTERN} ${ROUND_PATTERN}.*: ${PING_PATTERN}`,'gim'),
		ADD_MATCH:		new RegExp(`(?:✅ )?(.*) ${ADD_PATTERN}${GROUP_PATTERN}`,'gim'),
		END_MATCH:		new RegExp(`\\-*COMBAT ENDED\\-*`,'i')
	}
	return INIT_REGEX
})()

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

/// Convert the provided data into embed fields & strings
const charStrFormat = { team:true, user:true, xp:true, gp:true, hp:true, defeat:true, calc:false, string:true, data:false, shownull:true }
const playerStr = { ...charStrFormat, xp:false, gp:false, shownull:false }
const debugStr = { ...charStrFormat, shownull:false }
function _charToString(char, charList, args = charStrFormat) {
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
}
function _charToStringElements(char, charList, args) {
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
}
function _charOutcomeString(char) {
	const {trophy, skull, scale} = config.emoji;
	const xpAmt = char.xpSet ?? char.xpAmt ?? null
	const types = { 0: `${skull} Defeat: `, 1: `${trophy} Victor: ` }
	const noWin	= !char.hasOwnProperty('win') || !char.hasOwnProperty('xpAmt')
	const type	= noWin ? null : types[char.win]
	return type;
}
function _charTeamString(char, charList) {
	let result = null;
	if (char.hasOwnProperty("team")) {
		const team	= charList?.filter(t => t.team == char.team)?.map(c => `\`${c.char}\``) ?? []
		if (team?.length > 1) result = team.join("|")
	}
	return result
}
function _charExpDetails(char) {
	if (!char?.xpData) return null
	let { capTotal, totalPool, poolPct, unCapExp, partial } = char.xpData
	type = partial ? "partial victory" : (char.win ? "victor" : "defeat")
	xpMult = partial ? PARTIAL_XP : (char.win ? VICTOR_XP : DEFEAT_XP)
	xpMult = Utils.precise(100 * xpMult,1)
	poolPct = Utils.precise(100 * poolPct,1)
	unCapExp = Math.round(unCapExp)
	capExp = (unCapExp>char.xpAmt) ? ` => Capped: \`${char.xpAmt}\`` : ``
	xpSet = char.hasOwnProperty("xpSet") ? `\n-# -\t• \`Manual Override\`: \`${char.xpSet}\`` : ``
	const summary = `
-# - \`${char.xpCap}\` (*xp Cap*) / \`${capTotal}\` (*team cap*) = \`${poolPct}%\` (*pool %*)
-# - \`${totalPool}\` (*exp pool*) * \`${xpMult}%\` (*${type}*) * \`${poolPct}%\` (*pool %*) = \`${unCapExp}\`${capExp}xp${xpSet}`
	return summary
}
function _charGoldDetails(char) {
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
}
function _teamToString(t, data, includeList) {
	const team = []
	const args = {team:false, xp: false, gp: false}
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
}
function _defeatedCharList(char, charList) {
	let result = null;
	charList = charList.filter(c => (c.hpCur == 0 && c.hpMax > 0))
	if (char.win) charList = charList.filter(c => c.team != char.team);
	else charList = charList.filter(c => c.win)
	if (charList.length > 0) result = charList.map(c => `\`${c.char}\``).join('|')
	return result
}
function _errorsToFields(errors, verbose = false) {
	const fields = Object.keys(errors).map( k => {
		const msg = (verbose ? (ERROR[k]?.msg || ``) : ``)
		const name = `${config.emoji.warn} Warning: ${ERROR[k].name}`
		const value = `${msg}\n${_errorToString(errors[k])}`.trim()
		return {name,value}
	}).filter(e => e)
	return fields
}
function _errorToString(error) {

	if (Array.isArray(error)) error = error.map(e => `-# - ${e}`).join("\n")
	else error = `-# - ${error}`
	return error
}
function _encodeDataURL(data) {
	return JSONURL + encodeURIComponent(JSON.stringify(data));
}

//Log wrappers
function DebugFn(args=debugStr) {
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
}
function DEBUGFIELDS(data,args) {
	if (!data) Log.ERROR(Error().stack)
	const {events, ...debugData} = data;
	return Log.DEBUGFIELDS(data, DebugFn(args));
}
function DEBUGTHROW(data){
	if (!data) Log.ERROR(Error().stack)
	const {events, ...debugData} = data;
	Log.DEBUGTHROW(debugData, DebugFn())
}
/// Handle an error with the edit components by restoring the original embed/components passed in via args
async function _handleComponentError(args) {
	const {interaction, restoreEmbeds, restoreComponents, duelData, error} = args

	// Restore the interaction embed / components to the original state
	await interaction.editReply({embeds:restoreEmbeds,components:restoreComponents})

	// Relay the error message to the user
	if (error.message) await interaction.followUp({content:error.message, ephemeral:true})

	await _handleErrorLog(args)
}
/// Handle a thrown error by logging it to the appropriate log channel
async function _handleErrorLog(args) {
	const {interaction, debugData, error} = args

	// Early out if this is just a cancel message - we don't need to log every cancellation
	if (error?.message?.includes(ERROR.CANCELLED)) return;

	// Add the duelData to the debug log embed
	if (!error.cause && debugData) error.cause = DEBUGFIELDS(debugData, debugStr)

	// Log the error to the debug channel
	// Log.DEBUG(error)
	await Log.EMBED({interaction,channel:config.debug.duel,error,dataFields:error.cause})
}

/// Process the most recent duel in the specified channel in a try/catch harness
/// @interaction: The slash command interaction (where applicable)
/// @message: Optionally, the message on which the menu command was run
async function processDuel(interaction, message) {
	/// Arguments will vary depending on the method of entry
	///		- User-Ended via slash command:	interaction (contains channel)
	///		- User-Ended via context menu :	interaction (contains channel & message)
	///		- Auto-ended via thread update: channel & message (NO interaction)
	const args			=	{ interaction, message }
	if (message) args.skipRP = true;
	const channel		=	args.channel ?? interaction?.channel ?? message?.channel
	let ret 			=	null;
	let error	 		=	null;
	try 		{ ret	=	await _closeDuelInternal(args) }
	catch(err) 	{ error =	err }

	if (error) {
		if (error.message.includes(ERROR.CANCELLED)) error.name = "Cancelled"
		const debugData = error.cause
		error.cause = debugData ? DEBUGFIELDS(debugData, debugStr) : null
		_handleErrorLog({interaction, debugData, error})
		error.cause = debugData ? DEBUGFIELDS(debugData, playerStr) : null
	}

	Mutex.unlock(channel,	error);
	return ret;
}
async function _closeDuelInternal(args) {
	const interaction	=	args.interaction ?? null;
	const message		=	args.message ?? interaction?.message ?? null;
	const channel		=	args.channel ?? interaction?.channel ?? message?.channel;
	const autoClose		=	args.auto ?? false;
	const ephemeral		=	interaction?.ephemeral ?? false;
	const guild			=	channel.guild;
	const duelId		=	channel.id;
	const skipRP		=	(args.skipRP || DEBUG?.IGNORE_RP) ?? false
	const forceClose	=	null != message;// && !DEBUG;
	const trackProgress =	async(interaction, d, stage) => {
		/// Finish up the previous stage output
		let STEPKEY = Object.keys(STEP).find(key => STEP[key] === progressStage);
		const { events, ...debugData } = (duelData ?? {});
		const cause = duelData ? {cause:duelData} : {}
		if (BREAKSTEP && BREAKSTEP == progressStage) {
			Log.DEBUG([duelData, STEPKEY, BREAKSTEP])
			throw new Error(`Break step reached`, cause)
		}
		else if (DEBUG?.WATCHDATA && debugData) Log.DEBUG(debugData)

		/// Process the next stage output
		progressStage	= stage;
		STEPKEY = Object.keys(STEP).find(key => STEP[key] === progressStage);
		Log.STEP(STEPKEY, stage)
		if (stage.includes("TODO")) Log.TODO(stage)
		const embed = new EmbedBuilder().setTitle("Processing Duel").setThumbnail(DUELTHUMB)
										.setDescription(`${stage}\n${BR}`)
										.setFooter({text:"Please Be Patient"})
		const components = [];
		const buttons = [
			{style:ButtonStyle.Primary, emoji:config.emoji.next, label:"Step", custom_id:"step"},
			{style:ButtonStyle.Primary, emoji:config.emoji.next, label:"Step & Log", custom_id:"steplog"},
			{style:ButtonStyle.Primary, emoji:config.emoji.pause, label: "Pause", custom_id:"pause"},
			{style:ButtonStyle.Secondary, emoji:config.emoji.no, label:"Cancel", custom_id:"cancel"},
		]
		if (DEBUG?.EMBEDDATA) {
			let fields = (DEBUG?.EMBEDDATA && duelData) ? DEBUGFIELDS(duelData,debugStr) : [];
			if (fields.length > 0) embed.addFields(fields)
		}
		if (DEBUG?.TRACESTEP) components.push(Prompt.createButtonRow(buttons))
		const prompt = await interaction?.editReply({content:"",embeds:[embed],components})
		if (DEBUG?.TRACESTEP) {
			let input = await Prompt.collectComponents(prompt, {default:"step"});
			while (input.values[0] == "pause")
				input = await Prompt.collectComponents(prompt, {default:"pause",time:Prompt.Time.Extended})
			if (input.values[0] == "cancel") throw Error(ERROR.CANCELLED, cause)
			if (input.values[0] == "steplog") await interaction?.channel?.send({embeds:[embed]})
		}
		await interaction?.editReply({components:[]})
	}
	let progressStage	=	null;
	let rpChan			=	null;
	let mechChan		=	null;
	let duelData 		=	null;
	let rpData			=	null;
	let duelActive		=	false;
await trackProgress(interaction, duelData, STEP.CONFIRM_CHAN);
	if (DEBUG && forceClose) { mechChan = channel }// else
	{
		//Confirm that the command is being executed in a valid channel and mutex lock it
		const channelPair = ChanUtils.getDuelChannelPair(channel)
		if (!channelPair) throw new Error(ERROR.WRONG_CHANNEL)

		//Resolve the RP/Mech pair into actual channels
		rpChan = guild.channels.resolve(channelPair.RP);
		if (mechChan?.id != channelPair.MECHANICS)
			mechChan = guild.channels.resolve(channelPair.MECHANICS);

		if (!rpChan) throw new Error(ERROR.NO_RP_CHAN(channelPair.RP))
		if (!mechChan) throw new Error(ERROR.NO_MECH_CHAN(channelPair.MECHANICS));
		if (channelPair.RP == channel.id) throw new Error(ERROR.IN_RP_CHAN(channelPair.MECHANICS));

		//Mutex to prevent the same duel from being processed twice
		Mutex.lock(mechChan, Error(ERROR.PROCESSING_DUEL));
	}
await trackProgress(interaction, duelData, STEP.GET_ROLEPLAY);
	{
		//Get the raw RP data and throw an error if we don't have any
		if (rpChan) rpData = await MsgUtils.getRoleplayData(rpChan, message);
		if (!rpData && !forceClose && !skipRP) throw Error(ERROR.NO_RP_DATA);
	}
await trackProgress(interaction, duelData, STEP.EXTRACT_INIT);
	{
		//Parse the duel for transcript data and participants or throw an error
		duelData = await _getDuelData(mechChan, message);
		if (!duelData) throw new Error(ERROR.NO_DUEL_DATA);

		//Check pinned messages and early exit if there's an active init
		const pins = await mechChan.messages.fetchPinned()
		duelActive = (pins?.first()?.id == duelData.message)
		//if (pins.size > 0) throw new Error(ERROR.ACTIVE_DUEL);
	}
await trackProgress(interaction, duelData, STEP.FETCH_LEVELS);
	{
		//Fetch level data & exp cap from database
		duelData = await _fetchLevelData(duelData);
	}
await trackProgress(interaction, duelData, STEP.COLLATE_DATA);
	{
		//Consolidate the RP and Duel data
		duelData = _collateData(duelData, rpData);
	}
await trackProgress(interaction, duelData, STEP.CONFIRM_DATA);
	{
		//Verify that all participants put in sufficient effort in their roleplay
		duelData = _verifyParticipation(duelData, skipRP, forceClose);
	}
await trackProgress(interaction, duelData, STEP.TEAMS_GROUPS);
	{
		if (duelActive && duelData.players.length > 2)
			throw Error(ERROR.ACTIVE_DUEL, {cause:duelData})
		//Group the participants automatically / user input
		duelData = await _groupParticipants(duelData, interaction)
	}
await trackProgress(interaction, duelData, STEP.FIND_OUTCOME);
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
await trackProgress(interaction, duelData, STEP.CALC_WIN_EXP);
	{
		//Calculate the exp & Clean the data into the minimum necessary
		duelData = _calculateExp(duelData);
		duelData = _calculateGold(duelData)
	}
await trackProgress(interaction, duelData, STEP.CONFIRMATION);
	{
		if (duelActive) throw Error(ERROR.ACTIVE_DUEL, {cause:duelData})
		//Present the outcome to the players and await confirmation
		const confirm = await _awaitConfirmation(duelData, interaction);
	}
await trackProgress(interaction, duelData, STEP.DUEL_SUMMARY);
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
await trackProgress(interaction, duelData, STEP.APPROVE_PEND);
	{
		if (DEBUGFILE) Log.FILE("duelData_before.txt", duelData)

		const dmEmbed = await _sendApprovalMessage(duelData, interaction);
		duelData.dmMsg = dmEmbed.url;
	}
await trackProgress(interaction, duelData, STEP.CLOSING_DUEL);
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

/// Get the duel data
/// @mechChan		- the mechanics thread that contains the duel info
/// @message		- the message for the context menu force
async function _getDuelData(mechChan, message=null) {
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
}

/// Parse the initiative message to create duel data from it
/// @message		- The initiative message to parse
function _parseInitiative(message) {
	const logDate = DateTime.now().toUnixInteger();
	const duelData = {
						channel:message.channel.id,
						message:null,
						logDate:logDate,
						rounds:0,
						chars:[],
						players:[],
						events:[],
						urls:{roleplay:"",duel:"",transcript:""}
	};
	//Test to see if the initiative message matches what we expect form an initiative post
	if (!INIT_REGEX.END_MATCH.test(message.content)) return null;

	//Get the duration (in rounds)
	if (!INIT_REGEX.ROUND_MATCH.test(message.content)) return null;
	duelData.rounds = message.content.match(INIT_REGEX.ROUND_MATCH)[1];

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
}

/// Parse an Avrae embed for event transcript data
/// @duelData		- current duel data for back-referencing characters
/// @event			- the existing event data
/// @embed			- the embed
function _parseEventEmbed(duelData, event, embed) {
	const result = embed?.footer?.text.replaceAll('\n',' | ');
	event.event = embed?.title;
	if (result) event.result = result;

	// Special case hack to force teams into a specific configuration
	if (embed?.title == "Teams") {
		duelData.teams = embed?.fields?.map(field => field.value.split("\n").map(user => user.replaceAll(/\D/g,"")));
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
}

/// Check for the round from the current message and return it
/// @message		- the message containing the content to parse
function _parseEventRound(message) {
	if (!INIT_REGEX.ROUND_MATCH.test(message.content)) return null;
	return message.content.match(INIT_REGEX.ROUND_MATCH)[1];
}

/// Check for commands adding PCs/NPCs to init or groups to help track the players
/// @duelData		- current duel data for back-referencing characters
/// @message		- the message containing the content to parse
function _parseEventInitGroupAdd(duelData, message) {
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
		else duelData.chas.push(char)
	}

	return duelData
}

/// Map player ID to characters by name or group
/// @duelData		- current duel data for back-referencing characters
/// @message		- the message containing the content to parse
function _parseEventPlayer(duelData, message) {
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
}

/// Parse an event to determine if it's irrelevant
/// @event			- the event string to check
function _parseIrrelevantEvent(event) {
	return  (INIT_REGEX.ROUND_MATCH.test(event))||
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

/// Parse all provided messages for duel events
/// @messages		- Data gathered from duel
function _parseDuel(messages) {
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
		const AddInitRegex = /with initiative 1d20 .*/i;
		event.event = event.event.replace(AddInitRegex, "...");

		duelData.events.push(event);
		if (event.event == "Combat ended.") break;
	};
	return duelData;
}

/// Fetch the levels from the database and set the exp Cap for each character we've found
/// @duelData		- Extant data gathered from the initiative
async function _fetchLevelData(duelData) {
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
}

/// Consolidate the RP, duel, and level data into the duel data
/// @duelData		- Extant data gathered from the initiative
function _collateData(duelData, rpData) {
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
}

/// Verify that there are enough participants, and that all put effort into their roleplay
/// @duelData		- Extant data gathered from the initiative
function _verifyParticipation(duelData, skipRP = false, forceClose = false) {
	const errors = [];
	const uniqueUsers = [];
	const invalidChars = [];

	//Determine valid characters and log as error anything else.
	if (duelData.chars.length < 2) errors.push({reason: "CHAR_PARTICIPANTS"})
	let validChars = duelData.chars.filter(c => {
		let error = null;
		//Confirm the character has a valid player associated with it
		if (!c.user) error = "NO_PLAYER"
		//Confirm the character has been setup and has a valid level, else treat them as an NPC
		else if (c.level <= 0 || c.xpCap <= 0) error = "NO_LEVEL"
		//Confirm the character has a valid max HP and was not a summon or companion
		else if (c.hpMax <= 0) error = "NO_HITPOINTS"

		if (null !== error) errors.push({reason: error, user:c.user, char:c.char})
		else if (!uniqueUsers.includes(c.user)) uniqueUsers.push(c.user);
		return error ? false : true
	});
	//Determine valid players and log as error anything else.
	if (duelData.players.length < 2) errors.push({reason: "USER_PARTICIPANTS"})
	let validUsers = duelData.players.filter(user => {
		let error = null
		//Verify that each player roleplayed enough
		let sufficientRP = (user.rp.length >= MIN_CHARS)&&(user.rp.posts >= MIN_POSTS)
		if (!skipRP && !forceClose && !sufficientRP) error = "NEED_MORE_RP"
		//Verify that this user has valid characters
		user.chars = user.chars.filter(x => validChars.find(c => c.char == x))
		if (user.chars.length < 0) error = "NO_VALID_CHAR"

		if (null !== error) errors.push({reason: error, user})
		return error ? false : true
	});
	//Determine if there were characters controlled by invalid users
	validChars = validChars.filter(c => {
		let error = null
		const user = validUsers.find(u => u.user == c.user)
		if (!user) error = "NO_VALID_USER"
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
	if (!isValidDuel) {
		//Throw the error with the valid duel data and removed users/chars
		if (!forceClose) throw new Error(ERROR.PARTICIPATE, {cause:duelData})
	}
	return duelData;
}

/// Automatically group the user participants in the duel into teams
/// Uses event log to determine a mutual aggression score
/// @duelData		- Extant data parsed and consolidated
function _resetTeams(duelData) {
	duelData.teams = duelData.players.map(x => ([x.user]))
	delete duelData.errors?.MANUAL_GROUP
	return duelData;
}

/// Populate the teams data from a list of users into the characters and total xpCap
/// @duelData		- Extant data parsed and consolidated
function _aggregateTeams(duelData) {
	//At this stage the teams are justa list of players.
	//Aggregate the team data from multiple sources: user list, total HP, and total XP cap
	let groupId = 0;
	duelData.teams = duelData.teams.map((users,i) => {
		users = users.users ?? users
		//Find all characters of this group
		const chars = duelData.chars.filter(x => users.includes(x.user));
		if (chars.length > 1)
			duelData.errors.USER_GROUP = ERROR.USER_GROUP.value
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

	duelData.chars.map(c => {
		c.team = duelData.teams.findIndex(t => t.users.includes(c.user))
	})
	const sortKeys = {team:SortOrder.ASC,level:SortOrder.DESC,hp:SortOrder.DESC}
	duelData.chars.sort((a,b) => Utils.priorityCompare(a, b, sortKeys))

	return duelData;
}

/// Generate an embed to get team confirmation
/// @duelData		- Extant data parsed and consolidated
/// @debug			- optional param to show debug JSON data as part of the embed
function _getTeamsEmbed(duelData, debug = null) {
	const {d20} = config.emoji
	const fields = duelData.teams.map(t => {
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
									.setThumbnail(DUELTHUMB).setFields(fields).setFooter({text:footer})
	return embed
}

/// Get the components for editing the teams
/// @duelData		- Extant data parsed and consolidated
/// @_edit			- Status reflecting the currentgiven step fo the edit process
function _getTeamsComponents(duelData, _edit = null) {
	//Create button row
	const {yes, no, edit, undo, shuffle} = config.emoji;
	const buttonRow = Prompt.createButtonRow([
		{style:ButtonStyle.Success, emoji:yes, label:"Accept", custom_id:"accept"},
		{style:ButtonStyle.Secondary, emoji:no, label:"Cancel", custom_id:"cancel"},
		{style:ButtonStyle.Secondary, emoji:edit, label:"Edit", custom_id:"edit"},
		{style:ButtonStyle.Primary, emoji:undo, label:"Reset", custom_id:"reset"}
	])
	const components = [buttonRow];

	//Create a select dropdown of each character showing their current team
	const charOpts = duelData.chars.map(c => {
		const team	= duelData.teams[char.team]?.chars ?? ``
		const desc	= "Team: " + (team.length > 1 ? team?.join(' | ') : `solo`);
		//Omit any characters if they are the only one on their team and moving them would leave only one team
		const users = duelData.teams[char.team]?.users ?? []
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
	if (_edit?.char) {
		const char = duelData.chars.find(c => c.char == _edit.char)
		const team = duelData.chars.filter(c => c.team == char.team)
		if (team.length > 1) teamOpts.unshift(Prompt.createSelectOption("Solo", char.char, char.char))
	}
	const teamSelect = (_edit?.char) ? Prompt.createSelectRow("team", teamOpts, null, null, "Select destination team") : null

	if (_edit) components.push( _edit.char ? teamSelect : charSelect )
	return components;
}

async function _editParticipantGroups(duelData, interaction, forceEdit = null) {
	const cancelled = `${ERROR.CANCELLED}\nIf your level is wrong:\n${INSTRUCT.REFRESH}${CONTACT}`;
	let approved = false

	let edit = forceEdit ? { char:false} : null;
	let response = null;

	while (!approved) {
		const embed = _getTeamsEmbed(duelData, response)
		const components = _getTeamsComponents(duelData, edit)
		const prompt = await interaction.editReply({embeds:[embed],components})

		//Prompt the user and wait for reply
		response = await Prompt.collectComponents(prompt)
		const input = response.values ? response.values[0] : null
		response = null//JSON.stringify(response)

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

async function _groupParticipants(duelData, interaction, forceEdit = null) {
	//Default behavior: Every participant for themselves 1(v1)
	if (!duelData.teams) duelData = _resetTeams(duelData)
	duelData = _aggregateTeams(duelData)

	if (duelData.players.length > 2) {
		try { duelData = await _editParticipantGroups(duelData, interaction, forceEdit) }
		catch (e) { throw e }
	}

	return duelData;
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
	// Ideal case: clearly defined victors/defeats - One (or more) victors and one (or more) defeats
	// Deviant case: All defeats, no victors - Draw, each earning the minimum (25%) amount
	// Deviant case: No defeats teams means no totalCap exp pool to award
	//	- Duel ended early / player bailed (no one should get any award)
	//	- Player fuckup and healed before ending duel (select winner/loser teams)
	////if (defeats.length == 0 || totalCap == 0 || forceSelect)
	if (!valid || forceSelect) {
		delete duelData.errors.INVALID_OUTCOME
		if (!valid) duelData.errors.INVALID_OUTCOME = ERROR.INVALID_OUTCOME.invalid

		victors = (/*totalCap > 0 &&*/ victors.length > 0) ? victors?.map(t => t.team) : [];
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

/// Generate an option description string from a given team data
function _teamToOption(charList) {
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
}

/// Calculate the exp split between players based on the losers combined exp cap
/// @duelData		- Extant data gathered from the initiative
function _calculateExp(duelData) {
	const {victors, defeats} = duelData.outcome
	const testV = duelData.chars.filter(c => c.win)
	const testD = duelData.chars.filter(c => !c.win)

	//Total up any victors the defeated team managed to reduce to zero HP to award that exp
	//Comment this out if it's being abused
	const partVictorTotal = duelData.chars.reduce((total,c) =>
		(total += (c.win && c.hpCur == 0 && c.hpMax > 0) ? c.xpCap : 0), 0)

	const victorCapTotal = victors.reduce((total,team) => total + team.xpCap, 0)
	const defeatCapTotal = defeats.reduce((total,team) => total + team.xpCap, 0)
	// const victorExpPool = Math.ceil(defeatCapTotal * VICTOR_XP)
	// const defeatExpPool = Math.floor(defeatCapTotal * DEFEAT_XP)
	// const partVictorPool = Math.ceil(partVictorTotal * PARTIAL_XP)
	// const partDefeatPool = Math.ceil(defeatCapTotal * PARTIAL_XP)
	// const xpData = {victorCapTotal, victorExpPool, defeatCapTotal, defeatExpPool, partVictorPool}

	duelData.chars.map(c => {
		const partial = (c.win ? c.hpCur == 0 : partVictorTotal >= defeatCapTotal) ? 1 : 0

		//Determine the total pool
		const totalPool = (partial && !c.win) ? partVictorTotal : defeatCapTotal
		//Determine the group's percentage of the total purse
		const grpPoolPct = (partial ? PARTIAL_XP : (c.win ? VICTOR_XP : DEFEAT_XP))
		const grpPool = totalPool * grpPoolPct;
		// const grpPool = (c.win ? (partial ? partDefeatPool : victorExpPool)	//Victor
		// 	   				   : (partial ? partVictorPool : defeatExpPool))//Defeat
		//Determine the individual's percentage of their group's pool
		const capTotal = (c.win ? victorCapTotal : defeatCapTotal);
		const poolPct = Math.min(1, c.xpCap / capTotal);
		//Calculate the individual's total award
		const unCapExp = Math.round(totalPool * grpPoolPct * poolPct);
		c.xpAmt = Math.min(c.xpCap, Math.round(unCapExp));

		console.log(totalPool, grpPoolPct, poolPct)

		c.team = duelData.teams.findIndex(t => t.users.includes(c.user))
		c.xpData = { capTotal, totalPool, poolPct, unCapExp, partial }
	})

	return duelData;
}

/// Calculate the gold percentage an individual player gains based on their result
/// @duelData		- Extant data gathered from the initiativ
function _calculateGold(duelData) {
	//			 Level :  0, 1, 2, 3,  4,  5,  6,  7,  8,  9, 10,  11,  12,  13,  14,  15,  16,  17,  18,  19,  20
	const goldPerLevel = [0, 0, 0, 4,  8, 16, 24, 32, 40, 48, 56,  72,  88, 104, 120, 136, 152, 184, 216, 248, 280];

	const { chars } = duelData
	const victorTotal = chars.reduce((t, c) => t += (c.win ? goldPerLevel[c.level] : 0), 0)
	const partialTotal = chars.reduce((t,c) => t += ((c.win && c.hpCur == 0) ? goldPerLevel[c.level] : 0), 0)
	const defeatTotal = chars.reduce((t, c) => t += (c.win ? 0 : goldPerLevel[c.level]), 0)

	duelData.chars.map(c => {
		const { partial } = c.xpData;

		//Determine the purse amount
		const totalPurse = (partial && !c.win) ? partialTotal : defeatTotal
		//Determine the group's percentage of the total purse
		const grpPoolPct = (partial ? PARTIAL_XP : (c.win ? VICTOR_XP : DEFEAT_XP))
		//Determine the individual's percentage of their group's pool
		const goldCap = goldPerLevel[c.level];
		const capTotal = (c.win ? victorTotal : defeatTotal);
		const poolPct = Math.min(1, goldCap / capTotal);
		//Calculate the individual's total gold award
		const uncapGold = totalPurse * grpPoolPct * poolPct

		c.gpAmt = Math.min(goldCap, Math.round(uncapGold))
		c.gpData = { cap:goldCap, capTotal, totalPurse, poolPct, uncapGold }
	})

	return duelData;
}

/// Pause and wait for confirmation from the player(s) before continuing
/// @duelData		- Extant data gathered from the initiative
/// @interaction	- Original interaction, needed for player input
async function _awaitConfirmation(duelData, interaction, isEdit = false) {
	const users = duelData.chars.map(c => c.user)

	duelData.chars.sort((a,b) => {
		if (b.win   != a.win  ) return b.win   - a.win
		if (b.team  != a.team ) return b.team  - a.team
		if (b.level != a.level) return b.level - a.level
		if (b.hpCur != a.hpCur) return b.hpCur - a.hpCur
	})

	const fields = duelData.chars.map(c => _charToString(c, duelData.chars, {string:false, xp:false, gp:false}));
	fields.push(..._errorsToFields(duelData.errors,!isEdit))

	Log.TODO("Move confirmation code into its own utility")
	const embed = new EmbedBuilder().setThumbnail(DUELTHUMB).addFields(fields)
	await interaction.editReply({embeds:[embed],components:null})
	if (DEBUG?.USEREMBED) await interaction.channel.send({embeds:[embed]})

	//Send embed confirm prompt
	const {tu:yes, td:no} = config.emoji;
	const content = users.map(x => `<${PING_PREFIX}${x}>`).join(" ");
	const desc	= `${STEP.CONFIRMATION}\n${INSTRUCT.CONFIRM(yes,no)}\n${CONTACT}`
	const prompt = new EmbedBuilder().setTitle("Confirmation").setFooter({text:INSTRUCT.CONFIRM_FOOTER(yes,no)})
									 .setDescription(desc)
									 .setThumbnail(DUELTHUMB).addFields(fields)
	const confirm = await Prompt.confirmDialog(interaction, {content, embeds:[prompt]}, users, true);
	const cancelled = `${ERROR.CANCELLED}\nIf your level is wrong:\n${INSTRUCT.REFRESH}${CONTACT}`;
	if (!confirm || confirm == no) throw Error(cancelled, {cause:duelData})

	return true;
}

/// Cleanup the data into a small manageable chunk
/// @duelData		- Extant data gathered from the initiative
function _cleanData(duelData) {

	const {events, ...debugData} = duelData

	//We don't need player data anymore
	// - if we got here, we don't care about their RP data
	// - We can reconstruct the players.chars list from the characters fields
	delete duelData.players;

	//We can reconstruct the team data from character fields
	if (duelData.teams) duelData.matchup = duelData.teams.map(t => t.chars.length).join(' v ');
	delete duelData.teams;

	//We can teconstruct the outcome data from character / team fields
	delete duelData.outcome;

	return duelData;
}

/// Generate the transcript embed from the events field of the duel data
/// @duelData		= Extant data gathered from the initiative
function _generateTranscriptFromData(duelData) {
	if (!duelData.events) return null;
	//Create a paginated Embed, NOT an EmbedBuilder
	let embed = new Embed()
		embed.setTitle("Duel Transcript")
		embed.setDescription(`[[jump](${duelData.urls.duel})] \`Duel Initiative\`\n${BR}`)
	for (let round=0; round <= duelData.rounds; ++round) {
		let events = duelData.events.filter(event => (event.round == round));
		if (events.length > 0) {
			embed.addField(`Round ${round}`, "")
			events.forEach(event => {
				let field = `[[jump](${event.msg})] \`${event.event}\``
				if (event.result) field += `\n- *${event.result}*`
				embed.extendField(field, `Round ${round} cont.`)
			})
			embed.closeField();
		}
	}
	return embed.embeds();
}

/// Sends approval message to the DM channel
/// @duelData		- Extant data gathered from the initiative
/// @interaction	- Original interaction, needed for player input
async function _sendApprovalMessage(duelData, interaction, components = null, calc = false) {
	const date		= DateTime.fromSeconds(duelData.logDate);
	const format	= `dd LLLL yyyy [ hh:mma ]`	//`DD [ hh:mma ]`
	const fullDate	= date.toFormat(format)
	const footer	= `Logged at:`;
	const {errors, urls, channel, message, chars, comments, logField, ...encodeData} = duelData;
	const {roleplay, duel, transcript} = urls;
	const charFieldArgs = {string:false, calc, data:true};
	const fields 	= chars.map(c => _charToString(c, chars, charFieldArgs));
	const data		= _encodeDataURL(encodeData);
	const disabled	= chars.filter(c => !c.xpData?.totalPool && !c.xpData?.unCapExp).length > 0

	const errorFields = _errorsToFields(duelData.errors);
	fields.push(...errorFields);
	fields.push({name:"Links",value:`[Roleplay](${roleplay})\n[Duel](${duel})`,inline:true});
	fields.push({name:"Duel", value:`Rounds: \`${duelData.rounds}\`\n[Transcript](${transcript})`,inline:true});
	fields.push({name:"Data", value:`[Data](${data})`,inline:true});
	if (logField) fields.push(logField)
	if (comments) fields.push(...comments);

	const matchup = duelData.matchup ? ` (${duelData.matchup})` : ``
	let dmEmbed = new EmbedBuilder().setTitle(`${DUELTITLE}${matchup}`)
									.setThumbnail(DUELTHUMB)
									.setDescription(BR)
									.addFields(fields)
									.setFooter({text:footer})
									.setTimestamp(date.toMillis())
	if (errorFields.length > 0) dmEmbed.setColor(0xff6900);
	const {yes,no,edit,xp} = config.emoji;
	components = components ?? [ Prompt.createButtonRow([
		{style:ButtonStyle.Success, emoji:yes, label:"Approve", custom_id:"duel.approve", disabled},
		{style:ButtonStyle.Danger, emoji:no, label:"Reject", custom_id:"duel.decline"},
		{style:ButtonStyle.Secondary, emoji:edit, label:"Comment", custom_id:"duel.note"},
		{style:ButtonStyle.Secondary, emoji:"📱", label:"Calcs", custom_id:`duel.calc_${!calc}`, disabled},
		{style:ButtonStyle.Secondary, emoji:edit, label:"Edit", custom_id:"duel.edit"}
	])]
	if (DEBUGFILE) Log.FILE("duelData_embed.txt", dmEmbed)

	if (interaction.channel.id == dmPingChannel) {
		dmEmbed = await interaction.editReply({content:`${DM_PING}`,embeds:[dmEmbed], components})
	}
	else {
		const dmChan = interaction.guild.channels.resolve(dmPingChannel);
		dmEmbed = await dmChan.send({content:`${DM_PING}`,embeds:[dmEmbed], components});
	}
	return dmEmbed;
}

/// Close the scene, sends a message to the DM channel
/// @duelData		- Extant data gathered from the initiative
/// @interaction	- Original interaction, needed for player input
async function _closeScene(duelData) {
	const date		= DateTime.fromSeconds(duelData.logDate);
	const format	= `dd LLLL yyyy [ hh:mma ]`	//`DD [ hh:mma ]`
	const fullDate	= date.toFormat(format)
	const footer	= `Logged at:`;

	const fields = duelData.chars.map(c => _charToString(c, duelData.chars, {xp:false,gp:false,string:false}));
	fields.push(..._errorsToFields(duelData.errors))
	const embed		= new EmbedBuilder().setTitle(DUELTITLE).setThumbnail(DUELTHUMB)
										.setDescription(INSTRUCT.PENDING_APPROVAL(duelData.dmMsg))
										.addFields(fields)
										.setFooter({text:footer})
										.setTimestamp(date.toMillis())
	return embed;
}

/*==========================*\
|* DATA RETRIEVAL FUNCTIONS *|
\*==========================*/

/// Gather and re-assemble the encoded data from the embed message
/// @message	- The message containing the approval embed
function _getEncodedData(message, reconstruct = true) {
	let data = null;
	const linkRegex = /\[`?Data`?\]\((.*)\)/
	const linksRegex = /\[(.*)\]\((.*)\)/g
	const fields = message?.embeds?.[0]?.fields;
	const errorPrefix = `${config.emoji.warn} Warning: `
	const errors = fields?.filter(f => f.name.startsWith(errorPrefix))?.reduce((e, f) => {
		let k = f.name.replace(errorPrefix,``)
		k = Object.keys(ERROR).find(x => ERROR[x].name == k)
		let error = f.value.replaceAll("-# - ", "").split("\n")
		if (k) e[k] = error
		return e
	}, {})
	const value  = fields?.find(f => f.name == "Data")?.value?.replace(JSONURL,'');
	if (value) {
		data = value.match(linkRegex)?.[1]				//Strip the URL wrapper, leaving just encoded data
		data = data ? decodeURIComponent(data) : null	//Decode the data into json string
		data = JSON.parse(data);						//Parse it into an object
	}

	let urls = {}
	fields?.filter(f => f.name == "Links" || f.name == "Duel").map(f => {
		f = [...f.value.matchAll(linksRegex)].map(l => urls[l[1].toLowerCase()] = l[2])
	})

	const chars = fields?.filter(f => MessageMentions.UsersPattern.test(f.value)).map(char => {
		char = char.value.replace(JSONURL,``)
		char = char.match(linkRegex)?.[1]
		char = char ? decodeURIComponent(char) : null
		char = JSON.parse(char)
		return char
	}).filter(c => c)
	//Reconstruct some of the character data we'll need
	chars.map(c => c.xpCap = ExpUtils.getDuelExpCap(c.level || 0))

	const comments = fields?.filter(f => f.name.includes("DM Comment"))

	data = {...(data || []), chars, errors, comments, urls}
	if (reconstruct) data = _reconstructData(data)	//Reconstruct data into the complete version

	return data;
}

/// Reconstruct the players / teams / outcome duelData from the characters list
/// @duelData 	- the duelData containing all the characters data.
function _reconstructData(duelData) {
	//Rebuild the Players list from the characters
	const players = [];
	duelData.chars.forEach(c => {
		const idx = players.findIndex(p => p.user == c.user);
		if (idx < 0) players.push({user:c.user, chars:[c.char]})
		else players[idx].chars.push(c.char);
	})

	let teams = {};
	duelData.chars.forEach(c => {
		const t = teams[c.team] ?? {team: c.char, users:[], chars:[], totalHP: 0, xpCap: 0};
		if (!t.users.includes(c.user)) t.users.push(c.user);
		if (!t.chars.includes(c.char)) t.chars.push(c.char);
		if (t.chars.length > 1) t.team = `Group ${c.team + 1}`
		t.totalHP += c.hpCur;
		t.xpCap += c.xpCap;
		t.win = (c.win == 1) && (t?.win ?? true)
		teams[c.team] = t;
	})
	teams = Object.values(teams)
	teams.sort((a,b) => b.totalHP - a.totalHP)

	const outcome = {}
	outcome.victors = teams.filter(t => t.win)
	outcome.defeats = teams.filter(t => !t.win)

	duelData = {...duelData, players, teams, outcome}
	return duelData
}

/*===================*\
|* EDITING FUNCTIONS *|
\*===================*/

/// Toggle the approval embed's xp and gold calculation fields on and off
async function toggleCalculations(interaction, calc) {
	await interaction.deferUpdate();
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;

	let duelData = null
	try {
		//Retrieve the encoded data
		duelData = _getEncodedData(interaction?.message, false)
		duelData = _reconstructData(duelData)
		duelData = _calculateExp(duelData)
		duelData = _calculateGold(duelData)
		duelData = _cleanData(duelData)
		await _sendApprovalMessage(duelData, interaction, null, calc);
	} catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, duelData, error})
	}
}

/// Prompt the user for a note
async function noteDuel(interaction) {
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;

	const header = `${config.emoji.edit} DM Comment`
	const prefix = `-# `
	try {
		let embed = interaction?.message?.embeds?.[0]
		let index = embed?.fields?.findIndex(f => f.name.includes("Comment"))
		let found = index >= 0
		let field = (found) ? embed.fields[index] : {name:header,value:null}
		let value = field.value ? field.value.substr(prefix.length) : ""
		field.name = header
		field.value = await _promptTextModal(interaction, value)
		if (field.value) {
			field.value = prefix + field.value
			if (found) embed.fields[index] = field;
			else embed.fields.push(field)
		} else if (found) embed.fields.splice(index, 1)
		restoreEmbeds[0] = embed
		interaction.editReply({content, embeds:restoreEmbeds,components:restoreComponents})
	}
	catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, error})
	}
}

/// Edit the outcome of a duel
/// @interaction	- The interaction of the button press
async function editDuel(interaction) {
	await interaction.deferUpdate();
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;
	const builderPerms = Utils.hasAnyRole(interaction.member, [config.role.Builder]);

	let duelData = null
	try {
		//Retrieve the encoded data
		duelData = _getEncodedData(interaction?.message, false)
		duelDiff = _getEncodedData(interaction?.message, false)

		const {Primary, Secondary} = ButtonStyle;
		const {no,edit,undo,gear,group,trophy} = config.emoji;
		const editingButtons = Prompt.createButtonRow([
			{style:Secondary, emoji:group, label:"Edit Teams", custom_id:"editteam"},
			{style:Secondary, emoji:trophy, label:"Edit Outcome", custom_id:"editoutcome"},
			{style:Secondary, emoji:no, label:"Cancel Edit", custom_id:"cancel"}])
		const testingButtons = Prompt.createButtonRow([
			{style:Secondary, emoji:edit, label:"Copy", custom_id:"copy"},
			{style:Secondary, emoji:"⏰", label:"Daily Exp Reset", custom_id:"resetdaily"}
		])
		const builderButtons = Prompt.createButtonRow([
			{style:Primary, emoji:gear, label:"Raw", custom_id:"editraw"},
			{style:Primary, emoji:undo, label:"Reset Edit", custom_id:"clearraw"}
		])
		const components = [editingButtons]
		if (DEBUG) components.push(testingButtons);
		if (builderPerms) components.push(builderButtons);

		const prompt = await interaction.editReply({components})
		const collectArgs = {users:[interaction.user.id]}
		response = await Prompt.collectComponents(prompt, collectArgs)
		const input = response.values ? response.values[0] : null

		if (!input) throw Error(ERROR.CANCELLED);
		else if (input == "cancel") throw Error(ERROR.CANCELLED);
		else if (input == "copy") {
			const copy = {content,embeds:restoreEmbeds,components:restoreComponents};
			await interaction.channel.send(copy)
			await interaction.editReply(copy)
			return;
		}
		else if (input == "editteam") {
			duelData = _reconstructData(duelData);
			duelData = await _editTeams(duelData, interaction);
		}
		else if (input == "editoutcome") {
			duelData = _reconstructData(duelData);
			duelData = await _editOutcome(duelData, interaction, true);
		}
		else if (input == "clearraw") {
			const deleteKeys = ["xpAmt","xpSet","gpAmt","gpSet"]
			duelData.chars.map(c => deleteKeys.forEach(k => delete c[k]))
			duelData = _reconstructData(duelData);
			duelData = await _editTeams(duelData, interaction);
		}
		else if (input == "editraw") {
			duelData = await _editDuelDataRaw(duelData, interaction);
			duelData = _reconstructData(duelData);
			duelData = await _editTeams(duelData, interaction);
		}
		else if (input == "resetdaily") {
			await _resetDaily(duelData, interaction);
			await interaction.editReply({embeds:restoreEmbeds,components:restoreComponents})
			return
		}

		//Clean the duel data and refresh the DM Approval message
		duelData = _cleanData(duelData)
		const dmEmbed = await _sendApprovalMessage(duelData, interaction)

		const sortKeys = {char:SortOrder.ASC,level:SortOrder.DESC}
		duelData.chars.forEach(c => { delete c.xpData; delete c.xpCap; delete c.gpData })
		duelDiff.chars.sort((a,b) => Utils.priorityCompare(a, b, sortKeys))
		duelData.chars.sort((a,b) => Utils.priorityCompare(a, b, sortKeys))
		duelDiff = Utils.deepDiff(duelDiff.chars, duelData.chars, [], ["char"])
		const dataFn = {
			json: (data) => ({name:"Data JSON", value:`\`\`\`json\n${JSON.stringify(data,null,2)}\n\`\`\``}),
			diff: (data) => ({name:"Data Diff", value:`\`\`\`diff\n${data}\n\`\`\``})
		}
		const dataFields = Log.DEBUGFIELDS(duelDiff,dataFn)
		const logEmbed = {embedTitle:"Duel Changelog",embedDesc:BR}
		await Log.EMBED({interaction, channel:config.debug.duel, callstack:false, dataFields, ...logEmbed})
	}
	catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, duelData, error})
	}
}

/// Edit the team configuration of a completed duel
/// @duelData 		- the duelData containing all the characters data.
/// @interaction	- The interaction of the button press
async function _editTeams(duelData, interaction) {
	//Re-group the participants
	duelData.teams = duelData.teams.map(t => t.users)
	duelData = await _groupParticipants(duelData, interaction, true)
	duelData = await _editOutcome(duelData, interaction)
	return duelData
}

/// Edit the outcome of a completed duel
/// @duelData 		- the duelData containing all the characters data.
/// @interaction	- The interaction of the button press
async function _editOutcome(duelData, interaction, forceSelect = false) {
	//Determine the outcome of the duel
	duelData = await _determineOutcome(duelData, interaction, true, forceSelect)

	//Calculate the exp & Clean the data into the minimum necessary
	duelData = _calculateExp(duelData)
	duelData = _calculateGold(duelData)

	//Present the outcome to the players and await confirmation
	const confirm = await _awaitConfirmation(duelData, interaction, true)
	return duelData
}

/// Edit the outcome of a duel
/// @duelData		- The restored participant duel data NOT including teams/outcome/recalculated exp
/// @interaction	- The interaction of the button press
async function _editDuelDataRaw(duelData, interaction) {
	let approved = false
	let edit = {char:false}

	while (!approved) {
		const components = []
		{
			const {yes, no, undo} = config.emoji;
			const buttonRow = Prompt.createButtonRow([
					{style:ButtonStyle.Success, emoji:yes, label:"Accept", custom_id:"accept"},
					{style:ButtonStyle.Secondary, emoji:no, label:"Cancel", custom_id:"cancel"},
					{style:ButtonStyle.Primary, emoji:undo, label:"Reset", custom_id:"reset"}
				])
			//Create a select dropdown of each character
			const charStrFormat = { team:false, user:false, xp:false, gp:false, hp:true, defeat:false,
									calc: false, string: true, data: false }
			const charOpts = duelData.chars.map(c => {
				let desc = _charToString(c, [], charStrFormat).replaceAll(/[\`\*]/g,``)
				return Prompt.createSelectOption(c.char, desc, c.char)
			})
			//Add an option to insert a new character
			charOpts.push(Prompt.createSelectOption("New", "Add a new character from raw JSON", "undefinedchar"))
			const charSelect = Prompt.createSelectRow("char", charOpts, null, null, "Select character to edit");
			components.push(buttonRow, charSelect)
		}

		const prompt = await interaction.editReply({components})

		const buttonCallback = (interaction, args) => { return interaction.customId }
		const callbackMap = {
			"char": { func: _promptDataModal, args: duelData },
			"accept": {func: buttonCallback, args: "accept"},
			"cancel": {func: buttonCallback, args: "cancel"},
			"reset": {func: buttonCallback, args: "reset"}
		}
		const promptArgs = {callbackMap,users:[interaction.user.id]}
		response = await Prompt.collectComponents(prompt, promptArgs)
		const input = response.values ? response.values[0] : null

		if (!input || input == "cancel" || input == "reset") throw Error("Edit cancelled")
		else if (input == "accept") approved = true
		else {
			const char = Object.keys(input)[0]
			const value = input[char]
			if (char == "undefinedchar") duelData.chars.push(value)
			duelData.chars = duelData.chars.map(c => (c.char == char) ? value : c).filter(c => c)
		}
	}

	response = null;

	return duelData
}

/// Prompt the user for updated data
/// @interaction	- The interaction of the button press
/// @duelData		- The duel data to populate the current value of the data modal
async function _promptDataModal(interaction, duelData) {
	const char = interaction.values[0]
	const data = duelData.chars.find(c => c.char == char)
	const jsonStr = JSON.stringify(data, null, `\t`)?.toString() ?? ''

	const textInputParams = { customId:char, label:"Data", style:TextInputStyle.Paragraph, required:false,
							  placeholder:"No data...", min:0, max:4000, value:jsonStr }
	const input = Prompt.createTextInput(textInputParams)
	const modal = await Prompt.promptModal(interaction, char, char, [input]);

	const update = {}
	const value = modal.fields.getTextInputValue(char) || null;

	let content;
	try {
		const json = JSON.parse(value)
		update[char] = json

		if (data?.hasOwnProperty("xpAmt") && json?.hasOwnProperty("xpAmt") && data.xpAmt != json.xpAmt)
			json.xpSet = json.xpAmt
		if (data?.hasOwnProperty("gpAmt") && json?.hasOwnProperty("gpAmt") && data.gpAmt != json.gpAmt)
			json.gpSet = json.gpAmt

		if (char == "undefinedchar") content = `${json?.char} Added`
		else content = json ? `${json?.char} Updated` : `${char} Deleted`
	} catch(e) { Log.DEBUG(e); return null }

	await modal.reply({content,ephemeral:true})
	return update
}

/// Prompt the user for updated data
/// @interaction	- The interaction of the button press
/// @value			- Optional argument containing the default (current) text for the modal
async function _promptTextModal(interaction, value = "") {
	const textInputParams = { customId:"note", label:"Comment", style:TextInputStyle.Paragraph, required:false,
							  placeholder:"Empty", min:0, max:1000, value }
	const input = Prompt.createTextInput(textInputParams)
	const modal = await Prompt.promptModal(interaction, "Comment", "note", [input]);
	value = modal.fields.getTextInputValue("note") || null;
	await modal.deferUpdate()
	//await modal.reply({content:value || "Comment deleted",ephemeral:true})
	return value
}

/// A method for testing purposes to force-reset the daily cap database for duel character(s)
/// @duelData		- the duel data for a given duel
/// @interaction	- The interaction of the button press
async function _resetDaily(duelData, interaction) {
	let done = false;
	while (!done) {
		const components = []
		{
			const {yes,next} = config.emoji;
			const buttonRow = Prompt.createButtonRow([
					{style:ButtonStyle.Secondary, emoji:next, label:"All", custom_id:"all"},
					{style:ButtonStyle.Success, emoji:yes, label:"Done", custom_id:"done"}
				])
			//Create a select dropdown of each character
			const charStrFormat = { team:false, user:false, xp:false, gp:false, hp:true, defeat:false,
									calc: false, string: true, data: false }
			const charOpts = duelData.chars.map(c => {
				let desc = _charToString(c, [], charStrFormat).replaceAll(/[\`\*]/g,``)
				return Prompt.createSelectOption(c.char, desc, c.char)
			})
			const charSelect = Prompt.createSelectRow("char", charOpts, null, null, "Select character to edit");
			components.push(buttonRow, charSelect)
		}
		const prompt = await interaction.editReply({components});
		response = await Prompt.collectComponents(prompt,{users:[interaction.user.id]})
		const input = response.values ? response.values[0] : null

		const reset = []
		if (!input || input == "done") done = true
		else if (input == "all") {
			reset.push(...(duelData.chars.map(c => ({char:c.char, user:c.user, xpAmt: 0, xpCap: 0}))))
			done = true;
		}
		else {
			const c = duelData.chars.find(c => c.char == input)
			if (c) reset.push({char:c.char, user: c.user, xpAmt: 0, xpCap: 0})
		}

		await Utils.asyncArrayForEach(reset, async (c,i) => {
			c = await ExpUtils.resetDuelExp(c);
			await interaction.followUp({content:`${c.char} daily duel exp reset`, ephemeral:true})
		});
	}
}

/*====================*\
|* APPROVAL FUNCTIONS *|
\*====================*/

/// Handle reactions to the exp log message for ease of DM validation
/// @interaction	- The interaction of the button press
async function approveDuel(interaction) {
	await _handleDuelResult(interaction,true)
}

/// Handle reactions to the exp log message for ease of DM validation
/// @interaction	- The interaction of the button press
async function rejectDuel(interaction) {
	if (!interaction.deferred) await interaction.deferUpdate();
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;

	try {
		await _handleDuelResult(interaction,false)
	} catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, duelData, error})
	}
}

/// Handle reactions to the exp log message for ease of DM validation
/// @interaction	- The interaction of the button press
/// @approved		- If the duel in question should be approved or not
async function _handleDuelResult(interaction, approved) {
	if (!interaction.deferred) await interaction.deferUpdate();
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;

	let duelData = null
	try {
		const {yes, no} = config.emoji
		const icon = approved ? yes : no;
		//Disable the components to prevent double-handling
		const componentRow = new ActionRowBuilder(interaction.message.components[0].toJSON())
		componentRow.components.map(x => {x.data.disabled = true; return x})
		const components = [componentRow]
		await interaction.editReply({components})

		//Retrieve the encoded data & update the reset
		duelData = _getEncodedData(interaction?.message,false)
		duelData.reset = DateTime.fromSeconds(duelData.logDate).plus({days:1}).startOf('day').toUnixInteger()
		//Update each character's exp mod
		await Utils.asyncArrayForEach(duelData.chars, async (char,i) => {
			if (approved)	char = await ExpUtils.applyDuelExp(char, duelData.logDate, duelData.reset);
			else			char = {...char, xpMod: 0, gpMod: 0}
			if (char.xpMod == 0 && char.capped) char.gpMod = 0;
			duelData.chars[i] = char;
		})

		//Post the award to the exp log channel
		const logMessage = await _postDuelResultLog(interaction, duelData, approved);
		const logName	= approved ? `${icon} **Duel Approved**` : `${icon} **Duel Rejected**`
		const logValue	= `-# [<t:${DateTime.now().toUnixInteger()}:F>](${logMessage.url})\n<@${interaction.user.id}>`
		duelData.logField = {name:logName, value:logValue}

		//Update the DM approval message
		const undo = Prompt.createButtonRow([{style:ButtonStyle.Primary, emoji:"↩️", label:"Undo", custom_id:"duel.undo"}])
		components.push(undo)
		const approveMsg = await _sendApprovalMessage(duelData, interaction, components);

		//Add a react to the original initiative post when approved by a DM
		await MsgUtils.reactToMessageURL(interaction.guild, duelData.urls.duel, icon);
	} catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, duelData, error})
	}
}

/// Handle reactions to the exp log message for ease of DM validation
/// @interaction	- The interaction of the button press
async function undoResult(interaction) {
	await interaction.deferUpdate();
	const content = interaction?.message?.content
	const restoreEmbeds = interaction?.message?.embeds//?.[0]?.toJSON();
	const restoreComponents = interaction?.message?.components;

	let duelData = null
	try {
		//Remove the components
		interaction.editReply({components:[]})
		//Retrieve the encoded data
		duelData = _getEncodedData(interaction?.message,false)

		//Delete the result field from the DM approval message
		const embed = EmbedBuilder.from(restoreEmbeds[0])
		const field = embed.data.fields.pop();
		//Retrieve and delete the logged message from the exp log channel
		const message = await MsgUtils.getMessageFromURL(interaction.guild, field.value)
		await message?.delete();
		//Remove all reacts to the original initiative post
		await MsgUtils.reactToMessageURL(interaction.guild, duelData.urls.duel, null);

		//Update each character's exp mod
		await Utils.asyncArrayForEach(duelData.chars, async (char,i) => {
			if (char.xpMod) char = await ExpUtils.undoDuelExp(char);
			(["xpMod","xpCum","capped","gpMod"]).forEach(k => delete char[k]);
			duelData.chars[i] = char
		})

		//Re-post the approval message
		duelData = _reconstructData(duelData)
		duelData = _calculateExp(duelData)
		duelData = _calculateGold(duelData)
		duelData = _cleanData(duelData)
		duelData = _cleanData(duelData)
		const approveMsg = await _sendApprovalMessage(duelData, interaction);
	} catch (error) {
		await _handleComponentError({interaction, restoreEmbeds, restoreComponents, duelData, error})
	}
}

/// Post the approved exp message to the Exp Log channel
/// @interaction	- The interaction of the button press
/// @duelData		- The duel data to populate the embed
async function _postDuelResultLog(interaction, duelData, approved) {
	const date		= DateTime.fromSeconds(duelData.logDate);
	const format	= `dd LLLL yyyy [ hh:mma ]`	//`DD [ hh:mma ]`
	const fullDate	= date.toFormat(format)
	const guild		= interaction.guild;

	const {yes, no} = config.emoji
	const icon = approved ? yes : no;
	const {urls, chars, comments} = duelData;
	const {roleplay, duel, transcript} = urls;
	const charFieldArgs = { string:false, hp:false, defeat:false };

	const desc		= `${icon} **Duel ${approved ? 'Approved' : 'Rejected'}**${BR}`
	const instruct	= approved ? INSTRUCT.LOG_FOOTER : ``
	const fields 	= chars.map(c => _charToString(c, chars, charFieldArgs));
	if (comments) fields.push(...comments);

	fields.push({name:"** **", value:`-# [Roleplay](${roleplay}) / [Duel](${duel}) / [Transcript](${transcript})\n${instruct}-# Next Daily Exp Reset (from time of duel) <t:${duelData.reset}:R>\n-# <t:${duelData.reset}:F>`})

	const matchup	= duelData.matchup ? ` (${duelData.matchup})` : ``
	const logEmbed	= new EmbedBuilder().setTitle(`${DUELTITLE}${matchup}`)
										.setThumbnail(DUELTHUMB)
										.setDescription(desc)
										.setFields(fields)

	const players	= []
	chars.forEach(c => { if (c.xpMod > 0 && !players.includes(c.user)) players.push(c.user) })
	const content	= players.map(p => `<${PING_PREFIX}${p}>`).join('');

	const logChan = await guild?.channels?.resolve(xpLogChannel)
	const message = await logChan.send({content,embeds:[logEmbed]})
	return message;
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

module.exports = {
	processDuel,
	editDuel,
	noteDuel,
	toggleCalculations,
	approveDuel,
	rejectDuel,
	undoResult,
	resetDuelButton
}

///
async function _testConfirm(interaction) {
	{
		const embed = new EmbedBuilder().setTitle("Inline Test")
										.setDescription("This is a test of the inline functionality")
		const prompt = await interaction.editReply({content:"Inline Test",embeds:[embed]})
		const result = await Prompt.confirmDialog(interaction, prompt, [], true)
	}
	{
		const embed = new EmbedBuilder().setTitle("Followup Test")
										.setDescription("This is a test of the followup functionality")
		const reply = await interaction.editReply({content:"Followup Test",embeds:[embed]})
		const prompt = new EmbedBuilder().setTitle("Followup Prompt").setDescription("Followup prompt")
		const result = await Prompt.confirmDialog(interaction, {embeds:[prompt]}, [], false)
	}
}
