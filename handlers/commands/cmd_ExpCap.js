const { SlashCommandBuilder,
		EmbedBuilder, ButtonStyle,
		PermissionsBitField } = require('discord.js')
const { SortOrder } = require(`../../utilities/enums.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Utils = require(`../../utilities/utilFuncs.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const expUtils = require(`../../utilities/expUtils.js`)
const charUtils = require(`../../utilities/charUtils.js`)
const levelUtils = require(`../../utilities/levelUtils.js`)
const Daily = require(`../../database/dailyExpSchema.js`)
const Level = require(`../../database/levelSchema.js`)
const util = require('util')
const staffRoles = [ config.role.Staff, config.role.Moderator ];

const typeEmoji = {"duel":"⚔️","scene":config.emoji.xp}

async function cleanup()
{
	const currentDate = new Date();
	const daily = await Daily.find()
	const expired = await Daily.find({reset: { $lte: currentDate } })
	const unexpired = await Daily.find({reset: { $gt: currentDate } })
	console.log("Expired:" + expired.length)
}

async function execute(interaction) {
	await interaction.deferReply({ephemeral:true})
	const member = interaction.member;
	const staff = Utils.hasAnyRole(member, staffRoles)
	const userArg = interaction.options.getUser('user') || interaction.user
	const targetUser = (staff && userArg) ? userArg : interaction.user
	const user = targetUser?.id
	await updateEmbed(interaction, user, staff)
}

async function getChars(user) {
	const chars = await Level.find({user})

	keys = { "level":SortOrder.DESC, "char":SortOrder.ASC };
	chars.sort((a,b)=>{ return Utils.priorityCompare(a, b, keys) })

	//chars.sort((a,b) => {}); //Sort by descending level: ((a,b) => b.level - a.level);
	return chars;
}

async function getExpData(user, chars = null) {
	const currentDate = new Date();

	if (!chars) chars = await getChars(user)
	const daily = await Daily.find({user, reset:{$gt:currentDate}})

	//Consolidate it into a single data structure
	const data = {};
	chars.forEach(char => {
		data[char.name] = {name:char.name, level:char.level, xp:{}}
	})
	daily.forEach(exp => {
		if (data[exp.name])
		{
			const xp = {exp:exp.exp, cap:exp.cap, reset:(exp.reset / 1000)}
			data[exp.name].xp[exp.type] = xp
		}
	})

	return data;
}

async function updateEmbed(interaction, user, staff = false, subcmd = null)
{
	// Get character / level and daily exp data
	const chars = await getChars(user)
	const expData = await getExpData(user, chars)

	//Generate fields and select options from data
	const fields = []
	const options = []
	chars.forEach(char => {
		const field = {};
		field.name = `${char.name} (${char.level})`
		field.value = []
		const types = Object.keys(typeEmoji);
		types.forEach(type => {
			let xp = expData[char.name].xp[type]
			type = `${typeEmoji[type]} \`${type}\``
			if (xp)
				xp = `- ${type} - [\`${xp.exp}\` / \`${xp.cap}\`]\n`+
					 `  -#  - \`Reset\`: <t:${xp.reset}:F> (<t:${xp.reset}:R>)`
			else
				xp = `- ${type} - \`No Exp Today\``

			field.value.push(xp)
		})
		field.value = field.value.join("\n")
		fields.push(field)
		const option = Prompt.createSelectOption(field.name, null, char.name)
		options.push(option)
	})
	fields.push({name:"** **", value:`-# If a character is missing, run the \`!setup\` command in  <#${config.chan.xpSpam}>\n-# If a level is incorrect, run the \!xp\` command in <#${config.chan.xpSpam}>.\n-# If any of these characters are not a valid PC, you can click the \`❌ Remove\` button.\n-# If you need further help, contact a <@&${config.role.Helper}> or <@&${config.role.Staff}> member.`})

	//Generate components
	const prefix = `${data.name}.`
	const components = []
	const buttons = [{style:ButtonStyle.Secondary, emoji:"❌", label:"Remove", custom_id:`${prefix}delete`}]
	if (staff)
		buttons.push({style:ButtonStyle.Secondary, emoji:"⏰", label:"Reset Daily Exp ", custom_id:`${prefix}reset`});
	const buttonRow = Prompt.createButtonRow(buttons)
	components.push(buttonRow)

	if (null != subcmd)
	{
		const select = Prompt.createSelectRow(`${prefix}${subcmd}char`,options,1,1,`Select a character to ${subcmd}`)
		components.push(select)
	}

	const embed = new EmbedBuilder().setTitle("Character Exp Details").addFields(fields)
									.setFooter({text:user})
	await interaction.editReply({embeds:[embed], components})
}

async function handleInteraction(interaction) {
	const member = interaction.member
	const staff = Utils.hasAnyRole(member, staffRoles)

	const customId	= interaction.customId;
	const message	= interaction.message || null;
	const embed		= message?.embeds?.[0] || null;
	let   user		= embed?.footer?.text || "";
	let   char		= null
	if (!message || !embed || !user) return;

	console.log(`Handle: ${customId} for ${user}`)

	await interaction.deferUpdate();

	const prefix = `${data.name}.`
	if (!customId.startsWith(prefix))
		throw new Error("Interaction routed to incorrect command")

	const command = customId.replace(prefix,"");
	switch(command)
	{
		case `deletechar`:
			char = { user, name:interaction.values[0] }
			await levelUtils.PurgeChar(char)
			await updateEmbed(interaction, user, staff)
			charUtils.RefreshCache();
			break;
		case `resetchar`:
			char = { user, name:interaction.values[0] }
			await expUtils.resetDailyExp(char)
			await updateEmbed(interaction, user, staff)
			break;
		default:
			await updateEmbed(interaction, user, staff, command)
	}
}

const data = new SlashCommandBuilder()
	.setName(`expcap${config.DEV ? "dev" : ""}`)
	.setDescription("View your daily exp cap info")
	.addUserOption(option => option
		.setName('user')
		.setDescription('Specify a user (staff only)')
		.setRequired(false)
	)

const userPermissions = [ PermissionsBitField.Flags.SendMessages ];
module.exports =
{
	data: data,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,

	build:config.PRODUCTION
};
