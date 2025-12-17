const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const { ContextMenuCommandBuilder, EmbedBuilder, 
	    ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const Prompt = require(`../../utilities/promptUtils.js`)

const requiredRoles = [ config.role.Builder ];


async function GenerateEditMenu(message)
{
	const menu = new EmbedBuilder();

	//Check if we should allow content edit
	if (message.content)
	{
		const content = message.content.length > 100 ? message.content.substr(0, 97) + '...' : message.content
		menu.addFields({name:`Content`, value:`*${message.content.length} Characters*\n\`${content}\`}`})
	}

	if (message.embeds)
	{
		message.embeds.forEach(embed => {
			const name = `Embed: ${embed.title || "*Untitled*"}`
			const value = ``
			menu.addFields({name,value})
		})
	}
	return {embeds:[menu],ephemeral:true}
}


function createTextInputRow(customId, label, value)
{
	let input = new TextInputBuilder()
		.setCustomId(customId)
		.setLabel(label)					// The label is the prompt the user sees for this input
		.setStyle(TextInputStyle.Paragraph)	// TextInputStyle.Short or TextInputStyle.Paragraph
		.setPlaceholder("Enter content...")	// set a placeholder string to prompt the user
		.setRequired(false) 				// require a value in this input field
		.setValue(value)					// set the initial value
		.setMaxLength(4000)
		.setMinLength(0)
	input = new ActionRowBuilder().addComponents(input)
	return input
}

async function execute(interaction)
{
	const messageId = interaction.targetId;
	const message = interaction.targetMessage; //await channel?.messages.fetch(messageId);
	const customId = module.exports.data.name+messageId
	if (message?.author?.id != interaction.client.user.id) throw "Cannot edit this message"

	console.log(customId);
	// const menu = await GenerateEditMenu(message)
	// await interaction.reply(menu)

	let content = message.content
	const modal  = new ModalBuilder().setCustomId(customId).setTitle(messageId)
	const inputs = []
	inputs.push(createTextInputRow("content","Content",content))
	message.embeds.forEach((embed, i) => {
		i = i.toString()
		const json  = JSON.stringify(embed.toJSON(),null,"\t").toString()
		const input = createTextInputRow(i, i, json)
		inputs.push(input)
	})
	const modalInteraction = await Prompt.promptModal(interaction, messageId, customId,
													  inputs, Prompt.Time.Extended)

	modalInteraction.reply({content:message.url,ephemeral:true})

	const embeds = []
	modalInteraction.fields.fields.forEach( (field, i) => {
		if ("content" == field.customId)
			content = field.value
		else
			embeds.push(EmbedBuilder.from(JSON.parse(field.value)))
	})
	await message.edit({content, embeds})
}

module.exports =
{
	data: new ContextMenuCommandBuilder()
		.setName('Update Content')
		.setType(ApplicationCommandType.Message),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION
};