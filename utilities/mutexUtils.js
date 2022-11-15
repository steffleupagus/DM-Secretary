///
/// We don't want people to resolve the same duel multiple times
/// so to prevent that, we lock the channel from accepting the command again
/// 
const ALREADY_UNLOCKED = 0
const ALREADY_LOCKED = 1
const errorCodes = 
{
	ALREADY_UNLOCKED,
	ALREADY_LOCKED
}

//function MutexException(channel, value, message)
class MutexException
{
	constructor(channel, value, message)
	{
		this.channel = channel.id	
		this.value   = value
		this.message = message
	}
	
	toString()
	{
    	return this.message;
	}		
}

class MutexManager
{
    constructor() 
	{
		this.mutex = {};
		this.debug = false;
	}

	_Debug()
	{
		if (this.debug)
			console.log(this.mutex);
	}

	test(channel){return Test(channel)}	
	Test(channel)	
	{
		this._Debug();
		return this.mutex[channel.id] === true;
	}

	lock(channel, except = false){return Lock(channel,except)}
	Lock(channel, except = false)
	{
		if (except && this.Test(channel))
			throw new MutexException(channel, ALREADY_LOCKED, except);
		this.mutex[channel.id] = true;
	}

	unlock(channel, except = false){return Unlock(channel,except)}	
	Unlock(channel, except = false)
	{
		this.mutex[channel.id] = false;
		if (except)
			throw new MutexException(channel, ALREADY_UNLOCKED, except);
		return true;
	}

	get(channel=null){return Get(channel)}
	Get(channel=null)
	{
		if (channel)
			return this.mutex[channel.id]
		return this.mutex
	}
}

module.exports = new MutexManager