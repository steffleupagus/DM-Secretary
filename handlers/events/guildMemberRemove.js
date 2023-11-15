const { Events } = require('discord.js');
const GuildUtils = require(`../../utilities/guildUtils.js`);
const LevelUtils = require(`../../utilities/levelUtils.js`);
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(client, member)
{
	console.log(`${member.user.tag} left the guild...`);
	cleanupDB(member.user.id);
}

async function executeRaw(client, packet)
{
	// There's no need to process raw if the member is cached, the event will fire anyway	
	const guild = client.guilds.resolve(packet.d.guild_id);
	if (guild.members.cache.has(packet.d.user.id)) return;
	
	cleanupDB(packet.d.user.id);	
}

async function cleanupDB(user_id)
{
	await GuildUtils.PurgeUser(user_id);
	await LevelUtils.PurgeUser(user_id);
}

module.exports = {
	name: Events.GuildMemberRemove,
	execute: execute,
	raw: "GUILD_MEMBER_REMOVE",
	processRaw: executeRaw,

	build:config.PRODUCTION // || config.DEV	
};
