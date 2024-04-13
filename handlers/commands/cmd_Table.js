const { 
		SlashCommandBuilder,
		PermissionsBitField, 
		EmbedBuilder, 
		ChannelType,
		ThreadAutoArchiveDuration,
		ButtonStyle,
		ActionRowBuilder,
		TextInputBuilder,
		TextInputStyle	
	  } = require('discord.js')
const mongoose = require('mongoose');
const Prompt = require(`../../utilities/promptUtils.js`)
const Tables = require(`../../database/tableSchema.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const TableUtils = require(`../../utilities/funcsTable.js`)
const Mutex = require(`../../utilities/mutexUtils.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const SPACER = `\`                                                                     \``
const GOALS = `Goals:
- Enables those who want to to run a quest or one-shot
- Gives people a chance to practice DMing
- Gives people chances to play without DM availability limits
- Gives staff a chance to see how potential DM's run
 - (part of the DM application process)
- No permanent effects / character changes / death
- No Exp / Loot can be awarded to players
- RP exp, gold, loot points are automatically awarded
- NOT intended for simple RP - we have RP channels for that
- ONE character per player. Run \`!vsheet\` in the OOC thread
`
const REQUIREMENTS = `Requirements: 
- ~~Interface consists of an embed and two buttons~~
 - ~~Embed lists existing tables & the DM~~
  - ~~Limit of 25 max tables to display in a single embed~~
 - ~~Create Table button~~
   - ~~Verify Table can be created~~
	 - ~~Verify the user is authorized to create a table~~
	 - ~~Verify the person creating the table doesn't already have one open~~
	 - ~~Verify a table can be created (hasn't hit the max number of tables)~~
   - ~~If table creation permitted~~
	 - ~~Prompts for a name & Create three threads~~
	   - ~~🗣 RP thread for IC interaction (RP awards exp)~~
	   - ~~:game_die: OOC/Roll thread for OOC and rolling~~
	   - ~~⚙ DM screen private thread only visible to the DM who created the table~~
	 - ~~Set auto-archive duration of all threads to a week~~
	  - __**On archive, auto-close the table as with the second button**__
	 - ~~Set up a DB record for the table~~
	  - ~~Store user ID and thread IDs~~
	 - ~~Update embed to display the newly opened table~~
	   - ~~Include DM & links to public threads~~
 - ~~Close Table button~~
   - ~~Verify user is table DM or Mod staff~~
   - __**Awards RP exp from the RP thread**__
   - ~~Archive threads (for future review, if necessary, to avoid abuse)~~
   - ~~Remove from Embed~~
   - ~~Update thread to mark table Archived~~
   - ~~Mod staff has option to delete table threads & DB record once verified~~
__**Tables should auto-close when Discord archives the threads.**__`
const TABLE_MENU_CHAN = "1123074833857646702";
const TABLE_MENU_TITLE = `Free-Use Tables`
const TABLE_MENU_DESC = `**Free-||~~use~~||Play Tables**\n${GOALS}`
const USER_SLASH_COMMAND_REPLY = `To start or close a table, please use the buttons in <#${TABLE_MENU_CHAN}>.`

const DM_MSG = (user) => `<@${user}>: This channel represents your private behind-the-DM-screen area\n- \`Adding Bots\`: <@${config.bots.avrae}><@${config.bots.tupper}>`
const OOC_MSG = (user) => `This is the OOC and Mechanics/rolling channel.\n\n- \`Adding Bot(s)\`: <@${config.bots.avrae}>\n- <@${user}>: *@ping your players in this channel to get started!*\n- Each player **including the DM** __MUST__ run a \`!vsheet\` command in this channel\n\n*Only one character per player will earn RP exp*. The \`!vsheet\` command will help the bot determine to which character that experience should be awarded. __Failure to do so *may result in receiving no experience!*__`
const RP_MSG = (user) => `This is the RP channel\n- \`Adding Bot(s)\`: <@${config.bots.tupper}>\n- <@${user}>: *@ping your players in this channel to get started!*`

const TABLE_CREATE_DESC = `
	Ping your players in your \`OOC\` and \`RP\` threads. 
	\`DM Screen\` is a private thread for you to use for monster lookup & hidden rolling.`
const TABLE_UPDATE_DESC = TABLE_CREATE_DESC
const TABLE_ARCHIVE_DESC = `
	When a table is archived, threads will still be archived and __**locked**__ for review & exp award by a DM.`
const TABLE_DELETE_DESC = `Table Deleted`
const TABLE_AWARD_DESC = `Table RP has been processed for DM & Player rewards\n${config.emoji.xp}💰💎`

const ARCHIVE_CONFIRM = `This will archive and lock the following table and all associated threads.\n**__Warning__: You will not be able to undo this.**`
const DELETE_CONFIRM = `This will delete the following table and all associated threads.\n**__Warning__: You will not be able to undo this.**`

const ERROR_USER_LOCKED = `Already processing a request. Please wait.`



const MAX_TABLE_COUNT = 25
const ERROR_MAX_TABLES = `Maximum active tables (${MAX_TABLE_COUNT}) reached.`
const TITLE_LEN = 40
const NAME_LEN = 10
const DESC_LEN = 200
const LIMIT_ONE_TABLE = true
const ALLOWED_ROLES = [ "1181029591276593152" ];
const PREVENT_ROLES = [ "1181029720188538950" ];

const TEST_MODE = true
const debugUserAwardButton = true

async function blindRefresh(channel)
{
	if (!channel) return
	const messages = await channel.messages.fetch({limit:1})
	const message = messages.first();
	console.log(message.id)
	
	const embed = await getTableListEmbed()
	await message.edit({embeds:[embed]})
}

/// Run the slash command
async function execute(interaction){
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);
	if (isBuilder)
	{
		//TODO - Handle using this command to close or delete a thread
		await interaction.deferReply({ephemeral:true})
		const embed = new EmbedBuilder().setDescription(REQUIREMENTS);		
		const tables = await getTableListEmbed();
		const buttons = getTableMenuButtons();
		await interaction.channel.send({embeds:[embed]})
		await interaction.channel.send({embeds:[tables], components: [buttons]})
		await interaction.editReply("Done.");
	}
	else
	{
		await interaction.reply(USER_SLASH_COMMAND_REPLY);
	}
}

