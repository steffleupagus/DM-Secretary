const { ChannelType, EmbedBuilder, time } = require('discord.js')

const ActivityUtils = require(`../../utilities/activityUtils.js`)
const ChanActivity = require(`../../database/chanActivitySchema.js`)
const ChannelMeta = require(`../../database/chanMetaSchema.js`)
const ChanUtils  = require(`../../utilities/channelUtils.js`)
const AreaMeta  = require(`../../database/areaMetaSchema.js`)
const MsgUtils = require(`../../utilities/messageUtils.js`)
const Utils   = require(`../../utilities/utilFuncs.js`)

const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const spm=60      //seconds per Minute
const sph=60*spm  //Seconds per Hour
const spd=24*sph  //Seconds per Day
const msps=1000	  //Milliseconds per second

let timerInterval;

async function startTimer(client)
{
	await Utils.slowdown(2500)
	console.log(`        • Starting timer: ${timerData.name}`)

	//Get the guild from the ID in the config
	const guildId   = config._GUILDID || config.GUILDID
	const guild     = client.guilds.resolve(guildId)
	const channelId = config.activityChannel;
	const channel   = guild.channels.resolve(channelId) || await guild.channels.fetch(channelId);

	const messages  = await channel.messages.fetch()
	if (!messages.size)
	{
		console.log("No activity status messages. Generating stubs.")	
		await createStubMessages(guild, channel);
	}
	
	let index = 0
	timerInterval = setInterval(async () => 
	{
		console.log(`Timer Fired: ${timerData.name} at index ${index}`)
		index = await runUpdate(guild, channel, index);
	}, 5 * msps * spm);	//Update one channel group every 3 minutes
}

function stopTimer()
{
	clearInterval(timerInterval);
}
								
async function triggerTimer(client)
{
	//Get the guild from the ID in the config
	const guildId   = config._GUILDID || config.GUILDID
	const guild     = client.guilds.resolve(guildId)
	const channelId = config.activityChannel;
	const channel   = guild.channels.resolve(channelId) || await guild.channels.fetch(channelId);
	
	const messages  = await channel.messages.fetch()
	if (!messages.size)
	{
		console.log("No activity status messages. Generating stubs.")	
		await createStubMessages(guild, channel);
	}
	await runUpdate(guild, channel, -1);
}
	
//Create embed stubs
async function createStubMessages(guild, activityChannel)
{
	if (!activityChannel) return console.log("Log channel missing?")
	
	const channels = await ChannelMeta.find({});
	const channelByLocation = {}
	channels.forEach(channel => {
		channel.locations.forEach(location => {
			channelByLocation[location] = channelByLocation[location] || []
			channelByLocation[location].push(channel)
		})
	})

	let areas = await AreaMeta.find({});
	await Utils.asyncArrayForEach( areas, async (area, i) =>
	{
		console.log(`○\tStubbing area: ${area.name})`)
		const channels = []
		area.roleId.forEach(location => 
		{
			channelByLocation[location].forEach(channel => 
			{
				if (!channels.includes(channel))
					channels.push(channel)
			})			
		})	
		const embed = await generateEmbedStub(guild, area, channels);	
		const message = await activityChannel.send({embeds:[embed]});
 		await Utils.slowdown(1000);
		
		console.log(`\t${area.name} stubbed`)
	})
}

//Generate a group's embed message from the collected data
async function generateEmbedStub(guild, area, channels)
{
	const channelManager = guild.channels
	const embed = new EmbedBuilder()
					 .setDescription(`\`${"".padEnd(69," ")}\``)
	let areaexp = true;
	channels.forEach( channel => {
		//If the channel is set not to track, skip it
		if (!channel.trackActivity) return
		areaexp = areaexp && channel.awardsExp
		if (!channel.awardsExp)
			console.log(channel)
		channel = channelManager.resolve(channel.channelId)
		if (!channel) return console.log(`Could not resolve ${channelId}`)
	})
	areaexp = areaexp ? config.xpemoji : ""
	embed.setTitle(`${area.icon ? area.icon : ""} ${area.name} ${areaexp}`.trim())

	//Add the last updated to the embed
	var d = new Date();
	d = d.toLocaleTimeString("en-US", {timeZone: "America/New_York"});
	const footer = `Last updated: ${d} server time.`
	embed.setFooter({text:footer});	//Set the category ID as the footer to find later
	
	return embed;
}

