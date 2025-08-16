const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const Utils = require(`../../utilities/utilFuncs.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)
const levelUtils = require(`../../utilities/levelUtils.js`)

const ephemeral = {flags:MessageFlags.Ephemeral}
const requiredRoles = [ config.role.Moderator,
					    config.role.Builder];

function trimContent(content)
{
	return "```\n" + content.substr(0,1989) + "...\n```"
}

async function getReactData(message)
{
	const reactEmbed = new EmbedBuilder().setTitle("Reacts")
	//const reacts = [...reactions.keys()];

	const levels = await levelUtils.findLevelData({});

	let first = true;

	const fields = [];
	const charData = {};
	for (const [emoji, reaction] of message.reactions.cache) {
		// Fetch users for this reaction (avoid partials issues)
		const users = await reaction.users.fetch();

		// Map to usernames (or display names in the guild)
		const userNames = users.map(user => {
			// If message is in a guild, get the guild member's display name
			let name = user.username
			if (message.guild) {
				const member = message.guild.members.cache.get(user.id);
				name = member ? member.displayName : user.username;
			}

			const chars = levels.filter( char => char.user == user.id)
			const count = chars.length || 0
			const level = count ? Math.max(...chars.map( char => char.level)) : "-"
			charData[name] = {level, count};

			return name
		});

		fields.push({
			name: emoji,
			value: userNames.join("\n"),
			inline: true
		});
	}

	let names = Object.keys(charData)
	names = names.map(char => `${char} / ${charData[char].level} /  ${charData[char].count} `)
	names.sort()
	reactEmbed.setDescription(names.join("\n"))

	//reactEmbed.setFields(fields)
	return reactEmbed
}

async function execute(interaction)
{
	const user  = interaction.user;
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = await channel?.messages.fetch(messageId);
	let responses = [];

	if (!message) return interaction.reply({ 	content: 'No message found', ...ephemeral });


	// await interaction.deferReply({...ephemeral});
	// const reactEmbed = await getReactData(message)
	// interaction.editReply({ embeds:[reactEmbed], ...ephemeral });
	// return;


	if (message.content) message.content = message.content.replace('\`','\\`')
	await interaction.reply({ 	content: trimContent(message.content),
								...ephemeral });
	await interaction.followUp({ content: `Before: ${message.content.length} chars`, ...ephemeral });
	let stats = await MsgUtils.scrapeMessageMetadata(null, message)
	let content = MsgUtils.cleanMessageContent(message);

	await interaction.followUp({ content: trimContent(content), ...ephemeral });
	await interaction.followUp({ content: `After: ${content.length} chars`, ...ephemeral });

	responses = []
	message.embeds.forEach(embed => {
		responses.push( "```\n" + JSON.stringify(embed.toJSON(),null,"\t") + "```")
	})

	Utils.asyncArrayForEach(responses, async (response) =>
	{
		await interaction.followUp({ content: response, ...ephemeral });
		await user.send({ content: response })
	});
}

module.exports =
{
	data: new ContextMenuCommandBuilder()
		.setName('Message Metadata')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.DEV
};