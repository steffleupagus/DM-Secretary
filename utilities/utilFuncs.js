const { MessageEmbed, Permissions } = require('discord.js');

module.exports =
{
	isEqual(a, b)
	{
		return JSON.stringify(a) === JSON.stringify(b)
	},
	
	async slowdown(milliseconds)	
	{ 
		return new Promise(resolve => setTimeout(resolve, milliseconds)) 
	},

	async asyncCollectionForEach(collection, callback) 
	{
		if (!collection) return;
		const count = collection.size;
		const keys = Array.from(collection.keys());

		for (let index = 0; index < count; index++) 
		{
			const key = keys[index];
			await callback(collection.get(key), key, collection);
		}
	},

	async asyncObjectForEach(object, callback)
	{
		for (const [key, value] of Object.entries(object)) 
		{
			await callback(value, key, object);
		}
	},

	async asyncArrayForEach(array, callback) 
	{
		if (!array) return;
		const count = array.length;
		for (let index = 0; index < count; index++) 
		{
			await callback(array[index], index, array);
		}
	},
	
	hasAnyRole(member, roleArray)
	{
		const userRoles = member.roles.cache;
		for (const role of roleArray)
		{
			if (userRoles.has(role))
				return true;
		};
		return false;
	},
	
	getPermissionStr(perm)
	{
		perm = Object.keys(Permissions.FLAGS).find(key => Permissions.FLAGS[key] === perm);
		return perm;
	},

	precise(x, prec=2) 
	{
		return Math.floor(x*100)/100;
	},
	
	mround(number, roundto)
	{
		return roundto * Math.round(number/roundto);
	},
	
	milliseconds(days=0, hours=0, minutes=0, seconds=0)
	{
		hours += days * 24;
		minutes += hours * 60;
		seconds += minutes * 60;
		let ms = seconds * 1000;
		return ms;
	},

	getDate(timeStamp = null)
	{
		// Get time zone offset for NY, USA
		const getTZOffset = () => {
			const stdTimezoneOffset = () => {
				var jan = new Date(0, 1)
				var jul = new Date(6, 1)
				return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
			}

			var today = timeStamp ? new Date(timeStamp) : new Date()
			
			const isDstObserved = (today) => 
			{
				return today.getTimezoneOffset() < stdTimezoneOffset()
			}

//			console.log("DST: "+isDstObserved(today))

			if (isDstObserved(today))
				return -4
			else
				return -5
		}

		const d = timeStamp ? new Date(timeStamp) : new Date()
		const localTime = d.getTime()
		const localOffset = d.getTimezoneOffset() * 60 * 1000
		const utcTime = localTime + localOffset

		// obtain and add destination's UTC time offset
		const tzOffset = getTZOffset()

//		console.log("Offset: "+tzOffset)

		const usa = utcTime + (60 * 60 * 1000 * tzOffset)
		// convert msec value to date string
		const nd = new Date(usa)

//		console.log(this.formatDate(nd))
		return nd;
	},

	formatDate(d, format="hh:mm pm DD/MM/YYYY")
	{
		const year = d.getFullYear() 			//YYYY

		const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
		const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];	
		const monthIndex = d.getMonth()			//MM
		const monthFull = monthsFull[monthIndex]
		const monthShort= monthsShort[monthIndex]

		const daysFull = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
		const daysShort = ['Sun','Mon','Tues','Wed','Thur','Fri','Sat'];

		const date = d.getDate() 				//DD

		const hour24 = d.getHours() 			//24-hour
		const pm     = hour24 < 12 ? 'am':'pm';	//
		const hour12 = hour24 % 12 || 12;
		var	  min  	 = d.getMinutes();
			  min	 = (min < 10 ? "0" : "") + min;

		format = format.replace("YYYY", year);
		format = format.replace("MMMM", monthFull);
		format = format.replace("MMM", 	monthShort);
		format = format.replace("MM", 	monthIndex+1);
		format = format.replace("DD", 	date);
		format = format.replace("HH", 	hour24);
		format = format.replace("hh", 	hour12);
		format = format.replace("mm", 	min);
		format = format.replace("pm", 	pm);

		return format;
	}

}