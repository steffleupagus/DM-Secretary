const { 
		SlashCommandBuilder,
	    PermissionsBitField, 
	    InteractionType,
	    EmbedBuilder, 
	    ChannelType,
	    ThreadAutoArchiveDuration,
	    ButtonStyle 
	  } = require('discord.js')
const Prompt = require(`../../utilities/promptUtils.js`)
const Tables = require(`../../database/tableSchema.js`)
const Utils = require(`../../utilities/utilFuncs.js`)

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

const GOALS = `Goals:
- Enables anyone who wants to to run a quest or one-shot
- Gives people a chance to practice DMing
- Gives people chances to play without being limited by DM availability
- Gives DM staff a chance to see how potential DA's run
 - Make it part of the DA application process
- No Exp / Loot can be awarded to players
- No permanent effects / character changes / death
- RP exp *can* be gained (\`/scene\` command or similar)
`
const REQUIREMENTS = `Requirements: 
- Discord bot functionality to create threads. 
- Interface to consist of an embed and two buttons: Create Table / Delete Table
 - Create Table button:
   - Verify Table can be created
     - Verify the user is authorized to create a table. 
     - Verify the person creating the table doesn't already have one open
     - Verify a table can be created (hasn't hit the max number of tables)
   - If table creation permitted
     - Create three threads: 
       - OOC/Mechanics thread
       - RP thread
       - Private DM screen thread
     - Set up a DB record for the table 
     - Update embed to display the newly opened table 
	   - Include DM & links to public threads
 - Close Table button: 
   - Verify user is table DM or Mod staff
   - Archive threads
   - Remove from Embed
   - Update thread to mark table Archived
   - Mod staff has option to delete table threads & DB record once verified 
Tables should auto-close when Discord archives the threads.`
const LOGISTICS = `Logistics:
"Free Table" channel with an embed and two buttons
- Embed lists existing tables & the DM
 - Limit of 25 max tables to display in a single embed
- Button to generate a temp table
 - A person can only create one table open at a time
 - Prompts for a name & creates 3 threads in the Free Table channel
   - 🗣 RP thread for IC interaction (RP awards exp)
   - :game_die: OOC/Roll thread for OOC and rolling
   - ⚙ DM screen private thread only visible to the DM who created the table
 - Creates record in the DB with the user ID and thread IDs 
 - Set auto-archive duration of all threads to a week
   - On archive, auto-close the table as with the second button
- Button to close a table
 - Only works for DM of the table, or DMs/Mods
 - Awards RP exp from the RP thread
 - Archive all threads (for future review, if necessary, to avoid abuse) 
 - Option for Mods to delete closed tables`


const TABLE_MENU_CHAN = "1123074833857646702";
const TABLE_MENU_TITLE = `Free-Use Tables`
const TABLE_MENU_DESC = `
**Free-||~~use~~||Play Tables**
${GOALS}
${REQUIREMENTS}
${LOGISTICS}
\`\`\` \`\`\``

const DM_MSG = `This channel represents your private behind-the-DM-screen area`
const OOC_MSG = `*@ping your players in this channel to get started!*`
const TABLE_CREATE_DESC = `
	Ping your players in your \`OOC\` and \`RP\` threads. 
	DM Screen is for your use for monster lookup & hidden rolling.`
const TABLE_ARCHIVE_DESC = `TODO: Table Archive Description`
const TABLE_DELETE_DESC = `TODO: Table Delete Description`






///
/// Run the slash command
///
async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);
	if (isBuilder)
	{
		//Show menu to close table or show table menu
		const options = [
			{style:ButtonStyle.Secondary, emoji:"📜", label:"Show Table Menu", custom_id:`showMenu`},
			{style:ButtonStyle.Danger, emoji:"✖️", label:"Close Table", custom_id:`${data.name}.closeTable`}
		]
		const buttons = Prompt.promptUserButton()
		await interaction.channel.send({embeds:[embed], components: [buttons]})



		await showInteractionMenu(interaction);
		await interaction.editReply("Done.");
		return;
	}
	return await interaction.editReply(`Please use the buttons in <#${TABLE_MENU_CHAN}>.`);
}







