const root = process.cwd()
const Utils = require(`${root}/utilities/utilFuncs.js`)
const MsgUtils = require(`${root}/utilities/messageUtils.js`)
const mod = process.env.mod || "";
const config = require(`${root}/config/${mod}_config.json`);
const levelUtils = require(`${root}/utilities/levelUtils.js`)
const levelSchema = require(`${root}/database/levelSchema.js`)
const dailyExpSchema = require(`${root}/database/dailyExpSchema.js`)

class CharacterData
{
    constructor() 
	{
		this.RefreshCache();
    }

	async RefreshCache()
	{
		//Clear out the data currently cached
		this.charCache = await levelUtils.findLevelData({});
		console.log(`CharUtils reports ready: ${this.charCache.length} chars`)
	}

	async getUserCharData(user=null, nameFilter=null, guild=null, result={})
	{
		if (!this.charCache)
			throw "Please be patient, bot is still loading...\nWait a minute and try again."
		
		this.charCache.forEach(item => 
		{
			const matchUser = (user == null || user == item.user);
			if (matchUser)
				result[item.name] = result[item.name] || '';
		})	

		if (nameFilter)
		{
			result = Object.fromEntries(Object.entries(result).filter(([name, guilds]) => 		
										name.toLowerCase().includes(nameFilter)));		
		}
		
		return result;
	}	
}

module.exports = new CharacterData();