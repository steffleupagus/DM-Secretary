const axios = require('axios');
const avrae_token = process.env['avrae_token']

async function writeGvar(gvar, content)
{
	var auth = {'Authorization': avrae_token}
	var request = "https://api.avrae.io/customizations/gvars/"+gvar;
	var data = { "value": content }
	let res = await axios.post(request, data, { headers: auth });
	console.log(res.data);
}

async function readGvar(gvar)
{
	var request = "https://api.avrae.io/customizations/gvars/"+gvar;
	var auth = { 'Authorization': avrae_token };
	let res = await axios.get(request, { headers: auth });

	return res.data.value;
}

module.exports = {
	readGvar,
	writeGvar
}
