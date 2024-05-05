const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `channelMeta${config.DEV ? "_dev" : ""}`

//const stringArray = { type:[String] }
const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	channelId: reqString,
	name:      reqString,
	awardsExp: Boolean,
	userOwner: [String],
	guildHall: String,
	threadMax: Number,
	locations: [String],
	trackActivity: Boolean	
})
	
module.exports = mongoose.model(schemaName, schema, schemaName)
