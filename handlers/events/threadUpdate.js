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
	}
}

module.exports = {
	name: 'threadUpdate',
	execute: execute
};