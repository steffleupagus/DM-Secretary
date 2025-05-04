const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `channelLook${config.DEV ? "_dev" : ""}`

//const stringArray = { type:[String] }
const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	channelId:	reqString,
	title:		String,
	image:		[String],
	desc:		String
})

module.exports = mongoose.model(schemaName, schema, schemaName)
