const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils  = require(`../utilities/utilFuncs.js`);
const LevelUtils = require(`../utilities/levelUtils.js`)
const StringSimilarity = require("string-similarity");

const CharMeta = require(`../database/charMetaSchema.js`)

const MATCH_THRESHOLD = 0.9
const MIN_THRESHOLD = 0.15

class CharacterData
{
	constructor() {
		this.RefreshCache();
	}

	async RefreshCache() {
		//Clear out the data currently cached
		this.charCache = await LevelUtils.findLevelData({});
		this.charByUser = {};
		this.charCache.forEach(char => {
			const user = char.user;
			this.charByUser[user] = this.charByUser[user] || [];
			this.charByUser[user].push(char);
		});

		const userCount = Object.keys(this.charByUser).length
		console.log(`CharUtils reports ready: ${this.charCache.length} chars across ${userCount} users`)
	}

	getUserCharData(user=null, nameFilter=null, guild=null, result={}) {
		if (!this.charCache)
			throw "Please be patient, bot is still loading...\nWait a minute and try again."

		this.charCache.forEach(item => {
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

	async findClosestMatch(char, user = null, forceAll = false, npcs = [], threshold = MIN_THRESHOLD) {
		//Get a list of all characters - character:{level,player}
		let options = this.charCache;
		if (user)
			options = options.filter( option => option.user == user );
		if (options.length == 0)
			return null;

		let charTable = {};
		options.forEach(value => { charTable[value.name] = { level:value.level, user:value.user } });

		// If the calling method has specified a list of NPCs we might care about,
		// inject them into the list of options for us to consider prior to finding the best match
		(npcs ?? []).forEach( npc => {
			//console.log(npc)
			charTable[npc.name] = charTable[npc.name] ?? { level: npc.level, user: user }
		})

		var names = Object.keys(charTable);
		if (names.length == 0)
			return null;

		//If we have an exact match, skip the rest
		if (charTable[char] && !forceAll)
		{
			charTable[char].rating = 1;
			charTable[char].name = char;
			return {match:charTable[char], options: []}
		}

		//Find the closest match for that character's name
		var matches = StringSimilarity.findBestMatch(char, names);

		var match = matches.bestMatch;
			match = match.rating >= threshold ?
					{ 	name: match.target,
						...(!user && { user: charTable[match.target].user }),
						level: charTable[match.target].level,
						rating: match.rating
					} : null;

		var matches = matches.ratings;
		matches = matches
			.filter( m => user || m.rating >= threshold )
			.map( m => {
				let name = m.target
				return {
					name: name,
					...(!user && { user: charTable[name].user }),
					level: charTable[name].level,
					rating: m.rating
				}
			})
			.sort( (a,b) => b.rating - a.rating )
			.slice( 0, 10 );

		let result = {match,matches};
		return result;
	}
}

module.exports = new CharacterData();