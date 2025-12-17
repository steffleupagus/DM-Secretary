const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const mongoose = require('mongoose')
const schemaName = `channelActivity${config.DEV ? "_dev" : ""}`

//const stringArray = { type:[String] }
const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	chan:	reqString,
	user:	reqString,
	users: [String],
	thread: String,
	time:	Number,
	scene: 	Boolean,
	update: Number
})

module.exports = mongoose.model(schemaName, schema, schemaName)
