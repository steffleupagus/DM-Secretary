const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const reqNumber = { type:Number, required:true }
const schema = new mongoose.Schema({
	guild: String,
	rank: reqNumber,
	role: reqString,
	imageUrl: String,
})

module.exports = mongoose.model('guildRanks', schema, 'guildRanks')