/// Handle the menu interactions
async function handleInteraction(interaction){
	const customId = interaction.customId;
	const member = interaction.member;
	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")	
	const command = customId.replace(prefix,"");
	let update = false;
	let error = false;
	let table = null;
	let debug = new EmbedBuilder().setAuthor({name: member.displayName, iconURL: member.displayAvatarURL()})
	let operation = command.replace("Table","")
		operation = operation.charAt(0).toUpperCase() + operation.slice(1);
	let opDesc = "";
	try { Mutex.Lock(interaction.member, ERROR_USER_LOCKED) } catch (e) { error = e; }
	if (!error){
		switch(command)
		{
			case "createTable":
				opDesc = TABLE_CREATE_DESC;
				//Don't defer since we need to throw a modal
				try { table = await createTable(interaction) } catch (e){ error = e; }
				break;
			case "updateTable":
				opDesc = TABLE_UPDATE_DESC;
				//Don't defer since we need to throw a modal
				try { table = await updateTable(interaction) } catch (e){ error = e; }
				break;
			case "closeTable":
				operation = "Archive"
				opDesc = TABLE_ARCHIVE_DESC;
				//Don't defer since we may send a reply or update depending
				try { 
					table = await closeTable(interaction) 
					if (table?.deleted) 
					{
						operation = "Delete"
						opDesc = TABLE_DELETE_DESC;
					}
					else if (table?.awarded)
					{
						operation = "Awarded"
						opDesc = TABLE_AWARD_DESC
					}
				} catch (e){ error = e; }
				break;
			case "refreshList":
				update = new EmbedBuilder().setDescription("Table List is up to date.")
				await interaction.deferUpdate({ephemeral:true});
				break;
		}
		Mutex.Unlock(interaction.member);
	}

	if (update) {}
	else if (table) update = getTableReplyEmbed(table,operation,opDesc)		
	else if (!error) error = "No table to perform operation"
	if (error){		
		update = new EmbedBuilder().setTitle("Cannot Complete Command").setDescription(error.toString());
	}else{	//Don't update if we're throwing an error.
		if (!interaction.deferred && !interaction.replied)
			await interaction.deferUpdate({ephemeral:true});
		const embed = await getTableListEmbed()
		await interaction.message.edit({embeds:[embed]})
		// 	await interaction.editReply({embeds:[embed]})
	}
	if (update) {
		if (!interaction.deferred && !interaction.replied)
			await interaction.reply({content:customId,embeds:[update], ephemeral: true})
		else
			await interaction.followUp({content:customId,embeds:[update], ephemeral: true})
	}
	if (debug){		
		debug.addFields({name:"User",value:`<@${interaction.member.id}>`})
		if (update)
		{		
			update = update.data
			if (update.title) debug.setTitle(update.title)
			if (update.fields) debug.addFields(update.fields)
			if (update.description) debug.addFields({name:"Output",value:update.description})
		}
		if (error && error.stack) debug.setDescription("```\n"+error.stack+"\n```")
		//console.log("Debug",debug,table)
		debug.setFooter({text:`${customId} | ${(table ? table._id?.toString() : "")}`})	
		const debugChanId = config.debug.table
		const debugChan = await interaction.guild?.channels?.fetch(debugChanId);
		if (debugChan) await debugChan.send({embeds:[debug]});
	}
	
	return;
}

