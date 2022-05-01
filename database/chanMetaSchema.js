const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	channelId: reqString,
	awardsExp: Boolean,
	hideActivity: Boolean,	
})

module.exports = mongoose.model('channelmeta', schema, 'channelmeta')