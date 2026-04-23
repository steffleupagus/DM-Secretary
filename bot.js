const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path')
const { glob } = require("glob");
const mongoose = require('mongoose')

class Bot
{
        constructor()
        {
                const intents =
                [
                        GatewayIntentBits.Guilds,
                        GatewayIntentBits.GuildMessages,
                        GatewayIntentBits.GuildMessageReactions,
                        GatewayIntentBits.MessageContent,
                        GatewayIntentBits.GuildMembers,
                ]
                const partials =
                [
                        Partials.Channel,
                        Partials.Message,
                        Partials.User,
                        Partials.GuildMember
                ]
                this.client = new Client({partials, intents});
                this.loadBot();
        }

        async loadBot()
        {
                this.loadConfig();
                await this.loadEvents();
                await this.loadMessageHandlers();
                this.client.on("clientReady", async () =>
                {
                        await this.loadCommands();
                        await this.loadDatabase();
                        await this.loadTimers();
                });
                this.runBot();

                process.on('uncaughtException', function(error)
                {
                        console.error("Unhandled Bullshit: ", error)
                        //console.error(error.stack);
                });
        }

        /// Load configuration file
        loadConfig()
        {
                const mod = process.env.mod || "";
                this.client.config = require(`./config/${mod}_config.json`);
                this.client.config.token = process.env.token;

                console.log(`CONFIG LOADED: ${this.client.config.CONFIG}`)
        }

        async loadDatabase()
        {
                mongoose.connection.on('error', console.error)
                mongoose.connection.on('connected', console.log)
                mongoose.connection.on('disconnected', console.log)

                await mongoose.connect(process.env.mongodb_url, { })
                .then(console.log('Mongodb ✅'))
                .catch(console.error)
        }

        /// Load individual event files and register the event for dynamic execution
        async loadEvents()
        {
                console.log("Loading events...");
                this.client.eventHandlers = new Collection();

                // const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));  
                const eventFiles = await glob(`./handlers/events/*.js`, { absolute: true });
                eventFiles.map((file) => 
                {
                        //const event = require(`./events/${file}`);
                        const event = require(file);
                        if (!event.hasOwnProperty("build") || event.build)
                        {
                                console.log(" - Event: ", event.name);
                                if (event.once) 
                                        this.client.once(event.name, (...args) => event.execute(this.client, ...args));
                                else
                                        this.client.on(event.name, (...args) => event.execute(this.client, ...args));

                                // Set a new item in the Collection; key = command name, value = exported module
                                this.client.eventHandlers.set(event.name, event);
                                if (event.raw)
                                        this.client.eventHandlers.set(event.raw, event);
                        }
                });
        }

        async loadMessageHandlers()
        {
                console.log("Loading message handlers...");
                const messageHandlers = fs.readdirSync(`./handlers/message`)
                                                                  .filter(file => file.endsWith('.js'));

                this.client.messageHandlers = [];
                for (const file of messageHandlers)
                {
                        const handler = require(`./handlers/message/${file}`);
                        console.log(" - Handler: ", handler.name);
                        if (!handler.hasOwnProperty("build") || handler.build)
                        {
                                this.client.messageHandlers.push(handler);
                        }
                }
        }

        loadReactHandlers()
        {
                console.log("Loading reaction handlers...");
                const messageHandlers = fs.readdirSync(`./handlers/reations`)
                                                                  .filter(file => file.endsWith('.js'));

                this.client.reactHandlers = [];
                for (const file of messageHandlers)
                {
                        const handler = require(`./handlers/reations/${file}`);
                        console.log(" - Handler: ", handler.name);
                        if (!handler.hasOwnProperty("build") || handler.build)
                        {
                                this.client.reactHandlers.push(handler);
                        }
                }
        }

        loadTimers()
        {
                console.log("Loading timers...");
                const timers = fs.readdirSync(`./handlers/timers`)
                                                 .filter(file => file.endsWith('.js'));

                this.client.timers = new Collection();
                for (const file of timers) 
                {
                        const timer = require(`./handlers/timers/${file}`);
                        console.log(" - Timer: ", timer.name, (timer.build ?? true) ? "(Enabled)" : "(Disabled)" );
                        if (!timer.hasOwnProperty("build") || timer.build)
                        {
                                this.client.timers.set(timer.name, timer)       //.push(timer);
                                timer.startTimer(this.client);
                        }
                }
        }

        /// Load the individual command files and register them for dynamic execution
        async loadCommands()
        {
                console.log("Loading commands...");

                this.client.commands = new Collection();
                const commandFiles = fs.readdirSync(`./handlers/commands`).filter(file => file.endsWith('.js'));
                if (!commandFiles.length)
                        console.log(" - No commands found");
                for (const file of commandFiles) 
                {
                        let command = null;
                        try { command = require(`./handlers/commands/${file}`); }
                        catch(e) { console.log(e.stack) }
                        const enabled = !command?.hasOwnProperty("build") || command?.build;
                        // console.log(` - Command: ${command.data.name}${enabled ? "" : " [Disabled]"}`);
                        if (command && enabled)
                        {
                                console.log(` - Command: ${command.data.name}${enabled ? "" : " [Disabled]"}`);
                                // Set a new item in the Collection; key = command name, value = exported module
                                this.client.commands.set(command.data.name, command);

                                // Allow commands to have aliases for non-slash execution
                                command?.aliases?.forEach(alias => {
                                        this.client.commands.set(alias, command);
                                });
                        }
                }
        }

        /// Handle login and disconnect
        runBot()
        {
                //Login
                console.log("Logging in...")
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
//require("./dashboard")(bot.client)

module.exports = bot.client;