const data = new SlashCommandBuilder()
	.setName(`table${config.DEV ? "dev" : ""}`)
	.setDescription('Open a temporary table')

const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.role.Builder, config.role.Moderator	];

module.exports = 
{
	data: data,
//	whitelistRoles: { [InteractionType.ApplicationCommand] : whitelistRoles },
//	userPermissions: { [InteractionType.ApplicationCommand] : userPermissions },
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,
	autoClose: autoClose,

	build:config.DEV //||config.PRODUCTION
};

/// Menu interaction buttons for the main table embed
function getTableMenuButtons() {
	const options = [
		{style:ButtonStyle.Success,		emoji:"🗺️", label:"Create Table", 	custom_id:`${data.name}.createTable`},
		{style:ButtonStyle.Secondary,	emoji:"📝", label:"Edit Table", 	custom_id:`${data.name}.updateTable`},
		{style:ButtonStyle.Danger,		emoji:"✖️", label:"Close Table", 	custom_id:`${data.name}.closeTable`	},
		{style:ButtonStyle.Primary,		emoji:"🔄", label:"Refresh List",	custom_id:`${data.name}.refreshList`}
	]
	return Prompt.createButtonRow(options)	
}

/// Generate a field containing a single table's details
function getTableField(table, cap = null) {
	const threads = `<#${table.oocThread}> <#${table.rpThread}>`
	const datestamp = table.archived ?	`*archive* <t:${table.archived}:R>` : 
										`*created* <t:${table.created}:R>`	
	let value = `**DM**: <@${table.user}>\n${threads} ${datestamp}`
	cap = cap ?? (1024 - value.length - 6)	
	let desc = table.desc.substring(0,cap) || ""
	if (desc.length < table.desc.length) desc += "..."
	if (table.archived) desc = ""
	if (desc) desc = `*${desc}*\n`	
	value = `${desc}${value}`.trim()
	return {name:table.title, value:value}
}

