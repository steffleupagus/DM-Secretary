const { Permissions } = require('discord.js');

module.exports =
{
	async slowdown(milliseconds)	
	{ 
		return new Promise(resolve => setTimeout(resolve, milliseconds)) 
	},

	async asyncCollectionForEach(collection, callback) 
	{
		if (!collection) return;
		const count = collection.size;
		const keys = Array.from(collection.keys());

		for (let index = 0; index < count; index++) 
		{
			const key = keys[index];
			await callback(collection.get(key), key, collection);
		}
	},

	async asyncArrayForEach(array, callback) 
	{
		if (!array) return;
		const count = array.length;
		for (let index = 0; index < count; index++) 
		{
			await callback(array[index], index, array);
		}
	},

	//Use with caution
	async channelCleanup(channel)
	{
		let messages = await channel.messages.fetch({limit: 100});
		console.log(`Channel cleanup: Deleting ${messages.size} messages.`)
			await channel.bulkDelete(messages);
		if (messages.size >= 2)
			await this.channelCleanup(channel);
	},
	
	getPermissionStr(perm)
	{
		perm = Object.keys(Permissions.FLAGS).find(key => Permissions.FLAGS[key] === perm);
		return perm;
	}
}