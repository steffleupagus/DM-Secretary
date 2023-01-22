// messageReactionAdd
/* Emitted whenever a reaction is added to a message.
PARAMETER        TYPE             DESCRIPTION
messageReaction  MessageReaction  The reaction object
user             User             The user that applied the emoji or reaction emoji    
*/

module.exports = {
	name: 'messageReactionAdd',
	async execute(client, messageReaction, user) 
	{
		// if (messageReaction && messageReaction._emoji)
		// 	console.log(messageReaction._emoji.name);
	}
};