/// Generate the embed that lists all the tables
async function getTableListEmbed() {
	//Find all the active tables we have a reference of in the database
	let tables = await getAllTables();
	const archived = tables.filter(t=>t.archived);
	const footer = `Archived: ${archived.length}`
	tables = tables.filter(t=>(0 == t.archived));	

	let totalLen = TABLE_MENU_TITLE.length + TABLE_MENU_DESC.length + SPACER.length + footer.length;
	let count = 0
	const fieldTotal = tables.reduce( (total, t) => {
		const field = getTableField(t)
		if (t.desc.length > 0) ++count;
		return total + field.name.length + field.value.length
	}, 0)
	totalLen += fieldTotal;

	let cap = DESC_LEN;
	let fields = [];
	if (totalLen > 6000)
	{
		const over = Math.round( (totalLen - 6000) / count )
		cap = over < DESC_LEN ? DESC_LEN - over : 0
		totalLen = TABLE_MENU_TITLE.length + SPACER.length + footer.length;
	}

	tables.forEach(t => {
		const field = getTableField(t, cap)
		fields.push(field)
		totalLen += field.name.length + field.value.length
	});

	const embed = new EmbedBuilder().setTitle(TABLE_MENU_TITLE)
	embed.setDescription(TABLE_MENU_DESC+"\n"+SPACER);
	if (cap < DESC_LEN) embed.setDescription(SPACER)	
	if (fields.length) embed.addFields(fields);
	if (archived.length > 0) embed.setFooter({text:footer})
	return embed;	
}

/// Get the standardized reply to a single table operation
function getTableReplyEmbed(table, operation="Operation", opDesc="") {
	const desc = table.desc ? `*${table.desc}*\n` : ""
	//Prepare & reply to the user who clicked the button
	const inline = table.name.length <= 10
	const fields = [
		{name:`__**${table.title}**__`, value:`${desc} **DM**: <@${table.user}>`},
		{name:"OOC Thread", value:`<#${table.oocThread}>`, inline:inline},
		{name:"RP Thread", value:`<#${table.rpThread}>`, inline:inline},
		{name:"DM Screen", value:`<#${table.dmThread}>`, inline:inline},
	]
	const reply = new EmbedBuilder().setTitle(`Table ${operation}`)
									.setDescription(opDesc || "** **")
									.addFields(fields);
	return reply;
}

/// Get two lists of tables: active and archived
async function getSelectableTables(archived) {
	let tables = await getAllTables();
	tables = tables.filter(t => archived == (t.archived > 0))
	//Cap the number of tables displayed at 25 (limit of field & select count)
	if (archived) 
		tables.sort((a,b) => a.archived - b.archived)
	else
		tables.sort((a,b) => a.created - b.created)	
	tables = tables.slice(0,25)
	return tables
}

///Process tables to create a selection menu
function getTableSelectMenu(tables, customId, hint) {
	if (tables.length > 0)
	{
		tables = tables.map( t => 
			{
			let archivedStr = ""
			if (t.archived)
			{
				let newDate = new Date();
				newDate.setTime((t.archived-6*60*60)*1000);
				archivedStr = "Closed: " + newDate.toLocaleString();
			}

			const label = `${t.title} (${t.name})`
			return Prompt.createSelectOption(label, archivedStr, t._id.toString())
		})

		tables = Prompt.createSelectRow(customId, tables, 0, 1, hint);
	}
	return tables;
}

/// Attempt to get the table on which to perform an operation
async function getTableArg(interaction, isBuildMod = false, callbacks = null) {
	//Table can only be archived by a table DM or Mod staff
	let table = await getTableByUser(interaction.member);
	//If mod staff, provide a list of tables to archive or archived tables to delete
	if (isBuildMod) table = await promptSelectTable(interaction, callbacks)
	if (table) return table
	if (callbacks) return null
	if (isBuildMod) throw "There are no tables to select from"
	throw "You are not the DM of any active tables"
}


/*--------------*\
| Prompt methods |
\*--------------*/

/// Show a table selection dropdown
async function promptSelectTable(interaction, callbacks = null) {
	let activeTables = await getSelectableTables(false);
	let archivedTables = await getSelectableTables(true);

	//Generate the fields for each archived table
	const menu = new EmbedBuilder().setTitle("Select Table")
	const fields = archivedTables.map(t => getTableField(t, 0))
	if (fields) menu.addFields(fields)

	const components = [];
	const id = interaction.id
	if (activeTables.length > 0)
	{
		activeTables = getTableSelectMenu(activeTables, "activeTables"+id, "Select active table...")
		components.push(activeTables)
	}
	if (archivedTables.length > 0)
	{
		archivedTables = getTableSelectMenu(archivedTables, "archivedTables"+id, "Select archived table...")
		components.push(archivedTables)		
	}

	//Bail if the menu would be empty
	if (components.length == 0)
		return null;

	//Show the prompt, gather and return the response.
	const prompt = await interaction.followUp({embeds:[menu],components:components,ephemeral:true})
	let response = await Prompt.collectAllInteractions(prompt, callbacks || {}, null, Prompt.Time.Std)
							   .catch(console.error)
	if (callbacks) return response;

	//If we don't have a callback to process the response, convert the table ID into a record and return it
	response = (Array.isArray(response)) ? response[0] : response;
	//console.log("Select Table ID: ", response);
	if (null != response) response = await getTableById(response);
	//console.log("Table at ID: ",response);
	return response;
}

