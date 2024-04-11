const { SlashCommandBuilder,
		EmbedBuilder, 
		PermissionsBitField, 
		ButtonStyle } = require('discord.js')
const mod = process.env.mod || "";
const Utils = require(`../../utilities/utilFuncs.js`);
const config = require(`../../config/${mod}_config.json`);

let faqIndex = null;
const messageIndex = {}

async function execute(interaction)
{
	//Set up for the response
	const public = interaction.options.getBoolean('public') ?? false

	await interaction.deferReply({ephemeral:!public})
	let embed = null;
	
	const topic = interaction.options.getString('topic') ?? null
	if (topic)
	{
		embed = faqData[topic].embed

		if (!embed.url)
		{
			const faqChannel = await interaction.guild.channels.fetch(config.faqChannel);
			const faqMessages = await faqChannel.messages.fetch();
			faqMessages.each( x => {
				const title = x?.embeds[0]?.data?.title
				if (faqData[title] && faqData[title].embed)
					faqData[title].embed.url = x.url					
			})
      
			// const faqMessage = faqMessages.find(x => x?.embeds[0]?.data?.title == topic)		
			// console.log(faqMessage);
			// faqData[topic].embed.url = embed.url = faqMessage.url
			embed = faqData[topic].embed
		}
		// console.log(embed)
	}
		
	if (null == embed)
	{		
		if (null == faqIndex)
		{
			const faqChannel = await interaction.guild.channels.fetch(config.faqChannel);
			const faqIndexMsg = await faqChannel.messages.fetch({ limit: 1 });
			faqIndex = faqIndexMsg?.first()?.embeds[0]
		}
		embed = faqIndex
	}
	
	await interaction.editReply({embeds:[embed]})	
}


function getFAQData()
{
	const content = require(`../../content/rules/rules_faq.json`);	
	const faq = {};

	for (const [key, value] of Object.entries(content)) 
	{
		let section = key;
		value.embeds.forEach( embed => 
		{
			const json = JSON.stringify(embed)
			faq[embed.title] = {
				embed,
				section,
				json
			}
		});
	};
	return faq;
}
const faqData = getFAQData();

const data = new SlashCommandBuilder()
	.setName(`faq${config.DEV ? "dev" : ""}`)
	.setDescription("Easily access the server's FAQ")
	.addStringOption(option => option
			.setName('topic')
			.setDescription('Filter the FAQ by autocomplete')
			.setRequired(false)
			.setAutocomplete(true)
		)
	.addBooleanOption(option => option
			.setName('public')
			.setDescription('Show the FAQ result publicly')	
			.setRequired(false)
		)

const userPermissions = [ PermissionsBitField.Flags.SendMessages ];
module.exports = 
{
	data: data,
	execute: execute,
	autoComplete: autoComplete,
	build:config.PRODUCTION
};


////// Handle autocomplete options for the location field
async function autoComplete(interaction)
{
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'topic') 
	{
		const value = focusedOption.value.toLowerCase();
		let response = Object.keys(faqData);
		if (value.length > 0)
			response = response.filter(x => x.toLowerCase().includes(value)
								|| faqData[x].json.toLowerCase().includes(value))
		response = response.map(x => ({name:"[" + faqData[x].section + "] " + x, value:x}))
		// console.log(response)
		try {		
			response = response.length <= 25 ? response : response.splice(0,25)
			interaction.respond(response);
		}
		catch (e) {}
	}
}