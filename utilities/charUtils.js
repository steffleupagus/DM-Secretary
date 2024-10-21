const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils  = require(`../utilities/utilFuncs.js`);
const StringSimilarity = require("string-similarity");

const CharMeta = require(`../database/charMetaSchema.js`)
const LevelData = require(`../database/levelSchema.js`)

const MATCH_THRESHOLD = 0.9
const MIN_THRESHOLD = 0.15

class CharacterData
{
    constructor() {
		this.RefreshCache();
    }

	async RefreshCache() {
		//Clear out the data currently cached
		this.charByUser = {};
		//this.charCache = await LevelUtils.findLevelData({});
		this.charCache = await this.Find();
		this.charCache.forEach(char => 
		{
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
	
	findClosestMatch(char, user = null, forceAll = false, npcs = [], threshold = MIN_THRESHOLD) {
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
		(npcs ?? []).forEach( npc =>
		{
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



	/*=============================*\
	|* DB Lookup & Caching Methods *|
	\*=============================*/
	async RefreshUserCache(user)
	{
		if (!user)
			throw new Error(`charUtils: Cannot refresh user cache without user ID (${user})`)

		//Clear out the user's items from the general cache
		this.charCache = this.charCache.filter(item => item.user != user);
		this.charByUser[user] = [];

		//Grab the user's characters from the DB
		this.charByUser[user] = this.Find({user});
		this.charCache.push(this.charByUser[user]);	
	}	

	getUserChars(user)
	{
		return this.charByUser[user] || []
	}
	
	/*======================================================*\
	|* CRUD Database Operations - Create/Read/Update/Delete *|
	\*======================================================*/

	/// CharMetaSchema
	//{
	//	//User Data
	//		user: 	User ID									//Secondary Key (Combine w/ Name)
	//	//Profile Data
	//		profileName:Profile Name (Parsed from Discord)
	//		profileId:	Profile Message ID (Discord)		//Unique Key
	//	//Sheet Data
	//		sheetName: 	Sheet Name (Parsed from Avrae)
	//		sheetId: 	Sheet ID (Parsed from Avrae)		//Unique Key
	//		level: 		Level number (Parsed from Avrae)
	//	//Misc Data
	//		update: Timestamp
	//}

	/// Demographics parsed from profiles. Race/Class could come from Sheets too
	//{
	//	gender: string (parsed gender/sex)
	//	race: 	string (parsed race),
	//	class: 	string (parsed class),
	//}

	/// Create - Two insertion points into the charDB: profile message or sheet !setup

	///Profile wrappers
	async createProfile(data) { this.writeProfile(data); }
	async updateProfile(data) { this.writeProfile(data); }
	//Write a Profile record
	async writeProfile(data) {
		//Convert the data provided into profile data we can write to the database
		const profileData = { user: data.user, profileName: data.name, profileId: data.profileId };
		const query = this.findDBKey(data)
		console.log("Create Profile: ",data,"\n",profileData,"\nKey: ",query);
	
		//this.Update(profileData, true);
	}

	//Create a Sheet record
	async writeSheet(data) {
		const createRecord = data.upsert
		const sheetData = { user: data.user, sheetName: data.name, sheetId: data.sheetId, level: data.level }
		const query = this.findDBKey(data)
		console.log("Create Sheet: ",data,"\n",sheetData,"\nKey: ",query);
	}
	
	// function createProfile(user, profileName, profileId):
	// 	// Search for existing records with the same user
	// 	existingRecords = searchDatabase(user)

	// 	// Attempt to find a matching sheet using fuzzy string matching
	// 	matchedRecord = findMatchingRecord(existingRecords, profileName, "sheetName")

	// 	// If a match is found, update the existing record with profile data
	// 	if matchedRecord is not null:
	// 		matchedRecord.profileId = profileId
	// 		matchedRecord.name = profileName
	// 		matchedRecord.update = getCurrentTimestamp()
	// 		saveToDatabase(matchedRecord)
	// 		log("Updated existing record: " + matchedRecord.id)

	// 	// If no match is found, create a new profile record
	// 	else:
	// 		newRecord = createNewRecord(user, profileName, profileId, null, null)
	// 		saveToDatabase(newRecord)
	// 		log("Created new profile record: " + newRecord.id)

	// 	return newRecord.id if newRecord is not null else matchedRecord.id

	// function createSheet(user, sheetName, sheetId):
	// 	// Search for existing records with the same user
	// 	existingRecords = searchDatabase(user)

	// 	// Attempt to find a matching profile using fuzzy string matching
	// 	matchedRecord = findMatchingRecord(existingRecords, sheetName, "name")

	// 	// If a match is found, update the existing record with sheet data
	// 	if matchedRecord is not null:
	// 		matchedRecord.sheetId = sheetId
	// 		matchedRecord.sheetName = sheetName
	// 		matchedRecord.update = getCurrentTimestamp()
	// 		saveToDatabase(matchedRecord)
	// 		log("Updated existing record: " + matchedRecord.id)

	// 	// If no match is found, create a new sheet record
	// 	else:
	// 		newRecord = createNewRecord(user, null, null, sheetName, sheetId)
	// 		saveToDatabase(newRecord)
	// 		log("Created new sheet record: " + newRecord.id)

	// 	return newRecord.id if newRecord is not null else matchedRecord.id

	// function findMatchingRecord(records, name, nameField):
	// 	for record in records:
	// 		if record[nameField] is not null:
	// 			if fuzzyMatch(name, record[nameField]):
	// 				return record
	// 	return null



	


	

	


	// //Create and Update in one record
	// async Update(data, query=null, create=true) {
	// 	//Apply the most recent update to the data
	// 	data.update = Date.now()
	// 	const update = { $set: data }
	// 	const options = { new: create, upsert: create }
	// 	const record = await CharMeta.findOneAndUpdate(query, update, options)
	// 	console.log(`Update: `,record.user);
	// 	return record;
	// }




	

	//NOTES FOR LATER
	//Roster command fields for each character
	//Field Name:	Character name (Profile if available, else sheet only)
	//Field Body:	Indicate if the character is sheet-only (orphaned)
	//				Profile Name / Link (Level X / RP-Only / NPC)
	//				Sheet Name / Link
	//				Last Updated Timestamp

	//DB Access - Find
	async Find(query = {}) {
		//const result = await CharMeta.find(query)
		const result = await LevelData.find(query)
		return result;
	}

	//DB Access - Insert / Update
	async Update(data, upsert=false)
	{
		await CharMeta.create(data)
//		const result = await CharMeta.findOneAndUpdate(query, record, { upsert })
	}

	findDBKey(query, sheet=false) {
		//Make sure we're only updating the appropriate users' records
		if (!query.user) throw new Error("updateLevel: Cannot update character without the user")		
		const userKey = { user: query.user };

		//Match IDs where available this is the most reliable method
	 	let idKey = (sheet || query.sheetId) ? "sheetId" : "profileId";
			idKey = { [idKey]: query[idKey] }

		//Matching names as a fallback option if the ID isn't possible
		let nameKey = (sheet || query.sheetName) ? "sheetName" : "name"
	 		nameKey = { [charKey]: query[charKey] }

		const key = { $and: [ userKey, { $or: [ idKey, nameKey ] } ] }		
		console.log(key)
		return key
	}



	
	
		// 	search,
		// 	{
		// 		name: search.name,
		// 		user: search.user,
		// 		level: level,
		// 		update: timestamp
		// 	},
		// 	{
		// 		upsert: true
		// 	})



	
	/// TEST CODE
	async nameMatchTest() {
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




/*async RefreshCache()
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
*/

/*
getUserCharData(user=null, nameFilter=null, guild=null, result={})
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
*/

/*
async findClosestMatch(char, user = null, forceAll = false, npcs = [], threshold = MIN_THRESHOLD)
{
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
	(npcs ?? []).forEach( npc => 
	{
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
*/