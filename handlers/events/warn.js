module.exports = {
	name: 'warn',
	once: false,
	execute(client, info) {
		console.log(`warn -> ${info}`);
	},
};