const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType
} = require("discord.js");

const express = require("express");
const fs = require("fs");


// Web server
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);


// Files
const SETUP_FILE = "./setup.json";
const CLAIM_FILE = "./claims.json";
const BACKUP_FILE = "./backups.json";
const CUSTOM_FILE = "./custom.json";
const LOG_FILE = "./logs.json";
const MAINTENANCE_FILE = "./maintenance.json";


for (const file of [
  SETUP_FILE,
  CLAIM_FILE,
  BACKUP_FILE,
  CUSTOM_FILE,
  LOG_FILE,
  MAINTENANCE_FILE
]) {

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "{}");
  }

}


// Client
const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]

});


// Slash commands
const commands = [

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket"),


  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup bot channels"),


  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim a ticket"),


  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup server")
    .addSubcommand(sub =>
      sub
        .setName("create")
        .setDescription("Create a backup")
    )
    .addSubcommand(sub =>
      sub
        .setName("restore")
        .setDescription("Restore a backup")
    ),


  new SlashCommandBuilder()
    .setName("customize")
    .setDescription("Customize bot settings")
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Setting to change")
        .setRequired(true)
        .addChoices(
          {
            name: "Nickname",
            value: "nickname"
          },
          {
            name: "Status",
            value: "status"
          }
        )
    )
    .addStringOption(option =>
      option
        .setName("value")
        .setDescription("New value")
        .setRequired(true)
    ),


  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show bot settings"),


  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show bot stats"),


  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Announcement text")
        .setRequired(true)
    ),


  new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("Send a bot message")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Message")
        .setRequired(true)
    ),


  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Toggle maintenance mode"),


  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show commands")

].map(cmd => cmd.toJSON());


