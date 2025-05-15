const { SlashCommandBuilder, EmbedBuilder, ButtonStyle, TextInputStyle,
        PermissionsBitField, MessageFlags, MessageMentions } = require('discord.js')
const sanitize = require('mongo-sanitize');
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChannelLook = require(`../../database/chanLookSchema.js`)
const ChannelUtil = require(`../../utilities/channelUtils.js`)
const Prompt = require(`../../utilities/promptUtils.js`)
const Utils = require(`../../utilities/utilFuncs.js`)

const customEmoji = /\<?\:[a-zA-Z0-9_]*\:[0-9]*\>?/mg;
const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/mg
const editRoles  = [ config.role.Builder ];

async function accessDBRecord(channel) {
	channelId = channel.id
	let record = await ChannelLook.findOne({channelId:channelId})
	if (null == record) {
		const title = getDefaultTitle(channel)
		const desc = getDefaultDescription(channel)
		const name = ""
		const value = ""
		record = { channelId, title, desc, name, value }
	}
	return record
}
async function updateDBRecord(chanMeta)  {
	const channelId = chanMeta.channelId;
	const newResult = await ChannelLook.findOneAndUpdate(
										{channelId: channelId},
										chanMeta,
										{ upsert: true });
	return newResult
}
async function deleteDBRecord(channel) {
	channel = channel.id || channel
	await ChannelLook.findOneAndDelete({channelId:channel})
}
async function accessChanMeta(channel) {
	channel = channel.id || channel
	const chanMeta = await ChannelMeta.findOne({channelId:channel});
	return chanMeta;
}

function getDefaultTitle(channel) {
	const title = channel.name.replace(emojiRegex,"")
						.replace(customEmoji,"")
						.normalize("NFKC").trim()
						.toLowerCase().split("-").map(word => {
							return word.charAt(0).toUpperCase() + word.slice(1)
						}).join(" ")
	return title
}
function getDefaultDescription(channel) {
	let desc;
	if (!channel.topic && channel.isThread()) channel = channel.parent
	desc = channel.topic || ""
	desc = desc.replaceAll(new RegExp(MessageMentions.UsersPattern, `gim`), ``)
				.replaceAll(new RegExp(MessageMentions.RolesPattern, `gim`), ``)
				.replaceAll(new RegExp(MessageMentions.ChannelsPattern, `gim`), ``)
				.replaceAll(customEmoji,"")
				.replaceAll(emojiRegex,"")
				.normalize("NFKC").trim()
	desc = desc || "*No description*"
	return desc
}
async function getTitle(channel, chanLook = null) {
	chanLook = chanLook || await accessDBRecord(channel?.id ?? channel);
	let title = chanLook?.title || null;
	if (!title) title = getDefaultTitle(channel)
	return title
}
async function getDescription(channel, chanLook = null) {
	chanLook = chanLook || await accessDBRecord(channel?.id ?? channel);
	let desc = chanLook?.desc || null;
	if (!desc) desc = getDefaultDescription(channel)
	return desc;
}
async function getImages(channel, chanLook = null) {
	chanLook = chanLook || await accessDBRecord(channel?.id ?? channel);
	let image = chanLook?.image || null;
	return image
}
async function generateEmbed(interaction) {
	const channel = interaction.channel;
	const chanLook = await accessDBRecord(channel)
	const title = await getTitle(channel, chanLook)
	const desc = await getDescription(channel, chanLook)
	let images = await getImages(channel, chanLook)
	let embed = new EmbedBuilder()
					.setTitle("Looking around: " + title)
					.setDescription(desc);

	const fields = [];
	let value = chanLook?.value?.trim() || null
	let name = chanLook?.name?.trim() || (value ? "** **" : null)
	if (name && name.length > 0 && value && value.length > 0)
		fields.push({name,value})

	const chanMeta = await accessChanMeta(channel.id)
	if (chanMeta) {
		if (chanMeta.locations && chanMeta.locations.length > 0) {
			const locations= chanMeta.locations.map(loc => `<@&${loc}>`).join("\n")
			fields.push({name:"Location",value:locations,inline:true})
		}
		if (chanMeta.userOwner && chanMeta.userOwner.length > 0) {
			const ownerStr	= chanMeta.userOwner.map(owner => `<@${owner}>`).join("\n")
			fields.push({name:"Owners",value:ownerStr,inline:true})
		}
	}
	if (fields.length > 0) embed.addFields(fields);

	if (images && images.length > 0) {
		let image = Array.isArray(images) ? images[0] : images
		embed.setImage(image)
	}
	if (chanLook?.footer && chanLook.footer.trim().length > 0)
		embed.setFooter({text:chanLook.footer})

	const embeds = [embed]

	//Add multiple images to the embed
	if (images && Array.isArray(images) && images.length > 1) {
		const message = await interaction.editReply({embeds})
		embeds[0].setURL(message.url)
		images = images.slice(1)
		images.map( img => { embeds.push( {url:message.url,image:{ url:img }} ); } )
	}

	return embeds
}
async function generateComponents(isBuild, disabled = false) {
	const buttons = [
		{style:ButtonStyle.Secondary, emoji:'📝', label:'Edit', custom_id:`edit`, disabled},
		{style:ButtonStyle.Secondary, emoji:'🖼️', label:'Images', custom_id:`images`, disabled}
	];
	if (isBuild)
		buttons.push({style:ButtonStyle.Danger, emoji:'🔁', label:'Reset', custom_id:`reset`, disabled})

	const components = Prompt.createButtonRow(buttons)
	return [components]
}

