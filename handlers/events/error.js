module.exports = {
	name: 'error',
	once: false,
	execute(client, info) {
		console.error(`error -> ${info}`);
	},
};