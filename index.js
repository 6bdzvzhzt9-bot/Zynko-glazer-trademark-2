// ============================================================
// ZYNKO DASHBOARD BOT — FULL SINGLE-FILE BUILD
// Discord.js v14
// ONLY COMMAND: /dashboard
// ============================================================

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ActivityType,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ============================================================
// KEEP ALIVE
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Dashboard bot is online!");
});

app.listen(process.env.PORT || 3000);

// ============================================================
// DATABASE
// ============================================================

const DATA_DIR = "./data";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const FILES = {
  servers: `${DATA_DIR}/servers.json`,
  templates: `${DATA_DIR}/templates.json`,
  automations: `${DATA_DIR}/automations.json`,
  moderation: `${DATA_DIR}/moderation.json`,
  messages: `${DATA_DIR}/messages.json`,
  transcripts: `${DATA_DIR}/transcripts.json`,
  embeds: `${DATA_DIR}/embeds.json`,
  audit: `${DATA_DIR}/audit.json`
};

for (const file of Object.values(FILES)) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "{}");
  }
}

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function save(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ============================================================
// COMMANDS
// ============================================================

const commands = [

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Open the bot dashboard")

].map(command => command.toJSON());

// ============================================================
// DASHBOARD ACCESS
// ============================================================

function canUseDashboard(member) {

  if (!member) return false;

  const allowedNames = [
    "Owner",
    "Manager"
  ];

  return member.roles.cache.some(role =>
    allowedNames.includes(role.name)
  );
}

// ============================================================
// SERVER DEFAULTS
// ============================================================

function getServer(guildId) {

  const servers = load(FILES.servers);

  if (!servers[guildId]) {

    servers[guildId] = {

      botNickname: null,

      botStatus: "Managing the server",

      timezone: "America/New_York",

      dashboardRoles: [
        "Owner",
        "Manager"
      ],

      automation: {

        autoRoles: false,
        autoChatLogs: false,
        autoDeleteLogs: false,
        autoWelcome: false,
        autoGoodbye: false,
        transcripts: false

      },

      channels: {

        chatLogs: null,
        deleteLogs: null,
        welcome: null,
        goodbye: null,
        transcripts: null

      },

      autoRoles: [],

      warnings: []

    };

    save(FILES.servers, servers);
  }

  return servers[guildId];
}

function updateServer(guildId, data) {

  const servers = load(FILES.servers);

  servers[guildId] = data;

  save(FILES.servers, servers);
}

// ============================================================
// AUDIT LOG
// ============================================================

function audit(guildId, user, action) {

  const data = load(FILES.audit);

  if (!data[guildId]) {
    data[guildId] = [];
  }

  data[guildId].push({

    userId: user.id,

    username: user.username,

    action,

    time: Date.now()

  });

  // Keep last 500 entries

  if (data[guildId].length > 500) {
    data[guildId] =
      data[guildId].slice(-500);
  }

  save(FILES.audit, data);
}

// ============================================================
// MESSAGE DATABASE
// ============================================================

function storeMessage(message) {

  if (!message.guild) return;

  const data = load(FILES.messages);

  if (!data[message.guild.id]) {
    data[message.guild.id] = {};
  }

  data[message.guild.id][message.id] = {

    id: message.id,

    userId: message.author.id,

    username: message.author.username,

    channelId: message.channel.id,

    channelName: message.channel.name,

    content: message.content,

    created: message.createdTimestamp,

    edited: false,

    deleted: false,

    deletedAt: null,

    editedAt: null

  };

  const entries =
    Object.values(data[message.guild.id]);

  // Keep the database manageable

  if (entries.length > 10000) {

    const sorted =
      entries.sort(
        (a, b) => a.created - b.created
      );

    const keep = sorted.slice(-10000);

    data[message.guild.id] = {};

    for (const msg of keep) {
      data[message.guild.id][msg.id] = msg;
    }
  }

  save(FILES.messages, data);
}

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on("messageCreate", async message => {

  if (message.author.bot) return;

  storeMessage(message);

  const server =
    getServer(message.guild.id);

  // Auto chat logs

  if (
    server.automation.autoChatLogs &&
    server.channels.chatLogs
  ) {

    const channel =
      message.guild.channels.cache.get(
        server.channels.chatLogs
      );

    if (channel) {

      const embed = new EmbedBuilder()
        .setTitle("💬 Message")
        .setDescription(
          message.content?.slice(0, 4000) ||
          "[No text]"
        )
        .addFields(
          {
            name: "User",
            value: `${message.author}`,
            inline: true
          },
          {
            name: "Channel",
            value: `${message.channel}`,
            inline: true
          }
        )
        .setTimestamp();

      channel.send({
        embeds: [embed]
      }).catch(() => {});
    }
  }

});

// ============================================================
// MESSAGE UPDATE
// ============================================================

client.on("messageUpdate", async (oldMessage, newMessage) => {

  if (!newMessage.guild) return;

  if (newMessage.author?.bot) return;

  const data = load(FILES.messages);

  if (!data[newMessage.guild.id]) {
    data[newMessage.guild.id] = {};
  }

  const oldContent =
    oldMessage.content ||
    data[newMessage.guild.id]?.[newMessage.id]?.content ||
    "";

  if (!data[newMessage.guild.id][newMessage.id]) {

    data[newMessage.guild.id][newMessage.id] = {

      id: newMessage.id,

      userId: newMessage.author?.id,

      username:
        newMessage.author?.username ||
        "Unknown",

      channelId: newMessage.channel.id,

      channelName:
        newMessage.channel.name,

      content:
        oldContent,

      created:
        newMessage.createdTimestamp,

      edited: false,

      deleted: false

    };
  }

  data[newMessage.guild.id][newMessage.id].edited = true;

  data[newMessage.guild.id][newMessage.id].editedAt =
    Date.now();

  data[newMessage.guild.id][newMessage.id].editedContent =
    newMessage.content;

  save(FILES.messages, data);

  const server =
    getServer(newMessage.guild.id);

  if (
    server.automation.autoChatLogs &&
    server.channels.chatLogs &&
    oldContent !== newMessage.content
  ) {

    const channel =
      newMessage.guild.channels.cache.get(
        server.channels.chatLogs
      );

    if (channel) {

      const embed = new EmbedBuilder()
        .setTitle("✏️ Message Edited")
        .addFields(
          {
            name: "User",
            value: `${newMessage.author}`,
            inline: true
          },
          {
            name: "Channel",
            value: `${newMessage.channel}`,
            inline: true
          },
          {
            name: "Before",
            value:
              oldContent.slice(0, 1000) ||
              "[Empty]"
          },
          {
            name: "After",
            value:
              newMessage.content.slice(0, 1000) ||
              "[Empty]"
          }
        )
        .setTimestamp();

      channel.send({
        embeds: [embed]
      }).catch(() => {});
    }
  }

});

// ============================================================
// MESSAGE DELETE
// ============================================================

client.on("messageDelete", async message => {

  if (!message.guild) return;

  const data = load(FILES.messages);

  if (!data[message.guild.id]) {
    data[message.guild.id] = {};
  }

  if (!data[message.guild.id][message.id]) {

    data[message.guild.id][message.id] = {

      id: message.id,

      userId:
        message.author?.id ||
        "unknown",

      username:
        message.author?.username ||
        "Unknown",

      channelId:
        message.channel?.id,

      channelName:
        message.channel?.name ||
        "Unknown",

      content:
        message.content ||
        "[Unknown]",

      created:
        message.createdTimestamp ||
        Date.now(),

      edited: false

    };
  }

  data[message.guild.id][message.id].deleted = true;

  data[message.guild.id][message.id].deletedAt =
    Date.now();

  save(FILES.messages, data);

  const server =
    getServer(message.guild.id);

  if (
    server.automation.autoDeleteLogs &&
    server.channels.deleteLogs
  ) {

    const channel =
      message.guild.channels.cache.get(
        server.channels.deleteLogs
      );

    if (channel) {

      const embed = new EmbedBuilder()
        .setTitle("🗑️ Message Deleted")
        .addFields(
          {
            name: "User",
            value:
              message.author
                ? `${message.author}`
                : "Unknown",
            inline: true
          },
          {
            name: "Channel",
            value:
              message.channel
                ? `${message.channel}`
                : "Unknown",
            inline: true
          },
          {
            name: "Content",
            value:
              message.content?.slice(0, 4000) ||
              "[No content captured]"
          }
        )
        .setTimestamp();

      channel.send({
        embeds: [embed]
      }).catch(() => {});
    }
  }

});

// ============================================================
// WELCOME / GOODBYE
// ============================================================

client.on("guildMemberAdd", async member => {

  const server =
    getServer(member.guild.id);

  if (
    server.automation.autoWelcome &&
    server.channels.welcome
  ) {

    const channel =
      member.guild.channels.cache.get(
        server.channels.welcome
      );

    if (channel) {

      channel.send(
        `👋 Welcome ${member} to **${member.guild.name}**!`
      ).catch(() => {});
    }
  }

  if (
    server.automation.autoRoles &&
    server.autoRoles.length
  ) {

    for (const roleId of server.autoRoles) {

      const role =
        member.guild.roles.cache.get(roleId);

      if (role) {

        member.roles.add(role)
          .catch(() => {});

      }
    }
  }

});

client.on("guildMemberRemove", async member => {

  const server =
    getServer(member.guild.id);

  if (
    server.automation.autoGoodbye &&
    server.channels.goodbye
  ) {

    const channel =
      member.guild.channels.cache.get(
        server.channels.goodbye
      );

    if (channel) {

      channel.send(
        `🚪 **${member.user.username}** left the server.`
      ).catch(() => {});
    }
  }

});

// ============================================================
// DASHBOARD MAIN EMBED
// ============================================================

function dashboardEmbed(guild) {

  return new EmbedBuilder()
    .setTitle("🖥️ Server Dashboard")
    .setDescription(
      `Welcome to the control panel for **${guild.name}**.\n\n` +
      `Choose a section below to manage the server.`
    )
    .addFields(
      {
        name: "🟢 Bot",
        value: "Online",
        inline: true
      },
      {
        name: "👥 Members",
        value: `${guild.memberCount}`,
        inline: true
      },
      {
        name: "⚠️ System",
        value: "No active warnings",
        inline: true
      }
    )
    .setTimestamp();
}

// ============================================================
// DASHBOARD BUTTONS
// ============================================================

function dashboardRows() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId("dash_overview")
        .setLabel("Overview")
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("dash_templates")
        .setLabel("Templates")
        .setEmoji("📦")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_automation")
        .setLabel("Automation")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_moderation")
        .setLabel("Moderation")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Secondary)

    ),

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId("dash_lookup")
        .setLabel("Look Up")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_embeds")
        .setLabel("Embeds")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_help")
        .setLabel("Help")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_settings")
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary)

    )

  ];
}

