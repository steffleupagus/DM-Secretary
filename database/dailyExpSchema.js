const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name: reqString,
	user: reqString,
	type: reqString,
	exp: Number,
	cap: Number,
	reset: Number
})

module.exports = mongoose.model('dailyExp', schema, 'dailyExp')