const { SlashCommandBuilder,
	    EmbedBuilder, 
	    PermissionsBitField } = require('discord.js')
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function updateDBRecord(channelMeta)
{
	const channelId = channelMeta.channelId;
	const newResult = await ChannelMeta.findOneAndUpdate(
		{channelId: channelId},
		channelMeta,
		{
			upsert: true
		})
	return newResult
}

async function updateTopic(channel, showIcon)
{
	let topic = channel.topic || ""
	const hasIcon = topic.includes(config.xpemoji)
	if (showIcon && !hasIcon)
		topic = `${config.xpemoji} ${topic}`
	else if (!showIcon && hasIcon)
		topic = topic.replace(config.xpemoji,``).trim()
	if (showIcon != hasIcon && topic.length <= 1024)
		await channel.setTopic(topic)
}

async function execute(interaction, expOverride = null)
{
	const channel = interaction.channel;
	const target = interaction.options.getChannel('target') ?? channel;
	const notify = interaction.options.getBoolean('notify') ?? true;
	const exp = interaction.options.getBoolean('xp') ?? expOverride;
	const expIcon = interaction.options.getBoolean('icon') ?? exp;
	const activity = interaction.options.getBoolean('activity') ?? null;
	const ephemeral = (channel == target && !notify);
	await interaction.deferReply({ephemeral:ephemeral});

	//Generate the new record
	const channelMeta = {channelId: target.id}
	//Scene Experience Awarded
	if (null != exp)
		channelMeta.awardsExp = exp
	//Hide Channel Activity
	if (null != activity)
		channelMeta.hideActivity = !activity

	//Update the channel activity
	const oldChannelMeta = await updateDBRecord(channelMeta);

	//Get the old data if the new data wasn't specified
	channelMeta.awardsExp ??= oldChannelMeta?.awardsExp;
	channelMeta.hideActivity ??= oldChannelMeta?.hideActivity;

	//Prepare the embed
	const embed = new EmbedBuilder()
		.setTitle(`Channel Updated`)
		.addFields([{name:`Experience`,value:`<#${target.id}> ${channelMeta.awardsExp?"is":"is not"} eligible for \`/scene\` experience`}])

	//Send the notification if we should, update the 
	if (notify && channel != target )
		await target.send({embeds:[embed]})
	
	//Update the channel topic with the exp icon if the bot has the right permissions
	const chanPerms = channel.permissionsFor(interaction.client.user);
	if (null != expIcon && chanPerms.has(PermissionsBitField.Flags.ManageChannels))
		await updateTopic(target, channelMeta.awardsExp)
	const hasIcon = channel?.topic?.includes(config.xpemoji)
	//Update the embed with additional information for the builder reply
	if (channelMeta.awardsExp && !hasIcon)
		embed.addField([{name:`** **`,value:`*Note: Channel topic does not include exp icon*`}])
	if (channelMeta?.hideActivity != oldChannelMeta?.hideActivity)
		embed.addFields([{name:`Activity`,value:`This channel ${channelMeta.hideActivity?"is not":"is"} visible in the activity tracker`}])
	interaction.editReply({embeds:[embed]})
}

async function run(client, message, command, args)
{
}

const data = new SlashCommandBuilder()
	.setName('chanmeta')
	.setDescription('Upgrade the given channel to make it eligible for RP exp via the ~scene cmd')
	.setDefaultPermission(false)
	.addChannelOption(option => option.setName('target').setRequired(false)
									  .setDescription('Specify a target channel'))
	.addBooleanOption(option => option.setName('xp').setRequired(false)
									  .setDescription('Specify if channel is exp eligible'))
	.addBooleanOption(option => option.setName('activity').setRequired(false)
									  .setDescription('Specify if channel should show activity'))
	.addBooleanOption(option => option.setName('notify').setRequired(false)
									  .setDescription('Should send channel update notification'))
	.addBooleanOption(option => option.setName('icon').setRequired(false)
					 				  .setDescription('Should update channel topic with exp icon'))

const userPermissions = [	PermissionsBitField.Flags.ManageChannels,
							PermissionsBitField.Flags.ViewChannel,						 
							PermissionsBitField.Flags.SendMessages		];

module.exports = 
{
	data: data,
	whitelistRoles: [
		config.BuilderRole,
		config._BuilderRole	
	],
	userPermissions: userPermissions,
	botPermissions: userPermissions,
	execute: execute,
	message: run,

	build:config.PRODUCTION //||config.DEV
};