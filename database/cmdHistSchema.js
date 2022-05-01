const mongoose = require('mongoose')

const reqString = { type:String, required:true }

const schema = new mongoose.Schema({
	command: reqString,
	lasMsg: reqString
})

module.exports = mongoose.model('commandhistory', schema, 'commandhistory')