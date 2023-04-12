const { ActionRowBuilder, 
		ButtonBuilder,
		ButtonStyle,
		ComponentType,
	   	InteractionType,
	    MessageMentions,
	   	ModalBuilder, 
		StringSelectMenuBuilder, 
	    TextInputBuilder,
		TextInputStyle } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils = require(`./utilFuncs.js`)
		
const dmRoles = [
					config.DMRole, config.ModeratorRole,
					config._DMRole, config._ModeratorRole
				];
const PROMPT_TIME = 30000;
const REACT_TIME = 30000;
const INTERACT_TIME = 30000;
const MODAL_INPUT_TIME = 30000;

const Time = {
	Long: 60000,
	Std: 30000,
	Short: 10000,
	Debug: 1
}

////// Prompt the user for message input that match a numeric filter
//@channel the prompt should be sent to
//@prompt displayed to the users
//@users array of user IDs that can respond to this prompt
//@defaultOption selected if it times out 
//@time to wait for the user input 
async function promptUserInputOption(channel, prompt, users, defaultOption=null,
									 time = PROMPT_TIME)
{
	var response = defaultOption;
	var responses = ["cancel","c","skip","s"]
	const filter = (m) => 
	{
		const userId = m.author.id
		//Check if the author of the message is a mod or DM
		const member = m.member;
		const modDM = Utils.hasAnyRole(member, dmRoles)
		//Check if the author of the message is one of the users this prompt is listening for
		const user  = users.includes(userId);
		//Check if the message content is a number
		const isNum = m.content.replace(/\D/g,'').length > 0
		//Make sure the message is a number or one of the non-numeric responses
		const valid = isNum || responses.includes(m.content.toLowerCase())	
		return (valid && (modDM || user));
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
		.then(msg => { setTimeout(() => { if (msg && !msg.deleted){ msg.delete() } }, 30000) });
	});

	// console.log("Response: [" + response + "]");
	return response;
}

////// Prompt the user for message input
//@channel			- the prompt should be sent to
//@prompt			- displayed to the users
//@users			- array of user IDs that can respond to this prompt
//@defaultResponse	- selected if it times out 
//@time 			- time (in seconds) to wait for the user input 
async function promptUserInput(channel, prompt=null, users=[], 
							   defaultResponse=null, time=PROMPT_TIME)
{
	var response = defaultResponse;
	const filter = (m) => 
	{
		const userId = m.author.id
		const member = m.member
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
		.then(msg => { setTimeout(() => { if (msg && !msg.deleted){ msg.delete() } }, 30000) });
	});

	return response;
}

////
// Prompt the user to ping another user
//@channel			- the prompt should be sent to
//@prompt			- displayed to the users
//@users			- array of user IDs that can respond to this prompt
//@time 			- time (in seconds) to wait for the user input 
async function promptUserPing(channel, prompt, users=[], time=PROMPT_TIME)
{
	var response = null;
	var responses = ["cancel","c","skip","s"];

	const validUserFilter = (m) => 
	{
		const member = m.member;
		const modDM = Utils.hasAnyRole(member, dmRoles);
		const validUser = !users || users.includes(m.author.id) || modDM;
		return validUser;		
	}

	const validResponseFilter = (m) =>
	{
		const userMentions = m.mentions.users.size > 0;
		const regex = new RegExp(MessageMentions.UsersPattern,"gi")
		const regexMentions = ([...m.content.matchAll(regex)]).length > 0;	
		const alternate = responses.includes(m.content.toLowerCase());
		const validResponse = (userMentions || regexMentions || alternate);
		return validResponse;		
	}
	
	const filter = (m) => 
	{
		const validUser = validUserFilter(m);
		const validResponse = validResponseFilter(m);
		return validUser && validResponse;
	};

	await channel.awaitMessages({ filter, max: 1, time: time, errors: ['time'] })
	.then(collected => 
	{
		collected = collected.first();
		if (!responses.includes(collected.content.toLowerCase()))
		{
			const userMentions = collected.mentions.users;
			if (userMentions.size > 0)
				response = userMentions.first().id;
			else
			{
				const regex = new RegExp(MessageMentions.UsersPattern,"gi")
				const regexMentions = [...collected.content.matchAll(regex)];
				if (regexMentions.length > 0)
					response = regexMentions[0][1];
			}
		}
		else
		{
			response = collected.content.toLowerCase();
		}
		collected.delete();
	})
	.catch(collected => 
	{
		channel.send('Timeout waiting for response.')
		.then(msg => { setTimeout(() => { if (msg && !msg.deleted){ msg.delete() } }, 30000) });
	});

	return response;
}