async function updateTableRecord(table, archive=false)
{
	const query = { user: table.user, archived: archive };
	const update = table;
	const options = { new: true, upsert: true }	
	record = await Tables.findOneAndUpdate(query, update, options);
	return record;
}

async function deleteTableRecord(table)
{
	table = await Tables.findOneAndDelete(table).catch(console.error);	
	console.log(table)
	return table
}

async function getTableByUser(user)
{	
	const table = await Tables.findOne({user:user.id})
	return table;
}

async function getAllTables(active = true)
{	
	const tables = await Tables.find({archived:!active})
	return tables;
}





















///
/// Show the list of tables and the buttons
///
async function showInteractionMenu(interaction)
{
	const embed = await getTableListEmbed()
	const options = [
		{style:ButtonStyle.Success, emoji:"🗺️", label:"Create Table", custom_id:`${data.name}.createTable`},
		{style:ButtonStyle.Primary, emoji:"🔄", label:"Refresh Tables", custom_id:`${data.name}.refreshList`},
		{style:ButtonStyle.Danger, emoji:"✖️", label:"Close Table", custom_id:`${data.name}.closeTable`}
	]
	const buttons = Prompt.createButtonRow(options)	
	await interaction.channel.send({embeds:[embed], components: [buttons]})
}

///
/// Generate the embed with table listings
///
async function getTableListEmbed()
{
	let embed = new EmbedBuilder()
		.setTitle(TABLE_MENU_TITLE)
		.setDescription(TABLE_MENU_DESC);

	//Find all the tables we have a reference of in the database
	const tables = await getAllTables();
	console.log(tables);

	const fields = [];
	tables.forEach(table => {
		const value = `**DM**: <@${table.user}>\n<#${table.oocThread}> <#${table.rpThread}>`
		fields.push({name:table.name||"Table XXX", value:value})
	});
	if (fields.length)
		embed.addFields(fields);

	return embed;	
}

///
/// Generic interaction handler
///
async function handleInteraction(interaction)
{
	const customId = interaction.customId;
	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")	
	const command = customId.replace(prefix,"");
	
	switch(command)
	{
		case `refreshList`:
			await interaction.deferUpdate({ephemeral:true});
			const embed = await getTableListEmbed()
			interaction.editReply({embeds:[embed]})
			return;			
		case `createTable`:
			await createTable(interaction)
			return;
		case `closeTable`:
			await archiveTable(interaction)
			return;
	}
	if (!interaction.deferred && !interaction.replied)
		await interaction.reply({content:`Handling: ${interaction.customId}`, ephemeral: true})
}

///
/// Attempt to create a table
///
async function createTable(interaction)
{
	//Check if this user can create one
	const create = await canCreateTable(interaction)
	if (!create) return

	//Prepare to update the embed
	await interaction.deferUpdate({ephemeral:true});
	//Create the table threads
	const table = await createTableThreads(interaction);
	//Log it to the database
	await updateTableRecord(table);
	//Prepare the output - first update the permanent embed
	const embed = await getTableListEmbed();
	await interaction.editReply({embeds:[embed]})
	//Then prepare & reply to the user who clicked the button
	const fields = [
		{name:"OOC Thread", value:`<#${table.oocThread}>`, inline:true},
		{name:"RP Thread", value:`<#${table.rpThread}>`, inline:true},
		{name:"DM Screen", value:`<#${table.dmThread}>`, inline:true},
	]				
	const reply = new EmbedBuilder().setTitle("Table Created")
									.setDescription(TABLE_CREATE_DESC)
									.addFields(fields);
	await interaction.followUp({embeds:[reply],ephemeral:true})
}

///
/// Check to see if this user can create a table
///
async function canCreateTable(interaction)
{
	console.log("TODO: Check if they have a table open already")
	console.log("TODO: Check their roles for a permissive or preventative one?")
	console.log("TODO: Check upper limit of number of active tables")
	return true
}

