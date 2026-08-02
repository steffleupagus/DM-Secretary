const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`)

function run(client){
	console.log("Unit Test Run.")
}

const testData = {
	name: 'unitTest',
	run,
	build:config.DEV
};

module.exports = testData