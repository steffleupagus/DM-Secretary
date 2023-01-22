const mongoose = require('mongoose')

const reqString = { type:String, required:true }
const schema = new mongoose.Schema({
	user: reqString,
	posts: {type:Number, default:0},
	chars: {type:Number, default:0},
	scene: {type:Array, default:[]},
	proxy: {type:Number, default:0},
	last:  String
})
module.exports = mongoose.model('weeklyRPP', schema, 'weeklyRPP')