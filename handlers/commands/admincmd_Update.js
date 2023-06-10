const { SlashCommandBuilder, PermissionsBitField } = require('discord.js')
const mod = process.env.mod || "";
const config = require(`../../config/${mod}_config.json`);

async function execute(interaction)
{
	await interaction.reply({content:"Updating", ephemeral:true})
	if (interaction.channel.id == config.activityChannel)
	{
		const timer = interaction.client.timers.get('activityUpdate')
		timer.stopTimer()
		await timer.triggerTimer(interaction.client)
		timer.startTimer(interaction.client)
	}
}

const cmdName = `update${config.DEV ? "dev" : ""}`
const data = new SlashCommandBuilder()
			.setName(cmdName)
			.setDescription('Update the activity tracker')
const userPermissions = [	PermissionsBitField.Flags.SendMessages		];
module.exports = 
{
	data: data,
	whitelistRoles: [ config.BuilderRole, config._BuilderRole ],
	userPermissions: userPermissions,
	execute: execute,
	build:config.PRODUCTION || config.DEV
};