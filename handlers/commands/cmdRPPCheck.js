/*----------------------------------------*\
| Calculate RPP awards from user post data |
\*----------------------------------------*/
const { SlashCommandBuilder } = require('@discordjs/builders')
const { MessageEmbed, Permissions } = require('discord.js')
const unbapi = require("unb-api")
	
const commandHistory = require(`../../database/cmdHistSchema.js`)
const RPP = require(`../../database/rppTrackerSchema.js`)
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)
const Embed = require(`../../utilities/EmbedPaginator.js`)

async function execute(interaction)
{
	const check = "<:check:868350696293036042>";
	const d20 = "<:d20:704040692946698361>";
	const client = interaction.client
	const guildId = interaction.guildId
	const guilds = client.guilds.cache
	const guild = guilds.get(guildId)
	const unbClient = new unbapi.Client(process.env.UBTOKEN)
	const award = interaction.options.getBoolean('award') || false
	let channel = interaction.channel

	//Get the data and process it to calculate the total RPP
	let data = await RPP.find()
	for (let i = 0; i < data.length; ++i)
		data[i] = processData(data[i]);
	data.sort((a, b) => a.rpp - b.rpp)

	//Start up the Embed that will give the results
	let embed = new Embed()
		embed.setTitle(`${d20} RPP Award`)
		embed.setDescription(`${check} The following amounts have been added to the user's cash balance.`)
		embed.setColor([102, 187, 106])
		embed.addField("** **")
	if (!award)	
		embed.setFooter("(This is only a test of the new RPP command)")

	let cmdEmbed = new Embed()
		cmdEmbed.setTitle(`${d20} RPP Award`)
		cmdEmbed.addField("** **")
	let resEmbed = new Embed()
		resEmbed.setTitle(`${d20} RPP Award`)
		resEmbed.addField("** **")
	
	const reply = await interaction.deferReply({fetchReply:true,ephemeral:true})
	await Utils.asyncArrayForEach(data, async (record)=>
	{
		const userId = record.user
		const rpp = 1; //record.rpp

		//Find the user & member
		let user = client.users.resolve(userId)
		if (!user) user = await client.users.fetch(userId).catch(() => null)
		let member = guild.members.resolve(user)
		if (!member) member = await guild.members.fetch(user).catch(() => null)
		if (!member)
		{
			console.log("Error: Member not found",{id:userId});
			return
		}
	
		if (rpp > 0)
		{
			//Generate debug output
			const res = member.user.username + record.res			
			resEmbed.extendField(res);
	
			//Generate manual command if needed
			const cmd = `+add-money ${userId} ${rpp}`
			cmdEmbed.extendField(cmd);

			var desc = `<@${userId}>: ${d20}${rpp}`		
			console.log(desc)					
			if (award)
			{
				//Automatically apply the amount to the user			
				//unbClient.getUserBalance(guildId, userId) : 			
				unbClient.editUserBalance(guildId, userId, { cash: rpp })
					.then(record =>
				{
					embed.extendField(desc)
				}).catch(console.error);				
			}
			else
			{
				embed.extendField(desc)				
			}
		}
		await Utils.slowdown(500);
	})

	const url = "https://docs.google.com/spreadsheets/d/17uwNMXlqyA1UZj7j_UWofeUZfg5sdrqWn-fh0R1gH9U/edit#gid=330868712"
	await interaction.editReply("``` [Message data scraped] ```\n"+url)

	await resEmbed.send(channel)
	await cmdEmbed.send(channel)
	
	if (award)
		channel = await guild.channels.fetch(config.botSpamChannel)
	await embed.send(channel)

	// if (award)
	// 	RPP.deleteMany({});
}

async function run(client, message, command, args)
{
}

function processData(record)
{
	const postBaseline = 10;		//# posts in a scene
	const paragraphBaseline = 500;	//# characters in a Paragraph
	const pointsStep = 250;
	const charsMax = 200000;
	const pointsMax = 20000;
	const pointsUpperAvg = 15000;

	const user = record.user
	const chars = record.chars
	const posts = record.posts
	const avg = Math.round(chars / posts);
	const amt = Math.floor(chars / 1000) * 100;
	const scenes = record.scene.length;
	
	let pps = Math.round(posts / scenes);
	let pq = Utils.roundMod(pps / postBaseline, 0.5);
	let cpp = Math.round(chars / posts);
	let cq = Utils.roundMod(cpp / paragraphBaseline, 0.5);
	if (0 == pq) pq = pps / postBaseline;
	if (0 == cq) cq = cpp / paragraphBaseline;

	var finalAmt = 0;
	finalAmt = (chars / charsMax) * 2 * Math.PI;
	finalAmt = Math.atan(finalAmt / 2);
	finalAmt = Math.min(pointsMax,finalAmt*pointsUpperAvg);
	finalAmt = Utils.roundMod(finalAmt, pointsStep);

	var res =  "\t" + chars;
		res += "\t" + posts;
		res += "\t" + scenes;
		res += "\t" + cpp;
		res += "\t" + pps;
		res += "\t" + pq;
		res += "\t" + cq;
		res += "\t\t\t" + finalAmt;

	record.res = res
	record.rpp = finalAmt
	
	return record;	
}

const data = new SlashCommandBuilder()
	.setName('rppcheck')
	.setDescription('Award RPP since the last time this was executed')
	.setDefaultPermission(false)
	.addBooleanOption(option => option.setName('award').setRequired(false)
									  .setDescription('Automatically award values'))

const userPermissions = [	Permissions.FLAGS.SEND_MESSAGES		];
module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole,
	],
	userPermissions: userPermissions,
	execute: execute,
	message: run,

	build:config.DEV
};