////
// Prompt the user to react to the prompt message
//@channel			- the prompt should be sent to
//@prompt			- displayed to the users
//@users			- array of user IDs that can respond to this prompt
//@options			- react options to attach to the given message
//@defaultOption	- returned if it times out 
//@failOptions		- early-exit options will return immediately if any are selected
//@returnFirst 		- return after the first reaction if true, if false, wait for all @users to react
//@time 			- time (in seconds) to wait for the user input 
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

////
// Prompt users with a series of button options
//@channel			- the prompt should be sent to
//@prompt			- displayed to the users
//@users			- array of user IDs that can respond to this prompt
//@options			- react options to attach to the given message
//@defaultOption	- returned if it times out 
//@failOptions		- early-exit options will return immediately if any are selected
//@returnFirst 		- return after the first reaction if true, if false, wait for all @users to react
//@time 			- time (in seconds) to wait for the user input 
async function promptUserButton(channel, prompt, users, options, 
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
		const member = i.member;
		const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = users.includes(user.id) && !reactedUsers.includes(user.id);
		return (msg && (modDM || validUser));
	};
	
	var reactedUsers = [];
	var reactCount = {};
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createMessageComponentCollector({ 
			filter, componentType: ComponentType.Button, time: time, errors:['time'] 
		});

		collector.on('collect', async(i) => 
		{
			console.log("Collector")
			const member = i.member;
			const modDM = Utils.hasAnyRole(member, dmRoles) && !i.user.bot;
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



////
// Create a selection row component to attach to a message
//@customId			- name of the select
//@options			- a list of select option objects
//@min				- minimum number of options that can be selected
//@max				- maximum number of options that can be selected
//@placeholder		- string that specifies the text to be displayed prior to selection
function createSelectRow(customId="select", options=[], min=null, max=null, 
					   	 placeholder=null)
{
	placeholder = placeholder || 'Nothing selected'
	const row = new ActionRowBuilder();
	const select = new StringSelectMenuBuilder()
						.setCustomId(customId)
						.setPlaceholder(placeholder)
						.addOptions(options)
	if (min !== null)
		select.setMinValues(min)
	if (max)
		select.setMaxValues(max)			
	row.addComponents(select)
	
	return row;
}

//// Create a select option object
function createSelectOption(label, description, value)
{
	if (description)
		return {label:label, description: description, value: value};
	else
		return {label:label, value: value};
}
	
////
// Create a button row component to attach to a message
//@options	- an array of objects that contains button row data
function createButtonRow(options)
{
	//Add the button interactions for the users
	const row = new ActionRowBuilder()
	for (let option of options)
	{
		if (typeof(option) !== 'object')
			option = {style:'SECONDARY', emoji:option, custom_id:option}
		row.addComponents(new ButtonBuilder(option))
	}	
	return row;	
}

////
// Add multiple component rows to a specified message
//@message	- the message to which the component rows should be added
//@rows		- an array of the component row data
async function addComponentRows(message, rows)
{
	if (message.edit)
		await message.edit({components: rows})
	else if (message.editReply)
		await message.editReply({components: rows})
}

///
///
///
async function collectSelectInteractions(interaction, callbackMap = {}, defaultOption=null, time=PROMPT_TIME)
{
	const prompt = await interaction.fetchReply();
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createMessageComponentCollector({ 
			componentType: ComponentType.SelectMenu, time: time, errors:['time'] 
		});

		collector.on('collect', async(i) => 
		{
			let value = i.values[0]
			if (callbackMap && callbackMap[value])
			{
				try {
					value = await callbackMap[value].func(i, callbackMap[value].args);
				} catch (error) {
					console.error("Callback Error - " + error);
					resolve(null);
				}

				if (!i.deferred && !i.replied )
					i.deferUpdate()
				resolve(value);
			}
			else
			{
				i.deferUpdate()
				resolve(i.values);
			}

			collector.stop();
		});

		collector.on('end', collected => 
		{
			resolve(defaultOption)
		});
	});	
}

///
///
///
async function collectButtonInteractions(interaction, callbackMap={}, defaultOption=null, time=PROMPT_TIME)
{
	const prompt = await interaction.fetchReply();
	return collectButtonPrompt(prompt, callbackMap, defaultOption, time)
}
								