/// Show a modal to prompt for table details.
async function promptTableDetails(interaction, tables, table=null) {
	let defaultName = "";
	let defaultTitle = "";
	if (tables)
	{
		defaultTitle = ((/([^\s]+)/g).exec(interaction.member.displayName.trim()))[1] + "'s Table";
		for (let i = 1; i <= MAX_TABLE_COUNT; ++i)
		{
			defaultName = `Table ${i}`
			if (!tables.find(table => table.name == defaultName)) break;
		}
	}
	defaultName = table?.name || defaultName

	const inputs = []
	let name, title, desc;
	if (NAME_LEN && !table) {
		name = new TextInputBuilder().setStyle(TextInputStyle.Short).setCustomId("name")
					.setRequired(false).setMinLength(0).setMaxLength(NAME_LEN)
					.setLabel(`Channel Name (Max ${NAME_LEN} Chars)`)
					.setPlaceholder(`Name for the threads created (Default: ${defaultName})`)
		if (table) name.setValue(table.name)
		name = new ActionRowBuilder().addComponents(name)
		inputs.push(name)
	}
	if (TITLE_LEN) {
		title = new TextInputBuilder().setStyle(TextInputStyle.Short).setCustomId("title")
					.setRequired(false).setMinLength(0).setMaxLength(TITLE_LEN)
					.setLabel(`Table Title (Max ${TITLE_LEN} Chars)`)
					.setPlaceholder(`Shown in table list (Default: ${defaultTitle})`)
		if (table) title.setValue(table.title)
		title = new ActionRowBuilder().addComponents(title)
		inputs.push(title)
	}
	if (DESC_LEN) {
		desc = new TextInputBuilder().setStyle(TextInputStyle.Paragraph).setCustomId("desc")
					.setRequired(false).setMinLength(0).setMaxLength(DESC_LEN)
					.setLabel("Description").setPlaceholder("(Optional) A short description for your table.")
		if (table) desc.setValue(table.desc.substring(0,DESC_LEN))
		desc = new ActionRowBuilder().addComponents(desc)
		inputs.push(desc)		
	}

	const id = "tableSelect_"+interaction.id
	const modal = await Prompt.promptModal(interaction, "Table Details", id, inputs, Prompt.Time.Extended)
							  .catch(console.error);
	if (!modal) throw "Table Detail input timed-out or cancelled"
	//Modal ID Mismatch happens when someone cancels it and then re-does it
	if (modal.customId != id) return null

	//Defer update on the main menu embed before returning control
	await modal.deferUpdate({ephemeral:true});
	title = modal.fields.getTextInputValue('title') || table?.title || defaultTitle;
	name = table ? table.name : (modal.fields.getTextInputValue('name') || defaultName);	
	desc = modal.fields.getTextInputValue('desc') || "";
	return {modal, title, name, desc}
}

/// Wrapper for prompting the user for table details.
async function promptModal(interaction, tables = null, table = null) {
	// Prompt user for table details
	//Unlock it during the modal in case they cancel it so they won't be locked out for 15 mins
	Mutex.Unlock(interaction.member);
	const details = await promptTableDetails(interaction, tables, table)
	if (!details) return null;
	//Re-lock it after the modal for the thread creation, since that takes some time
	Mutex.Lock(interaction.member, ERROR_USER_LOCKED);
	return details
}

