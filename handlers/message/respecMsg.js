/*------------------------------------------------------------*\
| Detect Respec purchases and relay them to the respec channel |
\*------------------------------------------------------------*/
const respec = require(`../../utilities/funcsRespec.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

module.exports = {
	name: 'respecPurchase',
	bot: true,
	menu: true,	
	menuRoles: [ config.ModeratorRole ],
	shouldHandle: respec.shouldHandle,
	handleCreate: respec.handleCreate,

	build: config.PRODUCTION //|| config.DEV
};