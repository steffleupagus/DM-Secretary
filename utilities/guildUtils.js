const guildDataSchema = require(`../database/guildDataSchema.js`);
const guildRankSchema = require(`../database/guildRankSchema.js`);
const guildRosterSchema = require(`../database/guildRosterSchema.js`);
const guild_gvar = "776725c9-6944-4985-abfa-b629ffb89109";
const Avrae = require(`./avrae.js`)

class GuildData 
{
    constructor() 
	{
		this.isReady = false;
		this.guildData = {};
		this.rankData = {};
		this.rawRosterData = [];
		this.autoCompleteCache = {};
		this.RefreshGuildData();

		this.dataDirty = false;
		setInterval(async () => 
		{
			if(this.dataDirty) 
			{
				this.dataDirty = false;
				await this.RefreshRoster();
				await this.UpdateGVar();
			}
		}, 15000);		
    }

	async RefreshRoster()
	{
		this.rawRosterData = await guildRosterSchema.find({})
	}
	
	async RefreshGuildData()
	{
		//Clear out the data currently cached
		this.guildData = {};
		this.rankData = {};
		this.isReady = false;
		
		//Fetch the data from the database
		let guildData = await guildDataSchema.find({});
		let guildRank = await guildRankSchema.find({});

		await this.RefreshRoster();
		
		//Process the data into convenient object(s) for use
		guildData.forEach( data => 
		{
			this.guildData[data.guild] = {
				emoji: data.emoji,
				image: data.imageUrl,
				ranks: {0: data.role}
			}
		});
		guildRank.forEach( rank => 
		{
			if (rank.guild)
				this.guildData[rank.guild].ranks[rank.rank] = rank.role
			else
				this.rankData[rank.rank] = rank.role
		});

		this.isReady = true;
		console.log("GuildUtils reports ready")
	}

	GetRoleNames(server)
	{
		if (!this.RoleNames)
		{
			this.RoleNames = {}
			for (const [guild, data] of Object.entries(this.guildData)) 
			{
				for (const [rank, role] of Object.entries(data.ranks))
				{
					this.RoleNames[guild] = this.RoleNames[guild] || {}
					this.RoleNames[guild][rank] = server.roles.resolve(role).name;
				}			
			}
			for (const [rank, role] of Object.entries(this.rankData))
			{
				this.RoleNames[rank] = server.roles.resolve(role).name;
			}
		}
		return this.RoleNames
	}
	
	GetGuildRanksFromRoles(roles)
	{
		let guildRankData = {};
		Object.entries(this.guildData).forEach(guildData => 
		{
			const [guild,data] = guildData;
			guildRankData[guild] = -1
			const ranks = Object.keys(data.ranks);
			for (let rank=0; rank < ranks.length; ++rank)
			{
				const rankRole = data.ranks[`${rank}`];
				if (roles.has(rankRole))
					guildRankData[guild] = rank;							
			}
		});
		return guildRankData;
	}
	
	async GetRawRosterData({guild = null, user = null, char = null, rank = null} = {}, prefilter = false)
	{
		let query = {};
		if (user) query.user = user
		if (prefilter)
		{
			if (guild) query.guild = guild
			if (char) query.char = char
			if (rank) query.rank = rank
		}

		const rosterData = await guildRosterSchema.find(query);
		return rosterData
	}

	async GetMockRosterData({guild = null, user = null, char = null, rank = null} = {})
	{
		const rawData = 
		[
//			{	"user": "670473952761741332", "char": "Test Mage",		"guild": "Arcanum",			"rank": 2 },
			{	"user": "670473952761741332", "char": "Test Rogue", 	"guild": "Black Hand",		"rank": 2 },
			{	"user": "670473952761741332", "char": "Test Cleric",	"guild": "Faith Council",	"rank": 2 },
			{	"user": "670473952761741332", "char": "Test Ranger",	"guild": "Outriders",  		"rank": 2 },
			{	"user": "670473952761741332", "char": "Test Bard", 		"guild": "Silver Thorn",  	"rank": 2 },
			{	"user": "670473952761741332", "char": "Test Fighter", 	"guild": "Guardians", 		"rank": 2 },
			{	"user": "670473952761741332", "char": "Test NPC", 		"guild": "Black Hand",		"rank": 1 },
			{	"user": "670473952761741332", "char": "Test NPC", 		"guild": "Faith Council",	"rank": 2 },
			{	"user": "670473952761741332", "char": "Test NPC", 		"guild": "Guardians", 		"rank": 2 },
			{	"user": "670473952761741332", "char": "Test NPC", 		"guild": "Outriders", 		"rank": 3 },
			{	"user": "670473952761741332", "char": "Test NPC", 		"guild": "Silver Thorn", 	"rank": 3 }
		];
		if (user) user = rawData[0].user;
		const finalData = this.ProcessRosterData(rawData, {guild, user, char, rank});
		return finalData;		
	}
	
