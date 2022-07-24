///
/// We don't want people to resolve the same duel multiple times
/// so to prevent that, we lock the channel from accepting the command again
/// 
var mutex = {};

const ALREADY_UNLOCKED = 0
const ALREADY_LOCKED = 1

const errorCodes = 
{
	ALREADY_UNLOCKED,
	ALREADY_LOCKED
}

function MutexException(channel, value, message)
{
	this.channel = channel.id
	this.value = value
	this.message = message
  	this.toString = function() 
	{
    	return this.message;
	};
}

function test(channel)
{
	return mutex[channel.id] === true;
}

function lock(channel, except = false)
{
	if (except && test(channel))
		throw new MutexException(channel, ALREADY_LOCKED, except);
	mutex[channel.id] = true;
}

function unlock(channel, except = false)
{
	if (except && !test(channel))
		throw new MutexException(channel, ALREADY_UNLOCKED, except);	
	mutex[channel.id] = false;
	return true;
}

function get(channel=null)
{
	if (channel)
		return mutex[channel.id]
	return mutex
}

module.exports = 
{
	lock,
	unlock,
	test,
	get,

	errorCodes
}