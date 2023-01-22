const mod = process.env.mod || "";
const root = process.cwd()
const Utils = require(`${root}/utilities/utilFuncs.js`)
const config = require(`${root}/config/${mod}_config.json`);
const MsgUtils = require(`${root}/utilities/messageUtils.js`)
const LevelUtils = require(`${root}/utilities/levelUtils.js`)
const LevelSchema = require(`${root}/database/levelSchema.js`)
const DailyExpSchema = require(`${root}/database/dailyExpSchema.js`)
const StringSimilarity = require("string-similarity");

const MATCH_THRESHOLD = 0.9
const MIN_THRESHOLD = 0.15

class CharacterData
{
    constructor() 
	{
		this.RefreshCache();
    }

	async RefreshCache()
	{
		//Clear out the data currently cached
		this.charCache = await LevelUtils.findLevelData({});

		this.charByUser = {};
		this.charCache.forEach(char => 
		{
			const user = char.user;
			this.charByUser[user] = this.charByUser[user] || [];
			this.charByUser[user].push(char);
		});

		const userCount = Object.keys(this.charByUser).length
		console.log(`CharUtils reports ready: ${this.charCache.length} chars across ${userCount} users`)
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

	async findClosestMatch(char, user = null)
	{
		//Get a list of all characters - character:{level,player}
		let options = this.charCache;
		if (user)
			options = options.filter( option => option.user == user );		
		if (options.length == 0)
			return null;
		
		let charTable = {};
		options.forEach(value => { charTable[value.name] = { level:value.level, user:value.user } });

		var names = Object.keys(charTable);
		if (names.length == 0)
			return null;

		//If we have an exact match, skip the rest
		if (charTable[char])
		{
			charTable[char].rating = 1;			
			charTable[char].name = char;
			return {match:charTable[char], options: []}
		}
			
		//Find the closest match for that character's name
		var matches = StringSimilarity.findBestMatch(char, names);

		var match = matches.bestMatch;
			match = match.rating >= MIN_THRESHOLD ? 			
					{ 	name: match.target,
						user: charTable[match.target].user,
						level: charTable[match.target].level,
					 	rating: match.rating
					} : null;
		
		var matches = matches.ratings;
		matches = matches
			// .filter( m => m.target != match?.name )
			.filter( m => user || m.rating >= MIN_THRESHOLD)
			.map( m => {
				let name = m.target
				return {
					name: name,
					user: charTable[name].user,
					level: charTable[name].level,
					rating: m.rating
				}				
			})
			.sort( (a,b) => b.rating - a.rating )
			.slice( 0, 10 );
		
 		let result = {match,matches};
		return result;		
	}	


	
	async nameMatchTest()
	{
		const tupperSchema = require(`../database/tupperSchema.js`)
		const tupperLog = await tupperSchema.find()

		let tupperData = {}
		tupperLog.forEach( item => tupperData[item.t] = item)
		let tuppers = Object.keys(tupperData);
		console.log(tuppers.length)

		let charData = {}
		this.charCache.forEach( char => charData[char.name] = char.user );
		const names = Object.keys(charData);

		tuppers = tuppers.map( tupper => {
			const matches = StringSimilarity.findBestMatch(tupper, names);
			const match = matches.bestMatch;
			const tupperUser = tupperData[tupper].aId
			const targetUser = charData[match.target]
			return { tupper, tupperUser, target: match.target, targetUser, rating: match.rating}
		})
		.filter( tupper => (tupper.rating < MATCH_THRESHOLD && 
							tupper.rating >= MIN_THRESHOLD  &&
						    tupper.tupperUser != tupper.targetUser) )

		console.log(tuppers)
		
		return tuppers
	}
}

module.exports = new CharacterData();