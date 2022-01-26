const { MessageEmbed, MessageMentions } = require('discord.js');

const debugEnabled = true;

function debug(msg)
{
	if (debugEnabled)
	{
		console.log(msg)
	}
}

function shouldHandle(client, message)
{
	let meta = verifyMessageMeta(client, message)
	let content = verifyMessageContent(client, message)
	return meta && content
}

function verifyMessageMeta(client, message)
{
	let author  = message.author.id;
	author = author == client.config.avraeId;

	let channel = message.channel.id;
	let parent  = message.channel.parentId;
	channel = (//(channel == client.config.rollChannel)||
			   //(parent == client.config.rollChannel)||
			   (channel == client.config.respecChannel)||
			   (parent == client.config.respecChannel));

	return author && channel;
}

function verifyMessageContent(client, message)
{
	if (message && message.embeds && message.embeds.length > 0)
	{
		//Grab the necessary data from the embed
		var embed = message.embeds[0];
		var title = embed.title
		if (!title)
			return false
		if (!title.includes(" rolled!"))
			return false;

		var foot = embed.footer.text;
		if (foot == "This is a test roll that will not count")
			return false;

		return true;
	}
	return false;
}

function verifyRoll(client, message, sendResult=true)
{
	var embed = message.embeds[0];
	var title = embed.title
	var foot = embed.footer.text;
		foot = foot.split('X');
	var desc = embed.description;
	var eColor = embed.hexColor || "#000000";
	var dice  = [];
	var d = ''
	var total = 0;
	var t = parseInt(foot[0])
	var color='#'

	//Extract the user ID from the message
	var playerMatch = MessageMentions.USERS_PATTERN;
	var match = [...desc.matchAll(playerMatch)];
	if (match.length > 0)
	{	//Use it to map the UID to the character
		playerMatch = match[0][1];
		console.log("\n\nPLAYER ID: ",playerMatch,"\n\n");
	}
	else
		playerMatch = null;

	//Extract the roll results from the message
	var regex = new RegExp("`([0-9]+)`","gm");
	var matches = [...desc.matchAll(regex)];
	console.log(matches);
	for (var i=0; i < 6; ++i)
	{
		var die = parseInt(matches[i][1]);
		dice.push(die);
		d += ''+die;
		total += die;
		color += (dice[i] * t % 0xF).toString(16);
	}
	var eTotal = parseInt(matches[6][1]);
	d += ''+total;
	
	//Prep to reconstrut the Hash
	var mask = 0xFFFFFFFF;
	var bigMask = BigInt(mask);
	var u = (parseInt(foot[1]) & mask) >>>0;
	var s = (BigInt(message.guild.id) >> BigInt(22)) & bigMask;
		s = Number(BigInt.asUintN(32, s)) >>>0;
		d = (parseInt(d) & mask) >>>0;
	var v = ((parseInt('0x'+foot[2]) & mask) >>>0);
	var eHash= v.toString(16).toUpperCase();			

	var a = s;
	var b = u;
	var c = t;
		d = d;
	var f = 0;
	var hash = [a, b, c, d]
	var out = []
	for (var i=0; i < total; ++i)
	{
		if (i%4==0)
			f = (b & c) | (~b & d)
		else if (i%4==1)
			f = (d & b) | (~d & c)
		else if (i%4==2)
			f = b ^ c ^ d
		else
			f = c ^ (b | ~d)
		f = (f & mask) >>>0;

		var amt = dice[i%6];
		var r1 = (~hash[i%4] & mask) >>>0;
		var r2 = ((f ^ a & r1) & mask) >>>0;
		var r3 = ((r2 << amt) & mask) >>>0;
		var r4 = ((r2 >>> (32 - amt)) & mask);
		var r  = ((r3 | r4) & mask) >>>0;
		a = d;
		d = c; 
		c = b;
		b = ((b ^ r) & mask) >>>0;

		out.push ("`" + r.toString(16).toUpperCase() + "`");
		//+r1.toString(16)+" | "+r2.toString(16)+" | "+r3.toString(16) + " | "+r4.toString(16);	  
	}

	var p = [(a & mask) >>>0,(b & mask) >>>0,(c & mask) >>>0,(d & mask) >>>0];

	debug(total + " | " + eTotal);
	debug(color + " | " + eColor);
	debug("\nu - "+u+"\ns - "+s+"\nt - "+t+"\nd - "+d+"\nv - "+v+" ("+eHash+" | "+foot[2]+")");
	debug(out);
	debug("Before (h): ",hash);
	debug("Before (p): ",p);

	for (var i=0; i < p.length; ++i)
	{
		hash[i] = ((hash[i] ^ p[i]) & 0xFF);
		p[i] = p[i].toString(16).toUpperCase();
	}

	debug("After (h): ",hash);
	debug("Hex:", p);

	var h = (parseInt(hash.join('')) & mask) >>>0;
	hash = h.toString(16).toUpperCase()

	debug("h: `" + h + " (" + hash + ")`")

	color = (color == eColor ? color : 0xFF0000);
	hash  = (hash  == eHash  ? hash  : null);
	if (sendResult)
	{
		dice = "`" + dice.join("` / `") + "`: `" + total + "`";
		sendVerification(message, color, t, u, hash, playerMatch, dice);
	}

	function sendVerification(message, color, t, u, hash, mention, dice)
	{
		var title = "Roll " + (hash ? "Verified" : "Rejected")
		var footer= (hash ? t+'X'+u+'X'+hash : "Verification failed...")
		var embed = new MessageEmbed()
			.setTitle(title)
			.setURL(message.url)
			.setDescription(dice)
			.setColor(color)
			.setFooter(footer);

		if (hash)
			message.react("✅");
		else
			message.react("❌");

		if (mention)
			mention = "<@" + mention + ">";
		else
			mention = "";

		message.channel.send({content:mention, embeds:[embed]})				
			.then(async (newMsg) => {})
			.catch(console.error);

		return;
	}
}

module.exports = {
	name: 'rollVerify',
	shouldHandle: shouldHandle,
	handle: verifyRoll
};