const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const mongoose = require('mongoose')
const schemaName = `guildRanks${config.DEV ? "_dev" : ""}`

const reqString = { type:String, required:true }
const reqNumber = { type:Number, required:true }
const schema = new mongoose.Schema({
	guild: String,
	rank: reqNumber,
	role: reqString,
	imageUrl: String,
})

module.exports = mongoose.model(schemaName, schema, schemaName)