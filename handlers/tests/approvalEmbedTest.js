const fs = require('fs');

const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)
const approvalUtils = require('../../utilities/approvalUtils.js')

async function getTestData(args) {
	const file = `data/test/${args.cmd}Data.json`
	let data = await fs.readFileSync(file)
		data = JSON.parse(data)
	return data
}

async function run(client){
	const channel = await client.channels.fetch(config.debug.misc)

	{
		const args = { cmd:"duel", channel, test:true }
		const data = await getTestData(args)
		await approvalUtils.AwaitConfirmation(null, data, args)
	}

	{
		const fieldArgs = { hp:false }
		const args = { cmd:"scene", channel, test:true, fieldArgs }
		const data = await getTestData(args)
		await approvalUtils.AwaitConfirmation(null, data, args)
	}
}

const testData = {
	name: 'approvalEmbed',
	run,
	build:config.DEV
};
module.exports = testData