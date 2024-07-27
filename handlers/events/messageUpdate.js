const Utils = require(`../../utilities/utilFuncs.js`)
async function execute(client, oldMessage, newMessage)
{
	//Finally, if we're all the way through here, check for RP messages
	Utils.asyncArrayForEach(client.messageHandlers, async (handler) => 
	{
		if (handler.hasOwnProperty("build") && !handler.build) return;
		if (newMessage.author.bot && !handler.bot) return;
		if (handler.bot && !handler.user && !newMessage.author.bot) return;
		const shouldHandle = await handler.shouldHandle(client, newMessage, "Update");
		if (shouldHandle && handler.handleUpdate) 
			await handler.handleUpdate(client, oldMessage, newMessage)	
	});
}

module.exports = {
	name: 'messageUpdate',
	execute: execute
};