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
  SlashCommandBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");


// Keep alive
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);


// Files
const SETUP_FILE = "./setup.json";
const CLAIM_FILE = "./claims.json";
const BACKUP_FILE = "./backups.json";


for (const file of [
  SETUP_FILE,
  CLAIM_FILE,
  BACKUP_FILE
]) {

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "{}");
  }

}


// Discord client
const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]

});


client.on("error", console.error);
// Slash commands
const commands = [

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show bot commands"),


  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a ticket"),


  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup logs"),


  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim ticket"),


  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup server")
    .addSubcommand(sub =>
      sub
        .setName("create")
        .setDescription("Create backup")
    )
    .addSubcommand(sub =>
      sub
        .setName("restore")
        .setDescription("Restore backup")
    )

].map(cmd => cmd.toJSON());



// Bot ready
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


  console.log("Commands loaded!");

});
// Slash command handler
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
🛒 !setupshop
`);

  }



  // /setup
  if (command === "setup") {

    const setup = {

      logsChannel: interaction.channel.id

    };


    fs.writeFileSync(
      SETUP_FILE,
      JSON.stringify(setup, null, 2)
    );


    return interaction.reply(
      "✅ Setup complete!"
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

      content:
      "Click below to open a ticket.",

      components:[row]

    });

  }


});
// Ticket button system
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
// !setupshop
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content !== "!setupshop") return;


  const roles = [
    "Owner",
    "Manager",
    "Developer",
    "Support Team",
    "Customer",
    "Bots"
  ];


  const categories = {

    "📌 INFORMATION": [
      "welcome",
      "rules",
      "announcements"
    ],

    "🛒 STORE": [
      "store-menu",
      "pricing",
      "reviews"
    ],

    "🎟️ ORDERS": [
      "create-ticket",
      "active-orders",
      "completed-orders"
    ],

    "💬 COMMUNITY": [
      "general",
      "suggestions"
    ],

    "🛠️ SUPPORT": [
      "help",
      "bug-reports"
    ],

    "👑 STAFF": [
      "staff-chat",
      "order-logs",
      "staff-logs"
    ]

  };


  let rolesCreated = 0;
  let channelsCreated = 0;


  for (const roleName of roles) {

    const exists =
    message.guild.roles.cache.find(
      r => r.name === roleName
    );


    if (!exists) {

      await message.guild.roles.create({
        name: roleName
      });

      rolesCreated++;

    }

  }


  for (const categoryName in categories) {

    let category =
    message.guild.channels.cache.find(
      c =>
      c.name === categoryName &&
      c.type === ChannelType.GuildCategory
    );


    if (!category) {

      category =
      await message.guild.channels.create({

        name: categoryName,

        type: ChannelType.GuildCategory

      });

    }


    for (const channelName of categories[categoryName]) {

      const exists =
      message.guild.channels.cache.find(
        c => c.name === channelName
      );


      if (!exists) {

        await message.guild.channels.create({

          name: channelName,

          type: ChannelType.GuildText,

          parent: category.id

        });

        channelsCreated++;

      }

    }

  }


  message.reply(
    `✅ Shop server created!\n\n👑 Roles: ${rolesCreated}\n📁 Channels: ${channelsCreated}`
  );

});
// /claim
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "claim") return;


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



  const setup =
  JSON.parse(
    fs.readFileSync(SETUP_FILE)
  );



  const logs =
  interaction.guild.channels.cache.get(
    setup.logsChannel
  );



  if (logs) {

    logs.send({

      content:
      `📄 Transcript\nTicket: ${interaction.channel.name}\nClaimed by: ${interaction.user}`,

      files:[
        new AttachmentBuilder(fileName)
      ]

    });

  }



  let claims =
  JSON.parse(
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


});
// /backup
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "backup") return;


  const type =
  interaction.options.getSubcommand();



  // Create backup
  if (type === "create") {


    const backup = {

      server:
      interaction.guild.name,


      roles:
      interaction.guild.roles.cache.map(role => ({

        name: role.name,

        permissions:
        role.permissions.toArray()

      })),


      channels:
      interaction.guild.channels.cache.map(channel => ({

        name: channel.name,

        type: channel.type

      }))

    };



    let backups =
    JSON.parse(
      fs.readFileSync(BACKUP_FILE)
    );



    backups[interaction.guild.id] = backup;



    fs.writeFileSync(

      BACKUP_FILE,

      JSON.stringify(backups,null,2)

    );



    return interaction.reply(
      "✅ Server backup saved!"
    );


  }



  // Restore backup
  if (type === "restore") {


    await interaction.deferReply();



    const backups =
    JSON.parse(
      fs.readFileSync(BACKUP_FILE)
    );



    const backup =
    backups[interaction.guild.id];



    if (!backup) {

      return interaction.editReply(
        "❌ No backup found!"
      );

    }



    return interaction.editReply(
      "✅ Restore system ready!"
    );


  }


});
// Login
client.login(process.env.TOKEN);