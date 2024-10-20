/*------------------------------------------------*\
| Detect Profile postsand log them to the database |
\*------------------------------------------------*/
const mod = process.env.mod || ""
const config = require(`../../config/${mod}_config.json`)
const Profile = require(`../../utilities/profileUtils.js`)
const CharUtils = require(`../../utilities/charUtils.js`)

async function shouldHandle(client, message, type)
{
	const isProfile = Profile.isProfileMessage(client, message)
	return isProfile
}

async function handleCreate(client, message, interaction=null, sendResult=true)
{
	const profileData = Profile.parseProfile(message);
	await CharUtils.createProfile(profileData);
}

async function handleUpdate(client, oldMessage, newMessage)
{
	console.log(`Edit Profile ${newMessage.id}`)
	const profileData = Profile.parseProfile(newMessage);
	await CharUtils.updateProfile(profileData);
}

async function handleDelete(client, message, interaction=null, sendResult=true)
{
	console.log(`Delete Profile ${message.id}`)
	await CharUtils.deleteProfile(profileData);
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