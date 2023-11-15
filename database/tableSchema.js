const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const mongoose = require('mongoose')

const schemaName = `tablemeta${config.DEV ? "dev" : ""}`

//const stringArray = { type:[String] }
const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	user:		reqString,
	name:		reqString,
	dmThread:	reqString,
	oocThread:	reqString,
	rpThread:	reqString,
	updated: 	Number,
	archived:	Boolean
})
	
module.exports = mongoose.model(schemaName, schema, schemaName)