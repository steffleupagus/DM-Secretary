const { Client } = require("discord.js")

module.exports = {
	name: "ping",
	description: "Return Latency Ping",

	run: async (client, interaction, args) => {
		interaction.followUp({ content: `${client.ws.ping} ws!` })
	}
}