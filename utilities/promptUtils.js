const { MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`${process.cwd()}/config/${mod}_config.json`);
const Utils = require(`${process.cwd()}/utilities/utilFuncs.js`)
		
const dmRoles = [config.DMRole, config.ModeratorRole];				
const PROMPT_TIME = 30000;
const REACT_TIME = 30000;
const INTERACT_TIME = 30000;

//@channel the prompt should be sent to
//@prompt displayed to the users
//@users array of user IDs that can respond to this prompt
//@defaultOption selected if it times out 
//@time to wait for the user input 
async function promptUserInputOption(channel, prompt, users, defaultOption=null,
									 time = PROMPT_TIME)
{
	var response = defaultOption;
	var responses = ["cancel","c"]
	const filter = (m) => 
	{
		const userId = m.author.id
		const member = m.guild.members.resolve(userId);
		const modDM = Utils.hasAnyRole(member, dmRoles)
		const user  = users.includes(userId);
		const isNum = m.content.replace(/\D/g,'').length > 0
		const valid = isNum || responses.includes(m.content.toLowerCase())	
		return (valid && (modDM || user));
	};

//	prompt = await channel.send({embeds:[prompt]});
	await channel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] })
	.then(collected => 
	{
		collected = collected.first();
		response = collected.content;
		collected.delete();
	})
	.catch(collected => 
	{
		channel.send('Timeout waiting for response.')
		.then(msg => { setTimeout(() => msg.delete(), 30000) });
	});

	// console.log("Response: [" + response + "]");
	return response;
}


async function promptUserInput(channel, prompt, users, 
							   defaultResponse=null, time=PROMPT_TIME)
{
	var response = defaultResponse;
	const filter = (m) => 
	{
		const userId = m.author.id
		const member = m.guild.members.resolve(userId);
		const modDM = Utils.hasAnyRole(member, dmRoles)
		const user  = users.includes(userId);
		return (modDM || user);
	};

	await channel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] })
	.then(collected => 
	{
		collected = collected.first();
		response = collected.content;
		collected.delete();
	})
	.catch(collected => 
	{
		channel.send('Timeout waiting for response.')
		.then(msg => { setTimeout(() => msg.delete(), 30000) });
	});

	return response;
}


async function promptUserReaction(channel, prompt, users, options, 
								  defaultOption=null, failOptions=null,
								  returnFirst=false, time=REACT_TIME)
{
	//Sort the users so we can compare the lists easily later
	users.sort();

	//Set up a default option if one isn't specified
	if (!defaultOption) defaultOption = options[0];

	// //Send the prompt, and then apply all the reaction options 
	// prompt = await channel.send({embeds:[prompt]});
	//Add the initial reactions for the users
	var reactPromises = [];
	for (const option of options)
		reactPromises.push(prompt.react(option));
	await Promise.all(reactPromises);
	
	const filter = (reaction, user) => 
	{
		const msg = reaction.message.id == prompt.id;
		const valid = options.includes(reaction.emoji.name);
		const member = channel.guild.members.resolve(user.id);
		const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = users.includes(user.id);
		return (msg && valid && (modDM || validUser));
	};

	var reactedUsers = [];
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createReactionCollector({
			filter, time: time, errors: ['time']
		});
		collector.on('collect', (reaction, user) => 
		{
			const member = channel.guild.members.resolve(user.id);
			const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;

 			if (modDM || returnFirst || failOptions.includes(reaction.emoji.name))
			{
				const idx = options.indexOf(reaction.emoji.name);
 				resolve({react:reaction.emoji.name, idx: idx, user:user});
 				collector.stop();
			}
			else if (!reactedUsers.includes(user.id))
			{
				reactedUsers.push(user.id);
				reactedUsers.sort();
				if (Utils.isEqual(reactedUsers, users))
					collector.stop();
			}
		});

		collector.once('end', (reactions, reason) => 
		{	
			const idx = options.indexOf(defaultOption);
			resolve({react:defaultOption, idx:idx});
		});
	});	
}