async function collectButtonPrompt(prompt, callbackMap={}, defaultOption=null, time=PROMPT_TIME)
{
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createMessageComponentCollector({ 
			componentType: ComponentType.Button, time: time, errors:['time'] 
		});

		collector.on('collect', async(i) => 
		{
			let value = i.customId

			//let value = i.value
			if (callbackMap[value])
			{
				try {
					value = await callbackMap[value].func(i, callbackMap[value].args);
					if (!i.deferred && !i.replied )
						i.deferUpdate()
				} catch (error) {
					console.error("Callback Error: " + error);
					resolve(null);
				}					
				resolve(value);
			}
			else
			{
				i.deferUpdate()
				resolve(value);
			}

			collector.stop();			
		});

		collector.on('end', collected => 
		{
			resolve(defaultOption)
		});
	});	
}

///
///
///
async function collectAllInteractions(prompt, callbackMap = {}, defaultOption=null, time=PROMPT_TIME)
{
	return new Promise((resolve, reject) => 
	{
		const selectCollector = prompt.createMessageComponentCollector({ 
			componentType: ComponentType.SelectMenu, time: time, errors:['time'] });
		const buttonCollector = prompt.createMessageComponentCollector({ 
			componentType: ComponentType.Button, time: time, errors:['time'] });
		const collectors = [selectCollector, buttonCollector];
		let resolved = false;
		
		const collect = async(i) => 
		{
			let value = i.isButton() ? i.customId : i.values[0]
			console.log(value)

			let callback = callbackMap?.[value] || callbackMap?.['*'] || null;
			if (callback)
			{
				try {
					value = await callback.func(i, callback.args || null);
				} catch (error) {
					console.error("Callback Error: " + error);
					reject(error);
				}

				if (!i.deferred && !i.replied )
					i.deferUpdate()
				if (!resolved)				
					resolve(value);
			}
			else
			{
				i.deferUpdate()
				if (!resolved)
					resolve( i.isButton() ? value : i.values);
			}

			resolved = true;
			collectors.forEach(collector => collector.stop());
		}
		
		collectors.forEach(collector => collector.on('collect', collect));
		collectors.forEach(collector => collector.on('end', collected => 
		{
			if (!resolved)
				resolve(defaultOption)
			resolved = true;
		}));
	});	
}



////
// Prompt users with a series of button options
// @interaction		- the interaction to which the button components are attached
// @users			- array of user IDs that can respond to this prompt
// @defaultOption	- the result returned if the collector times out 
// @callbackMap     - 
// @time 			- time (in seconds) to wait for the user input 

// @options			- react options to attach to the given message
// @failOptions		- early-exit options will return immediately if any are selected
// @returnFirst 		- return after the first reaction if true, if false, wait for all @users to react
////	
async function collectMultiUserButton(prompt, users=[], defaultOption=null, failOptions=[],
									  callbackMap={}, time=PROMPT_TIME)
{
	const returnFirst = false // make this a param?
	
	//Sort the users so we can compare the lists easily later
	users.sort();
	if (!Array.isArray(failOptions)) failOptions = [failOptions];	
	
	var reactedUsers = [];
	var reactCount = {};
	
	const filter = i => 
	{
		const user = i.user;
		const msg = i.message.id == prompt.id;
		const member = i.member;
		const modDM = Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = (users.length == 0 || users.includes(user.id)) && !reactedUsers.includes(user.id);
		return (msg && (modDM || validUser));
	};
	
	return new Promise((resolve, reject) => 
	{
		const collector = prompt.createMessageComponentCollector({ 
			filter, componentType: ComponentType.Button, time: time, errors:['time'] 
		});

		collector.on('collect', async(i) => 
		{
			let value = i.customId

			if (!i.deferred && !i.replied)
				i.deferUpdate();
			
			reactCount[value] = (reactCount[value] || 0) + 1;	
			
			if (callbackMap)
			{
				let callback = callbackMap[value] || callbackMap['*'] || null;
				if (callback)
				{
					try {
						await callback.func(i, reactCount, callback.args || null);
					} catch (error) {
						console.error("Callback Error: " + error);
						reject(error);
					}
				}
			}

			const modDM = Utils.hasAnyRole(i.member, dmRoles) && !i.user.bot;
			if (users.includes(i.user.id) && !reactedUsers.includes(i.user.id))
			{
				reactedUsers.push(i.user.id)
				reactedUsers.sort();
			}
			
 			if (modDM || returnFirst || failOptions.includes(i.customId) || Utils.isEqual(reactedUsers, users))
			{
				resolve(value);
 				collector.stop();
			}
		});

		collector.on('end', collected => 
		{
			resolve(defaultOption)
		});
	});	
}

