const { SlashCommandBuilder,
		EmbedBuilder, 
		PermissionsBitField, 
		ButtonStyle } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const https = require('https');

async function execute(interaction)
{
	await interaction.deferReply({ephemeral:true})
	
	let url = "https://inspirobot.me/api?generate=true";
	https.get(url, (res) => {
		const { statusCode } = res;
		const contentType = res.headers['content-type'];
		console.log(statusCode, contentType)
		if (statusCode == 200)
		{
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => {
				console.log(rawData);
				let embed = new EmbedBuilder();		
					embed.setTitle("Inspiration!")
					embed.setURL(rawData)
					embed.setImage(rawData)
					embed.setFooter({text:"InspiroBot.me"})
				interaction.editReply({embeds:[embed]});
			});
		}
	});
}

async function button(interaction)
{
	await interaction.reply({content:`Handling: ${interaction.customId}`, 
							 ephemeral: true})
}

const data = new SlashCommandBuilder()
	.setName('inspire')
	.setDescription('Inspire me')

const userPermissions = [	PermissionsBitField.Flags.SendMessages	];
const whitelistRoles =  [	config.BuilderRole	];
module.exports = 
{
	data: data,
	whitelistRoles: whitelistRoles,
	userPermissions: userPermissions,
	execute: execute,
	button: button,

	build:config.DEV
};