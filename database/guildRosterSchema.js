const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const reqNumber = { type:Number, required:true }
const schema = new mongoose.Schema({
	guild: reqString,
	user: reqNumber,
	rank: reqNumber
})

module.exports = mongoose.model('guildRoster', schema, 'guildRoster')