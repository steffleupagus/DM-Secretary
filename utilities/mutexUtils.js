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

class MutexException
{
	constructor(channel, value, error)
	{
		this.channel = channel?.id ?? channel
		this.value	 = value
		this.error	 = error
		this.name    = error?.name ?? "Error"
		this.cause   = error?.cause ?? ""
		this.message = error?.message ?? error
		this.stack	 = error?.stack ?? Error().stack
	}

	toString()
	{
		console.log(this.error)
		console.log(this.stack)
    	return this.error?.toString();
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

	test(channel){return this.Test(channel)}
	Test(channel)
	{
		this._Debug();
		return this.mutex[channel?.id ?? channel] === true;
	}

	lock(channel, except = false){return this.Lock(channel,except)}
	Lock(channel, except = false)
	{
		if (except && this.Test(channel))
			throw new MutexException(channel, ALREADY_LOCKED, except);
		this.mutex[channel?.id ?? channel] = true;
	}

	unlock(channel, except = false, retVal = true){return this.Unlock(channel,except,retVal)}
	Unlock(channel, except = false, retVal = true)
	{
		this.mutex[channel?.id ?? channel] = false;
		if (except)
			throw new MutexException(channel, ALREADY_UNLOCKED, except);
		return retVal;
	}

	get(channel=null){return this.Get(channel)}
	Get(channel=null)
	{
		if (channel)
			return this.mutex[channel?.id ?? channel]
		return this.mutex
	}
}

module.exports = new MutexManager