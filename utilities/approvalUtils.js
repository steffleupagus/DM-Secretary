const { ActionRowBuilder, EmbedBuilder, ButtonStyle, MessageMentions, TextInputStyle, MessageFlags } = require('discord.js')
const { DateTime } = require("luxon");
const { SortOrder } = require(`./enums.js`)
const {INSTRUCT,ERROR,SORTKEYS} = require(`./constants.js`)

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
const fs = require('fs');

const PING_PREFIX = config.DEV ? "-" : "@";
const DUELTHUMB = "https://i.imgur.com/2U90DwW.png";
const SCENETHUMB = "https://i.imgur.com/pz8sI6M.png";
const JSONURL = "http://tinyurl.com/tjson?input="

const THUMBNAILS = {"duel":DUELTHUMB, "scene":SCENETHUMB}

const charStrFormat = { user:true, xp:true, gp:true, lp:true, hp:true, team:true, rpas: true,
	defeat:true, calc:false, field:false, data:false, shownull:true }
const playerStr = { ...charStrFormat, xp:false, gp:false, lp:false, shownull:false }
const debugStr = { ...charStrFormat, shownull:false }
// Data presentation methods
{
	// Convert character data into an Embed field
	function _charToField(char, charList, args = charStrFormat) {
		//Populate args with defaults and override with passed in values
		args = {...charStrFormat, ...args}
		const asField = args.field || false === args.string

		//Get the various elements that might potentially be displayed
		const e = _charToElements(char, charList, args)
		//Format the elements
		e.type	= (e.type) ? `**${e.type}**` : ``
		e.user	= (args.user) ? `<@${char.user}>` : ``
		e.data	= (args.data && e.data) ? ` | [[\`Data\`](${e.data})]` : ``
		e.hp	= (args.hp && e.hp) ? ` | HP: ${e.hp}` : ``
		e.xp	= (args.xp && e.xp) ? `${config.emoji.xp} ${e.xp}` : ``
		e.gp	= (args.gp && e.gp) ? `${config.emoji.gp} ${e.gp}` : ``
		e.lp	= (args.lp && e.lp) ? `${config.emoji.lp} ${e.lp}` : ``
		e.xpcalc= (args.calc && e.xpcalc) ? e.xpcalc : ``
		e.gpcalc= (args.calc && e.gpcalc) ? e.gpcalc : ``
		e.lpcalc= (args.calc && e.lpcalc) ? e.lpcalc : ``
		e.team	= (args.team && e.team) ? `\n-# *Team:* ${e.team}` : ``
		e.rp_as	= (e.rp_as) ? `\n-# *RP as:* ${e.rp_as}` : ``
		e.defeat= (args.defeat && e.defeat) ? `\n-# \t*Defeated:* ${e.defeat}` : ``

		if (!asField) e.user = `-# - ${e.user}`
		if (args.compact) e.rewards = ([e.xp,e.gp,e.lp]).filter(x=>x).join(" | ")

		//Define the embed field or string values
		const name	= `${e.type}\`${char.char}\` (Level \`${char.level}\`)`
		const value = `${e.user}${e.hp}${e.data}${e.team}${e.defeat}` +
					  `${e.xp}${e.xpcalc}${e.gp}${e.gpcalc}${e.lp}${e.lpcalc}`
		return asField ? { name, value } : `${name}\n${value}`
	}

	// Assemble character data into distinct elements that can be combined in various ways for display
	function _charToElements(char, charList, args) {
		const type	= _charTypeString(char, args)
		const team	= _charTeamString(char, charList)
		Log.TODO("Add 'Roleplay As' list to _charToElements")
		const defeat = _defeatedCharList(char, charList)

		const hp	= `<\`${char.hpCur}\`/\`${char.hpMax}\`>`

		const xpAmt = char.xpSet ?? char.xpMod ?? char.xpAmt ?? null
		const xpCum = char.xpCum ? `\`Cap\`: ||${char.xpCum} / ${char.xpCap}||` : `of \`${char.xpCap ?? '??'}\` cap`
		const xp	= (xpAmt === null) ? (args.shownull ? `\`No xp data\`` : ``) : `\`${xpAmt}\`xp [${xpCum}]`
		const xpcalc = _charExpDetails(char, args)

		const gpAmt = char.gpSet ?? char.gpMod ?? char.gpAmt ?? null
		const gp	= (gpAmt/* !== null*/) ? `\`${gpAmt}\`gp` : null
		const gpcalc = (gpAmt === null) ? null : _charGoldDetails(char)

		Log.TODO("Add Loot Point calculations to _charToStringElements")

		const {xpCap, xpData, gpData, lpData, ...encode} = char
		const data  = _encodeDataURL(encode)
		return {type, team, xp, gp, hp, defeat, data, xpcalc, gpcalc}
	}

}



