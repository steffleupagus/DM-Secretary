const ChanUtils = require(`../../utilities/channelUtils.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(client, oldThread, newThread)
{
	if (newThread.archived != oldThread.archived)
	{
		const name = newThread.name;
		const archived = newThread.archived;
		if (archived && name.includes("📌"))
		{
			console.log(`${name} has been archived. Unarchiving.`)
			newThread.setArchived(false, "Unarchiving pinned thread.");
		}

		if (ChanUtils.isRoleplayThread(newThread))
		{		
			const user = await client?.users?.fetch(config.OWNERID)
			if (user)
			{
				console.log(newThread)		
				await user.send(`${newThread.name} ${newThread} archived: ${newThread.archived}`)
			}
			
			console.log("\n\n\n\n\n-------------------------------------")			
			const messages = await newThread.messages.fetch({limit:1});
			const message  = messages?.first()
			
			if ( message && (!message.author.bot || message.author.id == config.tupperID) )
			{
				const isExpChannel = await ChanUtils.isRPExpChannel(channel)

				const commandName = `scene${config.DEV ? "dev" : ""}`
				const command = client.commands.get(commandName);
				if (command && isExpChannel) await command.autoClose(message)
			}
			console.log("-------------------------------------\n\n\n\n\n")					
		}
	}
}

module.exports = {
	name: 'threadUpdate',
	execute: execute,
	build:config.PRODUCTION //|| config.DEV
};