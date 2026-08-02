const ChanUtils = require(`../../utilities/channelUtils.js`)
const Tupper = require(`../../utilities/tupperUtils.js`)
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(client, oldThread, newThread)
{
	if (newThread.archived != oldThread.archived)
	{
		const user = await client?.users?.fetch(config.OWNERID)
		const name = newThread.name;
		const archived = newThread.archived;
		if (archived && name.includes("📌") && config.PRODUCTION)
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

		if (ChanUtils.isRoleplayThread(newThread) && newThread.archived)
		{
			const isExpChannel = await ChanUtils.isRPExpThread(newThread)
			const isTableThread = await ChanUtils.isTableRPThread(newThread)
			const log = `${newThread.name} ${newThread}\narchived: ${newThread.archived}\nExp Thread: ${isExpChannel}\nTable Thread: ${isTableThread}`
			if (isExpChannel && config.PRODUCTION)
			{
				const messages = await newThread.messages.fetch({limit:1});
				const message  = messages?.first()
				if ( message && (!message.author.bot || Tupper.isTupperProxyMessage(message)) )
				{
					const commandName = `scene${config.DEV ? "dev" : ""}`
					const command = client.commands.get(commandName);
					if (command)
					{
						await command.autoClose(message)
						await newThread.setArchived(true)
					}
				}
			}
			else if (isTableThread)
			{
				const messages = await newThread.messages.fetch({limit:1});
				const message  = messages?.first()
				if ( message && (!message.author.bot || Tupper.isTupperProxyMessage(message)) )
				{
					const commandName = `table${config.DEV ? "dev" : ""}`
					const command = client.commands.get(commandName);
					if (command && command.autoClose)
					{
						await command.autoClose(newThread, isTableThread)
					}
				}
			}

			if (user && log)
			{
				await user.send(log)
			}
		}
	}
}

module.exports = {
	name: 'threadUpdate',
	execute: execute,
	build:config.PRODUCTION || config.DEV
};