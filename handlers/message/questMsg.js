/*-----------------------------------------------------------------------------*\
| Detect Avrae combat messages, filtered for Quests, and log them in a database |
\*-----------------------------------------------------------------------------*/
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)
const quest = require(`../../database/questSchema.js`)

//!cast eldritch -rr 3 quest silver
//!cast eldritch -t beyond quest
//!c intim quest guard -reset

const damageType = new RegExp("\\*\\*Damage Type\\*\\*: (.*)", "gi")
const questIdent = new RegExp("(.*) quests (?:for their own |under the )(.*)(?: banner|glory)!","gi")
const skillIdent = new RegExp("(.*) aids the Quest with (.*)","gi")

const guildEmoji = {
    "Arcanum":"🔮",
    "Black Hand":"🧤",
    "Faith Council":"🕯️",
    "Guardian":"⚔️",
    "Outrider":"🍃",
    "Silver Thorn":"<:silverrose:699470814356963418>",
	"Unaligned":"👤"
}

async function shouldHandle(client, message)
{
	console.log("HERE")
	
	if (process.env.mod == "dev")
		return false;

	console.log("AND AFTER")
	
	if (!message.author.bot) return false
	if (message.author.id != config.avraeId) return false

	const embed = message?.embeds?.[0] || null;
	const fields = embed?.fields || null;
	
	if (!embed || !fields) return false;

	////Quest Phrase
	questIdent.lastIndex = 0;
	const isQuest = questIdent.test(embed.description);
	console.log(`${embed.title}: ${isQuest}`)

	////Damage Type
	damageType.lastIndex = 0
	const dtype = fields.filter(field => field.value.includes("Damage Type")).map(field => damageType.exec(field.value));

	////Skill Check
	skillIdent.lastIndex = 0
	const skill = skillIdent.test(embed.title);
		
	return isQuest && (dtype || skill)
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const embed = message?.embeds?.[0] || null;
	const fields = embed?.fields || null;

	questIdent.lastIndex = 0
	const detail = questIdent.exec(embed.description);
	// console.log(detail)
	const char = detail[1].replace("*","").trim()
	const guild = detail[2].trim() || "Unaligned"

	skillIdent.lastIndex = 0
	const skill = skillIdent.exec(embed.title)?.[2];
	// console.log(skill)

	const userId = /\(\|\|uid\: ?([0-9]*)\|\|\)/i
	let   user   = false;

	const action = /★*☆* \(\-1\)/gi
	let   actInc = false;
	
	const damage = /\*\*(?:Damage|Healing)(?: \(CRIT\!\):?)?\*\*:.*\[.*\] = `(\-?[0-9]*)`/gi
	const result = /[0-9]*d20.* = `([0-9]*)`/gi
	
	let   total  = fields.map(field => 
	{
		user   = user || field.value.match(userId)?.[1];
		actInc = actInc || field.value.match(action)
		console.log(actInc)
		
		let amt = [...field.value.matchAll(skill ? result : damage)];
			amt = (amt.length > 0) ? amt.reduce( (total, cur) => total + parseInt(cur[1]), 0) : 0			
		return amt
	}).filter(x=>x).reduce( (total, cur) => total + cur, 0)

	if (skill && 0 == total)
	{
		total = [...embed.description.matchAll(result)];
		// console.log(total)
		total = total?.[0]?.[1] || null;
		total = total ? parseInt(total) : 0
	}
	
	console.log(user, char, guild, skill, total)

	if (!user || !char || !total)
		return;

	const heal = total < 0

	if (fields.find(x => x.name == "Action not Deducted"))
		await message.react("ℹ️")
	
	await message.react("📜")
	await message.react(skill?"💠":heal?"🇨🇭":"💥")

	const query = {user: user, char:char, chan:message.channel.id}
	const record = await quest.findOne(query) || query
	const options = { new: true, upsert: true }

	record.damage = record.damage || { count:0, total:0 }
	record.healing= record.healing|| { count:0, total:0 }
	record.skills = record.skills || []
	record.guilds = record.guilds || []

	inc = actInc ? 1 : 0
	const guildData = {guild:guild, count:inc, skill:0, damage:0, healing:0}
	
	if (skill)
	{
		const idx = record.skills.findIndex( x => x.skill == skill);
		if (idx >= 0)
		{
			record.skills[idx].count += inc;
			record.skills[idx].total += total;
		}
		else
		{
			record.skills.push({skill:skill, count:1, total:total})
			record.skills.sort( (a,b) => a.skill < b.skill )			
		}
		guildData.skill += total
	}
	else if (heal)
	{
		record.healing.count += inc
		record.healing.total += total		
		guildData.healing    += total		
	}
	else
	{
		record.damage.count += inc
		record.damage.total += total		
		guildData.damage    += total
	}

	if (guild)
	{
		if (guildEmoji[guild]) await message.react(guildEmoji[guild]);
		const idx = record.guilds.findIndex( x => x.guild == guild);
		if (idx >= 0)
		{
			record.guilds[idx].count += inc
			record.guilds[idx].skill += guildData.skill
			record.guilds[idx].damage += guildData.damage
			record.guilds[idx].healing += guildData.healing
		}
		else
		{
			record.guilds.push({...guildData})
			record.guilds.sort( (a,b) => a.guild < b.guild)
		}
	}
	
	console.log(record)
	await quest.findOneAndUpdate(query, record, options);

	

}

module.exports = {
	name: 'questMsg',
	bot: true,
	menu: true,
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	build: config.PRODUCTION
};