async function execute(interaction) {
	const ephemeral = {flags:MessageFlags.Ephemeral}
	await interaction.deferReply({...ephemeral});

	//Do nothing if we're not in an RP channel
	const channel = interaction.channel;
	if (!ChannelUtil.isRoleplayChannel(channel) &&
		!ChannelUtil.isRoleplayThread(channel))
	{
		interaction.deleteReply();
		return;
	}

	await showChannelLook(interaction)
}

async function showChannelLook(interaction) {
	const user  = interaction.member;
	const channel = interaction.channel;
	const chanMeta = await accessChanMeta(channel.id);

	// Check if the user is a moderator or the channel owner
	const isOwner  = chanMeta?.userOwner?.includes( user.id );
	const isBuild  = Utils.hasAnyRole(interaction.member, editRoles);
	let components = (isOwner || isBuild) ? await generateComponents(isBuild) : []

	const embeds = await generateEmbed(interaction);
	const prompt = await interaction.editReply({embeds,components})
	if (isOwner || isBuild) {
		const update = await handleEdits(interaction, prompt)
		if (update) {
			await showChannelLook(interaction);
		} else {
			components = await generateComponents(isBuild, true)
			await interaction.editReply({components})
		}
	}
}

async function handleEdits(interaction, prompt) {
	const channel = interaction.channel
	const { id, name, topic } = channel
	const sparseChan = { id, name, topic }
	if (channel.isThread()) sparseChan.topic = channel.parent.topic

	const buttonCallback = (interaction, args) => { return interaction.customId; }
	const callbackMap = {
		"edit": { func: _promptTextModal, args: sparseChan },
		"images": {func: _promptImageModal, args: sparseChan },
		"reset": {func: _resetText, args:sparseChan}
	}
	const time = Prompt.Time.Extended
	response = await Prompt.collectComponents(prompt, {callbackMap, time})
	response = response?.values
	if (response && Array.isArray(response)) response = response[0]

	return response;
}

async function _resetText(interaction) {
	const channel = interaction.channel
	const look = await accessDBRecord(channel)
	look.title = getDefaultTitle(channel);
	look.desc = "";
	look.name = look?.name?.trim() || ""
	look.value = look?.value?.trim() || ""
	await updateDBRecord(look)
	await interaction.update({content:"Updated"})
	return true
}

