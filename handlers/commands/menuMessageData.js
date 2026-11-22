const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const {
	ContextMenuCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	AttachmentBuilder,
} = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const MsgUtils = require(`../../utilities/messageUtils.js`)

const requiredRoles = [config.role.Moderator, config.role.Builder];

const COLOR = 0x5865F2;
const MAX_FIELDS = 25;        // Discord limit per embed
const MAX_FIELD_NAME = 256;   // Discord limit per field name
const MAX_FIELD_VALUE = 1024; // Discord limit per field value
const EMBED_BUDGET = 5500;    // Discord caps total embed text at 6000 chars

/**
 * Returns every reaction on a message, with every user who reacted with each emoji.
 * @param {import('discord.js').Message} message
 * @returns {Promise<Array<{ emoji: string, count: number, users: Array<{ username: string, id: string }> }>>}
 */
async function getAllReactions(message) {
	await message.fetch();

	const results = [];
	for (const reaction of message.reactions.cache.values()) {
		const users = [];
		let lastId;
		while (true) {
			const batch = await reaction.users.fetch({ limit: 100, after: lastId });
			if (batch.size === 0) break;
			for (const user of batch.values()) {
				users.push({ username: user.username, id: user.id });
			}
			if (batch.size < 100) break;
			lastId = batch.lastKey();
		}

		results.push({
			emoji: reaction.emoji.name ?? reaction.emoji.toString(),
			count: users.length,
			users,
		});
	}
	return results;
}

/** Human-readable names for component type IDs, including Components V2 types. */
const COMPONENT_TYPE_NAMES = {
	[ComponentType.ActionRow]: 'ActionRow',
	[ComponentType.Button]: 'Button',
	[ComponentType.StringSelect]: 'StringSelect',
	[ComponentType.TextInput]: 'TextInput',
	[ComponentType.UserSelect]: 'UserSelect',
	[ComponentType.RoleSelect]: 'RoleSelect',
	[ComponentType.MentionableSelect]: 'MentionableSelect',
	[ComponentType.ChannelSelect]: 'ChannelSelect',
	[ComponentType.Section]: 'Section',
	[ComponentType.TextDisplay]: 'TextDisplay',
	[ComponentType.Thumbnail]: 'Thumbnail',
	[ComponentType.MediaGallery]: 'MediaGallery',
	[ComponentType.File]: 'File',
	[ComponentType.Separator]: 'Separator',
	[ComponentType.ContentInventoryEntry]: 'ContentInventoryEntry',
	[ComponentType.Container]: 'Container',
};

/**
 * Visits every component in the tree, depth-first. Recurses into `components`
 * (ActionRows, Containers, Sections) and into a Section's `accessory`.
 * @param {Array<any>} components
 * @param {(component: any, depth: number) => void} visit
 * @param {number} depth
 */
function walkComponents(components, visit, depth = 0) {
	for (const c of components ?? []) {
		visit(c, depth);
		const children = c.components ?? (c.accessory ? [c.accessory] : []);
		if (children.length) walkComponents(children, visit, depth + 1);
	}
}

/** Returns the readable type name for a component, falling back to the raw ID. */
function componentTypeName(c) {
	return COMPONENT_TYPE_NAMES[c.type] ?? `Unknown(${c.type})`;
}

/** One line per component: its type, plus a label or text preview where one exists. */
function describeComponent(c) {
	const extras = [];
	if (c.label) extras.push(c.label);
	if (c.placeholder) extras.push(c.placeholder);
	if (c.type === ComponentType.TextDisplay && c.content) {
		const preview = c.content.replace(/\s+/g, ' ').slice(0, 60);
		extras.push(`"${preview}${c.content.length > 60 ? '…' : ''}"`);
	}
	if (c.disabled) extras.push('disabled');

	const name = `**${componentTypeName(c)}**`;
	return extras.length ? `${name} — ${extras.join(' · ')}` : name;
}

/** Formats the component tree as indented lines for the Components view. */
function componentTreeLines(message) {
	const lines = [];
	walkComponents(message.components, (c, depth) => {
		lines.push(`${'│ '.repeat(depth)}${describeComponent(c)}`);
	});
	return lines;
}

/** Counts each component type across the whole tree, e.g. "Container ×1 · TextDisplay ×3". */
function componentSummary(message) {
	const counts = new Map();
	walkComponents(message.components, c => {
		const name = componentTypeName(c);
		counts.set(name, (counts.get(name) ?? 0) + 1);
	});
	if (counts.size === 0) return 'None';
	return [...counts].map(([name, n]) => `${name} ×${n}`).join(' · ');
}

/** Formats a byte count as B, KB, MB or GB. */
function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = bytes / 1024;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	return `${value.toFixed(1)} ${units[i]}`;
}

