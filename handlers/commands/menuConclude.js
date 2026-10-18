const { ContextMenuCommandBuilder } = require('discord.js')
const { ApplicationCommandType } = require(`../../utilities/enums.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`);
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)


const requiredRoles = [ config.role.Moderator, config.role.Staff, config.role.Builder];

async function execute(interaction) {
	const client = interaction.client;
	const messageId = interaction.targetId;
	const channel = interaction.channel;
	const message = interaction.targetMessage;

	const duel = ChanUtils.getDuelChannelPair(channel) && !ChanUtils.isDuelRPChannel(channel)
	const scene = ChanUtils.isRoleplayChannel(channel) || ChanUtils.isRoleplayThread(channel)

	const type = duel ? `duel` : `scene`
	const suffix = config.DEV ? `dev` : ``;
	const command = `${type}${suffix}`
	await client.commands.get(command).execute(interaction, message)
}

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('Conclude Duel/Scene')
		.setType(ApplicationCommandType.Message)
		.setDefaultPermission(false),
	whitelistRoles: requiredRoles,
	execute: execute,

	build:config.PRODUCTION || config.DEV
};

module.exports.whitelistRoles = requiredRoles