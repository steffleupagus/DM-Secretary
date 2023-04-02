const mongoose = require('mongoose')

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

module.exports = mongoose.model('quest', schema, 'quest')