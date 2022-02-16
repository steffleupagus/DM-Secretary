const { Client, Collection, Intents } = require('discord.js');
const fs = require('fs');
const path = require('path')
const { glob } = require("glob");
const { promisify } = require("util");
const globPromise = promisify(glob);


const { ApplicationCommandType } = require('discord.js')


const utils = require(`${process.cwd()}/utilities/utilFuncs.js`)

class Bot 
{
	constructor() 
	{
		let intents = [	
			Intents.FLAGS.GUILDS, 
			Intents.FLAGS.GUILD_MESSAGES,
			Intents.FLAGS.GUILD_MESSAGE_REACTIONS
		]
		this.client = new Client({intents: intents});

		console.log();

		this.loadBot();
	}

	async loadBot()
	{
		this.loadConfig();
		await this.loadEvents();
		await this.loadMessageHandlers();
		this.runBot();
	}

	/// Load configuration file
	loadConfig()
	{
		const mod = process.env.mod || "";
		this.client.config = require(`${process.cwd()}/config/${mod}_config.json`);
		this.client.config.token = process.env.token;
		
		console.log(`CONFIG LOADED: ${this.client.config.CONFIG}`)
	}

	/// Load individual event files and register the event for dynamic execution
	async loadEvents()
	{
		console.log("Loading events...");
		
		this.client.on("ready", () => this.loadCommands() );

		// const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));	
		const eventFiles = await globPromise(`${process.cwd()}/handlers/events/*.js`);    
		eventFiles.map((file) => 
		{
			//const event = require(`./events/${file}`);
			const event = require(file);
			console.log(" - Event: ", event.name);
			if (event.once) 
				this.client.once(event.name, (...args) => event.execute(this.client, ...args));
			else
				this.client.on(event.name, (...args) => event.execute(this.client, ...args));
		});
	}

	async loadMessageHandlers()
	{
		console.log("Loading message handlers...");
		const messageHandlers = fs.readdirSync(`${process.cwd()}/handlers/message`)
								  .filter(file => file.endsWith('.js'));

		this.client.messageHandlers = [];
		for (const file of messageHandlers) 
		{
			const handler = require(`${process.cwd()}/handlers/message/${file}`);
			console.log(" - Handler: ", handler.name);
			this.client.messageHandlers.push(handler);
		}		
	}

	loadReactHandlers()
	{
		console.log("Loading reaction handlers...");
		const messageHandlers = fs.readdirSync(`${process.cwd()}/handlers/reations`)
								  .filter(file => file.endsWith('.js'));

		this.client.reactHandlers = [];
		for (const file of messageHandlers) 
		{
			const handler = require(`${process.cwd()}/handlers/reations/${file}`);
			console.log(" - Handler: ", handler.name);
			this.client.reactHandlers.push(handler);
		}		
	}

	/// Load the individual command files and register them for dynamic execution
	async loadCommands()
	{
		console.log("Loading commands...");

		this.client.commands = new Collection();
		const commandFiles = fs.readdirSync(`${process.cwd()}/handlers/commands`).filter(file => file.endsWith('.js'));
		if (!commandFiles.length)
			console.log(" - No commands found");
		for (const file of commandFiles) 
		{
			const command = require(`${process.cwd()}/handlers/commands/${file}`);
			console.log(" - Command: ", command.data.name);

			// Set a new item in the Collection; key = command name, value = exported module
			this.client.commands.set(command.data.name, command);
		}

		await this.applyPermissions();
	}

	async applyPermissions()
	{
		if (!this.client.application?.owner) await this.client.application?.fetch()
		const guild = await this.client.guilds.cache.get(this.client.config.GUILDID)
		const commands = await guild?.commands.fetch();

		commands.each(async (v,k,all)=>
		{
//			console.log(k, v.name)
			const name = v.name
			const command = this.client.commands.get(name);
			const whitelistRoles = command.whitelistRoles;
			if (whitelistRoles)
			{
				let permissions = []
				for (const role of whitelistRoles)
				{
					permissions.push({id:role, type:'ROLE', permission: true})
				}
				await v.permissions.add({permissions});
			}
		})
	}





	/// Handle login and disconnect
	runBot()
	{
		//Login
		this.client.login(this.client.config.token).catch(console.error);

		//handle trying to re-login on disco
		this.client.on("disconnect", () => setTimeout(() => 
		{
			console.log("Bot disconnected :(");
			this.client.destroy().then(() => 
			{
				this.runBot();
			});
		}, 10000));
	}
}

const bot = new Bot();
require("./dashboard")(bot.client)

module.exports = bot.client;