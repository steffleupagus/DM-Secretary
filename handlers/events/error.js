module.exports = {
	name: 'error',
	once: false,
	execute(client, info) {
		var stackTrace = Error().stack;
		console.error(`error -> ${info}`, stackTrace);
	},
};