/// Pause and wait for confirmation from the player(s) before continuing
/// @data			- Data gathered from the initiative / scene
/// @interaction	- Original interaction, needed for player input
const confirmArgs = { cmd: null, edit: false, thumb:null, channel:null, fieldArgs:{} }
async function AwaitConfirmation(interaction = null, data = null, args = confirmArgs) {
	const { cmd, edit } = args = {...confirmArgs, ...args}

	// Get a list of users who can respond to the confirmation prompt
	const users = data.chars.map(c => c.user)
	// Sort characters based on the type of command being confirmed
	data.chars.sort((a,b)=>{ return Utils.priorityCompare(a, b, SORTKEYS[cmd]) })

	// Process character data into fields - don't show rewards in confirmation.
	const rewardFields = { xp:false, gp:false, lp:false }
	const fieldArgs = {cmd, field: true, ...rewardFields, ...args.fieldArgs};
	const fields = data.chars.map(c => _charToField(c, data.chars, fieldArgs));
	const errors = _errorsToFields(data.errors,!edit);
	// Push collected errors in the data into the embed fields
	fields.push(...errors)

	// Construct the embed and edit the interaciton reply
	const embed = new EmbedBuilder().addFields(fields)
	const thumb = args.thumb ?? THUMBNAILS[cmd] ?? null
	if (thumb) embed.setThumbnail(thumb)

	// Edit or send the embed
	if (interaction) await interaction.editReply({embeds:[embed],components:null})
	else if (args.channel) await args.channel.send({embeds:[embed],components:null})
}


async function _awaitConfirmation(data, interaction, args = confirmArgs) {

	// Build confirm prompt embed
	const {tu:yes, td:no} = config.emoji;
	const content = users.map(x => `<${PING_PREFIX}${x}>`).join(" ");
	const desc	= `${STEP.CONFIRMATION}\n${INSTRUCT.CONFIRM(yes,no)}\n${CONTACT}`
	const prompt = new EmbedBuilder().setTitle("Confirmation").addFields(fields)
									 .setFooter({text:INSTRUCT.CONFIRM_FOOTER(yes,no)})
									 .setDescription(desc)
	if (args.thumb) prompt.setThumbnail(args.thumb)
	// Send confirm prompt and wait for user input
	const confirm = await Prompt.confirmDialog(interaction, {content, embeds:[prompt]}, users, true);
	const cancelled = `${ERROR.CANCELLED}\nIf your level is wrong:\n${INSTRUCT.REFRESH}${CONTACT}`;
	if (!confirm || confirm == no) throw Error(cancelled, {cause:duelData})

	return true;
}














/// Convert the provided data into embed fields & strings
function _charToString(char, charList, args = charStrFormat) {

}