// ============================================================
// BACK BUTTON
// ============================================================

function backRow() {

  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId("dash_home")
      .setLabel("Dashboard")
      .setEmoji("🏠")
      .setStyle(ButtonStyle.Primary)

  );
}

// ============================================================
// AUTOMATION PAGE
// ============================================================

function automationPage(guild) {

  const server =
    getServer(guild.id);

  const on = value =>
    value ? "🟢 ON" : "🔴 OFF";

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("🤖 Automation")
        .setDescription(
          "Configure automatic server systems."
        )
        .addFields(

          {
            name: "🏷️ Auto Roles",
            value: on(
              server.automation.autoRoles
            ),
            inline: true
          },

          {
            name: "💬 Auto Chat Logs",
            value: on(
              server.automation.autoChatLogs
            ),
            inline: true
          },

          {
            name: "🗑️ Auto Delete Logs",
            value: on(
              server.automation.autoDeleteLogs
            ),
            inline: true
          },

          {
            name: "👋 Auto Welcome",
            value: on(
              server.automation.autoWelcome
            ),
            inline: true
          },

          {
            name: "🚪 Auto Goodbyes",
            value: on(
              server.automation.autoGoodbye
            ),
            inline: true
          },

          {
            name: "📑 Transcripts",
            value: on(
              server.automation.transcripts
            ),
            inline: true
          }

        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("auto_roles")
          .setLabel("Auto Roles")
          .setEmoji("🏷️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("auto_logs")
          .setLabel("Chat Logs")
          .setEmoji("💬")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("auto_delete")
          .setLabel("Delete Logs")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("auto_transcripts")
          .setLabel("Transcripts")
          .setEmoji("📑")
          .setStyle(ButtonStyle.Secondary)

      ),

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("auto_welcome")
          .setLabel("Welcome")
          .setEmoji("👋")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("auto_goodbye")
          .setLabel("Goodbye")
          .setEmoji("🚪")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("auto_channels")
          .setLabel("Channels")
          .setEmoji("📍")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// MODERATION PAGE
// ============================================================

function moderationPage() {

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("🛡️ Moderation")
        .setDescription(
          "Server moderation controls."
        )
        .addFields(
          {
            name: "🔇 Timeout",
            value: "Temporarily timeout a member.",
            inline: true
          },
          {
            name: "👢 Kick",
            value: "Remove a member.",
            inline: true
          },
          {
            name: "🔨 Ban",
            value: "Ban a member.",
            inline: true
          },
          {
            name: "🔓 Unban",
            value: "Remove a ban.",
            inline: true
          },
          {
            name: "⚠️ Warnings",
            value: "Manage warnings.",
            inline: true
          },
          {
            name: "🧹 Purge",
            value: "Delete messages.",
            inline: true
          },
          {
            name: "🔒 Channel Lock",
            value: "Lock the current channel.",
            inline: true
          },
          {
            name: "📜 History",
            value: "View moderation history.",
            inline: true
          },
          {
            name: "📝 Notes",
            value: "Manage moderator notes.",
            inline: true
          }
        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("mod_timeout")
          .setLabel("Timeout")
          .setEmoji("🔇")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("mod_kick")
          .setLabel("Kick")
          .setEmoji("👢")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("mod_ban")
          .setLabel("Ban")
          .setEmoji("🔨")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId("mod_unban")
          .setLabel("Unban")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Secondary)

      ),

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("mod_warning")
          .setLabel("Warnings")
          .setEmoji("⚠️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("mod_purge")
          .setLabel("Purge")
          .setEmoji("🧹")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("mod_lock")
          .setLabel("Channel Lock")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// SETTINGS PAGE
// ============================================================

function settingsPage(guild) {

  const server =
    getServer(guild.id);

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("⚙️ Settings")
        .setDescription(
          "Configure the bot and dashboard."
        )
        .addFields(

          {
            name: "🤖 Bot Name",
            value:
              server.botNickname ||
              "Default",
            inline: true
          },

          {
            name: "🟢 Bot Status",
            value:
              server.botStatus ||
              "Default",
            inline: true
          },

          {
            name: "🔐 Dashboard Roles",
            value:
              "👑 Owner\n🛠️ Manager",
            inline: true
          },

          {
            name: "🌎 Timezone",
            value:
              server.timezone,
            inline: true
          }

        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("settings_name")
          .setLabel("Bot Name")
          .setEmoji("🤖")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("settings_status")
          .setLabel("Bot Status")
          .setEmoji("🟢")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("settings_roles")
          .setLabel("Dashboard Access")
          .setEmoji("🔐")
          .setStyle(ButtonStyle.Secondary)

      ),

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("settings_timezone")
          .setLabel("Timezone")
          .setEmoji("🌎")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("settings_audit")
          .setLabel("Audit Log")
          .setEmoji("📜")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// HELP PAGE
// ============================================================

function helpPage() {

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("❓ Help")
        .setDescription(
          "Need help with the bot?"
        )
        .addFields(

          {
            name: "👤 Developer",
            value: "Your Name Here"
          },

          {
            name: "📩 Contact",
            value: "Add your contact information here."
          },

          {
            name: "🆘 Support",
            value: "Add your support server here."
          },

          {
            name: "🐛 Bug Reports",
            value: "Contact the developer with bug reports."
          },

          {
            name: "💡 Feature Suggestions",
            value: "Send suggestions through your support system."
          }

        )

    ],

    components: [
      backRow()
    ]

  };
}

// ============================================================
// TEMPLATES PAGE
// ============================================================

function templatesPage() {

  const templates =
    load(FILES.templates);

  const count =
    Object.keys(templates).length;

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("📦 Templates")
        .setDescription(
          "Save and load reusable server configurations."
        )
        .addFields(
          {
            name: "Templates",
            value: `${count}`,
            inline: true
          },
          {
            name: "Universal Loading",
            value: "✅ Available",
            inline: true
          }
        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("template_save")
          .setLabel("Save Template")
          .setEmoji("💾")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("template_load")
          .setLabel("Load Template")
          .setEmoji("📥")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("template_list")
          .setLabel("View Templates")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// EMBED PAGE
// ============================================================

function embedsPage() {

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("🎨 Embeds")
        .setDescription(
          "Create and manage Discord embeds."
        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("embed_create")
          .setLabel("Create Embed")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("embed_saved")
          .setLabel("Saved Embeds")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// LOOK UP PAGE
// ============================================================

function lookupPage() {

  return {

    embeds: [

      new EmbedBuilder()
        .setTitle("🔎 Look Up")
        .setDescription(
          "Admin Search searches the information the bot has legitimately recorded or can access."
        )
        .addFields(

          {
            name: "👤 User Search",
            value:
              "Search by username, mention, or ID."
          },

          {
            name: "💬 Messages",
            value:
              "Search recorded messages."
          },

          {
            name: "🗑️ Deleted Messages",
            value:
              "Shows messages captured before deletion."
          },

          {
            name: "✏️ Edited Messages",
            value:
              "Shows recorded message edits."
          },

          {
            name: "🧠 Related Messages",
            value:
              "Find similar messages from the same user."
          }

        )

    ],

    components: [

      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("lookup_user")
          .setLabel("Search User")
          .setEmoji("👤")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("lookup_message")
          .setLabel("Search Messages")
          .setEmoji("💬")
          .setStyle(ButtonStyle.Secondary)

      ),

      backRow()

    ]

  };
}

// ============================================================
// DASHBOARD SESSION STORAGE
// ============================================================

const sessions = new Map();

// ============================================================
// DASHBOARD COMMAND
// ============================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "dashboard") return;

  if (!interaction.guild) {

    return interaction.reply({
      content:
        "❌ The dashboard can only be used inside a server.",
      ephemeral: true
    });

  }

  if (!canUseDashboard(interaction.member)) {

    return interaction.reply({
      content:
        "❌ You need the **Owner** or **Manager** role to use the dashboard.",
      ephemeral: true
    });

  }

  const response =
    await interaction.reply({
      embeds: [
        dashboardEmbed(interaction.guild)
      ],
      components: dashboardRows(),
      ephemeral: true,
      fetchReply: true
    });

  const messageId = response.id;

  sessions.set(messageId, {
    userId: interaction.user.id,
    guildId: interaction.guild.id,
    expires: Date.now() + 300000
  });

  audit(
    interaction.guild.id,
    interaction.user,
    "Opened dashboard"
  );

  setTimeout(async () => {

    const session =
      sessions.get(messageId);

    if (!session) return;

    sessions.delete(messageId);

    const disabledRows =
      dashboardRows().map(row => {

        const newRow =
          new ActionRowBuilder();

        for (const component of row.components) {

          newRow.addComponents(
            ButtonBuilder.from(component)
              .setDisabled(true)
          );

        }

        return newRow;

      });

    try {

      await interaction.editReply({

        embeds: [

          new EmbedBuilder()
            .setTitle("⏱️ Dashboard Timed Out")
            .setDescription(
              "This dashboard session expired after 5 minutes.\n\n" +
              "Run `/dashboard` to open a new session."
            )

        ],

        components: disabledRows

      });

    } catch {}

  }, 300000);

});

// ============================================================
// DASHBOARD BUTTON HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isButton()) return;

  const session =
    sessions.get(interaction.message.id);

  if (!session) {

    return interaction.reply({
      content:
        "⏱️ This dashboard has timed out. Run `/dashboard` again.",
      ephemeral: true
    });

  }

  if (
    session.userId !== interaction.user.id
  ) {

    return interaction.reply({
      content:
        "❌ This dashboard belongs to another administrator.",
      ephemeral: true
    });

  }

  if (
    Date.now() > session.expires
  ) {

    sessions.delete(
      interaction.message.id
    );

    return interaction.reply({
      content:
        "⏱️ This dashboard has timed out.",
      ephemeral: true
    });

  }

  if (!canUseDashboard(interaction.member)) {

    return interaction.reply({
      content:
        "❌ You no longer have dashboard access.",
      ephemeral: true
    });

  }

  const id =
    interaction.customId;

  // ----------------------------------------------------------
  // HOME
  // ----------------------------------------------------------

  if (
    id === "dash_home" ||
    id === "dash_overview"
  ) {

    return interaction.update({
      embeds: [
        dashboardEmbed(interaction.guild)
      ],
      components: dashboardRows()
    });

  }

  // ----------------------------------------------------------
  // TEMPLATES
  // ----------------------------------------------------------

  if (id === "dash_templates") {

    const page =
      templatesPage();

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // AUTOMATION
  // ----------------------------------------------------------

  if (id === "dash_automation") {

    const page =
      automationPage(interaction.guild);

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // MODERATION
  // ----------------------------------------------------------

  if (id === "dash_moderation") {

    const page =
      moderationPage();

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // LOOK UP
  // ----------------------------------------------------------

  if (id === "dash_lookup") {

    const page =
      lookupPage();

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // EMBEDS
  // ----------------------------------------------------------

  if (id === "dash_embeds") {

    const page =
      embedsPage();

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // HELP
  // ----------------------------------------------------------

  if (id === "dash_help") {

    const page =
      helpPage();

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------------

  if (id === "dash_settings") {

    const page =
      settingsPage(interaction.guild);

    return interaction.update(page);

  }

  // ----------------------------------------------------------
  // AUTOMATION TOGGLES
  // ----------------------------------------------------------

  if (id.startsWith("auto_")) {

    const server =
      getServer(interaction.guild.id);

    if (id === "auto_roles") {

      server.automation.autoRoles =
        !server.automation.autoRoles;

      audit(
        interaction.guild.id,
        interaction.user,
        `Auto Roles ${
          server.automation.autoRoles
            ? "enabled"
            : "disabled"
        }`
      );

    }

    if (id === "auto_logs") {

      server.automation.autoChatLogs =
        !server.automation.autoChatLogs;

      audit(
        interaction.guild.id,
        interaction.user,
        `Auto Chat Logs ${
          server.automation.autoChatLogs
            ? "enabled"
            : "disabled"
        }`
      );

    }

    if (id === "auto_delete") {

      server.automation.autoDeleteLogs =
        !server.automation.autoDeleteLogs;

      audit(
        interaction.guild.id,
        interaction.user,
        `Auto Delete Logs ${
          server.automation.autoDeleteLogs
            ? "enabled"
            : "disabled"
        }`
      );

    }

    if (id === "auto_welcome") {

      server.automation.autoWelcome =
        !server.automation.autoWelcome;

      audit(
        interaction.guild.id,
        interaction.user,
        `Auto Welcome ${
          server.automation.autoWelcome
            ? "enabled"
            : "disabled"
        }`
      );

    }

    if (id === "auto_goodbye") {

      server.automation.autoGoodbye =
        !server.automation.autoGoodbye;

      audit(
        interaction.guild.id,
        interaction.user,
        `Auto Goodbye ${
          server.automation.autoGoodbye
            ? "enabled"
            : "disabled"
        }`
      );

    }

    if (id === "auto_transcripts") {

      server.automation.transcripts =
        !server.automation.transcripts;

      audit(
        interaction.guild.id,
        interaction.user,
        `Transcripts ${
          server.automation.transcripts
            ? "enabled"
            : "disabled"
        }`
      );

    }

    updateServer(
      interaction.guild.id,
      server
    );

    return interaction.update(
      automationPage(interaction.guild)
    );

  }

  // ----------------------------------------------------------
  // AUTO CHANNEL SETUP
  // ----------------------------------------------------------

  if (id === "auto_channels") {

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📍 Automation Channels")
          .setDescription(
            "Choose which channels receive each automatic system."
          )

      ],

      components: [

        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("channel_chatlogs")
            .setLabel("Chat Logs")
            .setEmoji("💬")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("channel_deletelogs")
            .setLabel("Delete Logs")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("channel_welcome")
            .setLabel("Welcome")
            .setEmoji("👋")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("channel_goodbye")
            .setLabel("Goodbye")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Secondary)

        ),

        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("channel_transcripts")
            .setLabel("Transcripts")
            .setEmoji("📑")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("dash_automation")
            .setLabel("Back")
            .setEmoji("↩️")
            .setStyle(ButtonStyle.Primary)

        )

      ]

    });

  }

  // ----------------------------------------------------------
  // CHANNEL SELECTORS
  // ----------------------------------------------------------

  if (id.startsWith("channel_")) {

    let type = null;

    if (id === "channel_chatlogs")
      type = "chatLogs";

    if (id === "channel_deletelogs")
      type = "deleteLogs";

    if (id === "channel_welcome")
      type = "welcome";

    if (id === "channel_goodbye")
      type = "goodbye";

    if (id === "channel_transcripts")
      type = "transcripts";

    if (!type) return;

    const select =
      new ChannelSelectMenuBuilder()
        .setCustomId(
          `select_channel_${type}`
        )
        .setPlaceholder(
          "Choose a channel"
        )
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        );

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📍 Select Channel")
          .setDescription(
            `Choose the channel for **${type}**.`
          )

      ],

      components: [

        new ActionRowBuilder()
          .addComponents(select),

        backRow()

      ]

    });

  }

  // ----------------------------------------------------------
  // TEMPLATE SAVE
  // ----------------------------------------------------------

  if (id === "template_save") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_template_save")
        .setTitle("Save Template");

    const name =
      new TextInputBuilder()
        .setCustomId("template_name")
        .setLabel("Template Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(name)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // TEMPLATE LOAD
  // ----------------------------------------------------------

  if (id === "template_load") {

    const templates =
      load(FILES.templates);

    const names =
      Object.keys(templates);

    if (!names.length) {

      return interaction.reply({
        content:
          "📦 No templates have been saved yet.",
        ephemeral: true
      });

    }

    const options =
      names.slice(0, 25).map(name => ({

        label: name.slice(0, 100),

        value: name

      }));

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId("template_select_load")
        .setPlaceholder("Choose a template")
        .addOptions(options);

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📥 Load Template")
          .setDescription(
            "Choose a saved template."
          )

      ],

      components: [

        new ActionRowBuilder()
          .addComponents(menu),

        backRow()

      ]

    });

  }

  // ----------------------------------------------------------
  // TEMPLATE LIST
  // ----------------------------------------------------------

  if (id === "template_list") {

    const templates =
      load(FILES.templates);

    const names =
      Object.keys(templates);

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📋 Saved Templates")
          .setDescription(
            names.length
              ? names.map(
                  (name, i) =>
                    `**${i + 1}.** ${name}`
                ).join("\n")
              : "No templates saved."
          )

      ],

      components: [
        backRow()
      ]

    });

  }

  // ----------------------------------------------------------
  // LOOKUP USER
  // ----------------------------------------------------------

  if (id === "lookup_user") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_lookup_user")
        .setTitle("Admin Search");

    const query =
      new TextInputBuilder()
        .setCustomId("lookup_query")
        .setLabel(
          "Username, mention, or User ID"
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(query)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // LOOKUP MESSAGE
  // ----------------------------------------------------------

  if (id === "lookup_message") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_lookup_message")
        .setTitle("Message Search");

    const query =
      new TextInputBuilder()
        .setCustomId("message_query")
        .setLabel("Search text")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(query)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // MODERATION MODALS
  // ----------------------------------------------------------

  if (
    id === "mod_timeout" ||
    id === "mod_kick" ||
    id === "mod_ban" ||
    id === "mod_warning"
  ) {

    const modal =
      new ModalBuilder()
        .setCustomId(
          `modal_${id}`
        )
        .setTitle(
          id === "mod_timeout"
            ? "Timeout Member"
            : id === "mod_kick"
            ? "Kick Member"
            : id === "mod_ban"
            ? "Ban Member"
            : "Warn Member"
        );

    const user =
      new TextInputBuilder()
        .setCustomId("target")
        .setLabel("User ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const reason =
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    modal.addComponents(

      new ActionRowBuilder()
        .addComponents(user),

      new ActionRowBuilder()
        .addComponents(reason)

    );

    if (id === "mod_timeout") {

      const duration =
        new TextInputBuilder()
          .setCustomId("duration")
          .setLabel("Timeout minutes")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(duration)
      );

    }

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // PURGE
  // ----------------------------------------------------------

  if (id === "mod_purge") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_purge")
        .setTitle("Purge Messages");

    const amount =
      new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Number of messages")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(amount)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // CHANNEL LOCK
  // ----------------------------------------------------------

  if (id === "mod_lock") {

    const channel =
      interaction.channel;

    if (!channel.permissionsFor(
      interaction.guild.members.me
    )?.has(
      PermissionsBitField.Flags.ManageChannels
    )) {

      return interaction.reply({
        content:
          "❌ I don't have Manage Channels permission.",
        ephemeral: true
      });

    }

    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: false
      }
    ).catch(() => {});

    audit(
      interaction.guild.id,
      interaction.user,
      `Locked #${channel.name}`
    );

    return interaction.reply({
      content:
        `🔒 ${channel} has been locked.`,
      ephemeral: true
    });

  }

  // ----------------------------------------------------------
  // SETTINGS BOT NAME
  // ----------------------------------------------------------

  if (id === "settings_name") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_bot_name")
        .setTitle("Change Bot Name");

    const name =
      new TextInputBuilder()
        .setCustomId("bot_name")
        .setLabel("Server nickname")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(32);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(name)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // SETTINGS STATUS
  // ----------------------------------------------------------

  if (id === "settings_status") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_bot_status")
        .setTitle("Change Bot Status");

    const status =
      new TextInputBuilder()
        .setCustomId("bot_status")
        .setLabel("Activity text")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(128);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(status)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // SETTINGS ROLES
  // ----------------------------------------------------------

  if (id === "settings_roles") {

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("🔐 Dashboard Access")
          .setDescription(
            "The dashboard currently requires one of these roles:\n\n" +
            "👑 **Owner**\n" +
            "🛠️ **Manager**\n\n" +
            "Members without either role cannot activate `/dashboard`."
          )

      ],

      components: [
        backRow()
      ]

    });

  }

  // ----------------------------------------------------------
  // SETTINGS TIMEZONE
  // ----------------------------------------------------------

  if (id === "settings_timezone") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_timezone")
        .setTitle("Server Timezone");

    const timezone =
      new TextInputBuilder()
        .setCustomId("timezone")
        .setLabel("Timezone")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(
          "America/New_York"
        )
        .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(timezone)
    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // AUDIT LOG
  // ----------------------------------------------------------

  if (id === "settings_audit") {

    const logs =
      load(FILES.audit);

    const guildLogs =
      logs[interaction.guild.id] || [];

    const last =
      guildLogs.slice(-15).reverse();

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📜 Dashboard Audit Log")
          .setDescription(

            last.length

              ? last.map(entry =>
                `<t:${Math.floor(entry.time / 1000)}:R> — ` +
                `**${entry.username}** — ${entry.action}`
              ).join("\n")

              : "No dashboard activity recorded."

          )

      ],

      components: [
        backRow()
      ]

    });

  }

  // ----------------------------------------------------------
  // EMBED CREATE
  // ----------------------------------------------------------

  if (id === "embed_create") {

    const modal =
      new ModalBuilder()
        .setCustomId("modal_embed_create")
        .setTitle("Create Embed");

    const title =
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Title")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const description =
      new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Description")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const footer =
      new TextInputBuilder()
        .setCustomId("footer")
        .setLabel("Footer")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(

      new ActionRowBuilder()
        .addComponents(title),

      new ActionRowBuilder()
        .addComponents(description),

      new ActionRowBuilder()
        .addComponents(footer)

    );

    return interaction.showModal(modal);

  }

  // ----------------------------------------------------------
  // SAVED EMBEDS
  // ----------------------------------------------------------

  if (id === "embed_saved") {

    const embeds =
      load(FILES.embeds);

    const guildEmbeds =
      embeds[interaction.guild.id] || {};

    const names =
      Object.keys(guildEmbeds);

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("📋 Saved Embeds")
          .setDescription(
            names.length
              ? names.join("\n")
              : "No saved embeds."
          )

      ],

      components: [
        backRow()
      ]

    });

  }

});

