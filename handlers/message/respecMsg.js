/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const respec = require("../../utilities/respecFuncs.js")
module.exports = {
	name: 'respecPurchase',
	shouldHandle: respec.shouldHandle,
	handle: respec.handle
};