async function confirmDialog(prompt, users=[])
{
	const options = [
		{style:ButtonStyle.Success, emoji:"👍", label:'Approve', custom_id:"👍"},
		{style:ButtonStyle.Danger, emoji:"👎", label:'Decline', custom_id:"👎"}		
	]
	const buttons = createButtonRow(options);
	await prompt.edit({components:[buttons]});
	
	let callbackFunc = async function(interaction, reactCount, args)
	{
		for (b=0; b<options.length; ++b)
		{
			const option = options[b];
			const count = reactCount[option.custom_id];
			let label = `${option.label || ''}`
			if (count)
				label += ` x ${count}`;
			buttons.components[b].data.label = label;
		}		
		await prompt.edit({components:[buttons]});
	}	
	const callbacks = { "*": {func:callbackFunc, args:null}};
	let confirm = await collectMultiUserButton(prompt, users, "👍", "👎", callbacks)
						.catch(async error => { console.error(error) });

	console.log("Confirm: "+confirm)
	return confirm == "👍"
}



///
///
///
function createTextInputRow(customId="input", label="Input", placeholder="Enter some text...", 
							   style=TextInputStyle.Short, minLength = null, maxLength = null)
{
	let input = new TextInputBuilder()
		.setCustomId(customId)
		.setLabel(label)				// The label is the prompt the user sees for this input
		.setStyle(style)				// TextInputStyle.Short or TextInputStyle.Paragraph
		.setPlaceholder(placeholder)	// set a placeholder string to prompt the user
		.setRequired(true);	 			// require a value in this input field	

	if (maxLength)	// set the maximum number of characters to allow
		input.setMaxLength(maxLength)
	if (minLength)	// set the minimum number of characters required for submission
		input.setMinLength(minLength)

	// // set a default value to pre-fill the input
	// .setValue('Default')

	input = new ActionRowBuilder().addComponents(input)
	return input
}
			 
async function promptModal(interaction, title="Modal", customId="modal", inputs = null, time=MODAL_INPUT_TIME)
{
	// Add text input components to modal
	// Note that unlike how you might expect when sending a Message with Components,
	// MessageActionRows for Modals **can only accept TextInputComponents** (no Buttons or
	// SelectMenus or other Components), and each Action Row can have a maximum of just one
	// TextInputComponent. You can have a maximum of 5 Action Rows in a Modal, so you have
	// a maximum of 5 Text Inputs per Modal.
	// An action row only holds one text input so you need one action row per text input.
	inputs = inputs || [createTextInputRow()];

	// Create the modal
	const modal = new ModalBuilder()
		.setCustomId(customId)
		.setTitle(title)
		.addComponents([...inputs]);		// Add inputs to the modal

	// Show the Modal to the User in response to the Interaction
	await interaction.showModal(modal)

	// Get the Modal Submit Interaction that is emitted once the User submits the Modal
	const submitted = await interaction.awaitModalSubmit(
	{
		// Timeout after a minute of not receiving any valid Modals
		time: time,
		// Make sure we only accept Modals from the User who sent the original Interaction we're responding to
		filter: i => i.user.id === interaction.user.id,
	})
	.catch(error => 
	{
		// Catch Errors that are thrown (e.g. if the awaitModalSubmit times out after 60000 ms)
		console.error(".catch: " + error)
	})
	return submitted;
	
	// If we got our Modal, we can do whatever we want with it down here. Remember that the Modal
	// can have multiple Action Rows, but each Action Row can have only one TextInputComponent. You
	// can use the  helper property to get the value of an input field
	// from it's Custom ID. See https://discord.js.org/#/docs/discord.js/stable/class/ModalSubmitFieldsResolver for more info.
}









module.exports = 
{	
 	promptUserPing,				//<-- funcsScene: Used to ping player of unknown tupper messages
 	promptUserInput,			//<-- funcsDuels: Used to prompt for reason for denying exp. TODO: Swap with Modal for general comments
 	promptUserReaction,			//<-- funcsDuels: (Deprecated) Use reacts for prompting winner/confirmation. Replaced with Buttons
 	promptUserInputOption,		//<-- funcsDuels: Prompt them for which person won. TODO: Swap with Select with options
 	promptUserButton,			//<-- funcsDuels: Use buttons for prompting winner/confirmation. Replaces reacts
 	promptModal,				//<-- cmdGuild: Prompt for character name
 	collectSelectInteractions,	//<-- cmdGuild: Prompt for character from list in main interaction reply
 	collectButtonInteractions,	//<-- cmdGuild
	collectAllInteractions,		//<-- funcsScene
	collectMultiUserButton,
	confirmDialog,				
 	createButtonRow,			//
 	createSelectRow,			//
 	createSelectOption,			//
 	createTextInputRow,			//	

	Time
}