/** Splits lines into chunks that each fit in one embed field value. */
function chunkLines(lines, max = MAX_FIELD_VALUE) {
	const chunks = [];
	let current = '';
	for (const line of lines) {
		const next = current ? `${current}\n${line}` : line;
		if (next.length > max) {
			chunks.push(current);
			current = line;
		} else {
			current = next;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

/** Approximate character count of an embed, matching Discord's total-size rule. */
function embedSize(embed) {
	const d = embed.data;
	let size = (d.title?.length ?? 0) + (d.description?.length ?? 0)
		+ (d.footer?.text?.length ?? 0) + (d.author?.name?.length ?? 0);
	for (const f of d.fields ?? []) size += f.name.length + f.value.length;
	return size;
}

/** Adds a field only if it stays within the field-count and total-size limits. */
function tryAddField(embed, field) {
	if ((embed.data.fields?.length ?? 0) >= MAX_FIELDS) return false;
	if (embedSize(embed) + field.name.length + field.value.length > EMBED_BUDGET) return false;
	embed.addFields(field);
	return true;
}

/** Adds a titled list across as many inline-safe fields as needed. Returns false if anything was dropped. */
function addListFields(embed, title, lines) {
	const chunks = chunkLines(lines.length ? lines : ['*None*']);
	let complete = true;
	chunks.forEach((chunk, i) => {
		const name = (chunks.length > 1 ? `${title} · ${i + 1}/${chunks.length}` : title)
			.slice(0, MAX_FIELD_NAME);
		if (!tryAddField(embed, { name, value: chunk, inline: false })) complete = false;
	});
	return complete;
}

const escapeLinkText = s => s.replace(/[\[\]]/g, '\\$&');

function attachmentLines(message) {
	return [...message.attachments.values()].map(a => {
		const name = escapeLinkText(a.name.slice(0, 80));
		const dims = a.width && a.height ? ` · ${a.width}×${a.height}` : '';
		const spoiler = a.spoiler ? ' · spoiler' : '';
		return `[${name}](${a.url}) · ${formatBytes(a.size)} · ${a.contentType ?? 'unknown type'}${dims}${spoiler}`;
	});
}

function mentionUserLines(message) {
	return [...message.mentions.users.values()]
		.map(u => `<@${u.id}> · ${u.username} · \`${u.id}\``);
}

function mentionRoleLines(message) {
	return [...message.mentions.roles.values()]
		.map(r => `<@&${r.id}> · ${r.name} · \`${r.id}\``);
}

function buildButtons(active = null, disabled = false) {
	const views = [
		{ id: 'meta', label: 'Metadata', emoji: '📋' },
		{ id: 'reactions', label: 'Reactions', emoji: '👥' },
		{ id: 'content', label: 'Content', emoji: '📝' },
		{ id: 'components', label: 'Components', emoji: '🧩' },
		{ id: 'raw', label: 'Raw', emoji: '🔍' },
	];
	return new ActionRowBuilder().addComponents(
		views.map(v => new ButtonBuilder()
			.setCustomId(v.id)
			.setLabel(v.label)
			.setEmoji(v.emoji)
			.setStyle(v.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
			.setDisabled(disabled || v.id === active)
		)
	);
}

function buildMetadataEmbed(message) {
	const content = message.content ?? '';
	const words = content.trim() ? content.trim().split(/\s+/).length : 0;
	const created = Math.floor(message.createdTimestamp / 1000);

	const embed = new EmbedBuilder()
		.setTitle('Message Metadata')
		.setURL(message.url)
		.setColor(COLOR)
		.setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
		.addFields(
			{ name: 'Author', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
			{ name: 'Channel', value: `<#${message.channelId}>`, inline: true },
			{ name: 'Message ID', value: `\`${message.id}\``, inline: true },
			{ name: 'Created', value: `<t:${created}:F> (<t:${created}:R>)`, inline: false },
			{ name: 'Edited', value: message.editedTimestamp ? `<t:${Math.floor(message.editedTimestamp / 1000)}:F>` : 'Never', inline: true },
			{ name: 'Length', value: `${content.length} chars / ${words} words`, inline: true },
			{ name: 'Pinned', value: message.pinned ? 'Yes' : 'No', inline: true },
			{ name: '@everyone / @here', value: message.mentions.everyone ? 'Yes' : 'No', inline: true },
			{ name: 'Embeds / Stickers', value: `${message.embeds.length} / ${message.stickers.size}`, inline: true },
			{ name: 'Reactions', value: `${message.reactions.cache.size} emoji`, inline: true },
			{ name: 'Reply To', value: message.reference?.messageId ? `\`${message.reference.messageId}\`` : 'None', inline: true },
			{ name: 'Components', value: componentSummary(message), inline: false },
		);

	// Lists go last so the base fields always fit
	const results = [
		addListFields(embed, `Attachments (${message.attachments.size})`, attachmentLines(message)),
		addListFields(embed, `Mentioned users (${message.mentions.users.size})`, mentionUserLines(message)),
		addListFields(embed, `Mentioned roles (${message.mentions.roles.size})`, mentionRoleLines(message)),
	];
	if (results.includes(false)) {
		embed.setFooter({ text: "Some lists were cut off to fit Discord's embed limits. Check the Raw view for the message data." });
	}
	return embed;
}

function buildContentEmbed(message) {
	const content = MsgUtils.cleanMessageContent(message) ?? '';
	const safe = content.replaceAll('```', '\u200b```').slice(0, 3900);
	return new EmbedBuilder()
		.setTitle('Message Content')
		.setURL(message.url)
		.setColor(COLOR)
		.setDescription(safe ? `\`\`\`\n${safe}\n\`\`\`` : '*(no text content)*')
		.setFooter({ text: `${content.length} chars (cleaned)` });
}

/** Builds the components view: the tree with types and labels, no IDs or styling details. */
function buildComponentsEmbed(message) {
	const embed = new EmbedBuilder()
		.setTitle('Message Components')
		.setURL(message.url)
		.setColor(COLOR);

	const lines = componentTreeLines(message);
	if (lines.length === 0) {
		return embed.setDescription('*No components on this message.*');
	}

	const topLevel = message.components.length;
	embed.setDescription(`${topLevel} top-level component${topLevel === 1 ? '' : 's'} · ${lines.length} total`);

	const complete = addListFields(embed, 'Component tree', lines);
	if (!complete) {
		embed.setFooter({ text: "Some components were cut off to fit Discord's embed limits. Check the Raw view for the full data." });
	}
	return embed;
}

/** Raw content before cleaning. Embed JSON and component JSON go in files so they don't crowd the embed. */
function buildRawView(message) {
	const raw = message.content ?? '';
	const cleaned = MsgUtils.cleanMessageContent(message) ?? '';
	const safe = raw.replaceAll('```', '\u200b```').slice(0, 3900);

	const embed = new EmbedBuilder()
		.setTitle('Raw Message')
		.setURL(message.url)
		.setColor(COLOR)
		.setDescription(safe ? `\`\`\`\n${safe}\n\`\`\`` : '*(no text content)*')
		.setFooter({ text: `Raw: ${raw.length} chars · Cleaned: ${cleaned.length} chars` });

	const files = [];
	if (message.embeds.length) {
		const json = JSON.stringify(message.embeds.map(e => e.toJSON()), null, 2);
		files.push(new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: 'embeds.json' }));
	}
	if (message.components.length) {
		const json = JSON.stringify(message.components.map(c => c.toJSON?.() ?? c), null, 2);
		files.push(new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: 'components.json' }));
	}
	return { embed, files };
}

/** Builds the reactions embed, plus a .txt attachment if the embed limits cut anything off. */
function buildReactionsView(message, reactions) {
	const embed = new EmbedBuilder()
		.setTitle('Reactions')
		.setURL(message.url)
		.setColor(COLOR);

	if (reactions.length === 0) {
		return { embed: embed.setDescription('No reactions on this message.'), file: null };
	}

	let overflow = false;
	for (const { emoji, count, users } of reactions) {
		const lines = users.length ? users.map(u => `${u.id}\n${u.username}`) : ['*None*'];
		const chunks = chunkLines(lines);

		chunks.forEach((chunk, i) => {
			const name = `${emoji} (${count})${chunks.length > 1 ? ` · ${i + 1}/${chunks.length}` : ''}`;
			if (!tryAddField(embed, { name, value: chunk, inline: true })) overflow = true;
		});
	}

	let file = null;
	if (overflow) {
		const text = reactions
			.map(r => `${r.emoji} (${r.count})\n` + r.users.map(u => `${u.username}\t${u.id}`).join('\n'))
			.join('\n\n');
		file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'reactions.txt' });
		embed.setFooter({ text: 'Embed limit reached. The full list is attached as reactions.txt' });
	}

	return { embed, file };
}

