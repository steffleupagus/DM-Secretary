const mongoose = require('mongoose')

const reqString = { type:String, required:true }

const schema = new mongoose.Schema({
	logId: reqString,
	cId: reqString,
	mId: reqString,
	aId: reqString,
	t: reqString,
	time: Number,
	len: {type:Number, required: true}
})

module.exports = mongoose.model('tuppermap', schema, 'tuppermap')