/**
 * cmd_Location.js
 * Player-facing slash command allowing a channel owner or admin to assign or
 * re-assign the location(s) for their channel.
 *
 * Location slot limits (enforced at the UI and save layers):
 *   - Default          → 1 location
 *   - "Exp" upgrade    → 2 locations
 *   - "Thread" upgrade → 3 locations  (implies Exp upgrade as well)
 *
 * Only the registered channel owner(s) or a Builder-role admin may use this
 * command. The command reads the existing chanMeta to determine the upgrade
 * tier, then presents a location select menu capped accordingly.
 */
const { EmbedBuilder, SlashCommandBuilder, PermissionsBitField, 
		OverwriteType, MessageFlags, ButtonStyle } = require('discord.js')
const ChannelMeta	= require(`../../database/chanMetaSchema.js`)
const ChanUtils		= require(`../../utilities/channelUtils.js`)
const Prompt		= require(`../../utilities/promptUtils.js`)
const Utils			= require(`../../utilities/utilFuncs.js`)
const mod			= process.env.mod || "";
const config		= require(`../../config/${mod}_config.json`);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ephemeral = {flags:MessageFlags.Ephemeral};
const BR = `\n\`${' '.repeat(69)}\``
const threadIcon = "🧵";
/** Minimum locations a channel must always have. */
const MIN_LOCATIONS = 1;
/** Location slot caps per upgrade tier. */
const MAX_LOCATIONS = {
	default: MIN_LOCATIONS,
	exp:     2,
	thread:  3,
};
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const TOPIC_COOLDOWN = 5 * 60 * 1000;	// 5 minutes
const RATE_LIMIT = {}
const timeout = (ms, err) => new Promise((_, reject) => setTimeout(() => reject(new Error(err)), ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Returns the maximum number of location slots allowed for a channel based on
 * its current upgrade flags in chanMeta.
 * Upgrade precedence: thread > exp > default
 * @param {object} chanMeta - The channel's metadata document.
 * @returns {number}
 */
function getLocationLimit(chanMeta) {
	if (chanMeta.threadMax > 0)  return MAX_LOCATIONS.thread;
	if (chanMeta.awardsExp)      return MAX_LOCATIONS.exp;
	return MAX_LOCATIONS.default;
}

/**
 * Returns null if the cooldown has passed, or a Discord timestamp string if
 * the user must still wait.
 * Builders bypass the cooldown entirely.
 * @param {object} chanMeta
 * @returns {string|null}
 */
function getCooldownBlock(chanMeta) {
	const last = chanMeta.locationCooldown ?? 0;
	const next = last + COOLDOWN_MS;
	if (Date.now() < next)
	{
		const timestamp = Math.floor(next / 1000);
		return `<t:${timestamp}:R>\n(<t:${timestamp}:F>)`;
	}
	return null;
}

/**
 * Builds a human-readable description of the channel's current upgrade tier
 * and how many location slots it unlocks.
 * @param {object} chanMeta
 * @returns {string}
 */
function getTierDescription(chanMeta) {
	if (chanMeta.threadMax > 0)
		return `${config.emoji.xp} \`Exp\` | 🧵 \`Thread\``;
	if (chanMeta.awardsExp)
		return `${config.emoji.xp} \`Exp\``;
	return `⬜ **No Upgrades**`;
}

/**
 * Syncs the channel's Discord permission overwrites so that every role in
 * chanMeta.locations receives ViewChannel, and roles that were removed lose it.
 * Delegates to the shared helper from admincmd_ChanMeta when available;
 * otherwise performs a minimal inline sync.
 *
 * @param {import('discord.js').GuildChannel} channel
 * @param {object} chanMeta
 */
async function syncLocationPerms(channel, chanMeta) {
	const locationPermission = { ViewChannel: true };

	// Build the set of all known location role IDs for safe cleanup.
	const knownIds = new Set([
		...ChanUtils.LocationRoles.user.map(r => r.value),
	]);

	// Remove permission overrides for location roles no longer in chanMeta.
	for (const [id, override] of channel.permissionOverwrites.cache) {
		if (override.type === OverwriteType.Role && knownIds.has(id) && !chanMeta.locations.includes(id)) {
			await channel.permissionOverwrites.delete(id);
		}
	}

	// Grant ViewChannel to each location role in chanMeta.
	for (const id of chanMeta.locations) {
		const existing = channel.permissionOverwrites.cache.get(id);
		if (!existing || !existing.allow.has(PermissionsBitField.Flags.ViewChannel)) {
			await channel.permissionOverwrites.create(id, locationPermission);
		}
	}
}

/**
 * Persists chanMeta changes to MongoDB.
 * @param {object} chanMeta
 */
async function saveChanges(chanMeta) {
	await ChannelMeta.findOneAndUpdate(
		{ channelId: chanMeta.channelId },
		chanMeta,
		{ upsert: false }
	);
}

/*
*/
async function updateChannelTopic(channel, chanMeta) {
	let topic = channel.topic || ""
	if (channel?.isThread()) return; // threads don't have topics

	const now = Date.now()
	if (RATE_LIMIT[channel.id] + TOPIC_COOLDOWN > now)
	{
		const diff = ((RATE_LIMIT[channel.id] + TOPIC_COOLDOWN) - now) / 1000;
		console.log(`--- Skipping topic set to avoid rate limits (${diff}s)`)
		return;
	}
	RATE_LIMIT[channel.id] = now;

	if (topic.includes(config.emoji.xp)) topic = topic.replaceAll(config.emoji.xp,``)
	if (topic.includes(threadIcon)) topic = topic.replaceAll(threadIcon,``)
	if (topic.includes(":thread:")) topic = topic.replaceAll(":thread:",``)
	ChanUtils.LocationRoles.user.forEach( role => {
		const value = `<@&${role.value}>`
		if (topic.includes(value)) topic = topic.replaceAll(value,``)
	})

	const prefix = [];
	if (chanMeta.awardsExp) prefix.push(config.emoji.xp)
	if (chanMeta.threadMax > 0) prefix.push(threadIcon)
	if (chanMeta.locations.length > 0) prefix.push(`<@&${chanMeta.locations.join('><@&')}>`)
	chanMeta?.userOwner?.forEach(owner => {
		if (!topic.includes(`<@${owner}>`)) prefix.push(`<@${owner}>`)
	})
	topic = prefix.join("") + "\n" + topic.trim()

	if (topic.length > 1024)
		throw new Error(`Channel topic would exceed Discord's character limit`)

	if (topic == channel.topic)
	{
		console.log("--- Topic unchanged, skipping set")
		return;
	}

	try {
		// Force it to throw an error if Discord takes longer than 5 seconds
		await Promise.race([
			channel.setTopic(topic),
			timeout(5000, "Update channel topic failed - request timed out")
		]);
	}
	catch(e){ console.error(e); throw e; }
}

/**
 * Create an embed
 */
function EmbedReply(desc, fields = null)
{
	const embed = new EmbedBuilder()
		.setTitle('📍 Channel Location')
		.setDescription(BR+"\n"+desc);
	if (null != fields)
		embed.addFields(fields)
	return embed;
}

function EmbedMenu(chanMeta)
{
	const channelId		= chanMeta.channelId;
	const MAX_LOCATIONS = getLocationLimit(chanMeta);
	const tierDesc      = getTierDescription(chanMeta);
	const minMaxStr		= `You may select between **${MIN_LOCATIONS}** and **${MAX_LOCATIONS}** location(s).`;
	const ownerStr 		= chanMeta.userOwner?.length
						? chanMeta.userOwner.map(owner => `<@${owner}> (\`${owner}\`)`).join("\n")
						: '*None*'
	const currentLocStr = chanMeta.locations.length
						? chanMeta.locations.map(id => `<@&${id}>`).join('\n')
						: '*None set*';
	// ── Cooldown check ──────────────────────────────────────────────────
	const cooldownBlock = getCooldownBlock(chanMeta);

	const embed = new EmbedBuilder()
		.setTitle('📍 Channel Location')
		.setDescription(BR+"\n"+`Use the menu below to set the location(s) for`)
		.addFields(
			{ name: `Channel`, value: `<#${chanMeta.channelId}> (\`${chanMeta.channelId}\`)` },
			{ name: `Owners`, value: ownerStr},
			{ name: 'Current Location(s)', value: currentLocStr },
			{ name: `Upgrade tier: ${tierDesc}`, value: minMaxStr}
		)
		.setFooter({ text: channelId });
	if (cooldownBlock)
		embed.addFields({ name: `⏳ Cooldown`, value: `You may change locations again ${cooldownBlock}.`})
	return embed;
}

function GetLocationOptions(chanMeta)
{
	let locationOptions = JSON.parse(JSON.stringify(ChanUtils.LocationRoles.user));
	locationOptions = locationOptions
		.map(role => {
			if (chanMeta.locations.includes(role.value)) role.default = true;
			return role;
		})
		.sort((a, b) => a.label.localeCompare(b.label));
	return locationOptions
}

function GetLocationSelect(locationOptions, MAX_LOCATIONS, locked)
{
	const locationSelect = Prompt.createSelectRow(
		`${data.name}.location`,
		locationOptions,
		MIN_LOCATIONS,  // must pick at least 1
		MAX_LOCATIONS,       			// cap from upgrade tier
		'Select location(s)…'
	);

	if (locked) locationSelect.components[0].setDisabled(true)
	return locationSelect
}

function GetResetButton()
{
	const button = [{style:ButtonStyle.Primary, emoji:config.emoji.undo,
					 label:"Reset", custom_id:`${data.name}.reset`}]
	return Prompt.createButtonRow(button)
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

const data = new SlashCommandBuilder()
	.setName(`location${config.DEV ? "_dev" : ""}`)
	.setDescription('Assign or update the location(s) for this channel');

const whitelistRoles  = [ config.role.Builder ];
const userPermissions = [
	PermissionsBitField.Flags.ViewChannel,
	PermissionsBitField.Flags.SendMessages,
];

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
async function execute(interaction) {
	await interaction.deferReply({...ephemeral});
	let channel = interaction.channel;
	if (channel.isThread()) channel = channel.parent;

	await ChanUtils.refreshLocationRoles(interaction.guild);

	// ── Fetch chanMeta ──────────────────────────────────────────────────────
	const chanMeta = await ChannelMeta.findOne({ channelId: channel.id });
	if (!chanMeta) {
		const embed = EmbedReply(`⚠️ No channel record found for <#${channel.id}>.\n`+
								 `Inform <@&${config.role.Builder}> if this is in error.`);
		return interaction.editReply({embeds:[embed]});
	}

	// ── Permission check ────────────────────────────────────────────────────
	const isBuilder = Utils.hasAnyRole(interaction.member, whitelistRoles);
	const isOwner   = chanMeta.userOwner?.includes(interaction.user.id) ?? false;
	if (!isBuilder && !isOwner) {
		const embed = EmbedReply(`🚫 Only the channel owner or a <@&${config.role.Builder}> can change this channel's location.`);
		return interaction.editReply({embeds:[embed]});
	}

	// ── Determine upgrade tier ──────────────────────────────────────────────
	const MAX_LOCATIONS = getLocationLimit(chanMeta);
	// ── Cooldown check ──────────────────────────────────────────────────
	const cooldown = getCooldownBlock(chanMeta);

	// ── Build location select options ───────────────────────────────────────
	// Always use the `user` location list for this player-facing command.
	// Admins can use /chanmeta to assign guild-specific locations.
	let locationOptions = GetLocationOptions(chanMeta);
	const locationSelect = GetLocationSelect(locationOptions, MAX_LOCATIONS, cooldown);
	const components = [locationSelect]
	if (cooldown && isBuilder) components.push(GetResetButton());

	// ── Build the reply embed ───────────────────────────────────────────────
	const embed = EmbedMenu(chanMeta)
	await interaction.editReply({ embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Interaction handler (select menu)
// ---------------------------------------------------------------------------

async function handleInteraction(interaction) {
	// Only handle our own select menus.
	if (!interaction.customId?.startsWith(`${data.name}.`)) return;

	await interaction.deferUpdate();

	// ── Re-fetch chanMeta from the footer of the original embed ────────────
	let error 		= null;
	const embed     = interaction.message?.embeds?.[0] ?? null;
	const channelId = embed?.footer?.text ?? null;
	if (!channelId) return;

	const chanMeta = await ChannelMeta.findOne({ channelId });
	if (!chanMeta) return;

	let channel   = await interaction.guild.channels.fetch(channelId);
	if (channel?.isThread()) channel = channel.parent;
	const isBuilder = Utils.hasAnyRole(interaction.member, whitelistRoles);
	const isOwner   = chanMeta.userOwner?.includes(interaction.user.id) ?? false;

	if (!isBuilder && !isOwner) {
		const embed = EmbedReply(`🚫 You do not have permission to change this channel's location.`);
		return interaction.followUp({ embeds:[embed], ...ephemeral });
	}

	// ── Cooldown check ──────────────────────────────────────────────────
	let cooldown	= getCooldownBlock(chanMeta);
	if (cooldown && !isBuilder)
	{
		const embed = EmbedReply(`⏳ Location can be changed again ${cooldown}.`);
		return interaction.followUp({embeds:[embed],...ephemeral});
	}

	let updated			= false;
	let MAX_LOCATIONS	= getLocationLimit(chanMeta);

	const command = interaction.customId.replace(`${data.name}.`, '');
	if (command === 'location') {
		const selectedIds = interaction.values;

		// ── Slot guard ──────────────────────────────────────────────────────
		// Guard: enforce the slot cap (the Discord UI enforces it too, but
		// double-check server-side in case of unexpected payloads).
		if (selectedIds.length < MIN_LOCATIONS || selectedIds.length > MAX_LOCATIONS) {
			const embed = EmbedReply(`⚠️ You must select between **${MIN_LOCATIONS}** and **${MAX_LOCATIONS}** location(s)`);
			return interaction.followUp({embeds:[embed],...ephemeral});
		}
		chanMeta.locations = selectedIds;

		// Persist changes and sync Discord permissions.
		try
		{
			chanMeta.locationCooldown = Date.now();
			const permResults = await syncLocationPerms(channel, chanMeta);
			await saveChanges(chanMeta);
			await updateChannelTopic(channel, chanMeta)
		}
		catch(e)
		{
			error = e
			console.log(e)
		}

		updated = true;
	}
	else if (command === 'reset')
	{
		chanMeta.locationCooldown = 0;
		await saveChanges(chanMeta);
		updated = false;
	}

	// Refresh the embed to show updated locations.
	cooldown 			= getCooldownBlock(chanMeta);
	let updatedOptions	= GetLocationOptions(chanMeta)
	const updatedSelect = GetLocationSelect(updatedOptions, MAX_LOCATIONS, cooldown)
	const components 	= [updatedSelect]
	if (cooldown && isBuilder) components.push(GetResetButton());
	const updatedEmbed	= EmbedMenu(chanMeta);
	if (error) updatedEmbed.addFields({name:"⚠️ Error", value: error.toString()})

	const content		= updated ? `✅ Location updated for <#${channelId}>.` : "";
	const reply			= { content, embeds: [updatedEmbed], components };
	await interaction.editReply(reply);

	if (updated)
	{
		const logChanId = config.debug.location;
		const logChan = await interaction?.guild?.channels?.fetch(logChanId);
		if (logChan) await logChan.send({embeds:[updatedEmbed]})
	}
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

module.exports = {
	data,
	whitelistRoles,
	userPermissions,
	botPermissions: userPermissions,
	execute,
	button: handleInteraction,
	select: handleInteraction,
	build: config.PRODUCTION || config.DEV,
};