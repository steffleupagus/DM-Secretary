const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const reqNumber = { type:Number, required:true }
const schema = new mongoose.Schema({
	guild: reqString,
	rankId: reqNumber,
	roleId: Number,
	imageUrl: String,
	emoji: String,
})

module.exports = mongoose.model('guildData', schema, 'guildData')