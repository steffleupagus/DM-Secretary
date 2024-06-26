const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const { MessageMentions } = require('discord.js');
const Embed = require(`../../utilities/EmbedPaginator.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)
const wait = require('util').promisify(setTimeout);

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const index = require(`../../content/_contentIndex.json`)
const TEST_CHAN = ["940061953064329216","1132477827095212032"];

function isObject (value) {  
  return Object.prototype.toString.call(value) === '[object Object]'
}

function extractMention(embed) 
{
	const desc = embed.description || "";
	const fields = embed.fields || [];
	const fieldText = fields.map(field => field.value).join(" ");
	const content = desc + " " + fieldText;

	// The id is the first and only match found by the RegEx.
	let matches = content.matchAll(MessageMentions.CHANNELS_PATTERN);
	// If supplied variable did not include a mention,
	// matches will be null instead of an array.
	if (!matches) return false;
	matches = ([...matches]).map( entry => entry[0]).join(" ");

	if (matches.length == 0)
		return null;

	console.log(matches);
	return matches;
}

async function publishContent(channel, content)
{
	let threadQueue = [];
	let index = [];
	let indexInline = true;
	let indexFields = true;
	await Utils.asyncObjectForEach(content, async (value, key)=>
	{
		if (value.skip) return;
		const header = `\`\`\`md\n# --- ${key} --- #\n\`\`\``;
		const tableOfContents = value.includeTOC || value.includeHeader ? 
									await channel.send(header) : null;
		let contents = [];
		indexInline = indexInline && (value.inlineIndex ?? true);
		indexFields = indexFields && (value.fieldsIndex ?? true);

		if (typeof value === 'string')
		{
			await channel.send(value);
		}
		else
		{
			let lastMessage = null;
			await Utils.asyncArrayForEach(value.embeds, async (embed)=>
			{			
				if (embed?.description?.includes("<last_id>"))
					embed.description = embed.description.replace("<last_id>",lastMessage)

				const content = embed.content ?? null;
				delete embed.content;				
				//Prep the prefix & cleanup
				const prefix = embed.prefix ?? "";
				delete embed.prefix;
				//Prep the title with the prefix & cleanup
				const title = embed.title || embed.Title || "";
				delete embed.Title;
				embed.title = `${prefix}${title}`.trim()				
				//Prep the thread and cleanup
				let thread = embed.thread || null;
				if (thread && !isObject(thread)) thread = {name:thread, content:null}
				delete embed.thread;
				//Prep the index field break and cleanup
				let fieldBreak = embed.indexBreak ?? false
				delete embed.indexBreak
				let includeIndex = embed.includeIndex ?? value.includeIndex;
				delete embed.includeIndex
				//Prep the attachments and cleanup
				let attachments = embed.attachments || null;
				delete embed.attachments;
				delete embed.hiddenFields;
				//Prep for multiple images
				let images = embed.image;
				if (images && Array.isArray(images))
					embed.image = images.pop();
				const embeds = [embed];
				//Send the embed and (if we have attachments) send those as a separate message
				let item;
				if (content)
					item = await channel.send({content:content,embeds:embeds});
				else
					item = await channel.send({embeds:embeds});

				if (images && Array.isArray(images) && images.length > 0)
				{
					embeds[0].url = item.url
					images.map( img => { embeds.push( {url:item.url,"image":img} ) })
					await item.edit({embeds:embeds})
					const waitTime = value.waitTime ?? 1000
					await wait(waitTime);			
				}

				if (attachments) await channel.send({files:attachments});
				//Push the link into the ToC or the Index
				if (value.includeTOC && title)
					contents.push({"prefix":prefix,"title":title,"url":item.url});
				else if (value.includeIndex && title && includeIndex)
					index.push({"prefix":prefix,"title":title,"url":item.url,"break":fieldBreak});
				//If we have a thread, start it
				if (thread && thread.name) 
				{
					thread.thread = await item.startThread({name:thread.name})
					threadQueue.push(thread);
					console.log(threadQueue)
				}

				lastMessage = item.id
				//Extract any channel mentions and send them separately?
				let chanMentions = extractMention(embed).trim();
				if (chanMentions) await channel.send(chanMentions)

				//Stall so we don't hit ratelimit
				const waitTime = value.waitTime ?? 1200
				await wait(waitTime);
			});
		}

		if (value.includeTOC)
		{
			let title = value.title || `${key} Index`;
			let prefix = value.prefix || "";
			let note = value.note || null;
			let embed = new Embed()
				if (note)
					embed.setDescription(note);
				embed.setFooter(title)
				embed.addField(`**${title}**`, '', true);
			let count = 0;
			contents.forEach( (item)=>
			{
				prefix = item.title?.startsWith('🚫') ? "" : prefix;
				const field = `${prefix}[${item.title}](${item.url})`
				embed.extendField(field, "** **", true);
				if (value.maxEntriesPerField && ++count >= value.maxEntriesPerField)
				{
					embed.close_field();
					embed.addField(`** **`, '', true);
					count = 0
				}
			});

			embed = embed.embeds()[0];
			await tableOfContents.edit({content:header, embeds:[embed]})
		}

		if (value.includeSectionBreak)
			await channel.send("*_ _*\n*_ _*\n*_ _*\n");

		if (value.includeTOC && value.includeIndex)
			index.push({"title":key,"url":tableOfContents.url});
	});


	if (index.length)
	{
		if (indexFields)
			await publishIndexFields(channel, index, indexInline);
		else
			await publishIndexDesc(channel, index);
	}

	if (threadQueue.length)
	{
		await Utils.asyncArrayForEach(threadQueue, async thread => {
			thread.content = getContent(thread.thread, thread.content);
			await publishContent(thread.thread, thread.content)
		})
	}
	return true
}

