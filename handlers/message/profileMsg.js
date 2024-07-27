/*------------------------------------------------*\
| Detect Profile postsand log them to the database |
\*------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const Profile = require(`../../utilities/profileUtils.js`)

async function shouldHandle(client, message, type)
{
	const isProfile = Profile.isProfileMessage(client, message)
	return isProfile
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const profileData = Profile.parseProfile(message);
	console.log(profileData);

	// const updated = await LevelData.logLevelMessage(client, message, interaction, sendResult)
	// if (updated && !config.DEV)
	// {
	// 	const channel = await message.guild.channels.resolve(config.chan.levelOut)
	// 	console.log(channel.id)
	// 	await LevelData.updateLevelMessage(channel);
	// }	
}

async function handleUpdate(client, oldMessage, newMessage)
{
	console.log(`Edit Profile ${newMessage.id}`)
	console.log(Profile.parseProfile(newMessage))
}

async function handleDelete(client, message, interaction=null, sendResult=true)
{
	console.log(`Delete Profile ${message.id}`)
}

module.exports = {
	name: 'profileMsg',
	menu: true,	
	shouldHandle: shouldHandle,
	handleCreate: handleCreate,
	handleUpdate: handleUpdate,
	handleDelete: handleDelete,

	build: config.PRODUCTION || config.DEV
};