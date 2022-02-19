/*--------------------------------------*\
| Detect Avrae rolls and verify the hash |
\*--------------------------------------*/
const verify = require(`${process.cwd()}/utilities/funcsVerify.js`)
module.exports = {
	name: 'rollVerify',
	shouldHandle: verify.shouldHandle,
	handle: verify.handle
};