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
}

module.exports = new CharacterData();