const { ChannelType, EmbedBuilder, InteractionType } = require('discord.js')
const util = require("util");
const cli = require("cli-color");
const purple = cli.xterm(93);
const orange = cli.xterm(208);
const fs = require('fs');

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);

const isString = (value) => typeof value === 'string';
const errorLogDefaultArgs = {
	interaction:null,
	channel:null,
	error:null,
	embed:null,
	dataFields:null,
	callstack: true
}

class Logger
{
	constructor() {
		this.errorLogDefaultArgs = errorLogDefaultArgs
	}

	TODO(text, offset=2){
		console.log(orange(text), text?"-":"",
					purple(Error().stack.split("\n")[offset].trim()))
		//console.log(orange(text));
	}

	NOTE(text="", offset=2){ console.log(text,text?"-":"",purple(Error().stack.split("\n")[offset].trim())) }

	STEP(STEPKEY,stage) { console.log(cli.green(STEPKEY), " - ", cli.green(stage)) }

	VAR(data) { return util.inspect(data, false, null, true /* enable colors */) }

	ERROR(error) { console.log(cli.red(error)) }

	WARNING(warn) { console.log(orange(warn)) }

	DEBUG(data) {
		(Array.isArray(data) ? data : [data]).forEach(x =>
			console.log("\n",(isString(x) ? x : this.VAR(x)),"\n"))
	}

	DEBUGFIELDS(data, dataFn = null) {
		let fields = []
		if (!data) return fields;
		fields = Object.keys(data).map(k => {
			let result = null;
			//If we have methods to process the data, run only those keys through their respective methods and return
			if (dataFn?.[k]) result = dataFn[k](data[k])
			//If we don't have any methods to process any data, just give it all back as raw JSON
			else if (!dataFn) result = {name:k, value:`\`\`\`json\n${JSON.stringify(data[k],null,2)}\n\`\`\``}
			return result
		}).filter(field => field).flat(Infinity)

		return fields
	}

	DEBUGTHROW(data, dataFn = null) {
		this.DEBUG(data);
		throw Error("Debug", {cause: this.DEBUGFIELDS(data, dataFn)});
	}

	async EMBED(args = errorLogDefaultArgs) {
		//Apply default args and override with passed in
		args = {...errorLogDefaultArgs, ...args}

		//Require interaction and/or channel of some kind
		const interaction = args.interaction
		const channel = isString(args?.channel) ? await interaction?.guild?.channels?.fetch(args.channel) :
						args?.channel?.type ? args.channel : null
		if (!channel) return this.ERROR(Error().stack);

		//Generate an embed if one isn't included
		const title = args.embedTitle ?? "Debug Log"
		const description = args.embedDesc ?? args.embedDescription ?? ``
		let embed = args.embed ?? null
		if (!embed) {
			embed = new EmbedBuilder().setTitle(title)
			if (description) embed.setDescription(description)
		}

		//Add the error message unless the embed already includes it
		const error = args.error ?? null
		if (error) {
			if (!embed.data.description) embed.setDescription(error.message)
			else if (embed.data.description != error.message)
				embed.addFields([{name:"Error",value:error.message}])
		}

		//Add the passed-in fields
		if (args.dataFields) { embed.addFields(args.dataFields.filter(f => f.value.length <= 1024)) }

		//Generate a callstack unless one is provided
		if (args.callstack) {
			embed.setThumbnail(null)
			const stack = error ? error.stack.replace(error.message,"").trim()
								: Error().stack
			embed.addFields([{name:"Callstack",value:`\`\`\`js\n${stack}\n\`\`\``}]);
		}

		//Add interaction details
		if (interaction) {
			const details = []
			details.push(`\`${InteractionType[interaction.type]}\``)
			if (interaction.commandName) details.push(`\`${interaction.commandName}\``)
			if (interaction.customId) details.push(`\`${interaction.customId}\``)
			const interactionDetails = details.map(d => `-# - ${d}`).join('\n')
			const channelLink = interaction.message?.url ?? `<#${interaction.channel.id}>`
			const interactionFields = [
				{name:"User",value:`-# <@${interaction.member.id}>`,inline:true},
				{name:"Channel",value:`-# ${channelLink}`,inline:true},
				{name:"Type",value:interactionDetails,inline:true}
			]
			embed.addFields(interactionFields)
		}

		await channel?.send({content:`<@${config.OWNERID}>`,embeds:[embed]})
	}

	FILE(filePath, data) {
		data = JSON.stringify(data, null, 2);
		fs.writeFile(filePath, data, (err) => {
		  if (err) {
			console.error('An error occurred:', err);
		  } else {
			console.log('File written successfully!');
		  }
		});
	}
}

module.exports = new Logger();