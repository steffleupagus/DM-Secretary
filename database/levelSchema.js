const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `leveldata${config.DEV ? "dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name: reqString,
	user: reqString,
	level: Number,
	update: Number
})

module.exports = mongoose.model(schemaName, schema, schemaName)