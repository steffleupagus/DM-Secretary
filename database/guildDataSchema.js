const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	guild: reqString,
	role: reqString,
	imageUrl: String,
	emoji: String,
})

module.exports = mongoose.model('guildData', schema, 'guildData')