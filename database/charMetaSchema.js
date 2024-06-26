const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `characterMeta${config.DEV ? "_dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	user: reqString,
	name: reqString,
	profile: String,
	sheetName: String,
	sheet: String,
	level: Number,
	//tupper: [String],
	update: Number
})

module.exports = mongoose.model(schemaName, schema, schemaName)