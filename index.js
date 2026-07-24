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

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);


// Files
const SETUP_FILE = "./setup.json";
const CLAIM_FILE = "./claims.json";
const BACKUP_FILE = "./backups.json";


if (!fs.existsSync(SETUP_FILE))
  fs.writeFileSync(SETUP_FILE, "{}");

if (!fs.existsSync(CLAIM_FILE))
  fs.writeFileSync(CLAIM_FILE, "{}");

if (!fs.existsSync(BACKUP_FILE))
  fs.writeFileSync(BACKUP_FILE, "{}");


// Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});


// Slash command list
const commands = [

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket"),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Setup transcript and leaderboard channel"),

  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim a ticket"),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Backup server")
    .addSubcommand(sub =>
      sub.setName("create")
      .setDescription("Create a backup"))
    .addSubcommand(sub =>
      sub.setName("restore")
      .setDescription("Restore backup")),

  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show commands")

].map(command => command.toJSON());


// Register commands
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


  console.log("Slash commands loaded.");
});
// Slash command handler
client.on("interactionCreate", async (interaction) => {

  if (interaction.isChatInputCommand()) {

    const command = interaction.commandName;


    // /ticket
    if (command === "ticket") {

      const button = new ButtonBuilder()
        .setCustomId("open_ticket")
        .setLabel("🎟️ Open Ticket")
        .setStyle(ButtonStyle.Primary);


      const row = new ActionRowBuilder()
        .addComponents(button);


      await interaction.reply({
        content: "Click below to open a support ticket.",
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
        JSON.stringify(setup, null, 2)
      );


      await interaction.reply(
        `✅ Setup complete!\n📄 Transcripts: ${interaction.channel}\n🏆 Leaderboard: ${interaction.channel}`
      );

    }



    // /info
    if (command === "info") {

      await interaction.reply(`
🤖 **Bot Commands**

🎟️ /ticket
• Opens a support ticket.

⚙️ /setup
• Sets the transcript + leaderboard channel.

📋 /claim
• Claims a ticket and updates leaderboard.

💾 /backup create
• Saves a server backup.

♻️ /backup restore
• Restores a server backup.
      `);

    }

  }

});
// Continue slash command handler
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isChatInputCommand()) return;


  // /claim
  if (interaction.commandName === "claim") {

    if (!interaction.channel.name.startsWith("ticket-")) {
      return interaction.reply({
        content: "❌ This command can only be used inside a ticket.",
        ephemeral: true
      });
    }


    const messages = await interaction.channel.messages.fetch({
      limit: 100
    });


    const transcript = messages
      .sort((a,b) => a.createdTimestamp - b.createdTimestamp)
      .map(msg =>
        `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.username}: ${msg.content}`
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


    const logsChannel =
      interaction.guild.channels.cache.get(setup.logsChannel);


    if (logsChannel) {

      const file =
        new AttachmentBuilder(fileName);


      logsChannel.send({
        content:
        `📄 Transcript\nTicket: **${interaction.channel.name}**\nClaimed by: ${interaction.user}`,
        files: [file]
      });

    }


    let payment = 0;

    const ticketName =
      interaction.channel.name.toLowerCase();


    if (ticketName.includes("dono-")) {
      payment = 0.50;
    }
    else if (ticketName.includes("ingame")) {
      payment = 0.30;
    }
    else if (ticketName.includes("mod-map")) {
      payment = 3.00;
    }


    let claims = JSON.parse(
      fs.readFileSync(CLAIM_FILE)
    );


    if (!claims[interaction.user.id]) {

      claims[interaction.user.id] = {
        name: interaction.user.username,
        claims: 0,
        money: 0
      };

    }


    claims[interaction.user.id].claims += 1;
    claims[interaction.user.id].money += payment;


    fs.writeFileSync(
      CLAIM_FILE,
      JSON.stringify(claims, null, 2)
    );


    await interaction.reply(
      `✅ Ticket claimed!\n💰 Payment added: $${payment.toFixed(2)}`
    );

  }



  // /backup create
  if (
    interaction.commandName === "backup" &&
    interaction.options.getSubcommand() === "create"
  ) {

    const backup = {

      server: interaction.guild.name,

      roles: interaction.guild.roles.cache.map(role => ({
        name: role.name,
        permissions: role.permissions.toArray()
      })),

      channels: interaction.guild.channels.cache.map(channel => ({
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
      JSON.stringify(backups, null, 2)
    );


    interaction.reply("✅ Server backup saved!");

  }



  // /backup restore
  if (
    interaction.commandName === "backup" &&
    interaction.options.getSubcommand() === "restore"
  ) {


    const backups = JSON.parse(
      fs.readFileSync(BACKUP_FILE)
    );


    const backup =
      backups[interaction.guild.id];


    if (!backup) {
      return interaction.reply("❌ No backup found!");
    }


    for (const role of backup.roles) {

      if (role.name !== "@everyone") {

        await interaction.guild.roles.create({
          name: role.name,
          permissions: role.permissions
        });

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


    interaction.reply("✅ Server restore complete!");

  }

});
// Ticket button system
client.on("interactionCreate", async (interaction) => {

  if (!interaction.isButton()) return;


  if (interaction.customId === "open_ticket") {


    const channel = await interaction.guild.channels.create({

      name: `ticket-${interaction.user.username}`,

      type: ChannelType.GuildText,


      permissionOverwrites: [

        {
          id: interaction.guild.id,

          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
        },


        {
          id: interaction.user.id,

          allow: [
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

      content: `Ticket opened: ${channel}`,

      ephemeral: true

    });

  }

});


// Login
client.login(process.env.TOKEN);