// ============================================================
// SELECT MENU HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isAnySelectMenu()) return;

  const session =
    sessions.get(interaction.message.id);

  if (!session) {

    return interaction.reply({
      content:
        "⏱️ This dashboard has timed out.",
      ephemeral: true
    });

  }

  if (
    session.userId !== interaction.user.id
  ) {

    return interaction.reply({
      content:
        "❌ This dashboard belongs to another administrator.",
      ephemeral: true
    });

  }

  // ----------------------------------------------------------
  // CHANNEL SELECT
  // ----------------------------------------------------------

  if (
    interaction.customId.startsWith(
      "select_channel_"
    )
  ) {

    const type =
      interaction.customId
        .replace(
          "select_channel_",
          ""
        );

    const channelId =
      interaction.values[0];

    const server =
      getServer(interaction.guild.id);

    server.channels[type] =
      channelId;

    updateServer(
      interaction.guild.id,
      server
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Set ${type} channel to ${channelId}`
    );

    return interaction.update(
      automationPage(interaction.guild)
    );

  }

  // ----------------------------------------------------------
  // TEMPLATE LOAD
  // ----------------------------------------------------------

  if (
    interaction.customId ===
    "template_select_load"
  ) {

    const name =
      interaction.values[0];

    const templates =
      load(FILES.templates);

    const template =
      templates[name];

    if (!template) {

      return interaction.reply({
        content:
          "❌ Template no longer exists.",
        ephemeral: true
      });

    }

    await restoreTemplate(
      interaction.guild,
      template
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Loaded template "${name}"`
    );

    return interaction.update({

      embeds: [

        new EmbedBuilder()
          .setTitle("✅ Template Loaded")
          .setDescription(
            `**${name}** has been loaded into this server.`
          )

      ],

      components: [
        backRow()
      ]

    });

  }

});