async function execute(interaction) {
	const message = interaction.targetMessage;
	if (!message) return interaction.reply({ content: 'No message found', ephemeral: true });

	const response = await interaction.reply({
		embeds: [buildMetadataEmbed(message)],
		components: [buildButtons('meta')],
		ephemeral: true,
		fetchReply: true,
	});

	// Cache reactions so switching views doesn't refetch every time
	let reactionsCache = null;

	const collector = response.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: i => i.user.id === interaction.user.id,
		time: 5 * 60_000,
	});

	collector.on('collect', async i => {
		if (i.customId === 'reactions') {
			await i.deferUpdate();
			reactionsCache ??= await getAllReactions(message);
			const { embed, file } = buildReactionsView(message, reactionsCache);
			return i.editReply({
				embeds: [embed],
				components: [buildButtons('reactions')],
				files: file ? [file] : [],
			});
		}

		if (i.customId === 'components') {
			const embed = buildComponentsEmbed(message);
			return i.update({
				embeds: [embed],
				components: [buildButtons('components')],
				files: [],
			});
		}

		if (i.customId === 'raw') {
			const { embed, files } = buildRawView(message);
			return i.update({
				embeds: [embed],
				components: [buildButtons('raw')],
				files,
			});
		}

		const embed = i.customId === 'content'
			? buildContentEmbed(message)
			: buildMetadataEmbed(message);

		return i.update({
			embeds: [embed],
			components: [buildButtons(i.customId)],
			files: [],
		});
	});

	collector.on('end', () => {
		interaction.editReply({ components: [] }).catch(() => {});
	});
}

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Message Metadata')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute,

	build:config.PRODUCTION || config.DEV
};