/// Prompt the user for updated data
async function _promptTextModal(interaction) {
	const channel = interaction.channel
	const look = await accessDBRecord(channel)
	const defaultDesc = getDefaultDescription(channel)
	let title = await getTitle(channel, look)
	const titleParams = { customId:"title", label:"Title", required:false,
					  	  min:0, max:222, value:title }
	const titleInput = Prompt.createTextInput(titleParams)

	let desc = await getDescription(channel, look)
	const descParams = { customId:"desc", label:"Description", style:TextInputStyle.Paragraph,
						 required:false, min:0, max:4000, value:desc}
	const descInput = Prompt.createTextInput(descParams)

	let name = look?.name?.trim() || ""
	const nameParams = {...titleParams, customId:"name", label:"Extra Field Title (optional)", value:name}
	const nameInput = Prompt.createTextInput(nameParams)
	let value = look?.value?.trim() || ""
	const valueParams = {...descParams, customId:"value", label:"Extra Field Value (optional)", max:1024, value:value}
	const valueInput = Prompt.createTextInput(valueParams)

	const customId = `edit_${interaction.id}`
	const modal = await Prompt.promptModal(interaction, "Look Edit", customId, [titleInput, descInput,
																				nameInput, valueInput]);

	if (!modal) return false
	if (modal.customId != customId) return true

	const fields = modal.fields
	title = fields.getTextInputValue("title") || "";
	desc = fields.getTextInputValue("desc") || "";
	value = fields.getTextInputValue("value") || "";
	name = fields.getTextInputValue("name") || (value ? "** **" : "");

	await modal.deferUpdate()
	if (title != look.title || desc != look.desc || name != look.name || value != look.value) {
		look.title = sanitize(title)
		console.log(defaultDesc,desc,"\n",defaultDesc == desc)
		look.desc = sanitize(desc)
		look.name = sanitize(name)
		look.value = sanitize(value)
		await updateDBRecord(look)
		await modal.editReply({content:"Updated"})
	}

	return true
}

/// Prompt the user for updated data
async function _promptImageModal(interaction) {
	const channel = interaction.channel
	const look = await accessDBRecord(channel)

	let images = await getImages(channel, look)
	let footer = look?.footer?.trim() || ""

	const inputs = []
	const imageParams = { label:"Image URL", required:false, min:0, max:400 }
	for (let i=0; i < 4; ++i)
	{
		imageParams.label = `Image URL (${i+1})`
		imageParams.customId = `image${i}`
		imageParams.value = ""
		if (images && Array.isArray(images) && i < images.length)
			imageParams.value = images[i]
		inputs.push( Prompt.createTextInput(imageParams) )
	}
	const footerParams = { label:"Image Credits (Footer)", customId:"footer", required:false,
						   style: TextInputStyle.Paragraph, value: footer}
	inputs.push( Prompt.createTextInput(footerParams) )

	const customId = `edit_${interaction.id}`
	const modal = await Prompt.promptModal(interaction, "Edit Images", customId, inputs);

	if (!modal) return false
	if (modal.customId != customId) return true

	const fields = modal.fields
	const newImages = []
	for (let i=0; i < 4; ++i)
	{
		const customId = `image${i}`
		const image = fields.getTextInputValue(customId) || null
		if (image) newImages.push(image)
	}
	const newFooter = fields.getTextInputValue(`footer`) || null
	look.image = newImages;
	look.footer = newFooter?.trim() || "";

	await modal.deferUpdate()
	if (JSON.stringify(images) !== JSON.stringify(look.image) ||
	    footer !== look.footer) {
		await updateDBRecord(look)
		await modal.editReply({content:"Updated"})
		return true
	}

	return false
}

async function handleInteraction(){}

const data = new SlashCommandBuilder()
				.setName(`look${config.DEV ? "dev" : ""}`)
				.setDescription('Look at the current location')
//const userPermissions = [	PermissionsBitField.Flags.SendMessages	];
module.exports = {
	data: data,
	execute: execute,
	button: handleInteraction,
	select: handleInteraction,
	build:config.PRODUCTION || config.DEV
};