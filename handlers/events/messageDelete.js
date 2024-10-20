const Utils = require(`../../utilities/utilFuncs.js`)
async function execute(client, message)
{
	Utils.asyncArrayForEach(client.messageHandlers, async (handler) =>
	{
		if (handler.hasOwnProperty("build") && !handler.build) return;
		if (message?.author)
		{
			//If the handler is not meant for bots, early out if a bot triggered it
			if (!handler.bot && message.author?.bot) return;
			//If the handler is ONLY meant for bots, early out if a user triggered
			if (handler.bot && !handler.user && !message.author?.bot) return;
		}
		const shouldHandle = await handler.shouldHandle(client, message, "Delete");
		if (shouldHandle && handler.handleDelete)
			await handler.handleDelete(client, message)
	});
}

module.exports = {
	name: 'messageDelete',
	execute: execute
};