module.exports = {
	name: 'rateLimit',
	once: false,
	execute(client, info) {
		console.error(`rateLimit -> `, info);
	},
};