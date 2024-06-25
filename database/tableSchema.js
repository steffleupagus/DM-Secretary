const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const mongoose = require('mongoose')

const schemaName = `tableMeta${config.DEV ? "_dev" : ""}`

//const stringArray = { type:[String] }
const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	user:		reqString,
	title:		reqString,
	name:		reqString,
	desc:		String,
	dmThread:	reqString,
	oocThread:	reqString,
	rpThread:	reqString,
	created: 	Number,
	updated: 	Number,
	archived:	Number,
	players:	{}
})

module.exports = mongoose.model(schemaName, schema, schemaName)