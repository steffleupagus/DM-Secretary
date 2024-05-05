const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	name: reqString,
	user: reqString,
	level: Number,
	update: Number
})

module.exports = mongoose.model('leveldata', schema, 'leveldata')