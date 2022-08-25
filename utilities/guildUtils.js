const guildDataSchema = require(`../database/guildDataSchema.js`);
const guildRankSchema = require(`../database/guildRankSchema.js`);
const guildRosterSchema = require(`../database/guildRosterSchema.js`);
const guilds_gvar = "776725c9-6944-4985-abfa-b629ffb89109";
const Avrae = require(`./avrae.js`)

class GuildData 
{
    constructor() 
	{
		this.RefreshGuildData();
    }
	
	async RefreshGuildData()
	{
		//Clear out the data currently cached
		this.guildData = {};
		this.rankData = {};
		

		//Fetch the data from the database
		let guildData = await guildDataSchema.find({});
		let guildRank = await guildRankSchema.find({});
		
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

		console.log("GuildUtils reports ready")
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
	
	async GetRosterData({guild = null, user = null, char = null, rank = null} = {})
	{
		let query = {};
		if (guild) query.guild = guild
		if (user) query.user = user
		if (char) query.char = char
		if (rank) query.rank = rank
		const rosterData = await guildRosterSchema.find(query);

		//TODO: Organize the guild data into a useful result data structure?
		// console.log(rosterData);
	
		return rosterData
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
		return record;
	}	

	// Update the gvar to be in parity with the database.
	// Check first to make sure the changes to the GVar will be the same as the ones just made
	async UpdateGVar()
	{
		// const content = await Avrae.readGvar(gvar);
		// interaction.reply({content:content, ephemeral: true})
		// await Avrae.writeGvar(gvar, content + "\nasdfsadf")	
	}
	
}

module.exports = new GuildData();