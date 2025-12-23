const { SlashCommandBuilder,
	EmbedBuilder, ButtonStyle, MessageFlags,
	PermissionsBitField } = require('discord.js')
const { SortOrder } = require(`../../utilities/enums.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const Utils = require(`../../utilities/utilFuncs.js`)
const Activity = require(`../../utilities/activityUtils.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`);
const util = require('util')
const staffRoles = [ config.role.Staff, config.role.Moderator ];

async function execute(interaction) {
	await interaction.deferReply({ ephemeral:true });
	const member = interaction.member;
	const staff = Utils.hasAnyRole(member, staffRoles)
	const userArg = interaction.options.getUser('user') || interaction.user
	const targetUser = (staff && userArg) ? userArg : interaction.user
	const user = targetUser?.id
	await updateEmbed(interaction, user)
}

async function updateEmbed(interaction, user, sort = SortOrder.ASC, showUntrack = false)
{
	const channelManager = interaction.guild.channels
	// Get the list of scenes
	let scenes = await Activity.getActiveScenes(user);
	const keys = { "time":sort }
	scenes.sort((a,b) => Utils.priorityCompare(a,b,keys))
	scenes = scenes.slice(0, 25)

	//console.log(scenes)

	//Generate fields and select options from data
	const fields = []
	let  options = []
	let  delOpts = []
	const components = []
	await Utils.asyncArrayForEach( scenes, async sceneData => {
		const channel = channelManager.resolve(sceneData.chan)
		if (!channel) channel = await channelManager.fetch(sceneData.chan)
		const chanName = Utils.toSentenceCase(channel.name,true);
		const awardsExp = await ChanUtils.isRPExpEligible(channel)
		const xpEmoji = awardsExp ? config.emoji.xp : ""
		const locations = await ChanUtils.getChannelLocationRoles(channel) || []
		const roles = locations?.map(x => `<@&${x}>`).join(" | ") || null
		const sceneStatus = await Activity.getChannelStatus(channel)
		const {status,lastMsg,elapsed,author} = sceneStatus
		const users = sceneData.users.map(x => `<@${x}>`).join(" | ")
		const name  = `**${chanName}** (<#${channel.id}>)`;
		const msg =`${lastMsg} ${elapsed} ${author}`.trim()
		let   value = '';
		value += `-# ${xpEmoji}${status} - *${msg}*\n`
		if (roles) value += `-# Location: ${roles}\n`
		value += `-# Participants: ${users}`
		fields.push({name,value})
		options.push( ...locations )
		delOpts.push( Prompt.createSelectOption(chanName, null, channel.id) )
	})
	options = [...new Set(options)]
	options = options.slice(0,25)

	const button = (sort == SortOrder.ASC) ?
		{style:ButtonStyle.Primary, emoji:"🔀",label:"Sort: New to Old", custom_id:`${data.name}.descend`} :
		{style:ButtonStyle.Primary, emoji:"🔀",label:"Sort: Old to New", custom_id:`${data.name}.ascend`}
	const buttons = [button]

	// Attach a method to untrack a given scene
	if (scenes.length)
	{
		const sortArg = sort == SortOrder.ASC ? "asc" : "desc"
		const id = `${data.name}.untrack.${sortArg}`
		const untrackSelect = Prompt.createSelectRow(id, delOpts, 0, 1, "Select scene to untrack")
		buttons.push({style:ButtonStyle.Danger, emoji:"✖️",label:"Untrack",custom_id:id})
		const cancel = {style:ButtonStyle.Secondary, emoji:"✖️",label:"Cancel",custom_id:`${data.name}.cancel`}
		if (showUntrack)
		{
			components.push(untrackSelect)
			components.push(Prompt.createButtonRow([cancel]))
		}
	}

	// Attach a button to reorder
	if (scenes.length > 0 && !showUntrack) components.push(Prompt.createButtonRow(buttons))

	//Handle the travel attachment
	const travel = interaction.client.commands.get(`travel${config.DEV ? "dev" : ""}`)
	if (scenes.length > 0 && !showUntrack)
	{
		const select = await travel?.attach?.selectMenu?.(interaction, options)
		components.push(select)
	}

	//console.log(util.inspect(select, false, null, true /* enable colors */))
	const curSort = sort == SortOrder.ASC ? "oldest to newest" : "newest to oldest"
	const desc = scenes.length == 0 ? `-# *No scenes found - reply to scenes to track them here.*` :
					`-# *Showing ${fields.length} of ${scenes.length} scenes sorted ${curSort}.*`
	const embed = new EmbedBuilder().setTitle("Scene Status")
									.setDescription(desc)
									.addFields(fields)
									.setFooter({text:user})
	await interaction.editReply({embeds:[embed], components})
}


async function handleInteraction(interaction) {
	const travel = interaction.client.commands.get(`travel${config.DEV ? "dev" : ""}`)
	if (interaction.isAnySelectMenu())
	{
		if (interaction.customId.startsWith("travel") && travel.select)
		{
			await travel.select(interaction)
		}
		else if (interaction.customId.includes("untrack"))
		{
			await interaction.deferUpdate({ephemeral:true})
			const ascend = interaction.customId.includes("asc")
			const sortDir = ascend ? SortOrder.ASC : SortOrder.DESC
			const user = interaction.message?.embeds?.[0]?.footer?.text || interaction.user.id

			let scenes = interaction.values
			await Utils.asyncArrayForEach( scenes, async scene => {
				await Activity.untrackScene(scene, user)
			});
			await updateEmbed(interaction, user, sortDir)
		}
	}
	else if (interaction.isButton())
	{
		await interaction.deferUpdate({ephemeral:true})
		const ascend = interaction.customId.includes("asc")
		const sortDir = ascend ? SortOrder.ASC : SortOrder.DESC
		const user = interaction.message?.embeds?.[0]?.footer?.text || interaction.user.id
		const showUntrack = interaction.customId.includes("untrack")
		await updateEmbed(interaction, user, sortDir, showUntrack)
	}
}


const data = new SlashCommandBuilder()
	.setName(`scenestatus${config.DEV ? "dev" : ""}`)
	.setDescription("View the channel status for your tracked scenes")
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
	select: handleInteraction,
	button: handleInteraction,
	build:config.PRODUCTION
};
