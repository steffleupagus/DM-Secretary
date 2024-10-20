const Utils = require(`../../utilities/utilFuncs.js`)
async function execute(client, oldMessage, newMessage)
{
	Utils.asyncArrayForEach(client.messageHandlers, async (handler) =>
	{
		if (handler.hasOwnProperty("build") && !handler.build) return;

		//If the handler is not meant for bots, early out if a bot triggered it
		if (!handler.bot && newMessage.author?.bot) return;

		//If the handler is ONLY meant for bots, early out if a user triggered
		if (handler.bot && !handler.user && !newMessage.author?.bot) return;

		const shouldHandle = await handler.shouldHandle(client, newMessage, "Update");
		if (shouldHandle && handler.handleUpdate)
			await handler.handleUpdate(client, oldMessage, newMessage)
	});
}

module.exports = {
	name: 'messageUpdate',
	execute: execute
};