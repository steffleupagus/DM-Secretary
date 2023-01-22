module.exports = 
{
	name: 'raw',
	once: false,
	execute(client, packet) 
	{
		const eventHandler = client.eventHandlers.get(packet.t);
		if (eventHandler && 
			eventHandler.raw && eventHandler.raw == packet.t)
		{
			console.log(packet);
			eventHandler.processRaw(client, packet);
		}
		
		const packetTypes = ['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'];

		// We don't want this to run on unrelated packets
	    if (!packetTypes.includes(packet.t)) return;

	    // Grab the channel to check the message from
	    const channel = client.channels.cache.get(packet.d.channel_id);

	    // There's no need to emit if the message is cached, the event will fire anyway
	    if (channel.messages.cache.has(packet.d.message_id)) return;

	    // Since we have confirmed the message is not cached, let's fetch it
	    channel.messages.fetch(packet.d.message_id).then(message => 
		{
			// Emojis can have identifiers of name:id format. account for that case as well
	        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
	        // This gives us the reaction we need to emit the event properly
	        const reaction = message.reactions.cache.get(emoji);
	        // Adds the currently reacting user to the reaction's users collection.
	        if (reaction) 
				reaction.users.cache.set(packet.d.user_id, client.users.cache.get(packet.d.user_id));
	        // Check which type of event it is before emitting
	        if (packet.t === 'MESSAGE_REACTION_ADD') 
			{
	            client.emit('messageReactionAdd', reaction, client.users.cache.get(packet.d.user_id));
	        }
    	    if (packet.t === 'MESSAGE_REACTION_REMOVE') 
			{
	            client.emit('messageReactionRemove', reaction, client.users.cache.get(packet.d.user_id));
			}
		});
	}
};