//Organize by location role
async function runUpdate(guild, activityChannel, index=0)
{
	if (!activityChannel) return console.log("Log channel missing?")
	
	const channels = await ChannelMeta.find({});
	const channelByLocation = {}
	channels.forEach(channel => {
		channel.locations.forEach(location => {
			channelByLocation[location] = channelByLocation[location] || []
			channelByLocation[location].push(channel)
		})
	})

	const embeds = await activityChannel.messages.fetch();
	
	let areas = await AreaMeta.find({});
	let onDeck = areas[0];
	if (index >= 0)
	{
		const area = areas[index];
		if (++index >= areas.length) index = 0		
		onDeck = areas[index]
		areas = [area]
	}
	
	await Utils.asyncArrayForEach( areas, async (area, i) =>
	{
		console.log(`○\tUpdating area ${area.name}`)
		const channels = []
		area.roleId.forEach(location => 
		{
			channelByLocation[location].forEach(channel => 
			{
				if (!channels.includes(channel))
					channels.push(channel)
			})			
		})	
		const embed = await generateEmbed(guild, area, channels);	
		const targetEmbed = embeds.find( (value, key, collection) => {
			return embed.data.title == value?.embeds?.[0]?.title 
		})

		try{
			if (targetEmbed)
				await targetEmbed.edit({embeds:[embed]})
			else	
				await activityChannel.send({embeds:[embed]})
		}
		catch (e) { console.error(e, embed.toJSON())}

 		await Utils.slowdown(1500);
		
		console.log(`\t${area.name} updated`)

		if (index < 0)
			Utils.slowdown(3500);
	})

	console.log(`\tOn Deck: ${index} (${onDeck.name})`)
	return index;
}

//Generate a group's embed message from the collected data
async function generateEmbed(guild, area, channels)
{
	const channelManager = guild.channels
	const embed = new EmbedBuilder()
					 .setDescription(`\`${"".padEnd(69," ")}\``)

	let areaexp = true;
	const fields = [];
	await Utils.asyncArrayForEach( channels, async channel =>
	{
		//If the channel is set not to track, skip it
		if (!channel.trackActivity) return
		const xpEmoji = channel.awardsExp ? config.xpemoji : ""
			  areaexp = areaexp && channel.awardsExp
		const hasThreads = channel.threadMax
		if (!hasThreads)
			console.log(`\t\t\tThreads: ${channel.name}`)
		
		channel = channelManager.resolve(channel.channelId)
		if (!channel) return console.log(`Could not resolve ${channelId}`)
		
		const order = channel.position;
		const chanName = Utils.toSentenceCase(channel.name,true);
		let   {status,lastMsg,elapsed,author} = await ActivityUtils.getChannelStatus(channel);
		const name  = `** **`;
		lastMsg =`${lastMsg} ${elapsed} ${author}`.trim()
		let   value = `${status} **${chanName}** (<#${channel.id}>) ${xpEmoji}\n*${lastMsg}*`

		if (hasThreads)
		{
			let threads = await ChanUtils.fetchThreads(channel);
				threads = threads.all;
			await Utils.asyncCollectionForEach(threads, async thread => {
				const {status,lastMsg,elapsed,author} = await ActivityUtils.getChannelStatus(thread);
				const detail = `\n\`     \`${lastMsg} ${elapsed} ${author} `
				value += `\n\`🧵${status}\` <#${thread.id}> ${detail}`
			})
		}
		fields.push({name,value,order})
//		embed.addFields({name,value})
	})		

	fields.sort((a,b) => a.order - b.order); // b - a for reverse sort
	embed.addFields(fields)
	
	areaexp = areaexp ? config.xpemoji : ""
	embed.setTitle(`${area.icon ? area.icon : ""} ${area.name} ${areaexp}`.trim())
	
	//Add the last updated to the embed
	let d = new Date();
	let r = Math.floor(Date.now() / 1000);	
	d = d.toLocaleTimeString("en-US", {timeZone: "America/New_York"});
	const updated = `*Last updated: ${d} server time (<t:${r}:R>)*`
	embed.addFields({name:"** **", value:updated})

	// embed.setFooter({text:footer});	//Set the category ID as the footer to find later
	// embed.setTimestamp(Date.now());
	return embed;
}

const timerData = {
	name: 'activityUpdate',
	startTimer,
	stopTimer,
	triggerTimer,
	build:config.PRODUCTION //|| config.DEV
};

module.exports = timerData