/// Prompt the user for confirmation of archiving / deleting a table
async function promptCloseConfirm(interaction, table) {
	if (!table) throw "No table to close"

	//Prep the embed to show
	const op = table.archived ? "Delete" : "Archive"
	const opDesc = table.archived ? DELETE_CONFIRM : ARCHIVE_CONFIRM
	let embed  = getTableReplyEmbed(table,`${op} Confirmation`,opDesc)
	const options = [
		{style:ButtonStyle.Danger,		emoji:"✖️", label:`Confirm ${op}`, 	custom_id:`confirm`	},
		{style:ButtonStyle.Secondary,				label:`Cancel ${op}`, 	custom_id:`cancel`	}
	]
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);
	//if (isBuilder || debugUserAwardButton) 
		options.push({style:ButtonStyle.Primary, emoji:config.emoji.xp, label:`Rewards`, custom_id:`rewards` })		
	const buttons = Prompt.createButtonRow(options);
	let prompts = await interaction.editReply({embeds:[embed],components:[buttons],ephemeral:true})
	const confirm = await Prompt.collectAllInteractions(prompts, {}, null, Prompt.Time.Std);

	await interaction.deleteReply();
	//If the confirmation is a cancel or timeout, cancel the result	
	if (!confirm || confirm == "cancel")
		return false;
	return confirm;
}

/*--------------------------------------------------*\
| Table operations: Create / Update / Delete a Table |
\*--------------------------------------------------*/

/// Check to see if this user can create a table
async function canCreateTable(member, tables) {
	//Check upper limit on the number of active tables
	if (tables.length >= MAX_TABLE_COUNT)
		throw ERROR_MAX_TABLES

	const isBuilder	= Utils.hasAnyRole(member, whitelistRoles);
	if (TEST_MODE && isBuilder)
		return true	

	//Check user's roles for a permissive or preventative one?
	const permitted = ALLOWED_ROLES.length == 0 || Utils.hasAnyRole(member, ALLOWED_ROLES);
	const prevented = PREVENT_ROLES.length > 0 && Utils.hasAnyRole(member, PREVENT_ROLES);
	if (!permitted || prevented)
		throw "You do not have permission to create a table."

	//Check if they have a table open already
	if (LIMIT_ONE_TABLE && tables.find(table => table.user == member.id))
		throw "You already have a table open."

	return true
}

/// Attempt to create a table
async function createTable(interaction) {	
	//Check if this user can create a table
	const tables = await getAllTables(true);
	let create = await canCreateTable(interaction.member, tables)
	if (!create) return null

	const details = await promptModal(interaction, tables, null);
	if (!details) return null;

	//Create the table threads
	const table = await createTableThreads(interaction, details.name, details.desc);

	//Generate the table record
	const timestamp = Math.floor(interaction.createdTimestamp/1000);
	const tableRecord = {
		user: 		table.user || interaction.user.id, 
		title: 		details.title,
		name: 		details.name,
		desc: 		details.desc || "",
		dmThread:	table.dmThread,
		oocThread:	table.oocThread,
		rpThread:	table.rpThread,
		created:	timestamp,
		updated:	timestamp,		
		players:	{},
		archived: 	0
	}

	const reply = await updateTableDB(tableRecord)
	return reply;
}

/// Attempt to update a table
async function updateTable(interaction) {
	let table = null
	const isBuildMod = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	if (isBuildMod)
	{		
		//For a normal user, we go right into the modal. 
		//For a builder, we need to ask which table to edit first
		await interaction.deferReply({ephemeral:true});		
		let processSelectedTable = async function(selectInteraction, args)
		{
			const values  = selectInteraction.values
			const tableId = (Array.isArray(values)) ? values[0] : values;
				  table   = await getTableById(tableId)
			return await promptModal(selectInteraction, null, table)
		}
		let timeout= async function(selectInteraction, args)
		{			
			await interaction.deleteReply()
			return null
		}
		const callbacks = {"*": {func:processSelectedTable, args:null}}
			  callbacks.timeout = {func:timeout, args:null}
		details = await getTableArg(interaction, isBuildMod, callbacks)
		if (details) await details.modal.deleteReply()
	}
	else
	{
		table = await getTableArg(interaction, isBuildMod);
		if (table) details = await promptModal(interaction, null, table)
	}

	if (!table) return null;

	//If the table was archived, unarchive the threads
	if (table.archived) await archiveTable(interaction, table, false)

	//Generate the updated table record
	const timestamp = Math.floor(interaction.createdTimestamp/1000);
	const tableRecord = {
		_id:		table._id,
		user: 		table.user, 
		title: 		details.title || table.title,
		name: 		details.name || table.name,
		desc: 		details.desc || "",
		dmThread:	table.dmThread,
		oocThread:	table.oocThread,
		rpThread:	table.rpThread,
		created:	table.created,
		updated:	timestamp,		
		players:	table.players,
		archived: 	0
	}

	//Update the database with the new record and edit the reply
	const reply = await updateTableDB(tableRecord, false)
	return reply;
}