/// Character outcome type
function _charTypeString(char, args) {
	//Possible icons
	const {trophy, skull, scale, xp, rpp} = config.emoji;
	const xpAmt = char.xpSet ?? char.xpAmt ?? null
	const types = { 0: `${skull} Defeat: `, 1: `${trophy} Victor: ` }
	const noWin	= !char.hasOwnProperty('win') || !char.hasOwnProperty('xpAmt')
	const noExp = !xpAmt;
	let type	= (args.cmd == "duel") ?
						( noWin ? null : types[char.win] ) :
						`${noExp ? rpp : xp} `
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
function _charExpDetails(char, args) {
	if (!char?.xpData) return null
	let { capTotal, totalPool, poolPct, xpMult, unCapExp, partial } = char.xpData
	let type = null
	if (args.cmd != "duel") partial ? "partial victory" : (char.win ? "victor" : "defeat")
	if (type) type = ` (*${type}*)`

	//xpMult = partial ? PARTIAL_XP : (char.win ? VICTOR_XP : DEFEAT_XP)
	xpMult = Utils.precise(100 * xpMult,1)
	poolPct = Utils.precise(100 * poolPct,1)
	unCapExp = Math.round(unCapExp)
	capExp = (unCapExp>char.xpAmt) ? ` => Capped: \`${char.xpAmt}\`` : ``
	xpSet = char.hasOwnProperty("xpSet") ? `\n-# -\t• \`Manual Override\`: \`${char.xpSet}\`` : ``
	const summary = `
-# - \`${char.xpCap}\` (*xp Cap*) / \`${capTotal}\` (*team cap*) = \`${poolPct}%\` (*pool %*)
-# - \`${totalPool}\` (*exp pool*) * \`${xpMult}%\`${type} * \`${poolPct}%\` (*pool %*) = \`${unCapExp}\`${capExp}xp${xpSet}`
	return summary
}
function _charGoldDetails(char) {
	if (!char?.gpData || !char?.xpData) return null
	let { cap, capTotal, totalPurse, poolPct, gpMult, uncapGold } = char.gpData
	let { partial } = char.xpData
	type = char.xpData.partial ? "partial victory" : (char.win ? "victor" : "defeat")
	gpSet = char.hasOwnProperty("gpSet") ? `\n-# -\t• \`Manual Override\`: \`${char.gpSet}\`` : ``
	//gpMult = partial ? PARTIAL_XP : (char.win ? VICTOR_XP : DEFEAT_XP)
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
	if (!errors) return [];
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














module.exports = {
	AwaitConfirmation
}







function generatePlayerConfirmEmbed(expData)
{
	let embed = new Embed();
	embed.setTitle(SCENE_EMBED_TITLE);
	embed.setDescription(SCENE_EMBED_DESC);
	embed.setFooter({text:SCENE_EMBED_FOOTER});

	const data = expData.filter(x=>(x.level > 0 && x.xp > 0));
	const npcs = expData.filter(x=>(x.level == NPC && x.xp > 0)).map(x=>`${x.char} (<@${x.user}>)`).join('\n').trim();
	const skip = expData.filter(x=>(x.level <= SKIP && x.xp > 0)).map(x=>`${x.char} (<@${x.user}>)`).join('\n').trim();
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
	return embeds
}



///
/// Pause and wait for confirmation from the player(s) before continuing
///
async function awaitConfirmation(interaction, expData)
{
	const players = [];
	expData.map(x => { if (!players.includes(x.user)) players.push(x.user); })
	const pings = `<${PING_PREFIX}${players.join("> <"+PING_PREFIX)}>`;

	const embeds = generatePlayerConfirmEmbed(expData)
	let   embed  = embeds.shift();

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
		embed.setDescription(`If your level was incorrect:\n${inst}\nIf you need help, please ask a <@&${config.role.DMOnDuty}>`);
		interaction.editReply({embeds:[embed],components:[]})
	}

	return confirm;
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

	const title = footer.includes("auto-close") ? SCENE_EMBED_TITLE_AUTO : SCENE_EMBED_TITLE;

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
		if (data.xp <= 0 || level <= SKIP) level = "Skip"
		else if (level == NPC) level = "NPC"
		data.rp.days = data.rp.days || data.daily?.length || 0;

		let title  = `${data.char} (${level})`
		let encode = encodeURIComponent(JSON.stringify(data));
			encode = ` | [Data](${JSONURL}${encode})`
		//Hack to make sure the data won't overflow the max size of the embed value
		data.daily = data.daily.slice(0,3);
		let shortEncode = encodeURIComponent(JSON.stringify(data));
			shortEncode = ` | [Data](${JSONURL}${shortEncode})`

		let value  = ""
		if (data.name != data.char)
		{
			data.name = data.name.split("\u200B").join("`,`")
			value += `*RP as \`${data.name}\`*\n`
		}
		if (data.rpp >= 0)
			value += `<@${data.user}>: ${config.emoji.rpp}\`${data.rpp}\` RPP\n`
		else //if (data.xp >= 0)
			value += `<@${data.user}>: \`${data.xp}x\` Cap\n`

			value += `**Days:** \`${data.rp.days}\` | **Posts:** \`${data.rp.posts}\` | **Length:** \`${data.rp.length}\``

		let fieldLength = (value.length + encode.length)
		if (fieldLength >= embed.MAX.FIELD)
		{
			console.log("Full encode too long. Using short encode")
			value += shortEncode
		}
		else
		{
			console.log("Full encode fits field. Using full encode")
			value += encode
		}

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
	const dmPingChan = await interaction.guild.channels.resolve(dmPingChannel);
	const buttonRow = getApprovalButtonRow(interaction)

	//Handle the travel attachment
	let travel = interaction.client.commands.get(`travel${config.DEV ? "dev" : ""}`)
		travel = await travel?.attach?.dmPing?.(interaction.channel)
		travel = travel?.components[0]
	if (travel)
		buttonRow.addComponents(travel)

	await embed.send(dmPingChan, `<@&699439189447671889><${PING_PREFIX}&${config.role.DMOnDuty}>`, //attachButtons);
					 (message) => message.edit({ components:[buttonRow] }))
}

function getApprovalButtonRow(interaction)
{
	const row = Prompt.createButtonRow([
		{style:ButtonStyle.Success, emoji:"✅", label:"Approve", custom_id:"scene.approve"},
		{style:ButtonStyle.Danger, emoji:"❌", label:"Reject", custom_id:"scene.decline"},
		{style:ButtonStyle.Secondary, emoji:"📝", label:"Edit", custom_id:"scene.edit"}
	])
	return row;
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
