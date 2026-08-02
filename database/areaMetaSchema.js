const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `areaMeta${config.DEV ? "_dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name:   reqString,
	catId:	reqString,
	roleId: [String],
	icon:	String,
	guild:	String,
	disable:Boolean
})

module.exports = mongoose.model(schemaName, schema, schemaName)
