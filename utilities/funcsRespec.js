/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const { EmbedBuilder } = require("discord.js");

const regex = /You have bought ([0-9]+) \[Character Respec\]/

const steps = `
0️⃣ Run \`+use <x> respec\`, where <x> is the amount purchased
1️⃣ Run \`!char <name>\` to select the character you want to respec
🟦 • Run \`!xp\` in this channel to confirm your level
🟦 • Run \`!bag\` in this channel
🟦 • Run \`!viewroll\` *If you have unused rolls, __**STOP**__*
2️⃣ Run \`!respec\`
3️⃣ [*Optional*] Run \`!statroll\`
🟦 • Respec grants you one new roll
🟦 • If you wish a second roll, you must purchase it as normal
🟦 • **Important**: Do __not__ roll before running \`!respec\`
4️⃣ Update or recreate your sheet
5️⃣ Re-import or \`!update\` your sheet
6️⃣ Inform the DMs of your sheet choices (Class options / Feats / etc)
7️⃣ Run \`!vsheet\` and **Wait for DM approval**
8️⃣ Call \`!setup\` as normal
🟦 • Run \`!bag\` in this channel to confirm data transferred correctly

<@&694285067723210843> - Don't approve until after the last step

**Note**: A maximum of 10 rolls will be tracked on a character, after which you will be unable to roll additional stats for them if you choose to continually respec
`;

async function shouldHandle(client, message)
{
	let meta = verifyMessageMeta(client, message)
	let content = verifyMessageContent(client, message)
	return meta && content
}

function verifyMessageMeta(client, message)
{
	let author  = message.author.id;
	author = author == client.config.unbelievaboatId;

	let channel = message.channel.id;
	let parent  = message.channel.parentId;
	channel = ((channel == client.config.botSpamChannel)||
			   (channel == client.config.dmbotSpamChannel)||
			   (channel == client.config.gameSpamChannel))
	return author && channel;
}

function verifyMessageContent(client, message)
{
	if (!message || !message.embeds || !message.embeds[0])
		return false;

	//Grab the necessary data from the embed
	var embed = message.embeds[0];
	var title = embed.title
	let desc = embed.description;

	if (!desc)
		return false

	let match = desc.match(regex)
	if (!match)
		return false

	return true;
}

async function handleRespec(client, message)
{
	let embed = message.embeds[0];
	let name = embed.author.name
	let desc = embed.description;

	let match = desc.match(regex)
	if (match)
	{
		let level = match[1]
		let userId = false;
		let mention = name;
	
		let members = message.guild.members.cache;		
		let member = members.find(m => name === `${m.user.username}#${m.user.discriminator}` ||
									   name === `${m.user.username}`)
		if (!member)
		{
			members = await message.guild.members.fetch();
			member = members.find(m => name === `${m.user.username}#${m.user.discriminator}` ||
									   name === `${m.user.username}`)
		}

		if (member)
		{
			name = member.displayName
			mention = `<@${member.user.id}>`;
			userId = member.user.id
		}
		desc = match[0].replace(`You have`, `✅ ${mention}`);

		if (!member)
		{
			message.reply(`<@${client.config.OWNERID}> - something went wrong`)
			return
		}

		//Add the Respec role
		await member.roles.add(client.config.RespecRole);

		//Get the respec channel
		let channelId = client.config.respecChannel;
		let channel = message.guild.channels.cache.get(channelId);

		//Roles
		const dmOnDuty = client.config.DMOnDutyRole
		const moderator= client.config.ModeratorRole
		const avrae = client.config.avraeId
		const yagpdb = client.config.yagpdbId

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
									content:`<@${userId}><@&${dmOnDuty}><@&${moderator}>`, 
									embeds:[embed]
								});
		msg.pin();
		
		//Send a message directing user to the thread
		embed = new EmbedBuilder()
		embed.setDescription(`To complete your respec, go to [the thread](${msg.url}) in <#${client.config.respecChannel}>`)
		message.reply({content:`<@${userId}>`, embeds:[embed]});
	}
}

module.exports = {
	name: 'respecPurchase',
	shouldHandle: shouldHandle,
	handleCreate: handleRespec
};