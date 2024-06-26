const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const mongoose = require('mongoose')
const schemaName = `itemMeta${config.DEV ? "_dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name: reqString,
	source: reqString,
	rarity: reqString,
	attunement: String,

	status: reqString,
	flags: String,	
	comment: String,
	updated: Number
})

module.exports = mongoose.model(schemaName, schema, schemaName)