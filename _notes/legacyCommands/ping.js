const { Client } = require("discord.js")

module.exports = {
	name: "ping",
	description: "Return Latency Ping",

	run: async (client, message, args) => {
		message.channel.send({ content: `${client.ws.ping} ws!`})
	}
}