	async GetRosterData({guild = null, user = null, char = null, rank = null} = {}, prefilter = false)
	{
		const rawData = await this.GetRawRosterData({guild, user, char, rank}, prefilter)
		const finalData = this.ProcessRosterData(rawData, {guild, user, char, rank});
		return finalData;
	}

	async ProcessRosterData(rawData, {guild = null, user = null, char = null, rank = null} = {})
	{
		let charData = {}
		let rankData = {}
		let guildData = {}
		let guildRankData = {}
		rawData.forEach( data => 
		{
			if ((!char || char == data.char) &&
				(!guild || guild == data.guild))
			{
				const { char, guild, rank } = data	
				charData[char] = charData[char] || {}
				charData[char][guild] = rank
				guildData[guild] = guildData[guild] || {}
				guildData[guild][char] = rank
				
				if (data.rank > (guildRankData[data.guild] || 0))
					guildRankData[guild] = rank;
			}
			if (data.rank > (rankData[data.guild] || 0))
				rankData[data.guild] = data.rank;			
		})
		return {chars: charData, guilds:guildData, guildRanks:guildRankData, ranks:rankData, raw:rawData};
	}
	
	async UpdateRoster({guild, user, char, rank})
	{
		const query = { guild: guild, user: user, char: char };
		const update = { $set: { rank: rank } };
		const options = { new: true, upsert: true }
		let record;
		if (rank > 0)		
			record = await guildRosterSchema.findOneAndUpdate(query, update, options);
		else
			record = await guildRosterSchema.findOneAndDelete(query);

		this.dataDirty = true;
		// await this.UpdateGVar();
		
		return record;
	}

		
	async PurgeChar(char)
	{
		if (!char) return;
		let records = await guildRosterSchema.findOneAndDelete(char);
		console.log("Guild",records)
		this.dataDirty = true;
		return records
	}
			

	async PurgeUser(user)
	{
		if (!user) return;
		const query = { user: user };
		const records = await guildRosterSchema.deleteMany(query);
		console.log("Guild",records);
		this.dataDirty = true;		
	}
	
	// Update the gvar to be in parity with the database.
	// Check first to make sure the changes to the GVar will be the same as the ones just made
	async UpdateGVar()
	{
		// Get the curent gvar contents
		let content = await Avrae.readGvar(guild_gvar);
		// Parse the JSON string from the gvar
			content = JSON.parse(content);
		let dirty = false;

		// Get the total DB
		const userData = {}
		const rawData = await this.GetRawRosterData()
		rawData.forEach( data => 
		{
			const { user, char, guild, rank } = data
			userData[user] = userData[user] || {}
			userData[user][char] = userData[user][char] || {}
			userData[user][char][guild] = rank
		})

		// Update the content with the changes. May need to stringify the JSON
		let newContent = {...content, ...userData};

		// Validate the total DB against the gvar contents
		content = JSON.stringify(content, null, 2)
		newContent = JSON.stringify(newContent, null, 2)
		dirty = content !== newContent

		// Write the new content back to the gvar
		if (dirty)			
			await Avrae.writeGvar(guild_gvar, newContent)	
	}

	getAutoCompleteData(user=null, nameFilter=null, guild=null, result = {})
	{
		if (user)
		{
			//If we don't have autocomplete data cached, get the raw roster data
			if (!this.autoCompleteCache[user])
			{
				this.autoCompleteCache[user] = this.rawRosterData.filter( record => 
				{
					return record.user == user;
				});
//				this.autoCompleteCache[user] = await this.GetRawRosterData({ user:user })
			}
			result = this.autoCompleteCache[user].reduce((map, record) => 
			({
				...map,
				[record.char]: (map[record.char] || '') + 
					( guild 
					 	//If a guild is specified, make the details show the rank of this character in that guild
					 	? (record.guild == guild ? `${this.RoleNames[record.guild][record.rank]} ` : '') 
						//If no guild is specified, make the details a list of guilds the character is in
						: ( (map[record.char] ? " | ":"") + record.guild )
					)
				// [record.char]: (map[record.char] || '') + (record.guild == guild ? 
				// 	`${this.RoleNames[record.guild][record.rank]} ` : '')   
			}), {})
		}
	
		if (nameFilter)
		{
			result = Object.fromEntries(Object.entries(result).filter(([name, guilds]) => 		
										name.toLowerCase().includes(nameFilter)));		
		}
	
		return result;
	}

	clearPromptCache(user)
	{
		this.autoCompleteCache[user] = null
	}
}

module.exports = new GuildData();