async function publishIndexDesc(channel, index)
{
	let desc = ""
	index.forEach( (item)=>
	{
		if (!item.title) return;
		desc += `${item.prefix || ""}[${item.title}](${item.url})\n`
	});	
	let embed = new Embed()
		embed.setDescription(desc)
		embed.setFooter({text:"Index"})	
	await embed.send(channel);
}

async function publishIndexFields(channel, index, indexInline)
{
	let embed = new Embed()
		embed.addField("**Index**", '', indexInline);
		embed.setFooter({text:"Index"})
	index.forEach( (item)=>
	{
		if (!item.title) return;
		let fieldHeader = "** **";

		if (item.break)
		{
			if (typeof item.break == "string")
				fieldHeader = item.break;
			embed.closeField();
			embed.addField(fieldHeader,'', indexInline)
		}

		const field = `${item.prefix || ""}[${item.title}](${item.url})`			
		embed.extendField(field, fieldHeader, indexInline);
	});
	await embed.send(channel);
}

function requireUncached(module) 
{
	delete require.cache[require.resolve(module)];
	try
	{
		return require(module);
	}
	catch (e)
	{
		return null;
	}
}

function getContent(channel, override = null)
{
	let source = override || index[channel.id].data	
	let content = null;
	try {
		content = `../../content/${source}`
		content = requireUncached(content)
		console.log(content)
	}
	catch(e){ console.log(e) }
	return content
}

async function execute(interaction)
{
	//Base functionality (no args/subcommands): write the contents of the channel
	//   					  channel argument: write contents to the specified channel
	//TODO: Edit subcommand

	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const channelId = interaction.channelId;
	const messageId = interaction.targetId;
	const guilds = client.guilds.cache;
	const guild = guilds.get(guildId);
	const channel = interaction.channel;
	const clear  = interaction.options.getBoolean('clear') ?? false
	const override = interaction.options.getString('content') ?? null

	await interaction.deferReply({ephemeral:true});

	//Grab the data for the new content according to what goes in this channel
	const content = getContent(channel, override);
	if (!content)
	{
		await interaction.editReply(`No content found for <#${channel.id}>. Aborting`);
		return false;
	}	

	//Clean up the old messages in the channel
	if (clear)
	{
		await interaction.editReply(`Cleaning old content from <#${channel.id}>`);
		await MsgUtils.channelCleanup(channel);
	}

	//Write the content to the channel
	await interaction.editReply(`Writing contents to <#${channel.id}>`);
	const result = await publishContent(channel, content);
	if (result)
		await interaction.followUp({ content: 'Write success!', ephemeral: true });
	else
		await interaction.followUp({ content: 'Write failure!', ephemeral: true });



	interaction.deleteReply();
}

async function run(client, message, command, args)
{
}

////// Handle autocomplete options for the Character field
async function autoComplete(interaction) 
{
	const focusedOption = interaction.options.getFocused(true);
	const isTestChan = TEST_CHAN.includes(interaction.channel.id) || TEST_CHAN.includes(interaction.channel?.parent?.id);	
	if (isTestChan && focusedOption.name === 'content') 
	{
		const value = focusedOption.value.toLowerCase();
		console.log(value);
		const response = Object.values(index)
								.map( x => ({ name: x.data.replace(".json",""), value: x.data }) )
								.filter( x => x.value.toLowerCase().includes(value) )
		console.log(response)

		try {
			interaction.respond(response.length <= 25 ? response : []);
		}
		catch (e) {}
	}
	else
		interaction.respond([])
}

const data = new SlashCommandBuilder()
	.setName(`content${config.DEV ? "dev" : ""}`)
	.setDescription('Update the contents of a static channel')
	.setDefaultPermission(false)	
	.addBooleanOption(option => option.setName('clear').setRequired(false).setDescription('Clear old messages or not'))
	.addStringOption(option => option
			.setName('content')
			.setDescription('Override from available content')
			.setRequired(false)
			.setAutocomplete(true)
		)
const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.SendMessages		];

module.exports = 
{
	data: data,
	whitelistRoles: [
		config.role.Builder,
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
	autoComplete: autoComplete,
	build:config.PRODUCTION || config.DEV
};