const { SlashCommandBuilder,
		EmbedBuilder, 
		PermissionsBitField, 
		ButtonStyle } = require('discord.js')
const mod = process.env.mod || "";
const Utils = require(`../../utilities/utilFuncs.js`);
const config = require(`../../config/${mod}_config.json`);

let ruleIndex = null;
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
		embed = ruleData[topic].embed

		if (!embed.url)
		{
			const ruleChannel = await interaction.guild.channels.fetch(config.chan.rules);
			const ruleMessages = await ruleChannel.messages.fetch();
			//console.log(Object.keys(ruleData))
			ruleMessages.each( x => {
				let title = x?.embeds[0]?.data?.title?.replace(/:.*: /g,"")
				if (ruleData[title] && ruleData[title].embed)
					ruleData[title].embed.url = x.url					
			})

			embed = ruleData[topic].embed
		}
		//console.log(embed)
	}

	if (null == embed)
	{		
		if (null == ruleIndex)
		{
			const ruleChannel = await interaction.guild.channels.fetch(config.chan.rules);
			const ruleIndexMsg = await ruleChannel.messages.fetch({ limit: 1 });
			ruleIndex = ruleIndexMsg?.first()?.embeds[0]
		}
		embed = ruleIndex
	}

	await interaction.editReply({embeds:[embed]})	
}


function getRuleData()
{
	const content = require(`../../content/rules/rules.json`);	
	const rules = {};
	
	for (const [key, value] of Object.entries(content)) 
	{
		let section = key;
		value.embeds.forEach( embed => 
		{
			const json = JSON.stringify(embed)
			const title = (embed.prefix || "") + embed.title
			rules[embed.title] = {
				embed,
				section,
				json
			}
		});
	};
	return rules;
}
const ruleData = getRuleData();

const data = new SlashCommandBuilder()
.setName(`rule${config.DEV ? "dev" : ""}`)
.setDescription("Easily access the server's rules")
.addStringOption(option => option
		.setName('topic')
		.setDescription('Filter the rules by autocomplete')
		.setRequired(false)
		.setAutocomplete(true)
	)
.addBooleanOption(option => option
		.setName('public')
		.setDescription('Show the rule result publicly')	
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
		let response = Object.keys(ruleData);
		if (value.length > 0)
			response = response.filter(x => x.toLowerCase().includes(value)
								|| ruleData[x].json.toLowerCase().includes(value))
		response = response.map(x => ({name:"[" + ruleData[x].section + "] " + x,
									   value:x}))
		// console.log(response)
		try {		
			response = response.length <= 25 ? response : response.splice(0,25)
			interaction.respond(response);
		}
		catch (e) {}
	}
}