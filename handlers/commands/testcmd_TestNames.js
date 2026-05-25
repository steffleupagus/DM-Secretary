const {
	SlashCommandBuilder,
	EmbedBuilder,
	MessageFlags,
	PermissionsBitField,
} = require("discord.js");

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Embed = require(`../../utilities/EmbedPaginator.js`);
const charUtils = require(`../../utilities/charUtils.js`);
const charMatch = require(`../../utilities/charMatchUtils.js`);
const Log = require(`../../utilities/loggerUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`);
const tupperSchema = require(`../../database/tupperSchema.js`);

const staffRoles = [ config.role.Staff, config.role.Moderator, config.role.Builder ];

async function execute(interaction) {
	const ephemeral = {flags: MessageFlags.Ephemeral}
	await interaction.deferReply({...ephemeral})

	const member = interaction.member;
	const staff = Utils.hasAnyRole(member, staffRoles)
	const userArg = interaction.options.getUser('user') || interaction.user
	const targetUser = (userArg) ? userArg : interaction.user
	const user = targetUser?.id
	
	const log = (user == "912162588253642763" ||
				 user == "912167154906988595" );

	const tupperData = await nameMatchTest(user, log);
	if (log)
		await interaction.editReply("Logged");
	else
	{
		const embed = GenerateEmbed(tupperData);
		await interaction.followUp({embeds:[embed]});
	}
}

function GenerateEmbed(tupperData)
{
	const embed = new EmbedBuilder()
	embed.setTitle("Tupper Matches")
	const fields = tupperData.map( t => {
		const name = t.tupper;
		let value = "No match";
		if (t.match && t.match.partial)
			value = `Partial Match: ${t.match.target} (Substring: ${t.match.partial})`
		else if (t.match)
			value = `Match: ${t.match.target} (${(t.match.rating * 100).toFixed(2)}%)`
		else if (t.candidates.length > 0)
			value = t.candidates.map( c => `${c.target} (${(c.rating * 100).toFixed(2)}%)`).join("\n")
		return {name, value}
	})
	embed.addFields(fields)
	return embed
}

async function nameMatchTest(targetUser = null, logAll = false) {
	if (logAll) targetUser = null;
	const tupperLog = await tupperSchema.find();
	let tupperData = tupperLog.map((tup) => {
		return { n: tup.t, u: tup.aId };
	});
	if (targetUser) tupperData = tupperData.filter( t => t.u == targetUser );

	const seen = new Set();
	const tuppers = tupperData.filter((t) => {
		const key = `${t.n}-${t.u}`;
		return seen.has(key) ? false : seen.add(key);
	});
	console.log("Tuppers: " + tuppers.length);
	tupperChars = tuppers.map(t => t.n)
	tupperChars.sort()

	let charData = charUtils.charCache.map(char => {
		return { n: char.name, u: char.user };
	});
	if (targetUser) charData = charData.filter( c => c.u == targetUser );
	const charIDs = [...new Set(charData.map( c => c.u ))];
	console.log("Characters: " + charData.length);

	tupperData = tuppers.filter( t => charIDs.includes(t.u) )
	.map(t => {
		const tupper = t.n;
		const userId = t.u;
		const userChars = charData.filter( c => c.u == t.u ).map( c => c.n );

		//const matches = charMatch.findBestMatch(tupper, charNames);
		const matches = charMatch.findBestMatch(tupper, userChars);
		const match = matches.bestMatch;
		const candidates = matches.rawRatings.map(m => ({target: m.target, rating: m.rating, partial: m.partial}))

		return {
			tupper,
			userId,
			match,
			candidates
		};
	})

	if (logAll)
	{
		//tupperData.map( t => {if (t.match?.rating == 1) delete t.candidates} )
		tupperData = tupperData.filter( t => t.match != null && (t.match.rating < 1) )
		Log.FILE("./data/test/nameTest.json", tupperData)
	}

	//console.log(tupperChars)
	//console.log(tupperData)
	return tupperData;
}

const data = new SlashCommandBuilder()
	.setName("testnames")
	.setDescription("Test name matching from Tupper log")
	.addUserOption(option => option
		.setName('user')
		.setDescription('Specify a user')
		.setRequired(false)
	)
const userPermissions = [PermissionsBitField.Flags.SendMessages];
module.exports = {
	data: data,
	userPermissions: userPermissions,
	execute: execute,
	build: config.PRODUCTION || config.DEV,
};