// ============================================================
// MODALS
// ============================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isModalSubmit()) return;

  // ========================================================
  // SAVE TEMPLATE
  // ========================================================

  if (
    interaction.customId ===
    "modal_template_save"
  ) {

    const name =
      interaction.fields.getTextInputValue(
        "template_name"
      );

    const template =
      await createTemplate(
        interaction.guild
      );

    const templates =
      load(FILES.templates);

    templates[name] = template;

    save(
      FILES.templates,
      templates
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Saved template "${name}"`
    );

    return interaction.reply({
      content:
        `📦 Template **${name}** saved and can be loaded into another server.`,
      ephemeral: true
    });

  }

  // ========================================================
  // USER LOOKUP
  // ========================================================

  if (
    interaction.customId ===
    "modal_lookup_user"
  ) {

    const query =
      interaction.fields.getTextInputValue(
        "lookup_query"
      ).trim();

    const member =
      findMember(
        interaction.guild,
        query
      );

    if (!member) {

      return interaction.reply({
        content:
          "❌ I couldn't find that member.",
        ephemeral: true
      });

    }

    const result =
      await createUserLookup(
        interaction.guild,
        member
      );

    return interaction.reply({
      embeds: [result],
      ephemeral: true
    });

  }

  // ========================================================
  // MESSAGE LOOKUP
  // ========================================================

  if (
    interaction.customId ===
    "modal_lookup_message"
  ) {

    const query =
      interaction.fields.getTextInputValue(
        "message_query"
      ).toLowerCase();

    const data =
      load(FILES.messages);

    const guildData =
      data[interaction.guild.id] || {};

    const results =
      Object.values(guildData)
        .filter(message =>
          message.content &&
          message.content
            .toLowerCase()
            .includes(query)
        )
        .sort(
          (a, b) =>
            b.created - a.created
        )
        .slice(0, 10);

    if (!results.length) {

      return interaction.reply({
        content:
          "🔎 No matching recorded messages found.",
        ephemeral: true
      });

    }

    const text =
      results.map(message => {

        const state =
          message.deleted
            ? "🗑️"
            : message.edited
            ? "✏️"
            : "💬";

        return (
          `${state} **${message.username}** ` +
          `in <#${message.channelId}>\n` +
          `> ${message.content.slice(0, 500)}`
        );

      }).join("\n\n");

    return interaction.reply({

      embeds: [

        new EmbedBuilder()
          .setTitle("🔎 Message Search")
          .setDescription(text)

      ],

      ephemeral: true

    });

  }

  // ========================================================
  // BOT NAME
  // ========================================================

  if (
    interaction.customId ===
    "modal_bot_name"
  ) {

    const name =
      interaction.fields.getTextInputValue(
        "bot_name"
      );

    const server =
      getServer(interaction.guild.id);

    server.botNickname = name;

    updateServer(
      interaction.guild.id,
      server
    );

    await interaction.guild.members.me
      ?.setNickname(name)
      .catch(() => {});

    audit(
      interaction.guild.id,
      interaction.user,
      `Changed bot nickname to "${name}"`
    );

    return interaction.reply({
      content:
        `🤖 Bot nickname changed to **${name}**.`,
      ephemeral: true
    });

  }

  // ========================================================
  // BOT STATUS
  // ========================================================

  if (
    interaction.customId ===
    "modal_bot_status"
  ) {

    const status =
      interaction.fields.getTextInputValue(
        "bot_status"
      );

    const server =
      getServer(interaction.guild.id);

    server.botStatus = status;

    updateServer(
      interaction.guild.id,
      server
    );

    client.user.setActivity(
      status,
      {
        type:
          ActivityType.Watching
      }
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Changed bot status to "${status}"`
    );

    return interaction.reply({
      content:
        `🟢 Bot status changed to **${status}**.`,
      ephemeral: true
    });

  }

  // ========================================================
  // TIMEZONE
  // ========================================================

  if (
    interaction.customId ===
    "modal_timezone"
  ) {

    const timezone =
      interaction.fields.getTextInputValue(
        "timezone"
      );

    const server =
      getServer(interaction.guild.id);

    server.timezone =
      timezone;

    updateServer(
      interaction.guild.id,
      server
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Changed timezone to "${timezone}"`
    );

    return interaction.reply({
      content:
        `🌎 Timezone set to **${timezone}**.`,
      ephemeral: true
    });

  }

  // ========================================================
  // EMBED CREATION
  // ========================================================

  if (
    interaction.customId ===
    "modal_embed_create"
  ) {

    const title =
      interaction.fields.getTextInputValue(
        "title"
      );

    const description =
      interaction.fields.getTextInputValue(
        "description"
      );

    const footer =
      interaction.fields.getTextInputValue(
        "footer"
      );

    const embed =
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(description);

    if (footer) {
      embed.setFooter({
        text: footer
      });
    }

    const embeds =
      load(FILES.embeds);

    if (!embeds[interaction.guild.id]) {
      embeds[interaction.guild.id] = {};
    }

    const id =
      `embed_${Date.now()}`;

    embeds[interaction.guild.id][id] = {

      title,

      description,

      footer,

      created:
        Date.now()

    };

    save(
      FILES.embeds,
      embeds
    );

    audit(
      interaction.guild.id,
      interaction.user,
      `Created embed ${id}`
    );

    return interaction.reply({

      embeds: [embed],

      content:
        `🎨 Embed created and saved as **${id}**.`,

      ephemeral: true

    });

  }

  // ========================================================
  // MODERATION
  // ========================================================

  if (
    interaction.customId.startsWith(
      "modal_mod_"
    )
  ) {

    const action =
      interaction.customId
        .replace("modal_", "");

    const targetId =
      interaction.fields.getTextInputValue(
        "target"
      );

    const reason =
      interaction.fields.getTextInputValue(
        "reason"
      ) ||
      "No reason provided.";

    const member =
      await interaction.guild.members
        .fetch(targetId)
        .catch(() => null);

    if (!member) {

      return interaction.reply({
        content:
          "❌ Member not found.",
        ephemeral: true
      });

    }

    try {

      if (
        action ===
        "mod_timeout"
      ) {

        const duration =
          Number(
            interaction.fields.getTextInputValue(
              "duration"
            )
          );

        if (
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 40320
        ) {

          return interaction.reply({
            content:
              "❌ Timeout must be between 1 and 40320 minutes.",
            ephemeral: true
          });

        }

        await member.timeout(
          duration * 60 * 1000,
          reason
        );

      }

      if (
        action ===
        "mod_kick"
      ) {

        await member.kick(reason);

      }

      if (
        action ===
        "mod_ban"
      ) {

        await member.ban({
          reason
        });

      }

      if (
        action ===
        "mod_warning"
      ) {

        const moderation =
          load(FILES.moderation);

        if (!moderation[interaction.guild.id]) {
          moderation[interaction.guild.id] = {};
        }

        if (
          !moderation[interaction.guild.id][targetId]
        ) {

          moderation[
            interaction.guild.id
          ][targetId] = {
            warnings: [],
            notes: []
          };

        }

        moderation[
          interaction.guild.id
        ][targetId].warnings.push({

          moderator:
            interaction.user.id,

          reason,

          time:
            Date.now()

        });

        save(
          FILES.moderation,
          moderation
        );

      }

      audit(
        interaction.guild.id,
        interaction.user,
        `${action} ${member.user.username}: ${reason}`
      );

      return interaction.reply({

        content:
          `✅ ${action.replace(
            "mod_",
            ""
          )} completed for **${member.user.username}**.`,

        ephemeral: true

      });

    } catch (error) {

      console.error(error);

      return interaction.reply({
        content:
          "❌ I couldn't complete that moderation action. Check my permissions and role hierarchy.",
        ephemeral: true
      });

    }

  }

  // ========================================================
  // PURGE
  // ========================================================

  if (
    interaction.customId ===
    "modal_purge"
  ) {

    const amount =
      Number(
        interaction.fields.getTextInputValue(
          "amount"
        )
      );

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100
    ) {

      return interaction.reply({
        content:
          "❌ Enter a number between 1 and 100.",
        ephemeral: true
      });

    }

    const deleted =
      await interaction.channel
        .bulkDelete(amount, true)
        .catch(() => null);

    if (!deleted) {

      return interaction.reply({
        content:
          "❌ I couldn't delete those messages.",
        ephemeral: true
      });

    }

    audit(
      interaction.guild.id,
      interaction.user,
      `Purged ${deleted.size} messages in #${interaction.channel.name}`
    );

    return interaction.reply({
      content:
        `🧹 Deleted **${deleted.size}** messages.`,
      ephemeral: true
    });

  }

});

