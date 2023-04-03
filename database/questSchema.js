const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`)

const mongoose = require('mongoose')

const schemaName = `quest${config.DEV ? "dev" : ""}`

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	char: reqString,
	user: reqString,
	chan: reqString,	
  	damage: {
		count: Number,
    	total: Number
	},	
  	healing: {
		count: Number,
    	total: Number
	},
	guilds: [{
		guild: String,
		count: Number,
		skill: Number,
		damage:Number,
		healing:Number
	}],
	skills: [{
		skill: String,
		count: Number,
    	total: Number				
	}]
})

module.exports = mongoose.model(schemaName, schema, schemaName)