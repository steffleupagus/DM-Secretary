/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const respec = require(`../../utilities/funcsRespec.js`)
module.exports = {
	name: 'respecPurchase',
	bot: true,
	shouldHandle: respec.shouldHandle,
	handleCreate: respec.handleCreate
};