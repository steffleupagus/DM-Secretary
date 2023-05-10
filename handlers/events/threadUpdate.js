const ChanUtils = require(`../../utilities/channelUtils.js`)
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);

async function execute(client, oldThread, newThread)
{
	if (newThread.archived != oldThread.archived)
	{
		const user = await client?.users?.fetch(config.OWNERID)
		
		const name = newThread.name;
		const archived = newThread.archived;
		if (archived && name.includes("📌"))
		{
			newThread.setArchived(false, "Unarchiving pinned thread.");
			if (user)
			{
				const dm = `${name} (${newThread}) has been archived. Unarchiving.`
				await user.send(dm)
				const bump = await newThread.send(".");
				await bump.delete();
			}
		}

		if (ChanUtils.isRoleplayThread(newThread))
		{		
			const isExpChannel = await ChanUtils.isRPExpThread(newThread)
			if (user)
			{
				const dm = `${newThread.name} ${newThread}\narchived: ${newThread.archived}\nExp Thread: ${isExpChannel}`
				await user.send(dm)
			}

			if (isExpChannel)
			{
				const messages = await newThread.messages.fetch({limit:1});
				const message  = messages?.first()			
				if ( message && (!message.author.bot || message.author.id == config.tupperID) )
				{
	
					const commandName = `scene${config.DEV ? "dev" : ""}`
					const command = client.commands.get(commandName);
					if (command) await command.autoClose(message)
				}
			}
		}
	}
}

module.exports = {
	name: 'threadUpdate',
	execute: execute,
	build:config.PRODUCTION //|| config.DEV
};