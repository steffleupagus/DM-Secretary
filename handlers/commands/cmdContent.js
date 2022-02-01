const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js')
const Embed = require(`${process.cwd()}/utilities/EmbedPaginator.js`)
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
const index = require(`${process.cwd()}/content/_contentIndex.json`)
const wait = require('util').promisify(setTimeout);

async function publishContent(channel, content)
{
	let index = [];
	await Utils.asyncObjectForEach(content, async (value, key)=>
	{
		const header = `\`\`\`md\n# --- ${key} --- #\n\`\`\``;
		const tableOfContents = await channel.send(header)
		let contents = [];
		await Utils.asyncArrayForEach(value.embeds, async (embed)=>
		{
			let item = await channel.send({embeds:[embed]});
			contents.push({"title":embed.title,"url":item.url});
		});

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
			contents.forEach( (item)=>
			{
				prefix = item.title?.startsWith('🚫') ? "" : prefix;
				const field = `${prefix}[${item.title}](${item.url})`
				embed.extendField(field, "** **", true);			
			});

			embed = embed.embeds()[0];
			await tableOfContents.edit({content:header, embeds:[embed]})
		}
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
	await Utils.channelCleanup(channel);
	
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

async function run(message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName('content')
	.setDescription('Update the contents of a static channel')
	// .addStringOption(option => option.setName('input').setDescription('Enter a string').setRequired(false))
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))

module.exports = 
{
	data: data,
	execute: execute,
	message: run
};