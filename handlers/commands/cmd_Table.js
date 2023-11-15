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

const TABLE_MENU_TITLE = `Free-Use Tables`
const TABLE_MENU_DESC = `
**Free-||~~use~~||Play Tables**
Goals:
Enables anyone who wants to to run a quest, one-shot, even a campaign.
Gives people a chance to practice DMing
Gives people chances to play without necessarily being limited by DM availability.
Gives us (as DM staff) a chance to see how potential DA's run - make it part of the DA application process
Obvious caveat: No Exp / Loot can be awarded to players, no permanent effects / character changes / death
However, RP exp via the \`/scene\` command *can* be gained

Requirements: 
Discord bot functionality to create threads for running a DnD session. Main interface will consist of an embed and two buttons, one to create a table and one to delete a table. 
Anyone can click the Create button, but it'll need to verify that a table can be created (hasn't hit the max number of tables), that the person creating the table doesn't already have one open, and make sure they are authorized. If they can create a table, it will create three threads: an OOC/Mechanics thread, an RP thread, and a private thread visible only to the DM who created the table. Once created, it should set up a database record for the table and update the embed to display the newly opened table, a mention of the DM and a link to the public threads. 
The Close Table button should only work for the DM who made the table, or the Mod staff. Tables should auto-close when Discord archives the threads. When closed, the threads should archive, remove them from the list of active tables in the embed, and the database record should update to reflect it. Mod staff should have an additional option to delete the table threads and the database record.

Logistics:
◘ One "Free Table" channel with an embed and two buttons
--○ Embed lists out all existing tables created with this and the DM who created it
--○ Button to generate a temp table
----• Prompts for a name & creates 3 threads in the Free Table channel
------- 🗣 RP thread for IC interaction (scene command will award exp)
------- :game_die: OOC/Roll thread for OOC and rolling
------- ⚙ DM screen private thread only visible to the DM who created the table
----• Creates a record in the database with the user ID and all 3 thread IDs
----• A person can only create one table open at a time
----• Set auto-archive duration of all threads to a week
----• On archive, auto-close the table as with the second button
--○ Button to close a table
----• only works for DM of the table, or DMs/Mods
----• Auto-closes the scene in the RP thread for RP exp
----• Archive all threads (for future review, if necessary, to avoid abuse) 
----• Option for Mods to delete closed tables
◘ Limit of 25 max tables (75 threads) to display in a single embed
--○ Could possibly up limit to 50 max tables (150 threads)
`

const DM_MSG = `This channel represents your private behind-the-DM-screen area`
const OOC_MSG = `@ping your players in this channel to get started!`
const TABLE_CREATE_DESC = `
Ping your players in your \`OOC\` and \`RP\` threads. 
DM Screen is for your use for monster lookup & hidden rolling.
`

///
/// Run the slash command
///
async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);
	if (isBuilder)
	{
	 	await showInteractionMenu(interaction);
		await interaction.editReply("Done.");
		return;
	}
	return await interaction.editReply("Please use the buttons in <#1123074833857646702>.");
}

///
/// Show the list of tables and the buttons
///
async function showInteractionMenu(interaction)
{
	const embed = await getTableListEmbed()
	const options = [
		{style:ButtonStyle.Primary, emoji:"🗺️", label:"Create Table", custom_id:`${data.name}.startTable`},
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

	const tables = await getAllTables();
	console.log(tables);
	
	// const fields = [];
	// tables.forEach(table => {
	// 	const value = `**DM**: <@${table.user}>\n<#${table.oocThread}> <#${table.rpThread}>`
	// 	fields.push({name:table.name||"Table XXX", value:value})
	// });
	// if (fields.length)
	// 	embed.addFields(fields);
	
	return embed;	
}

///
/// Generic interaction handler
///
async function handleInteraction(interaction)
{
	const isBuilder	= Utils.hasAnyRole(interaction.member, whitelistRoles);	
	const customId = interaction.customId;
	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")	

	const command = customId.replace(prefix,"");
	switch(command)
	{
		case `startTable`:
			await createTable(interaction)
			break;
		case `closeTable`:
			const table = await getTableByUser(interaction.user);
			if (table)
			{
				deleteTable(interaction, table);
			}
			break;
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
		thread.autoAcrhiveDuration =  ThreadAutoArchiveDuration.OneWeek;
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

//	console.log(interaction)
	
	return table;
}

async function updateTableRecord(table)
{
	const query = { user: table.user, archived: false };
	const update = table;
	const options = { new: true, upsert: true }	
	record = await Tables.findOneAndUpdate(query, update, options);
	return record;
}

async function deleteTable(interaction, table)
{
	const channel = interaction.channel;
	const threads = channel.threads;

	threads.fetch(table.dmThread).then(thread => thread.delete()).catch(console.error);
	threads.fetch(table.rpThread).then(thread => thread.delete()).catch(console.error);
	threads.fetch(table.oocThread).then(thread => thread.delete()).catch(console.error);	
	table = await Tables.findOneAndDelete(table).catch(console.error);	
	console.log(table)
}

async function getTableByUser(user)
{	
	const table = await Tables.findOne({user:user.id})
	return table;
}

async function getAllTables()
{
	const tables = await Tables.find()
	return tables;
}
















const data = new SlashCommandBuilder()
	.setName(`table${config.DEV ? "dev" : ""}`)
	.setDescription('Open a temporary table')
	
const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];
const whitelistRoles  = [	config.BuilderRole, config._BuilderRole		];

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