/*--------------------------------------*\
| Detect Avrae rolls and verify the hash |
\*--------------------------------------*/
const verify = require(`../../utilities/funcsVerify.js`)
module.exports = {
	name: 'rollVerify',
	bot: true,
	shouldHandle: verify.shouldHandle,
	handleCreate: verify.handleCreate
};