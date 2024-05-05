const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const mongoose = require('mongoose')
const schemaName = `guildData${config.DEV ? "_dev" : ""}`


const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	guild: reqString,
	role: reqString,
	imageUrl: String,
	emoji: String,
})

module.exports = mongoose.model(schemaName, schema, schemaName)