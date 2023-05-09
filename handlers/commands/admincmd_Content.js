const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const { MessageMentions } = require('discord.js');
const Embed = require(`../../utilities/EmbedPaginator.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)
const wait = require('util').promisify(setTimeout);

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const index = require(`../../content/_contentIndex.json`)
const TEST_CHAN = "940061953064329216"

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
	let index = [];
	let indexInline = true;
	await Utils.asyncObjectForEach(content, async (value, key)=>
	{
		const header = `\`\`\`md\n# --- ${key} --- #\n\`\`\``;
		const tableOfContents = value.includeTOC || value.includeHeader ? 
									await channel.send(header) : null;
		let contents = [];
		indexInline = indexInline && (value.inlineIndex ?? true);
		
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

				const prefix = embed.prefix ?? "";
				delete embed.prefix;

				const title = embed.title || embed.Title || "";
				delete embed.Title;
				embed.title = `${prefix}${title}`.trim()				
				
				let thread = embed.thread || null;
				delete embed.thread;
				let fieldBreak = embed.indexBreak ?? false
				delete embed.indexBreak
				
				let item = await channel.send({embeds:[embed]});
				if (value.includeTOC && title)
					contents.push({"prefix":prefix,"title":title,"url":item.url});
				else if (value.includeIndex && title)
					index.push({"prefix":prefix,"title":title,"url":item.url,"break":fieldBreak});
				
				if (thread)
					await item.startThread({name:thread})
				
				lastMessage = item.id
				
				let chanMentions = extractMention(embed).trim();
				if (chanMentions)
					await channel.send(chanMentions)

				const waitTime = value.waitTime ?? 1200				
				await wait(1200);
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
		let embed = new Embed()
			embed.addField("**Index**", '', indexInline);
			embed.setFooter({text:"Index"})
		index.forEach( (item)=>
		{
			if (!item.title) return;
			if (item.break)
			{
				embed.closeField();
				embed.addField("** **",'', indexInline)
			}
			
			const field = `${item.prefix || ""}[${item.title}](${item.url})`			
			embed.extendField(field, "** **", indexInline);
		});
		await embed.send(channel);
	}

	return true
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
	const channel = await guild?.channels.fetch(channelId);
	const target = interaction.options.getChannel('target') || channel
	const clear  = interaction.options.getBoolean('clear') ?? false
	const override = interaction.options.getString('content') ?? null

	await interaction.deferReply({ephemeral:true});
	
	//Make sure this channel has content specified before continuing
	if (!index.hasOwnProperty(channel.id))
	{
		await interaction.editReply(`No content found for <#${target.id}>. Aborting`);
		return false
	}

	//Grab the data for the new content according to what goes in this channel
	let source = override || index[channel.id].data	
	const content = require(`${process.cwd()}/content/${source}`)
	if (!content)
	{
		await interaction.editReply(`No content found for <#${target.id}>. Aborting`);
		return false;
	}	

	//Clean up the old messages in the channel
	if (clear)
	{
		await interaction.editReply(`Cleaning old content from <#${target.id}>`);
		await MsgUtils.channelCleanup(channel);
	}
	
	//Write the content to the channel
	await interaction.editReply(`Writing contents to <#${target.id}>`);
	const result = await publishContent(target, content);
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
	if (interaction.channel.id == TEST_CHAN && focusedOption.name === 'content') 
	{
		const value = focusedOption.value.toLowerCase();
		console.log(value);
		const response = Object.values(index)
								.map( x => ({ name: x.data.replace(".json",""), value: x.data }) )
								.filter( x => x.value.includes(value) )
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
	.setName('content')
	.setDescription('Update the contents of a static channel')
	.setDefaultPermission(false)	
	.addChannelOption(option => option.setName('target').setRequired(false).setDescription('Specify a target channel'))
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
		config.BuilderRole,
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,
	autoComplete: autoComplete,
	build:config.PRODUCTION 
};