// Ready
client.once("ready", async () => {

  console.log(`Logged in as ${client.user.tag}`);


  const rest = new REST({
    version: "10"
  }).setToken(process.env.TOKEN);


  await rest.put(
    Routes.applicationCommands(client.user.id),
    {
      body: commands
    }
  );


  console.log("Slash commands registered");

});
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;


  const command = interaction.commandName;


  // /info
  if (command === "info") {

    return interaction.reply(`
🤖 **Bot Commands**

🎟️ /ticket
⚙️ /setup
📋 /claim
💾 /backup
🎨 /customize
👤 /botinfo
📊 /stats
📢 /announce
📡 /broadcast
🔧 /maintenance
    `);

  }



  // /customize
  if (command === "customize") {

    const type =
      interaction.options.getString("type");

    const value =
      interaction.options.getString("value");


    let custom = JSON.parse(
      fs.readFileSync(CUSTOM_FILE)
    );


    if (!custom[interaction.guild.id]) {
      custom[interaction.guild.id] = {};
    }


    custom[interaction.guild.id][type] = value;


    fs.writeFileSync(
      CUSTOM_FILE,
      JSON.stringify(custom,null,2)
    );


    if (type === "nickname") {

      await interaction.guild.members.me.setNickname(value);

    }


    if (type === "status") {

      client.user.setActivity(value, {
        type: ActivityType.Playing
      });

    }


    return interaction.reply(
      `✅ Updated ${type}: ${value}`
    );

  }



  // /botinfo
  if (command === "botinfo") {

    const custom = JSON.parse(
      fs.readFileSync(CUSTOM_FILE)
    );


    const settings =
      custom[interaction.guild.id] || {};


    return interaction.reply(`
🤖 **Bot Info**

Nickname:
${settings.nickname || "Default"}

Status:
${settings.status || "Default"}
    `);

  }



  // /stats
  if (command === "stats") {

    const claims = JSON.parse(
      fs.readFileSync(CLAIM_FILE)
    );


    let total = 0;


    for (const user in claims) {
      total += claims[user].claims;
    }


    return interaction.reply(`
📊 **Bot Stats**

🎟️ Total Claims:
${total}

👥 Staff Tracked:
${Object.keys(claims).length}
    `);

  }



  // /announce
  if (command === "announce") {

    const message =
      interaction.options.getString("message");


    await interaction.channel.send(
      `📢 **Announcement**\n\n${message}`
    );


    return interaction.reply({
      content: "✅ Announcement sent!",
      ephemeral: true
    });

  }



  // /broadcast
  if (command === "broadcast") {

    const message =
      interaction.options.getString("message");


    await interaction.channel.send(message);


    return interaction.reply({
      content: "✅ Broadcast sent!",
      ephemeral: true
    });

  }



  // /maintenance
  if (command === "maintenance") {

    let maintenance = JSON.parse(
      fs.readFileSync(MAINTENANCE_FILE)
    );


    maintenance[interaction.guild.id] =
      !maintenance[interaction.guild.id];


    fs.writeFileSync(
      MAINTENANCE_FILE,
      JSON.stringify(maintenance,null,2)
    );


    return interaction.reply(
      `🔧 Maintenance mode: ${
        maintenance[interaction.guild.id]
        ? "ON"
        : "OFF"
      }`
    );

  }
    // /ticket
  if (command === "ticket") {

    const button = new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("🎟️ Open Ticket")
      .setStyle(ButtonStyle.Primary);


    const row = new ActionRowBuilder()
      .addComponents(button);


    return interaction.reply({
      content: "Click below to open a ticket.",
      components: [row]
    });

  }



  // /setup
  if (command === "setup") {

    const setup = {
      logsChannel: interaction.channel.id
    };


    fs.writeFileSync(
      SETUP_FILE,
      JSON.stringify(setup,null,2)
    );


    return interaction.reply(
      "✅ Setup complete!"
    );

  }



  // /claim
  if (command === "claim") {

    if (!interaction.channel.name.startsWith("ticket-")) {

      return interaction.reply({
        content: "❌ Use this inside a ticket.",
        ephemeral: true
      });

    }


    await interaction.deferReply();


    const messages =
      await interaction.channel.messages.fetch({
        limit: 100
      });


    const transcript =
      messages
      .sort((a,b) =>
        a.createdTimestamp - b.createdTimestamp
      )
      .map(msg =>
        `[${msg.author.username}] ${msg.content}`
      )
      .join("\n");


    const fileName =
      `${interaction.channel.name}-transcript.txt`;


    fs.writeFileSync(
      fileName,
      transcript
    );


    const setup = JSON.parse(
      fs.readFileSync(SETUP_FILE)
    );


    const logs =
      interaction.guild.channels.cache.get(
        setup.logsChannel
      );


    if (logs) {

      logs.send({

        content:
        `📄 Transcript\n${interaction.channel.name}\nClaimed by ${interaction.user}`,

        files:[
          new AttachmentBuilder(fileName)
        ]

      });

    }


    let claims = JSON.parse(
      fs.readFileSync(CLAIM_FILE)
    );


    if (!claims[interaction.user.id]) {

      claims[interaction.user.id] = {
        name: interaction.user.username,
        claims: 0
      };

    }


    claims[interaction.user.id].claims++;


    fs.writeFileSync(
      CLAIM_FILE,
      JSON.stringify(claims,null,2)
    );


    return interaction.editReply(
      "✅ Ticket claimed!"
    );

  }



  // /backup
  if (command === "backup") {

    const type =
      interaction.options.getSubcommand();



    if (type === "create") {

      const backup = {

        roles:
        interaction.guild.roles.cache.map(role => ({
          name: role.name,
          permissions: role.permissions.toArray()
        })),

        channels:
        interaction.guild.channels.cache.map(channel => ({
          name: channel.name,
          type: channel.type
        }))

      };


      let backups = JSON.parse(
        fs.readFileSync(BACKUP_FILE)
      );


      backups[interaction.guild.id] = backup;


      fs.writeFileSync(
        BACKUP_FILE,
        JSON.stringify(backups,null,2)
      );


      return interaction.reply(
        "✅ Backup saved!"
      );

    }



    if (type === "restore") {

      await interaction.deferReply();


      const backups = JSON.parse(
        fs.readFileSync(BACKUP_FILE)
      );


      const backup =
        backups[interaction.guild.id];


      if (!backup) {

        return interaction.editReply(
          "❌ No backup found!"
        );

      }


      for (const role of backup.roles) {

        if (role.name !== "@everyone") {

          const exists =
          interaction.guild.roles.cache.find(
            r => r.name === role.name
          );


          if (!exists) {

            await interaction.guild.roles.create({
              name: role.name,
              permissions: role.permissions
            });

          }

        }

      }



      for (const channel of backup.channels) {

        const exists =
        interaction.guild.channels.cache.find(
          c => c.name === channel.name
        );


        if (!exists) {

          await interaction.guild.channels.create({
            name: channel.name,
            type: channel.type
          });

        }

      }


      return interaction.editReply(
        "✅ Restore complete!"
      );

    }

  }

});



// Ticket button
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isButton()) return;


  if (interaction.customId === "open_ticket") {


    const channel =
    await interaction.guild.channels.create({

      name:
      `ticket-${interaction.user.username}`,

      type:
      ChannelType.GuildText,


      permissionOverwrites:[

        {
          id: interaction.guild.id,

          deny:[
            PermissionsBitField.Flags.ViewChannel
          ]

        },


        {
          id: interaction.user.id,

          allow:[
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]

        }

      ]

    });



    await channel.send(
      `<@${interaction.user.id}> Ticket created!`
    );


    await interaction.reply({

      content:
      `Ticket opened: ${channel}`,

      ephemeral:true

    });

  }

});



// Login
client.login(process.env.TOKEN);