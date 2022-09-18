const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js')
const { MessageMentions } = require('discord.js');
const Embed = require(`../../utilities/EmbedPaginator.js`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)
const wait = require('util').promisify(setTimeout);

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const index = require(`../../content/_contentIndex.json`)

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
	await Utils.asyncObjectForEach(content, async (value, key)=>
	{
		const header = `\`\`\`md\n# --- ${key} --- #\n\`\`\``;
		const tableOfContents = value.includeTOC || value.includeHeader ? 
									await channel.send(header) : null;
		let contents = [];

		if (typeof value === 'string')
		{
			await channel.send(value);
		}
		else
		{
			await Utils.asyncArrayForEach(value.embeds, async (embed)=>
			{
				let item = await channel.send({embeds:[embed]});
				contents.push({"title":embed.title,"url":item.url});
				let chanMentions = extractMention(embed);
				if (chanMentions)
					await channel.send(chanMentions)
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

		if (value.includeTOC || value.includeIndex)
			index.push({"title":key,"url":tableOfContents.url});
	});


	if (index.length)
	{
		let embed = new Embed()
			embed.addField("**Index**", '', true);
			embed.setFooter("Index")
		index.forEach( (item)=>
		{
			const field = `[${item.title}](${item.url})`
			embed.extendField(field, "** **", true);			
		});
		embed.send(channel);
	}

	return true
}

async function execute(interaction)
{
	//Base functionality (no args/subcommands): write the contents of the channel
	//   					  channel argument: write contents to the specified channel
	//Edit subcommand: 

	const user  = interaction.user;
	const client = interaction.client;
	const guildId = interaction.guildId;
	const channelId = interaction.channelId;
	const messageId = interaction.targetId;
	const guilds = client.guilds.cache;
	const guild = guilds.get(guildId);
	const channel = await guild?.channels.fetch(channelId);
	const target = interaction.options.getChannel('target') || channel

	//Make sure this channel has content specified before continuing
	if (!index.hasOwnProperty(channel.id)) return false

	await interaction.reply(`Writing contents to <#${target.id}>`);

	//Clean up the old messages in the channel
	await MsgUtils.channelCleanup(channel);

	//Grab the data for the new content according to what goes in this channel
	const content = require(`${process.cwd()}/content/${index[channel.id].data}`)

	//Write the content to the channel
	const result = await publishContent(target, content);
	if (result)
	{
		await interaction.followUp({ content: 'Write success!', ephemeral: true });
	}
	else
	{
		await interaction.followUp({ content: 'Write failure!', ephemeral: true });
		await interaction.deleteReply();
	}

	// const string = interaction.options.getString('input');
	// console.log([string, channel]);
}

async function run(client, message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName('content')
	.setDescription('Update the contents of a static channel')
	.setDefaultPermission(false)	
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))

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

	build:config.DEV||config.PRODUCTION 
};