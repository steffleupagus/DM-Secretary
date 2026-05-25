const { EmbedBuilder, InteractionType, ButtonStyle } = require('discord.js')
const util = require("util");
const cli = require("cli-color");
const purple = cli.xterm(93);
const orange = cli.xterm(208);
const fs = require('fs');

const mod = process.env.mod || "";
const config = require(`../config/${mod}_config.json`);
//const {STEP,ERROR} = require(`./constants.js`)
const Prompt = require(`./promptUtils.js`)
const BR = `\n\`${' '.repeat(69)}\``

const isString = (value) => typeof value === 'string';
const errorLogDefaultArgs = {
	interaction:null,
	channel:null,
	error:null,
	embed:null,
	dataFields:null,
	callstack: true
}

// Helper
const truncateToField = (text, lang = "", limit = 1024) => {
	const wrap = (s) => `\`\`\`${lang}\n${s}\n\`\`\``;
	const overhead = wrap("").length;
	const maxContent = limit - overhead;
	if (text.length <= maxContent) return wrap(text);
	return wrap(text.slice(0, maxContent - 3) + "...");
};

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
			else if (!dataFn) result = {name:k, value:truncateToField(JSON.stringify(data[k],null,2), "json")}
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
		if (!channel) {
			this.ERROR(Error().stack);
			throw Error("Missing channel", {cause: args})
		}

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
		if (args.dataFields) { 
			const safeFields = args.dataFields.map(f => ({ ...f, value: f.value.length <= 1024 ? f.value : truncateToField(f.value) }));
			embed.addFields(safeFields) 
		}

		//Generate a callstack unless one is provided
		if (args.callstack) {
			embed.setThumbnail(null)
			const stack = error ? error.stack.replace(error.message,"").trim()
								: Error().stack
			embed.addFields([{name:"Callstack",value:truncateToField(stack,"js")}]);
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

	async FILE(filePath, data) {
		try {
			await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
		} catch (err) {
			this.ERROR(err);
		}
	}	

	/// Trace step
	/// Advance the data to the newStage and handle stepping interaction
	/// Updates data.stage to newStage
	async TRACE (interaction, data, newStage, DEBUG) {
		/// Finish up the previous stage output
		let STEPKEY = Object.keys(STEP).find(key => STEP[key] === data.stage);
		const debugData = data ?? {};
		const cause = data ? {cause:data} : {}

		if (DEBUG.BREAKSTEP && DEBUG.BREAKSTEP == data.stage) {
			this.DEBUG([data, STEPKEY, DEBUG.BREAKSTEP])
			throw new Error(`Break step reached`, cause)
		}
		else if (DEBUG?.WATCHDATA && debugData) this.DEBUG(debugData)

		/// Process the next stage output
		data.stage = newStage;
		STEPKEY = Object.keys(STEP).find(key => STEP[key] === data.stage);
		this.STEP(STEPKEY, newStage)
		if (newStage.includes("TODO")) this.TODO(newStage)
		const embed = new EmbedBuilder().setTitle("Processing").setThumbnail(DEBUG.THUMB)
										.setDescription(`${newStage}\n${BR}`)
										.setFooter({text:"Please Be Patient"})
		const components = [];
		const buttons = [
			{style:ButtonStyle.Primary, emoji:config.emoji.play, label:"Run", custom_id:"run"},
			{style:ButtonStyle.Primary, emoji:config.emoji.next, label:"Step", custom_id:"step"},
			{style:ButtonStyle.Primary, emoji:config.emoji.next, label:"Step & Log", custom_id:"steplog"},
			{style:ButtonStyle.Primary, emoji:config.emoji.pause, label: "Pause", custom_id:"pause"},
			{style:ButtonStyle.Secondary, emoji:config.emoji.no, label:"Cancel", custom_id:"cancel"},
		]
		if (DEBUG?.EMBEDDATA) {
			let fields = (DEBUG?.EMBEDDATA && data) ? this.DEBUGFIELDS(data) : [];
			console.log(this.VAR(fields))
			if (fields.length > 0) embed.addFields(fields)
		}
		if (DEBUG?.TRACESTEP) components.push(Prompt.createButtonRow(buttons))
		const prompt = await interaction?.editReply({content:"",embeds:[embed],components})
		if (DEBUG?.TRACESTEP) {
			let input = await Prompt.collectComponents(prompt, {default:"step"});
			while (input.values[0] == "pause")
				input = await Prompt.collectComponents(prompt, {default:"pause",time:Prompt.Time.Extended})
			if (input.values[0] == "run") DEBUG.TRACESTEP = false;
			if (input.values[0] == "cancel") throw Error(ERROR.CANCELLED, cause)
			if (input.values[0] == "steplog") await interaction?.channel?.send({embeds:[embed]})
		}
		await interaction?.editReply({components:[]})
	}

}

module.exports = new Logger();