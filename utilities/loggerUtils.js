const util = require("util");
const cli = require("cli-color");
const purple = cli.xterm(93);
const orange = cli.xterm(208);

class Logger
{
	constructor()
	{
	}

	TODO(text){ console.log(orange(text)); }

	NOTE(text="", offset=2){ console.log(text,text?"-":"",purple(Error().stack.split("\n")[offset].trim())) }

	STEPOUT(STEPKEY,stage) { console.log(cli.green(STEPKEY), " - ", cli.green(stage)) }

	ERROROUT(error) { console.log(cli.red(error)) }

	WARNOUT(warn) { console.log(orange(warn)) }

	DEBUGVAR(data) { return util.inspect(data, false, null, true /* enable colors */) }

	DEBUGOUT(data) {
		let isString = (value) => typeof value === 'string';
		(Array.isArray(data) ? data : [data]).forEach(x =>
			console.log("\n",(isString(x) ? x : this.DEBUGVAR(x)),"\n"))
	}

	DEBUGFIELDS(data, dataFn = {}) {
		let fields = []
		if (!data) return fields;

		fields = Object.keys(data).map(k => {
//		Object.keys(data).forEach(k => {
			let result = null;
			//If we have methods to process the data, run only those keys through their respective methods and return
			if (dataFn?.[k]) result = dataFn[k](data[k])
			//If we don't have any methods to process any data, just give it all back as raw JSON
			else if (!dataFn) result = {name:f, value:`\`\`\`json\n${JSON.stringify(data[f])}\n\`\`\``}

			// if (result && !Array.isArray(result)) result = [result]
			// if (result) fields.push(...result)
			return result
//		})
		}).filter(field => field).flat(Infinity)

		return fields
	}

	DEBUGTHROW(data, dataFn = {}) {
		this.DEBUGOUT(data);
		throw Error("Debug", {cause: this.DEBUGFIELDS(data, dataFn)});
	}
}

module.exports = new Logger();