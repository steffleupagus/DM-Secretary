const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `areameta${config.DEV ? "dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name:   reqString,
	catId:	reqString,
	roleId: [String],	
	icon:	String,
	guild:	String
})
	
module.exports = mongoose.model(schemaName, schema, schemaName)
