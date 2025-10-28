const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`)
const { SortOrder } = require(`./enums.js`)

const PING_PREFIX = config.DEV ? "-" : "@";
const BR = `\n\`${' '.repeat(69)}\``
const DM_PING = `<${PING_PREFIX}&${config.role.DMOnDuty}>`
const XP_CHAN = config.DEV ? config.debug.xpLog : config.chan.xpLog;
const CONTACT = `*If you need help, contact ${DM_PING} for assistance.*\n${BR}\n`

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
	PENDING_APPROVAL: (msg) => `***Please wait** a [@Helper](${msg}) will review this information as soon as possible.`+
							   `Awards will be posted in <#${XP_CHAN}> once it has been reviewed.*\n`+CONTACT,
//Duel Approved
	LOG_FOOT_XP: `-# Log your gains in <#${config.chan.xpSpam}>\n-# - ${config.emoji.xp} \`!xp <#>\`\n`,
	LOG_FOOT_GP: `-# - ${config.emoji.gp}  \`!coins <#>\`\n`,
	LOG_FOOT_LP: `-# - ${config.emoji.lp} \`!loot <#>\`\n`
}
INSTRUCT.LOG_FOOTER = INSTRUCT.LOG_FOOT_XP+INSTRUCT.LOG_FOOT_GP+INSTRUCT.LOG_FOOT_LP

const ERROR = {
	//Data acquisition & state flow errors
	WRONG_CHANNEL_DUEL: `Cannot process duels in this channel.\n${BR}`,
	PROCESSING_DUEL: `Already processing this duel\n${CONTACT}`,
	ACTIVE_DUEL: `**Duel Active**\nEnd the duel with \`!i end\` and run this command again.\n${CONTACT}`,
	NO_MECH_CHAN: (chan) => `**No duel found**\n*No mechanics thread found. (<#${chan}>)*\n${CONTACT}`,
	NO_DUEL_DATA: `**No duel found**\nThe most recent duel may have already been processed.\n${CONTACT}`,
	IN_RP_CHAN: (chan) => `**No duel found**\n*You must run this command in the Mechanics thread (<#${chan}>)*`,
	NO_RP_CHAN: (chan) => `**No roleplay found**\n*No roleplay channel found. (<#${chan}>)*\n${CONTACT}`,
	NO_RP_DATA: `**No roleplay found**\nThere is no RP found for the current duel.\n${CONTACT}`,
	PARTICIPATE: `Could not confirm sufficient participation to process this duel.\n${INSTRUCT.SETUP}\n${CONTACT}`,
	NO_OUTCOME: `Could not determine the duel outcome.\n${INSTRUCT.SELECTWIN}\n${CONTACT}`,

	SCENE_LOCKED: `Already processing this scene\n${CONTACT}`,
	DUEL_CHANNEL: `Cannot process scenes in this channel.\nRun \`/duel\` in the mechanics thread.\n${BR}`,
	NORP_CHANNEL: `Cannot process scenes in this channel. (Not an RP channel)\n${BR}`,

	CANCELLED: `Command cancelled.`,
	DUEL_ABORTED: `Duel aborted.`,

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
/// Execution Stages & grouped variables
const STEP = {
	CONFIRM_CHAN: "Verifying channels & threads.",
	GET_ROLEPLAY: "Gathering RP posts and compiling roleplay data.",
	EXTRACT_INIT: "Parsing duel events and compiling character data & transcript.",
	FETCH_LEVELS: "Fetching level data from database and calculating exp caps.",
	COLLATE_DATA: "Processing & combining data.",
	CONFIRM_DATA: "Validating and confirming participant data.",
	TEAMS_GROUPS: "Grouping participants.",
	FIND_OUTCOME: "Determining outcome.",
	CALC_WIN_EXP: "Calculating particpant experience.",
	CONFIRMATION: "Awaiting player confirmation.",
	DUEL_SUMMARY: "Generating transcript.",
	APPROVE_PEND: "Sending to DMs for approval.",
	CLOSING_DUEL: "Closing channel / thread."
}

const SORTKEYS = {
	// - winners/team/level/curHP for duels
	"duel":	{ "win":SortOrder.DESC, "team":SortOrder.ASC, "level":SortOrder.DESC, "hpCur":SortOrder.DESC }, /* Duel Sort */
	// - user / char / level for scenes
	"scene":{ "user":SortOrder.ASC, "char":SortOrder.ASC, "level":SortOrder.DESC } /* Scene Sort */
}

module.exports = {
	INSTRUCT,
	ERROR,
	STEP,
	SORTKEYS
}