/// Attempt to close a table
async function closeTable(interaction) {
	await interaction.deferReply({ephemeral:true});
	let table = null
	let error = null
	let confirm = false
	const isBuildMod = Utils.hasAnyRole(interaction.member, whitelistRoles);	
	if (isBuildMod)
	{		
		//For a normal user, we go right into the modal. 
		//For a builder, we need to ask which table to edit first
		let processSelectedTable = async function(selectInteraction, args) {			
			const values  = selectInteraction.values
			const tableId = (Array.isArray(values)) ? values[0] : values;
			table = await getTableById(tableId)					
			if (table) 
			{
				await selectInteraction.deferReply({ephemeral:true})		
				confirm = await promptCloseConfirm(selectInteraction, table)
			}
			await interaction.deleteReply()
			return table
		}
		let timeout= async function(selectInteraction, args) {			
			await interaction.deleteReply()
			return null
		}
		const callbacks = {"*": {func:processSelectedTable, args:null}}
			  callbacks.timeout = {func:timeout, args:null}
		table = await getTableArg(interaction, isBuildMod, callbacks)
	}
	else
	{		
		table = await getTableArg(interaction, isBuildMod)
		confirm = await promptCloseConfirm(interaction, table)
	}
	
	if (table && confirm)
	{
		let reply;
		//If Builder and table is already archived, close it
		if ((isBuildMod || debugUserAwardButton) && confirm == "rewards")
		{
			const thread = await interaction.channel.threads.fetch(table.rpThread)
			if (thread) awardTable(thread, table, interaction)
			table.awarded = true
		}
		else if (isBuildMod && table.archived)
		{
			reply = await deleteTable(interaction, table);
			table.deleted = true	
		}
		else //Else, archive it
			reply = await archiveTable(interaction, table);
		return table
	}
	else if (table && !confirm)
	{
		const op = table.archived ? "Delete" : "Archive"
		throw `Table ${op} Cancelled`
	}
	return null
}

/*-----------------*\
| Thread operations |
\*-----------------*/

/// Create the threads that make up a table
async function createTableThreads(interaction, name, desc = null) {
	//Define the threads we will create
	const threads = {
		"rpThread":	{name:`🗣│RP ${name}`,	type: ChannelType.PublicThread,		startMsg:RP_MSG},
		"oocThread":{name:`🎲│OOC ${name}`,	type: ChannelType.PublicThread,		startMsg:OOC_MSG},
		"dmThread":	{name:`⚙│DM Screen`,	type: ChannelType.PrivateThread,	startMsg:DM_MSG	}
	};

	const table = { };	
	const channel = interaction.channel;
	await Utils.asyncObjectForEach(threads, async (thread, key) => 
	{
		//Create the thread
		const startMsg = thread.startMsg
		delete thread.startMsg
		thread.autoArchiveDuration = ThreadAutoArchiveDuration.OneHour //.OneWeek;
		thread = await channel.threads.create(thread)
		table[key] = thread.id
		
		//Clean up the extraneous Start Message cluttering the table channel
		if (thread.type == ChannelType.PublicThread)
			thread?.fetchStarterMessage().then(msg => msg.delete());

		//Finish setting up the thread: add user, send starting message
		await thread.send(startMsg(interaction.user.id)).then(msg=>msg.pin())
	})

	//Return the table threads to the calling method for DB purposes
	return table;
}

