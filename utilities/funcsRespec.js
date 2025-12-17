/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const { EmbedBuilder } = require("discord.js");

const regex = /You have bought ([0-9]+) \[Character Respec\]/

const steps = `
Run all commands in this channel
0️⃣ Run \`/item use\`, to use all purchased respecs
1️⃣ Run \`!char <name>\` to select the character you want to respec
🟦 • Run \`!xp\` to confirm your level
🟦 • Run \`!bag\`
🟦 • Run \`!viewroll\` *If you have unused rolls, __**STOP**__*
2️⃣ Run \`!respec\`
3️⃣ [*Optional*] Run \`!statroll\`
🟦 • Respec grants you one new roll
🟦 • You may purchase a second roll as normal
🟦 • **Important**: Do __not__ roll before running \`!respec\`
4️⃣ Update or recreate your sheet
5️⃣ Re-import your sheet or \`!update\`
6️⃣ Inform DMs of your sheet choices (Class options / Feats / etc)
7️⃣ Run \`!vsheet\` & \`!validate\`, and **Wait for review**
8️⃣ Call \`!setup\` in <#704307298407022622>
🟦 • Run \`!bag\` to confirm data transferred correctly
<@&694285067723210843> - Don't approve until after the last step

**Note**: A maximum of 10 rolls will be tracked on a character, after which you will be unable to roll additional stats`;

async function shouldHandle(client, message) {
	let meta = verifyMessageMeta(client, message)
	let content = verifyMessageContent(client, message)
	return meta && content
}

function verifyMessageMeta(client, message) {
	let author  = message?.author?.id || null;
	author = author == client.config.bots.unbelievaboat;

	let channel = message.channel.id;
	let parent  = message.channel.parentId;
	channel = ((channel == client.config.chan.botSpam)||
			   (channel == client.config.chan.dmBotSpam)||
			   (channel == client.config.chan.gameSpam))
	return author && channel;
}

function verifyMessageContent(client, message) {
	if (!message || !message.embeds || !message.embeds[0])
		return false;

	//Grab the necessary data from the embed
	var embed = message.embeds[0];
	var title = embed.title
	let desc = embed.description;

	if (!desc) return false

	let match = desc.match(regex)
	if (!match) return false

	return true;
}

async function handleRespec(client, message) {
	let embed = message.embeds[0];
	let name = embed.author.name
	let desc = embed.description;

	let match = desc.match(regex)
	if (match) {
		let level = match[1]
		let userId = false;
		let mention = name;
			name = name.toLowerCase();

		let members = message.guild.members.cache;
		let member = members.find(m => name === `${m.user.username.toLowerCase()}#${m.user.discriminator}` ||
									   name === `${m.user.username.toLowerCase()}`)
		if (!member) {
			members = await message.guild.members.fetch();
			members.sort((a,b) => {
				a = a.user.username
				b = b.user.username
				return (a<b) ? 1 : ((a>b) ? -1 : 0);
			})
			member = members.find(m => name === `${m.user.username.toLowerCase()}#${m.user.discriminator}` ||
									   name === `${m.user.username.toLowerCase()}`)
		}

		if (member) {
			name = member.displayName
			mention = `<@${member.user.id}>`;
			userId = member.user.id
		}
		desc = match[0].replace(`You have`, `✅ ${mention}`);

		if (!member) {
			message.reply(`<@${client.config.OWNERID}> - something went wrong`)
			return
		}

		//Add the Respec role
		await member.roles.add(client.config.role.Respec);

		//Get the respec channel
		let channelId = client.config.chan.respec;
		let channel = message.guild.channels.cache.get(channelId);

		//Roles
		const helper = client.config.role.Helper
		const staff = client.config.role.Staff
		const moderator= client.config.role.Moderator
		const avrae = client.config.bots.avrae
		const yagpdb = client.config.bots.yagpdb

		//Send an initial message
		embed = new EmbedBuilder()
		embed.setTitle(`${name} would like to respec a character`);
		embed.setDescription(desc);
		embed.addFields({name:"Level",value:`[Level ${level}](${message.url})`,inline:true});
		if (userId)
			embed.setFooter({text: name + ": " + userId})

		msg = await channel.send({embeds:[embed]})

		//Create a thread off the initial message and join it
		const thread = await msg.startThread({ name: name });
		if (thread.joinable) await thread.join();

		//Add the bots we'll need
		await thread.members.add(avrae);
		await thread.members.add(yagpdb);

		//Send the message to the user
		embed = new EmbedBuilder()
		embed.addFields({name:"Next Steps",value:steps})
		msg = await thread.send({
									content:`<@${userId}><@&${helper}><@&${staff}><@&${moderator}>`,
									embeds:[embed]
								});
		msg.pin();

		//Send a message directing user to the thread
		embed = new EmbedBuilder()
		embed.setDescription(`To complete your respec, go to [the thread](${msg.url}) in <#${client.config.chan.respec}>`)
		message.reply({content:`<@${userId}>`, embeds:[embed]});
	}
}

module.exports = {
	name: 'respecPurchase',
	shouldHandle: shouldHandle,
	handleCreate: handleRespec
};