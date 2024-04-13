/*--------------------------------------------------------------*\
| Detect vsheet messages in a table and log them in the table DB |
\*--------------------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const LevelData = require(`../../utilities/levelUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)
const ChanUtils = require(`../../utilities/channelUtils.js`)
const TableMeta = require(`../../database/tableSchema.js`)
const { EmbedBuilder }  = require(`discord.js`)

async function shouldHandle(client, message)
{
	const table = await ChanUtils.isTableMechanicsThread(message.channel)
	if (null == table) return false	

	const embed = message?.embeds?.[0]
	if (!embed) return false
	
	const vsheet = embed?.footer?.text.startsWith("!vsheet")
	return vsheet
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const embed = message?.embeds?.[0]
	const table = await ChanUtils.isTableMechanicsThread(message.channel)

	//Get the data for the character and author
	const data = {char:{}}
	data.char.name = embed.title;
	if (embed.author) data.player = parseAuthor(message.guild, embed.author);

	//Confirm that we have a record of the character / it has been !setup correctly
	const match = await CharUtils.findClosestMatch(data.char.name, data.player)	
	if (!match.match)
	{
		const errorMsg = `The bot doesn't have a record of \`${data.char.name}\`.\nPlease make sure this character has been properly \`!setup\` in <#${config.chan.xpSpam}> and try again.`
		const error = new EmbedBuilder().setTitle(`Character Not Found`)
					 				    .setDescription(errorMsg)
		message.reply({content:`<@${data?.player}>`,embeds:[error]})
		return
	}

	data.char.level = match.match.level;
	
	//Push the new info into the database for the table	
	const oldRecord = await updateDBRecord(table, data)
	const roster = oldRecord.players || {}
	
	//Prepare and present the output to the user
	let op = "Added"
	let desc = `Added ${data.char.name}`
	if (roster[data.player]){
		const char = roster[data.player]
		if (char.name == data.char.name) 
		{
			op = "Confirmed"
			desc = `\`${char.name} (${char.level})\` is already present in the roster`
		}
		else
		{
			op = "Updated"
			desc = `Replaced \`${char.name} (${char.level})\`\nwith \`${data.char.name} (${data.char.level})\``
		}
	}	
	roster[data.player] = data.char
	const fields = Object.entries(roster).map(([user,char]) => { return {name:`${char.name} (${char.level})`,value:`<@${user}>`}})
	const reply = new EmbedBuilder().setTitle(`Table Character ${op}`)
									.setDescription(desc+"\n### __Character Roster__:")
									.setFields(fields)
	if (embed?.thumbnail?.url) reply.setThumbnail(embed.thumbnail.url)
	message.reply({embeds:[reply],ephemeral:true})
}

async function updateDBRecord(table, data)
{
	if (!table) return;

	let query = { _id: table.id }
	let record = await TableMeta.findOne(query)

	if (!record.players)
		record.players = {}
	record.players[data.player] = data.char

	const oldRecord = await TableMeta.findOneAndUpdate(query, record);	
	return oldRecord
}

function parseAuthor(guild, author)
{
	var data = {}
	var displayName = author.name;
	let serverMembers = guild.members

	let matchedMember = serverMembers.cache.find(m => m.displayName === displayName);
	if (matchedMember)
	{
		data = matchedMember.user.id;
		console.log("Author:", data);
	}
	return data;
}


module.exports = {
	name: 'tableVsheetMsg',
	bot: true,
	menu: true,	
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,

	build: config.PRODUCTION || config.DEV
};