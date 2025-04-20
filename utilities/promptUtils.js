const { ActionRowBuilder,
		ButtonBuilder,
		ButtonStyle,
		ComponentType,
		InteractionType,
		MessageMentions,
		ModalBuilder,
		StringSelectMenuBuilder,
		StringSelectMenuOptionBuilder,
		TextInputBuilder,
		TextInputStyle } = require('discord.js')

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
const Utils = require(`./utilFuncs.js`)

const dmRoles = [ config.role.DM, config.role.Moderator ];
const PROMPT_TIME = 30000;
const REACT_TIME = 30000;
const INTERACT_TIME = 30000;
const MODAL_INPUT_TIME = 30000;

const Time = {
	Extended: 15*59*1000,	//14.75 minutes
	Long: 5*60*1000,		//5 minutes
	Std: 30000,				//30s
	Short: 10000,			//10s
	Debug: 1				//1ms
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
	// const select = new StringSelectMenuOptionBuilder()
	// select.setLabel(label).setValue(value)//.disabled()
	// if (description) select.setDescription(description)
	// return select
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
async function collectAllInteractions(prompt, callbackMap = {}, defaultOption=null, time=PROMPT_TIME, max=null)
{
	return new Promise((resolve, reject) =>
	{
		const selectCollector = prompt.createMessageComponentCollector({
			componentType: ComponentType.StringSelect, time: time, errors:['time'] });
		const buttonCollector = prompt.createMessageComponentCollector({
			componentType: ComponentType.Button, time: time, errors:['time'] });
		const collectors = [selectCollector, buttonCollector];
		let resolved = false;
		const stopCollecting = () =>
		{
			resolved = true;
			collectors.forEach(collector => collector.stop());
		}
		const collect = async(i) =>
		{
			let value = i.isButton() ? i.customId : i.values[0]
			console.log("Collected:", value)

			let callback = callbackMap?.[value] || callbackMap?.['*'] || null;
			if (callback)
			{
				try {
					value = await callback.func(i, callback.args || null, value);
				} catch (error) {
					console.error("Callback Error: " + error);
					stopCollecting();
					reject(error);
				}

				if (!i.deferred && !i.replied )
					i.deferUpdate()
				if (!resolved)
				{
					stopCollecting();
					resolve(value);
				}
			}
			else
			{
				i.deferUpdate()
				if (!resolved)
				{
					stopCollecting();
					resolve( i.isButton() ? value : i.values);
				}
			}
		}

		collectors.forEach(collector => collector.on('collect', collect));
		collectors.forEach(collector => collector.on('end', async(collected) =>
		{
			console.log("Reason: ", collector.endReason)
			if (!resolved)
			{
				resolved = true;
				let value = defaultOption
				if (collector.endReason == 'time')
				{
					let callback = callbackMap.timeout || null;
					if (callback)
					{
						try {
							value = await callback.func(collected, callback.args || null, defaultOption)
						} catch (error) {
							console.error("Callback Error: " + error);
							reject(error)
						}
					}
				}
				resolve(value)
			}
		}));
	});
}

///
///
///
const defaultArgs = {callbackMap:{}, default:null, time:PROMPT_TIME, users:[], returnFirst:false, failOptions:[], debug:false}
async function collectComponents(prompt, args = defaultArgs) {
	args = {...defaultArgs, ...args}
	const callbackMap = args.callbackMap ?? {}
	const defaultOption = args.default ?? null
	const time = args.time ?? PROMPT_TIME
	const users = args.users ?? []
	const returnFirst = args.returnFirst ?? false
	const failOptions = args.failOptions ?? []
	const debug = args.debug ?? false

	users.sort();	//Sort users so we can compare the lists easily later
	const reactedUsers  = [];
	const reactCount  = {};
	const results = {values:null, responses:null};

	const filter = i => {
		const msg = i.message.id == prompt.id;
		const user = i.user;
		const member = i.member;
		const modDM = member && Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = (users.length == 0 || users.includes(user.id)) && !reactedUsers.includes(user.id);
		return (msg && (modDM || validUser));
	};

	//Set up a new Promise
	const promise = new Promise((resolve, reject) =>
	{
		//Setup general collector for all components (button and select)
		const collector = prompt.createMessageComponentCollector({filter, time, errors:['time']})
		//Start collecting on all collectors
		collector.on('collect', async(i) => {
			const user = i.user.id
			let values = i.isButton() ? [i.customId] : i.values
			let fail   = false;
			//Map all values through their callbacks where applicable
			values = await Utils.asyncArrayMap(values, async (value) => {
				fail = fail || failOptions.includes(value);
				reactCount[value] = (reactCount[value] || 0) + 1;
				if (debug) console.log(`Collected: ${value} (${reactCount[value]} total)`)
				let callback = callbackMap?.[i.customId] || callbackMap?.[value] || callbackMap?.['*'] || null;
				if (callback) {
					try {
						value = await callback.func(i, callback.args || null, value, reactCount);
					} catch (error) {
						console.error("Callback Error: ", error)
						collector.stop();
						reject(error);
					}
				}
				return value;
			});

			//results.responses.push({user, values});
			//results.values.push(...values);
			results.responses = [...(results.responses || []), {user, values}]
			results.values = [...(results.values || []), ...values]
			if (fail) results.responses = [{user,values}]
			if (fail) results.values = values.filter(v => failOptions.includes(v));
			if (fail) results.fail = true

			if (users.includes(i.user.id) && !reactedUsers.includes(i.user.id))
			{
				reactedUsers.push(i.user.id)
				reactedUsers.sort();
			}

			if (!i.deferred && !i.replied) i.deferUpdate()
			const modDM = Utils.hasAnyRole(i.member, dmRoles) && !i.user.bot;
			if (modDM || returnFirst || fail || Utils.isEqual(reactedUsers, users))
			{
	 			collector.stop();
			}
		});
		//Setup end / timeout method for all collectors
		collector.on('end', async(collected) => {
			results.end = results.end ?? collector.endReason
			if (debug) console.log("Reason: ", collector.endReason)
			collected = collected.map(c => c.isButton() ? [c.customId] : c.values)
			collected = collected.reduce((f,c) => { f.push(...c); return f }, [])
			collected = [...new Set(collected)];

			let value = defaultOption
			if (collector.endReason == 'time') {
				let callback = callbackMap.timeout || null;
				if (callback) {
					try {
						value = await callback.func(collected, callback.args || null, defaultOption)
					} catch (error) {
						console.error("Callback Error: " + error);
						reject(error)
					}
				}
			}
			//Send whatever was collected up untill now
			results.values = results.values || defaultOption;
			//console.log("\n\n\nFinal Results: \n", results,"\n\n\n")
			resolve(results)
		});
	});

	return promise;
}

/// collectComponents Backup
/*
async function collectComponents(prompt, args = {callbackMap:{}, default:null, time:PROMPT_TIME, users:[]})
{
	const callbackMap = args.callbackMap ?? {}
	const defaultOption = args.default ?? null
	const time = args.time ?? PROMPT_TIME
	const users = args.users ?? []
	const returnFirst = args.returnFirst ?? false
	const failOptions = args.failOptions ?? []

	users.sort();	//Sort users so we can compare the lists easily later
	const reactedUsers = [];
	const reactCount = {};

	const filter = i => {
		const msg = i.message.id == prompt.id;
		const user = i.user;
		const member = i.member;
		const modDM = member && Utils.hasAnyRole(member, dmRoles) && !user.bot;
		const validUser = (users.length == 0 || users.includes(user.id)) && !reactedUsers.includes(user.id);
		return (msg && (modDM || validUser));
	};

	const promise = new Promise((resolve, reject) =>
	{
		let resolved = false;
		const stopCollecting = () => {
			resolved = true;
			collectors.forEach(collector => collector.stop());
		}
		const selectCollector = prompt.createMessageComponentCollector({
			filter, componentType: ComponentType.StringSelect, time: time, errors:['time'] });
		const buttonCollector = prompt.createMessageComponentCollector({
			filter, componentType: ComponentType.Button, time: time, errors:['time'] });
		const collectors = [selectCollector, buttonCollector];
		collectors.forEach(collector => collector.on('collect', async(i) => {
			const user = i.user.id
			const value = i.isButton() ? i.customId : i.values[0]

			reactCount[value] = (reactCount[value] || 0) + 1;
			console.log(`Collected: ${value} (${reactCount[value]} total)`)

			let callback = callbackMap?.[value] || callbackMap?.['*'] || null;
			if (callback) {
				try {
					value = await callback.func(i, callback.args || null, value, reactCount);
				} catch (error) {
					console.error("Callback Error: " + error);
					stopCollecting();
					reject(error);
				}

				if (!i.deferred && !i.replied )
					i.deferUpdate()
				if (!resolved)
				{
					console.log("prompt.Utils:626")
					stopCollecting();
					resolve({value,users:[user]});
				}
			}
			else {
				i.deferUpdate()
				if (!resolved)
				{
					console.log("prompt.Utils:635")
					stopCollecting();
					value = i.isButton() ? value : i.values
					resolve({value,users:[user]});
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
				console.log("prompt.Utils:651")
				resolve({value,users:reactedUsers});
				stopCollecting();
			}
		}));
		collectors.forEach(collector => collector.on('end', async(collected) => {
			console.log("Reason: ", collector.endReason)
			if (!resolved) {
				resolved = true;
				let value = defaultOption
				if (collector.endReason == 'time') {
					let callback = callbackMap.timeout || null;
					if (callback) {
						try {
							value = await callback.func(collected, callback.args || null, defaultOption)
						} catch (error) {
							console.error("Callback Error: " + error);
							reject(error)
						}
					}
				}
				console.log("prompt.Utils:673")
				resolve({value,user:null})
			}
		}));
	});

	return promise;
}
*/

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

async function confirmDialog(interaction, prompt, users=[], inline=false) {
	//If this interaction is ephemeral, we don't need to wait for other users since they can't see it
	if (interaction.ephemeral) users = [];

	const {tu:yes, td:no} = config.emoji;
	options = [
		{style:ButtonStyle.Success, emoji:yes, label:'Approve', custom_id:yes},
		{style:ButtonStyle.Danger, emoji:no, label:'Cancel', custom_id:no}
	]
	const buttons = createButtonRow(options);
	prompt.components = [buttons]
	prompt.ephemeral = interaction.ephemeral
	if (inline) prompt = await interaction.editReply(prompt);
	else		prompt = await interaction.followUp(prompt);
	let callbackFunc = async function(buttonInteraction, reactCount, args) {
		for (b=0; b<options.length; ++b)
		{
			const option = options[b];
			const count = reactCount[option.custom_id];
			let label = `${option.label || ''}`
			if (count)
				label += ` x ${count}`;
			buttons.components[b].data.label = label;
		}
		if (inline) interaction.editReply({components:[buttons]})
		else await prompt.edit({components:[buttons]});
	}
	const callbacks = interaction.ephemeral ? null : { "*": {func:callbackFunc, args:null}};
	let confirm = await collectMultiUserButton(prompt, users, yes, no, callbacks)
						.catch(async error => { console.error(error); throw error });
	if (!interaction.ephemeral && !inline) 	await prompt.delete();
	else if (inline) 						await interaction.editReply({components:null})
	console.log("Confirm: "+confirm)
	return confirm == options[0].custom_id
}

/*
async function confirmDialog_Backup(interaction, prompt, users=[]){
	//If this interaction is ephemeral, we don't need to wait for other users since they can't see it
	if (interaction.ephemeral) users = [];

	const options = [
		{style:ButtonStyle.Success, emoji:"👍", label:'Approve', custom_id:"👍"},
		{style:ButtonStyle.Danger, emoji:"👎", label:'Decline', custom_id:"👎"}
	]
	const buttons = createButtonRow(options);
	prompt.components = [buttons]
	prompt = await interaction.followUp(prompt);

	let callbackFunc = async function(buttonInteraction, reactCount, args)
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
		//await buttonInteraction.update({components:[buttons]});
		await prompt.edit({components:[buttons]});
	}
	const callbacks = interaction.ephemeral ? null : { "*": {func:callbackFunc, args:null}};
	let confirm = await collectMultiUserButton(prompt, users, "👍", "👎", callbacks)
						.catch(async error => { console.error(error) });

	if (!interaction.ephemeral) prompt.delete();
	console.log("Confirm: "+confirm)
	return confirm == "👍"
}
*/

const textInputDefaults = { customId:"input", label:"Input", style:TextInputStyle.Short, required:false,
							placeholder:null, min: null, max: null, value: null }
function createTextInput(args = textInputDefaults)
{
	args = {...textInputDefaults, ...args}
	let input = new TextInputBuilder()
					.setCustomId(args.customId)
					.setLabel(args.label)
					.setStyle(args.style)
	if (args.placeholder) input.setPlaceholder(args.placeholder)
	input.setMinLength(args.min ? args.min : 0)
	input.setMaxLength(args.max ? args.max : 4000)
	if (args.value) input.setValue(args.value)
	input.setRequired(args.required ? true : false)

	return new ActionRowBuilder().addComponents(input)
}

///
///
///
function createTextInputRow(customId="input", label="Input", placeholder="Enter some text...",
							   style=TextInputStyle.Short, minLength = null, maxLength = null, value = null)
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
	if (value) input.setValue(value)

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
 	promptUserButton,			//<-- funcsDuels: Use buttons for prompting winner/confirmation. Replaces reacts
 	promptModal,				//<-- cmdGuild: Prompt for character name
 	collectSelectInteractions,	//<-- cmdGuild: Prompt for character from list in main interaction reply
 	collectButtonInteractions,	//<-- cmdGuild
	collectAllInteractions,		//<-- funcsScene
	collectComponents,
	collectMultiUserButton,
	confirmDialog,
 	createButtonRow,			//
 	createSelectRow,			//
 	createSelectOption,			//
 	createTextInputRow,			// DEPRECATED - REPLACE THIS WITH createTextInput
	createTextInput,
	Time
}
