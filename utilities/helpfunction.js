const chalk = require('chalk');
const { MessageSelectMenu, MessageActionRow } = require('discord.js');
const { readdirSync } = require("fs");
const client = require("../bot")

/* MENU CREATOR */
/**
 * @param {Array} array - The array of options (rows to select) for the select menu
 * @returns MessageSelectMenu
 */
const create_mh = (array) => 
{
  if (!array) throw new Error(chalk.red.bold('The options were not provided! Make sure you provide all the options!'));
  if (array.length < 0) throw new Error(chalk.red.bold(`The array has to have atleast one thing to select!`));
  let select_menu;

  let id = 'help-menus';

  let menus = [];

  const emo = {
    fun: "📱",
    giveaway: "🎉",
    info: "📱",
    moderation: "📱",
    testing: "🎌",
    utility: ":comet:",
    music: "📱",
	  admins: "🔑",
    ticket: "🎫",
    counting: "🔢",
    invite: "📱",
    economy: '💰',
  }
    
		const formatString = (str) => 
`${str[0].toUpperCase()}${str.slice(1).toLowerCase()}`;


  array.forEach(cca => {
    let name = cca;
    let sName = `${formatString(name)}`
    let tName = name.charAt(0).toUpperCase() + name.slice(1);
    let fName = name.toUpperCase();

    return menus.push({ 
		 label: sName,
		 description: `${tName} Commands`,
		 value: fName,
		 emoji: emo[name.toLowerCase()] || null,
			})
  });



  let chicken = new MessageSelectMenu()
    .setCustomId(id)
    .setPlaceholder('Choose the command category')
    .addOptions(menus)

  select_menu = new MessageActionRow()
    .addComponents(
      chicken
    );

  //console.log(select_menu.components[0].options)
  return {
    smenu: [select_menu],
    sid: id,
		// emoji: emo[cmd.directory.toLowerCase()] || null,
  }
}

module.exports = create_mh;