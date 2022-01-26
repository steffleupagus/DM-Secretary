const { MessageEmbed, Message, Client } = require("discord.js");
const { readdirSync } = require("fs");
const prefix = require("../../config/config.json").prefix;
let color = "#36393f";

const create_mh = require('../../functions/helpfunction');

module.exports = 
{
	name: "help",
	aliases: ['h'],
	description: "help command",
  /**
   * 
   * @param {Client} client 
   * @param {Message} message 
   * @param {String} args 
   * @returns 
   */
  run: async (client, message, args) => {
				const formatString = (str) => 
		`${str[0].toUpperCase()}${str.slice(1).toLowerCase()}`;

    let categories = [];
    let cots = [];

    if (!args[0]) {

      //categories to ignore
      let ignored = [
        "birthday",
        "owner"
      ];

      const emo = {
        fun: "<:ThugBlob:900675768311484417> | ",
        giveaway: "🎉",
        info: "<:NoobInfo:870965313875877969> | ",
        moderation: "<:BanBlob:900783888467628073>",
        testing: "🎌",
        utility: ":comet:",
        music: "<a:pepeJamSides:900275960618840144> | ",
        admins: "🔑",
        ticket: "🎫",
        counting: "🔢",
        invite: "📱",
        economy: '💰',
      }

      let ccate = [];

      readdirSync("./commands/").forEach((dir) => {
        if (ignored.includes(dir.toLowerCase())) return;
        const commands = readdirSync(`./commands/${dir}/`).filter((file) =>
          file.endsWith(".js")
        );

        if (ignored.includes(dir.toLowerCase())) return;

        const name = `${emo[dir.toLowerCase()]} ${formatString(dir)}`;
        //let nome = dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase();
        let nome = dir.toLowerCase();

        let cats = new Object();

        cats = {
          name: name,
          value: `\`${prefix}help ${dir.toLowerCase()}\``,
          inline: true
        }


        categories.push(cats);
        ccate.push(nome);
      });

      const embed = new MessageEmbed()
        .setTitle("Commands Menu:")
        .setDescription(`My prefix is b!\nUse the menu, or use \`b!help [category]\` to view commands base on their category!`)
        .addFields(categories)
        .setFooter(
          `Requested by ${message.author.tag}`,
          message.author.displayAvatarURL({
            dynamic: true
          })
        )
        .setTimestamp()
        .setThumbnail(client.user.displayAvatarURL({
          dynamic: true
        }))
        .setColor(color);


      let menus = create_mh(ccate);
      return message.channel.send({ embeds: [embed], components: menus.smenu }).then((msgg) => {

        const menuID = menus.sid;

        const select = async (interaction) => {
          if (interaction.customId != menuID) return;

          let {
            values
          } = interaction;

          let value = values[0];

          let catts = [];

          readdirSync("./commands/").forEach((dir) => {
            if (dir.toLowerCase() !== value.toLowerCase()) return;
            const commands = readdirSync(`./commands/${dir}/`).filter((file) =>
              file.endsWith(".js")
            );


            const cmds = commands.map((command) => {
              let file = require(`../../commands/${dir}/${command}`);

              if (!file.name) return "No command name.";

              let name = file.name.replace(".js", "");

              if (client.commands.get(name).hidden) return;


              let des = client.commands.get(name).description;
              let emo = client.commands.get(name).emoji;
              let emoe = emo ? `${emo} - ` : '';

              let obj = {
                cname: `${emoe}\`${name}\``,
                des
              }

              return obj;
            });

            let dota = new Object();

            cmds.map(co => {
              if (co == undefined) return;

              dota = {
                name: `${cmds.length === 0 ? "In progress." : co.cname}`,
                value: co.des ? co.des : 'No Description',
                inline: true,
              }
              catts.push(dota)
            });

            cots.push(dir.toLowerCase());
          });
					


          if (cots.includes(value.toLowerCase())) {
            const combed = new MessageEmbed()
              // .setTitle(`__${value.charAt(0).formatString + value.slice(1)} Commands!__`)
							.setTitle(`${formatString(value)} Commands`)
              .setDescription(`Use \`${prefix}help\` followed by a command name to get more information on a command.\nFor example: \`${prefix}help ping\`.\n\n`)
              .addFields(catts)
              .setColor(color)

            await interaction.deferUpdate();

            return interaction.message.edit({ embeds: [combed], components: menus.smenu })
          };

        };

        const filter = (interaction) => { return !interaction.user.bot && interaction.user.id == message.author.id };

        const collector = msgg.createMessageComponentCollector({ filter, componentType: "SELECT_MENU" });
        collector.on("collect", select);
        collector.on("end", () => null);

      });

    } else {
      let catts = [];

      readdirSync("./commands/").forEach((dir) => {
        if (dir.toLowerCase() !== args[0].toLowerCase()) return;
        const commands = readdirSync(`./commands/${dir}/`).filter((file) =>
          file.endsWith(".js")
        );


        const cmds = commands.map((command) => {
          let file = require(`../../commands/${dir}/${command}`);

          if (!file.name) return "No command name.";

          let name = file.name.replace(".js", "");

          if (client.commands.get(name).hidden) return;


          let des = client.commands.get(name).description;
          let emo = client.commands.get(name).emoji;
          let emoe = emo ? `${emo} - ` : '';

          let obj = {
            cname: `${emoe}\`${name}\``,
            des
          }

          return obj;
        });

        let dota = new Object();

        cmds.map(co => {
          if (co == undefined) return;

          dota = {
            name: `${cmds.length === 0 ? "In progress." : co.cname}`,
            value: co.des ? co.des : 'No Description',
            inline: true,
          }
          catts.push(dota)
        });

        cots.push(dir.toLowerCase());
      });

      const command =
        client.commands.get(args[0].toLowerCase()) ||
        client.commands.find(
          (c) => c.aliases && c.aliases.includes(args[0].toLowerCase())
        );

      if (cots.includes(args[0].toLowerCase())) {
        const combed = new MessageEmbed()
          .setTitle(`__${args[0].charAt(0) + args[0].slice(1)} Commands!__`)
          .setDescription(`Use \`${prefix}help\` followed by a command name to get more information on a command.\nFor example: \`${prefix}help ping\`.\n\n`)
          .addFields(catts)
          .setColor(color)

        return message.channel.send({ embeds: [combed] })
      };

      if (!command) {
        const embed = new MessageEmbed()
          .setTitle(`Invalid command! Use \`${prefix}help\` for all of my commands!`)
          .setColor("RED");
        return await client.sendEmbed(embed);
      }

      const embed = new MessageEmbed()
        .setTitle("Command Details:")
        .addField(
          "Command:",
          command.name ? `\`${command.name}\`` : "No name"
        )
        .addField(
          "Aliases:",
          command.aliases ?
            `\`${command.aliases.join("` `")}\`` :
            "No aliases"
        )
        .addField(
          "Usage:",
          command.usage ?
            `\`${prefix}${command.name} ${command.usage}\`` :
            `\`${prefix}${command.name}\``
        )
        .addField(
          "Command Description:",
          command.description ?
            command.description :
            "No description"
        )
        .setFooter(
          `Requested by ${message.author.tag}`,
          message.author.displayAvatarURL({
            dynamic: true
          })
        )
        .setTimestamp()
        .setColor(color);
      return await message.channel.send({ embeds: [embed] });
    }
  },
};