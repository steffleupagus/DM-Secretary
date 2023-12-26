/*--------------------------------------*\
| Detect Avrae rolls and verify the hash |
\*--------------------------------------*/
const verify = require(`../../utilities/funcsVerify.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

module.exports = {
	name: 'rollVerify',
	bot: true,
	menu: true,	
	shouldHandle: verify.shouldHandle,
	handleCreate: verify.handleCreate,
	
	build: config.PRODUCTION //|| config.DEV	
};