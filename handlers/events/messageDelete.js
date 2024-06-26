const Utils = require(`../../utilities/utilFuncs.js`)
async function execute(client, message)
{
	//Finally, if we're all the way through here, check for RP messages
	Utils.asyncArrayForEach(client.messageHandlers, async (handler) => 
	{
		if (handler.hasOwnProperty("build") && !handler.build) return;
		if (handler.bot != message.author?.bot) return;
		const shouldHandle = await handler.shouldHandle(client, message);
		if (shouldHandle && handler.handleDelete) 
			await handler.handleDelete(client, message)
	});
}

module.exports = {
	name: 'messageDelete',
	execute: execute
};