/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const verify = require(`${process.cwd()}/utilities/funcsVerify.js`)
module.exports = {
	name: 'rollVerify',
	shouldHandle: verify.shouldHandle,
	handle: verify.handle
};