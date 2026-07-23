const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
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

if (!fs.existsSync(SETUP_FILE)) {
  fs.writeFileSync(SETUP_FILE, "{}");
}

if (!fs.existsSync(CLAIM_FILE)) {
  fs.writeFileSync(CLAIM_FILE, "{}");
}
if (!fs.existsSync(BACKUP_FILE)) {
  fs.writeFileSync(BACKUP_FILE, "{}");
}

// Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});


client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});


// Messages
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;


  // Open ticket command
  if (message.content === "!ticket") {

    const button = new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("🎟️ Open Ticket")
      .setStyle(ButtonStyle.Primary);


    const row = new ActionRowBuilder()
      .addComponents(button);


    message.channel.send({
      content: "Click below to open a support ticket.",
      components: [row]
    });

  }


  // Setup command
  if (message.content === "!setup") {

    const setup = {
      logsChannel: message.channel.id
    };


    fs.writeFileSync(
      SETUP_FILE,
      JSON.stringify(setup, null, 2)
    );


    message.reply(
      `✅ Setup complete!\n📄 Transcripts: ${message.channel}\n🏆 Leaderboard: ${message.channel}`
    );

  }


  // Claim command starts here
  if (message.content === "!claim") {
      if (!message.channel.name.startsWith("ticket-")) {

      return message.reply(
        "❌ This command can only be used inside a ticket."
      );

    }


    const messages = await message.channel.messages.fetch({
      limit: 100
    });


    const transcript = messages
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(msg =>
        `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.username}: ${msg.content}`
      )
      .join("\n");


    const fileName =
      `${message.channel.name}-transcript.txt`;


    fs.writeFileSync(
      fileName,
      transcript
    );


    const setup = JSON.parse(
      fs.readFileSync(SETUP_FILE)
    );


    const logsChannel =
      message.guild.channels.cache.get(setup.logsChannel);


    if (logsChannel) {

      const file =
        new AttachmentBuilder(fileName);


      logsChannel.send({
        content:
        `📄 Transcript\nTicket: **${message.channel.name}**\nClaimed by: ${message.author}`,
        files: [file]
      });

    }


    let payment = 0;

    const ticketName = message.channel.name.toLowerCase();

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


    if (!claims[message.author.id]) {
      claims[message.author.id] = {
        name: message.author.username,
        claims: 0,
        money: 0
      };
    }


    claims[message.author.id].claims += 1;
    claims[message.author.id].money += payment;


    fs.writeFileSync(
      CLAIM_FILE,
      JSON.stringify(claims, null, 2)
    );


    const leaderboard = Object.values(claims)
      .sort((a, b) => b.money - a.money)
      .slice(0, 10)
      .map((user, index) =>
`${index + 1}. ${user.name}
🎟️ Claims: ${user.claims}
💰 Earned: $${user.money.toFixed(2)}`
      )
      .join("\n\n");


    if (logsChannel) {
      logsChannel.send(
`🏆 Claim Leaderboard

${leaderboard}`
      );
    }


    message.reply(
      `✅ Ticket claimed!\n💰 Payment added: $${payment.toFixed(2)}`
    );

  }


  // Info command
  if (message.content === "!info") {
    message.reply(`
🤖 **Bot Commands**

🎟️ !ticket
• Opens a support ticket.

⚙️ !setup
• Sets the transcript + leaderboard channel.

📋 !claim
• Claims a ticket.
• Saves transcript.
• Adds payment.
• Updates leaderboard.

ℹ️ !info
• Shows this command list.
`);
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


    channel.send(
      `<@${interaction.user.id}> Ticket created!`
    );


    interaction.reply({
      content: `Ticket opened: ${channel}`,
      ephemeral: true
    });

  }

});


client.login(process.env.TOKEN);