// ============================================================
// FIND MEMBER
// ============================================================

function findMember(guild, query) {

  query =
    query
      .replace(/[<@!>]/g, "")
      .trim();

  if (/^\d+$/.test(query)) {

    return guild.members.cache.get(
      query
    ) || null;

  }

  const lower =
    query.toLowerCase();

  return guild.members.cache.find(
    member =>
      member.user.username
        .toLowerCase() === lower ||

      member.displayName
        .toLowerCase() === lower ||

      member.user.tag
        ?.toLowerCase() === lower
  ) || null;
}

// ============================================================
// USER LOOKUP
// ============================================================

async function createUserLookup(
  guild,
  member
) {

  const messages =
    load(FILES.messages);

  const guildMessages =
    Object.values(
      messages[guild.id] || {}
    );

  const userMessages =
    guildMessages
      .filter(
        message =>
          message.userId ===
          member.user.id
      )
      .sort(
        (a, b) =>
          b.created - a.created
      );

  const lastMessages =
    userMessages
      .slice(0, 5)
      .map(message => {

        const icon =
          message.deleted
            ? "🗑️"
            : message.edited
            ? "✏️"
            : "💬";

        return (
          `${icon} <#${message.channelId}> — ` +
          message.content.slice(0, 250)
        );

      })
      .join("\n") ||
      "No recorded messages.";

  const deleted =
    userMessages.filter(
      message =>
        message.deleted
    ).length;

  const edited =
    userMessages.filter(
      message =>
        message.edited
    ).length;

  const moderation =
    load(FILES.moderation);

  const modData =
    moderation[guild.id]?.[
      member.user.id
    ];

  const warnings =
    modData?.warnings?.length ||
    0;

  const roles =
    member.roles.cache
      .filter(
        role =>
          role.id !== guild.id
      )
      .map(
        role => role.toString()
      )
      .slice(0, 20)
      .join(", ") ||
    "No roles";

  return new EmbedBuilder()

    .setTitle(
      `🔎 Admin Search — ${member.user.username}`
    )

    .setThumbnail(
      member.user.displayAvatarURL()
    )

    .addFields(

      {
        name: "👤 Identity",
        value:
          `Username: **${member.user.username}**\n` +
          `Display: **${member.displayName}**\n` +
          `ID: \`${member.user.id}\``,
        inline: false
      },

      {
        name: "🏷️ Roles",
        value: roles,
        inline: false
      },

      {
        name: "📅 Joined",
        value:
          member.joinedTimestamp
            ? `<t:${Math.floor(
                member.joinedTimestamp / 1000
              )}:F>`
            : "Unknown",
        inline: true
      },

      {
        name: "💬 Recorded Messages",
        value:
          `${userMessages.length}`,
        inline: true
      },

      {
        name: "🗑️ Deleted",
        value:
          `${deleted}`,
        inline: true
      },

      {
        name: "✏️ Edited",
        value:
          `${edited}`,
        inline: true
      },

      {
        name: "⚠️ Warnings",
        value:
          `${warnings}`,
        inline: true
      },

      {
        name: "💬 Last Messages",
        value:
          lastMessages.slice(0, 1000),
        inline: false
      }

    )

    .setTimestamp();
}

