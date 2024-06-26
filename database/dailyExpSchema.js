const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const mongoose = require('mongoose')
const schemaName = `dailyExp${config.DEV ? "_dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name: reqString,
	user: reqString,
	type: reqString,
	exp: Number,
	cap: Number,
	reset: Number
})

module.exports = mongoose.model(schemaName, schema, schemaName)