async function _archiveTableInternal(channel, table, timestamp, archived = true)
{
	if (!table) throw "Attempted to archive invalid table."	

	table.archived = archived ? (table.archived || timestamp) : 0;

	//Archive all threads (for future review to avoid abuse) 
	channel = channel.isThread() ? channel.parent : channel
	const chanThreads = channel.threads;
	const tableThreads = [table.dmThread, table.rpThread, table.oocThread];
	Utils.asyncArrayForEach(tableThreads, async (threadId)=>
	{
		const thread = await chanThreads.fetch(threadId)
		if (thread)
		{
			if (thread.archived && !archived) 
				await thread.setArchived(archived)
			if (!thread.archived) 
			{
				await thread.setLocked(archived)
				if (archived) await thread.setArchived(archived)
			}
		}
	})

	table = await updateTableRecord(table);
	return table
}

/// Attempt to toggle a table's archive status
async function archiveTable(interaction, table, archived = true) {
	const timestamp = Math.floor(interaction.createdTimestamp/1000);
	const channel = interaction.channel;
	
	////threadUpdate event will award Exp from the RP thread when the thread is archived
	//const thread = await chanThreads.fetch(table.rpThread)
	//awardTable(thread, table, interaction)
	
	table = await _archiveTableInternal(channel, table, timestamp, archived)
	return table
}

async function autoClose(thread, table, interaction = null){
	const timestamp = Math.floor(thread.archiveTimestamp/1000)
	const channel = thread.parent

	await _archiveTableInternal(channel, table, timestamp, true);	
	await awardTable(thread, table, interaction)
	await blindRefresh(channel)
}

async function awardTable(thread, table, interaction = null){
	await TableUtils.awardTable(thread, table, interaction)
}

/// Attempt to delete a table's threads and DB record for cleanup
async function deleteTable(interaction, table) {
	if (!table) throw "Attempted to delete invalid table."

	//Delete the database record
	try
	{	
		let oldTable = await deleteTableRecord(table)
		table = oldTable
	}
	catch (e)
	{
		throw `DB Delete Failed for ${table.title}\n${e}`
	}

	//Delete the threads
	try
	{	
		const chanThreads = interaction.channel.threads;
		const threads = [table.dmThread, table.rpThread, table.oocThread];
		Utils.asyncArrayForEach(threads, async (threadId)=>
		{
			const thread = await chanThreads.fetch(threadId)
			if (thread) thread.delete()
		})
	}
	catch (e)
	{
		throw `Delete Failed for ${table.title}\n<#${table.dmThread}> <#${table.rpThread}> <#${table.oocThread}>\n${e}`
	}

	return table;
}

/*----------------*\
| Database methods |
\*----------------*/

/// Handle updating the table database and showing the response
async function updateTableDB(table, newTable=true) {
	//Create or Update the table in the database
	const record = {...table, archived: 0}		
	if (newTable)
		return await createTableRecord(record);
	else
		return await updateTableRecord(record);
}
async function createTableRecord(table) {
	record = await Tables.create(table);
	return record;
}
async function updateTableRecord(table) {
	const query = { user: table.user };
	if (table["_id"])
	{
		query["_id"] = table["_id"]
		delete table["_id"]
	}
	const update = table;
	const options = { new: true }//, upsert: true }	
	const record = await Tables.findOneAndUpdate(query, update, options);
	return record;
}
async function deleteTableRecord(table) {
	const query = { user: table.user };
	if (table["_id"])
	{
		query["_id"] = table["_id"]
		delete table["_id"]
	}
	const record = await Tables.findOneAndDelete(query);
	return record;
}

async function getTableByUser(user, active = true) {	
	const query = {user:user.id}
	if (active) query.archived = 0
	return getTable(query)
}
async function getTableById(id) {
	return await getTable({_id:mongoose.Types.ObjectId(id)})
}
async function getTable(query) {
	const table = await Tables.findOne(query)
	return table;
}
async function getAllTables(active = null) {
	const query = (null === active) ? {} : {archived:!active}
	const tables = await Tables.find(query)
	return tables;
}
