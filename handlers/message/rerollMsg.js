const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const util = require('util')
const { ComponentType } = require('discord.js')

const pattern = /.* : (.*) has purchased a single reroll \(limit 1\) of their character's beginning attributes./gi

/**
 * Recursively extracts all TextDisplay components from a message's component tree.
 * @param {Array} components - The message.components array (or nested components)
 * @returns {Array} Flat array of TextDisplay components
 */
function findAllTextComponents(components = []) {
	const textComponents = [];

	for (const component of components) {
		// Check if the current component is a Text Display (Type 10)
		if (component.type === ComponentType.TextDisplay) {
			textComponents.push(component);
		}

		// Recursively search nested components (e.g., inside Containers or Sections)
		if (Array.isArray(component.components) && component.components.length > 0) {
			textComponents.push(...findAllTextComponents(component.components));
		}
	}
	return textComponents;
}

function getCombinedContent(message)
{
	var content = message.content;
	if (message.embeds.length > 0)
	{
		var embed = message.embeds[0];
		content = content + " " + embed?.description;
	}

	if (message.components.length > 0)
	{
		const textBlocks = findAllTextComponents(message.components);
		const allText = textBlocks.map(comp => comp.content).join(" ");
		content += " " + allText;
	}

	return content
}

async function shouldHandle(client, message)
{
	if (!message?.author?.bot) return false
	if ((message.channel.id != config.chan.botSpam)&&
		(message.channel.id != config.chan.gameSpam))
		return false;

	var content = getCombinedContent(message)
	if (content?.match(pattern))
		return true;

	return false;
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	var content = getCombinedContent(message)
	console.log(content)

	let result = [...content.matchAll(pattern)]?.[0];
	console.log(result)
	result = result?.[1] || null;

	const channel = await message.guild.channels.fetch(config.chan.roll)
	if (channel)
		channel.send(content)
}

const schemaName = `rerollMsg`
module.exports = {
	name: schemaName,
	bot: true,
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	build: config.PRODUCTION //|| config.DEV
};