// ============================================================
// RELATED MESSAGE SEARCH
// ============================================================

function similarity(a, b) {

  const first =
    new Set(
      a
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2)
    );

  const second =
    new Set(
      b
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2)
    );

  if (!first.size || !second.size)
    return 0;

  let matches = 0;

  for (const word of first) {

    if (second.has(word)) {
      matches++;
    }

  }

  return matches /
    Math.max(
      first.size,
      second.size
    );
}

// ============================================================
// TEMPLATE CREATION
// ============================================================

async function createTemplate(guild) {

  const roles =
    guild.roles.cache
      .filter(
        role =>
          role.name !== "@everyone"
      )
      .map(role => ({

        name: role.name,

        color: role.color,

        permissions:
          role.permissions.bitfield.toString(),

        hoist:
          role.hoist,

        mentionable:
          role.mentionable

      }));

  const channels =
    guild.channels.cache
      .sort(
        (a, b) =>
          a.rawPosition - b.rawPosition
      )
      .map(channel => ({

        name: channel.name,

        type: channel.type,

        parent:
          channel.parent?.name ||
          null,

        position:
          channel.rawPosition

      }));

  return {

    sourceGuild:
      guild.id,

    sourceName:
      guild.name,

    created:
      Date.now(),

    roles,

    channels

  };

}