///
/// Create the threads that make up a table
///
async function createTableThreads(interaction)
{
	// create new threads
	const threads = {
		"rpThread":	{name:"🗣│RP",	type: ChannelType.PublicThread,		startMsg:OOC_MSG},
		"oocThread":{name:"🎲│OOC",	type: ChannelType.PublicThread,		startMsg:OOC_MSG},
		"dmThread":	{name:"⚙│DM",	type: ChannelType.PrivateThread,	startMsg:DM_MSG	}
	};

	const table = { user: interaction.user.id };	
	const channel = interaction.channel;
	await Utils.asyncObjectForEach(threads, async (thread, key) => 
	{
		const startMsg = thread.startMsg
		delete thread.startMsg
		thread.autoAcrhiveDuration = ThreadAutoArchiveDuration.OneWeek;
		thread = await channel.threads.create(thread)

		if (thread.type == ChannelType.PublicThread)
		{
			const message = await thread?.fetchStarterMessage();
			await message?.delete();
		}

		await thread.members.add(interaction.user.id);
		await thread.send(startMsg)
		table[key] = thread.id
	})

	table.archived = false;
	return table;
}

///
/// Attempt to archive a table
///
async function archiveTable(interaction)
{
	//Table can only be archived by a table DM or Mod staff
	const isBuildMod = Utils.hasAnyRole(interaction.member, whitelistRoles);
	const table = await getTableByUser(interaction.user);
	
	//If mod staff, provide a list of tables to archive or archived tables to delete
	if (isBuildMod)
	{
		console.log("TODO: Show menu of open tables to archive / archived tables to delete")
		console.log("TODO: Get table DB record from menu selection")
	}

	const reply = new EmbedBuilder()
	
	//If we have a table defined
	if (table)
	{
		//Prepare to update the embed
		await interaction.deferUpdate({ephemeral:true});
		
		const channel = interaction.channel;
		const threads = channel.threads;
		
		if (isBuildMod && table.archived)
		{
			console.log("TODO: Table archived. Delete it")
			console.log("TODO: Update DB to delete table record")	
			console.log("TODO: Remove from Embed")
			threads.fetch(table.dmThread).then(thread => thread.delete()).catch(console.error);
			threads.fetch(table.rpThread).then(thread => thread.delete()).catch(console.error);
			threads.fetch(table.oocThread).then(thread => thread.delete()).catch(console.error);			
			await deleteTableRecord(table);			

			reply.setTitle("Table Deleted")
		}
		else
		{
			console.log("TODO: Table active. Archive it")
			console.log("TODO: Award Exp from the RP thread")
			console.log("TODO: Update DB to mark table Archived")	
			console.log("TODO: Remove from Embed")
			//Archive all threads (for future review, if necessary, to avoid abuse) 
			threads.fetch(table.dmThread).then(thread => thread.setArchived()).catch(console.error);
			threads.fetch(table.rpThread).then(thread => thread.setArchived()).catch(console.error);
			threads.fetch(table.oocThread).then(thread => thread.setArchived()).catch(console.error);
			await updateTableRecord(table, true);

			reply.setTitle("Table Archived")
		}

		//Prepare the output - first update the permanent embed
		const embed = await getTableListEmbed();
		await interaction.editReply({embeds:[embed]})
	}

	//Prepare & reply to the user who clicked the button
	// const fields = [
	// 	{name:"OOC Thread", value:`<#${table.oocThread}>`, inline:true},
	// 	{name:"RP Thread", value:`<#${table.rpThread}>`, inline:true},
	// 	{name:"DM Screen", value:`<#${table.dmThread}>`, inline:true},
	// ]				
	// 
	// 								.setDescription(TABLE_CREATE_DESC)
	// 								.addFields(fields);
	// await interaction.followUp({embeds:[reply],ephemeral:true})
}



const data = new SlashCommandBuilder()
	.setName(`table${config.DEV ? "dev" : ""}`)
	.setDescription('Open a temporary table')
	
const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.BuilderRole, config.ModeratorRole	];

module.exports = 
{
	data: data,
//	whitelistRoles: { [InteractionType.ApplicationCommand] : whitelistRoles },
//	userPermissions: { [InteractionType.ApplicationCommand] : userPermissions },
	botPermissions: userPermissions,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,

	build:config.DEV //||config.PRODUCTION
};