function createSelectRow(customId="select", options=[], min=null, max=null, 
					   	 placeholder=null)
{
	placeholder = placeholder || 'Nothing selected'
	const row = new MessageActionRow();
	const select = new MessageSelectMenu()
						.setCustomId(customId)
						.setPlaceholder(placeholder)
						.addOptions(options)
	if (min)
		select.setMinValues(min)
	if (max)
		select.setMaxValues(max)			
	row.addComponents(select)
	
	console.log(row);
	return row;
}

function createButtonRow(options)
{
	//Add the button interactions for the users
	const row = new MessageActionRow()
	for (let option of options)
	{
		if (typeof(option) !== 'object')
			option = {style:'SECONDARY', emoji:option, custom_id:option}
		row.addComponents(new MessageButton(option))
	}	
	return row;	
}

async function addMessageSelect(message, customId=select, options=[], 
								min=null, max=null, placeholder=null)
{
	const row = await createSelectRow(customId, options, min, max, placeholder)
	await message.edit({components: [row]});
}

async function addMessageButtons(message, options)
{
	const row = await createButtonRow(options);
	await addComponentRows(message, [row])
}

async function addComponentRows(message, rows)
{
	await message.edit({components: rows})
}

async function promptUserSelectInteraction()
{	
}

async function promptUserButtonInteraction(channel, prompt, users, options, 
										defaultOption=null, failOptions=null,
				    					returnFirst=false, time=INTERACT_TIME)
{
	//Sort the users so we can compare the lists easily later
	users.sort();
	if (!defaultOption) defaultOption = options[0];
	if (typeof defaultOption === 'object')
		defaultOption = defaultOption.custom_id

	const row = await createButtonRow(options)
	await addComponentRows(prompt, [row]);
	
	const filter = i => 
	{
		i.deferUpdate();
		const user = i.user;
		const msg = i.message.id == prompt.id;		
		const member = channel.guild.members.resolve(i.user.id);
		const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = users.includes(user.id) && !reactedUsers.includes(user.id);
		return (msg && (modDM || validUser));
	};
	
	var reactedUsers = [];
	var reactCount = {};
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createMessageComponentCollector({ 
			filter, componentType: 'BUTTON', time: time, errors:['time'] 
		});

		collector.on('collect', async(i) => 
		{
			console.log("Collector")
			const member = channel.guild.members.resolve(i.user.id);
			const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;
 			if (modDM || returnFirst || failOptions.includes(i.customId))
			{
				const idx = options.map(opt => opt.custom_id).indexOf(i.customId);
 				resolve({react:i.customId, idx: idx, user:i.user});
 				collector.stop();
			}
			else if (!reactedUsers.includes(i.user.id))
			{
				reactedUsers.push(i.user.id);
				reactedUsers.sort();
				const idx = options.map(opt => opt.custom_id).indexOf(i.customId);
				reactCount[idx] = (reactCount[idx] || 0) + 1;
				if (Utils.isEqual(reactedUsers, users))
					collector.stop();
				else
				{
					const label = `${options[idx].label || ''} x ${reactCount[idx]}`
					row.components[idx].label = label;
					await prompt.edit({components: [row]})
				}
			}			
		});

		collector.on('end', collected => 
		{
			// console.log(`Collected ${collected.size} interactions.`);
			// console.log(collected)
			const idx = options.map(opt => opt.custom_id).indexOf(defaultOption);
			resolve({react:defaultOption, idx:idx});
		});
	});
}

module.exports = 
{	
	promptUserInput,
	promptUserReaction,	
	promptUserInputOption,		
	promptUserButtonInteraction,
	promptUserSelectInteraction,
	addMessageButtons,
	addMessageSelect,
	addComponentRows,
	createButtonRow,
	createSelectRow,
}
