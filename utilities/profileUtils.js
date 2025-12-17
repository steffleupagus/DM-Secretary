const normalize = "NFKC";
const badChars  = /[\[\]\(\)\<\>\{\}\|\`\#\.\!\*\_\:\~]/g
const breakRegex = /[`-]{3}\n?(\s*|\u200B*|<\:.*\:[0-9]*>)?\n?[`-]{3}/
const customEmoji = /\<?\:[a-zA-Z0-9]*\:[0-9]*\>?/;
const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/mg
//const nameRegex  = /^[\[\|\|️\•\⊰\*\`\"\'\>\s_]*name[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const nameRegex = /^[\>\[\|\|️\_\*\`\s\️\"]*(?:normal )?name[\"\`\*\_\]\:\s\(]*([^\n]*)$/mig
//\•\⊰
const raceRegex  = /^[\[\|\|️\*\`\"\'\>\s_]*race[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const classRegex = /^[\[\|\|️\*\`\"\'\>\s_]*class[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi
const genderReg  = /^[\[\|\|️\*\`\"\'\>\s_]*(?:gender|sex)[:\]_\-\|\|️\.\*\`\"\'\s\n]*\(?([^\n\`\(\[\]\)]*)\)?/mgi

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

///
function parseProfileFields(message)
{
	if (!message || 0 == message.length)
		return null

	const profile =
	{
		name:null,
		user:message.author.id,
		profileId:message.id,
		url:message.url
	}
	const fields = {
		"name":nameRegex,
		"gender":genderReg,
		"race":raceRegex,
		"class":classRegex
	}

	for (var[field,regex] of Object.entries(fields))
	{
		var matches = [...message.content.matchAll(regex)];
		profile[field] = matches.length ? matches[0][1] : null;
	}

	//Dummy hack to prevent the template post from getting logged
	if ("1142993266996953218" == message.id || profile.name?.startsWith("Age:"))
		return null
	if (profile.name)
		profile.name = profile.name.replace(/[\(\[\<\{].*[\}\>\]\)]/g,"").replace(/\s+/g," ").replace(badChars,"").trim();
	return profile	
}

function fallbackParse(message)
{
	message.content = message.content.split("\n")[0].replace(/.*name\:?/i,"").trim() || null
	if (!message.content || message.content.length == 0) 
		return {}
	else
	{
		message.content = `name: ${message.content}`
		const profile = parseProfile(message)
		if (!profile.name) return {}
		return profile
	}
}

///
/// Process the profile message into usable data
///
function parseProfile(message, fallback = true) {
	const pcProfile = message.channel.id == config.chan.pcProfile

	message.content = message?.content ?? "";
	message.content = message.content.replace(breakRegex,"")
					 				 .replace(emojiRegex,"")
									 .replace(customEmoji,"")
					 				 .normalize(normalize).trim();

	//Parse the profile
	const profile = parseProfileFields(message);
	if (profile)
	{
		profile.type  = pcProfile ? "PC" : "NPC"

		//If we didn't find a name, try a fallback test.
		if (!profile.name && fallback)
		{
			const fallback = fallbackParse(message)
			for (const [key, value] of Object.entries(fallback)) 
				profile[key] = profile[key] || fallback[key]
		}
		console.log(`${profile.profileId}: ${profile.name}`)
	}

	//console.log(profile)
	return profile
}

module.exports = {
	parseProfile
}