// ============================================================
// TEMPLATE RESTORE
// ============================================================

async function restoreTemplate(
  guild,
  template
) {

  const roleMap =
    new Map();

  for (const role of template.roles || []) {

    const existing =
      guild.roles.cache.find(
        current =>
          current.name ===
          role.name
      );

    if (existing) {

      roleMap.set(
        role.name,
        existing.id
      );

      continue;

    }

    const created =
      await guild.roles.create({

        name:
          role.name,

        color:
          role.color,

        permissions:
          BigInt(
            role.permissions || 0
          ),

        hoist:
          role.hoist || false,

        mentionable:
          role.mentionable || false

      }).catch(() => null);

    if (created) {

      roleMap.set(
        role.name,
        created.id
      );

    }

  }

  const categories =
    new Map();

  for (
    const channel
    of template.channels || []
  ) {

    if (
      channel.type !==
      ChannelType.GuildCategory
    ) continue;

    const existing =
      guild.channels.cache.find(
        current =>
          current.name ===
            channel.name &&
          current.type ===
            ChannelType.GuildCategory
      );

    if (existing) {

      categories.set(
        channel.name,
        existing.id
      );

      continue;

    }

    const created =
      await guild.channels.create({

        name:
          channel.name,

        type:
          ChannelType.GuildCategory

      }).catch(() => null);

    if (created) {

      categories.set(
        channel.name,
        created.id
      );

    }

  }

  for (
    const channel
    of template.channels || []
  ) {

    if (
      channel.type ===
      ChannelType.GuildCategory
    ) continue;

    const existing =
      guild.channels.cache.find(
        current =>
          current.name ===
            channel.name &&
          current.type ===
            channel.type
      );

    if (existing) continue;

    await guild.channels.create({

      name:
        channel.name,

      type:
        channel.type,

      parent:
        categories.get(
          channel.parent
        ) || null

    }).catch(() => {});

  }

}

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {

  console.log(
    `${client.user.tag} online`
  );

  client.user.setActivity(
    "Server Dashboard",
    {
      type:
        ActivityType.Watching
    }
  );

  const rest =
    new REST({
      version: "10"
    }).setToken(
      process.env.TOKEN
    );

  await rest.put(

    Routes.applicationCommands(
      client.user.id
    ),

    {
      body:
        commands
    }

  );

  console.log(
    "Only /dashboard registered."
  );

});

// ============================================================
// ERROR HANDLING
// ============================================================

client.on(
  "error",
  console.error
);

process.on(
  "unhandledRejection",
  console.error
);

process.on(
  "uncaughtException",
  console.error
);

// ============================================================
// LOGIN
// ============================================================

client.login(
  process.env.TOKEN
);