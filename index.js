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
const MAINTENANCE_FILE = "./maintenance.json";


for (const file of [
  SETUP_FILE,
  CLAIM_FILE,
  BACKUP_FILE,
  CUSTOM_FILE,
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


// Slash Commands
const commands = [

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket"),


  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup bot logs"),


  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim a ticket"),


  new SlashCommandBuilder()
    .setName("storesetup")
    .setDescription("Create store server"),


  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Server backup")
    .addSubcommand(sub =>
      sub
        .setName("create")
        .setDescription("Create backup")
    )
    .addSubcommand(sub =>
      sub
        .setName("restore")
        .setDescription("Restore backup")
    ),


  new SlashCommandBuilder()
    .setName("customize")
    .setDescription("Customize bot"),


  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show bot stats"),


  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show bot info"),


  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send announcement"),


  new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("Send bot message"),


  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Toggle maintenance"),


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


  console.log("Commands loaded!");

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
🛒 /storesetup
💾 /backup
🎨 /customize
📊 /stats
👤 /botinfo
📢 /announce
📡 /broadcast
🔧 /maintenance
    `);

  }



  // /storesetup
  if (command === "storesetup") {

    await interaction.deferReply();


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


    for (const roleName of roles) {

      const exists =
        interaction.guild.roles.cache.find(
          r => r.name === roleName
        );


      if (!exists) {

        await interaction.guild.roles.create({
          name: roleName
        });

        rolesCreated++;

      }

    }



    let channelsCreated = 0;


    for (const categoryName in categories) {


      let category =
        interaction.guild.channels.cache.find(
          c =>
          c.name === categoryName &&
          c.type === ChannelType.GuildCategory
        );


      if (!category) {

        category =
        await interaction.guild.channels.create({

          name: categoryName,

          type: ChannelType.GuildCategory

        });

      }



      for (const channelName of categories[categoryName]) {


        const exists =
          interaction.guild.channels.cache.find(
            c => c.name === channelName
          );


        if (!exists) {

          await interaction.guild.channels.create({

            name: channelName,

            type: ChannelType.GuildText,

            parent: category.id

          });


          channelsCreated++;

        }

      }

    }


    return interaction.editReply(
      `✅ Store server created!\n\n` +
      `👑 Roles created: ${rolesCreated}\n` +
      `📁 Channels created: ${channelsCreated}`
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
      "Click below to open a support ticket.",

      components:[row]

    });

  }



  // /setup
  if (command === "setup") {

    const setup = {

      logsChannel:
      interaction.channel.id

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

        content:
        "❌ Use this inside a ticket.",

        ephemeral:true

      });

    }



    await interaction.deferReply();



    const messages =
      await interaction.channel.messages.fetch({

        limit:100

      });



    const transcript =
      messages
      .sort((a,b) =>
        a.createdTimestamp -
        b.createdTimestamp
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

        name:
        interaction.user.username,

        claims:0

      };

    }



    claims[interaction.user.id].claims++;



    fs.writeFileSync(

      CLAIM_FILE,

      JSON.stringify(
        claims,
        null,
        2
      )

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



      backups[interaction.guild.id] =
      backup;



      fs.writeFileSync(

        BACKUP_FILE,

        JSON.stringify(
          backups,
          null,
          2
        )

      );



      return interaction.reply(
        "✅ Server backup saved!"
      );

    }



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



      let roles = 0;
      let channels = 0;



      for (const role of backup.roles) {

        if (role.name !== "@everyone") {


          const exists =
          interaction.guild.roles.cache.find(
            r => r.name === role.name
          );



          if (!exists) {

            await interaction.guild.roles.create({

              name: role.name,

              permissions:
              role.permissions

            });


            roles++;

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


          channels++;

        }

      }



      return interaction.editReply(

        `✅ Restore complete!\n\n🛡️ Roles: ${roles}\n📁 Channels: ${channels}`

      );

    }

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




// Login
client.login(process.env.TOKEN);