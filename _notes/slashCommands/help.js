const { Client, EmbedBuilder } = require("discord.js");
const { readdirSync } = require("fs");
const prefix = "/";
let color = "#36393f";

const create_mh = require(`${process.cwd()}/functions/helpfunction`);

module.exports = {
  name: "help",
  description: "Get A List Of My Commands",
	options: [
		{
			name: "command",
			description: "Command To Get Info About",
			type: "STRING",
			required: false
		}
	],
	
  /**
   * 
   * @param {Client} client 
   * @param {Message} message 
   * @param {String} args 
   * @returns 
   */
  run: async (client, interaction, args) => {
  const cats = interaction.options.getString("command")

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
        fun: "🎉",
        giveaway: "🎉",
        info: "🎉 ",
        moderation: "🎉",
        testing: "🎌",
        utility: ":comet:",
        music: "🎉 ",
        admins: "🔑",
        ticket: "🎫",
        counting: "🔢",
        invite: "📱",
        economy: '💰',
      }

      let ccate = [];

      readdirSync("./SlashCommands/").forEach((dir) => {
        if (ignored.includes(dir.toLowerCase())) return;
        const commands = readdirSync(`./SlashCommands/${dir}/`).filter((file) =>
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

      const embed = new EmbedBuilder()
        .setTitle("SlashCommands Menu:")
        .setDescription(`>>> My prefix is /\nUse the menu, or use \`/help [category]\` to view commands base on their category!\n\n[\`Invite Me\`](https://discord.com/api/oauth2/authorize?client_id=899947566567915531&permissions=8&scope=bot%20applications.commands)  |  [\`Support Server\`](https://dsc.gg/nyancatcommunity)`)
        .addFields(categories)
        // .setFooter(
        //   `Requested by ${interaction.user.tag}`,
        //   interaction.author.displayAvatarURL({
        //     dynamic: true
        //   })
        // )
        .setTimestamp()
        .setThumbnail(client.user.displayAvatarURL({
          dynamic: true
        }))
        .setColor(color);


      let menus = create_mh(ccate);
      return interaction.followUp({ embeds: [embed], components: menus.smenu }).then((msgg) => {

        const menuID = menus.sid;

        const select = async (interaction) => {
          if (interaction.customId != menuID) return;

          let {
            values
          } = interaction;

          let value = values[0];

          let catts = [];

          readdirSync("./SlashCommands/").forEach((dir) => {
            if (dir.toLowerCase() !== value.toLowerCase()) return;
            const commands = readdirSync(`./SlashCommands/${dir}/`).filter((file) =>
              file.endsWith(".js")
            );


            const cmds = commands.map((command) => {
              let file = require(`${process.cwd()}/SlashCommands/${dir}/${command}`);

              if (!file.name) return "No command name.";

              let name = file.name.replace(".js", "");

              if (client.slashCommands.get(name).hidden) return;


              let des = client.slashCommands.get(name).description;
              let emo = client.slashCommands.get(name).emoji;
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
            const combed = new EmbedBuilder()
              // .setTitle(`__${value.charAt(0).formatString + value.slice(1)} Commands!__`)
							.setTitle(`${formatString(value)} Commands`)
              .setDescription(`Use \`${prefix}help\` followed by a command name to get more information on a command.\nFor example: \`${prefix}help ping\`.\n\n`)
              .addFields(catts)
              .setColor(color)

            await interaction.deferUpdate();

            return interaction.editReply({ embeds: [combed], components: menus.smenu })
          };

        };

        const filter = (interaction) => { return !interaction.user.bot && interaction.user.id == interaction.user.id };

        const collector = msgg.createMessageComponentCollector({ filter, componentType: "SELECT_MENU" });
        collector.on("collect", select);
        collector.on("end", () => null);

      });

    } else {
      let catts = [];

      readdirSync("./SlashCommands/").forEach((dir) => {
        if (dir.toLowerCase() !== args[0].toLowerCase()) return;
        const commands = readdirSync(`./SlashCommands/${dir}/`).filter((file) =>
          file.endsWith(".js")
        );


        const cmds = commands.map((command) => {
          let file = require(`${process.cwd()}/SlashCommands/${dir}/${command}`);

          if (!file.name) return "No command name.";

          let name = file.name.replace(".js", "");

          if (client.slashCommands.get(name).hidden) return;


          let des = client.slashCommands.get(name).description;
          let emo = client.slashCommands.get(name).emoji;
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
        client.slashCommands.get(args[0].toLowerCase()) ||
        client.slashCommands.find(
          (c) => c.aliases && c.aliases.includes(args[0].toLowerCase())
        );
      if (cots.includes(args[0].toLowerCase())) {
        const combed = new EmbedBuilder()
          .setTitle(`__${formatString(args[0].charAt(0) + args[0].slice(1))} Commands!__`)
          .setDescription(`Use \`${prefix}help\` followed by a command name to get more information on a command.\nFor example: \`${prefix}help ping\`.\n\n`)
          .addFields(catts)
          .setColor(color)

        return interaction.followUp({ embeds: [combed] })
      };

      if (!command) {
        const embed = new EmbedBuilder()
          .setTitle(`Invalid command! Use \`${prefix}help\` for all of my commands!`)
          .setColor("RED");
        return interaction.followUp({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
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
          `Requested by ${interaction.user.tag}`,
          interaction.user.displayAvatarURL({
            dynamic: true
          })
        )
        .setTimestamp()
        .setColor(color);
      return await interaction.followUp({ embeds: [embed] });
    }
  },
};