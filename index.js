// ============================================================
// ZYNKO CONTROL BOT
// FULL SINGLE-FILE VERSION
// ============================================================

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing.");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const DB_FILE = "./database.json";

// ============================================================
// KEEP ALIVE
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Zynko Control Bot is online!");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    online: true,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

// ============================================================
// DATABASE
// ============================================================

const DEFAULT_GUILD = {
  channels: {
    transcripts: null,
    logs: null,
    welcome: null,
    goodbye: null,
    moderation: null
  },

  roles: {
    autoRole: null
  },

  automation: {
    transcripts: true,
    autoJoins: false,
    autoGoodbyes: false,
    autoDeleteLogs: false,
    autoChatLogs: false,
    autoRoles: false
  },

  moderation: {
    warnings: true,
    automod: false,
    antiSpam: false,
    antiLinks: false,
    antiMassMention: false
  },

  settings: {
    botName: null
  },

  templates: [],

  embeds: [],

  warnings: {},

  messageLog: {},

  setupComplete: false
};

function ensureDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ guilds: {} }, null, 2)
    );
  }
}

ensureDatabase();

function loadDB() {
  try {
    return JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );
  } catch (error) {
    console.error("Database read error:", error);

    return {
      guilds: {}
    };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("Database save error:", error);
  }
}

function cloneDefault() {
  return JSON.parse(
    JSON.stringify(DEFAULT_GUILD)
  );
}

function getGuildData(guildId) {
  const db = loadDB();

  if (!db.guilds[guildId]) {
    db.guilds[guildId] = cloneDefault();
    saveDB(db);
  }

  return db.guilds[guildId];
}

function updateGuild(guildId, data) {
  const db = loadDB();

  db.guilds[guildId] = data;

  saveDB(db);
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================================================
// DASHBOARD SESSIONS
// ============================================================

const dashboardSessions = new Map();

const SESSION_TIME = 5 * 60 * 1000;

function createSession(messageId, userId) {
  const expires = Date.now() + SESSION_TIME;

  dashboardSessions.set(messageId, {
    userId,
    expires
  });

  setTimeout(() => {
    dashboardSessions.delete(messageId);
  }, SESSION_TIME + 1000);
}

function sessionIsValid(interaction) {
  const messageId = interaction.message?.id;

  if (!messageId) {
    return false;
  }

  const session = dashboardSessions.get(messageId);

  if (!session) {
    return false;
  }

  if (Date.now() > session.expires) {
    dashboardSessions.delete(messageId);
    return false;
  }

  if (session.userId !== interaction.user.id) {
    return false;
  }

  return true;
}

// ============================================================
// ACCESS
// ============================================================

function dashboardAccess(member, guild) {
  if (!member || !guild) {
    return false;
  }

  if (guild.ownerId === member.id) {
    return true;
  }

  const permissions = member.permissions;

  if (
    permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  if (
    permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) {
    return true;
  }

  const canManageChannels =
    permissions.has(
      PermissionsBitField.Flags.ManageChannels
    );

  const canManageRoles =
    permissions.has(
      PermissionsBitField.Flags.ManageRoles
    );

  return canManageChannels && canManageRoles;
}

async function requireDashboard(interaction) {
  if (
    !interaction.guild ||
    !dashboardAccess(
      interaction.member,
      interaction.guild
    )
  ) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content:
          "❌ You don't have permission to use the dashboard.",
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content:
          "❌ You don't have permission to use the dashboard.",
        ephemeral: true
      }).catch(() => {});
    }

    return false;
  }

  return true;
}

// ============================================================
// EMBED HELPERS
// ============================================================

function status(value) {
  return value
    ? "🟢 Enabled"
    : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!id) {
    return "Not configured";
  }

  const channel = guild.channels.cache.get(id);

  return channel
    ? `<#${id}>`
    : "Channel not found";
}

// ============================================================
// HOME
// ============================================================

function homeEmbed(guild, user) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Zynko Control Dashboard")
    .setDescription(
      "Your server control center.\n\n" +
      "Use the buttons below to configure automation, " +
      "moderation, templates, embeds and server settings."
    )
    .addFields(
      {
        name: "⚡ Automation",
        value:
          data.automation.transcripts ||
          data.automation.autoJoins ||
          data.automation.autoGoodbyes ||
          data.automation.autoChatLogs ||
          data.automation.autoDeleteLogs ||
          data.automation.autoRoles
            ? "🟢 Active"
            : "⚪ Disabled",
        inline: true
      },
      {
        name: "🛡️ Moderation",
        value:
          data.moderation.automod ||
          data.moderation.antiSpam ||
          data.moderation.antiLinks ||
          data.moderation.antiMassMention
            ? "🟢 Active"
            : "⚪ Basic",
        inline: true
      },
      {
        name: "📋 Templates",
        value:
          `${data.templates.length} saved`,
        inline: true
      },
      {
        name: "🧱 Embeds",
        value:
          `${data.embeds.length} saved`,
        inline: true
      },
      {
        name: "📜 Logs",
        value:
          channelMention(
            guild,
            data.channels.logs
          ),
        inline: true
      },
      {
        name: "👤 Auto Role",
        value:
          data.roles.autoRole
            ? `<@&${data.roles.autoRole}>`
            : "Not configured",
        inline: true
      }
    )
    .setFooter({
      text:
        `Opened by ${user.username} • Session expires in 5 minutes`
    })
    .setTimestamp();
}

function homeButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("home_automation")
        .setLabel("Automation")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("home_moderation")
        .setLabel("Moderation")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("home_lookup")
        .setLabel("Lookup")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("home_embeds")
        .setLabel("Embeds")
        .setEmoji("🧱")
        .setStyle(ButtonStyle.Success)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("home_templates")
        .setLabel("Templates")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("home_settings")
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("home_help")
        .setLabel("Help")
        .setEmoji("🥺")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("go_home")
      .setLabel("Back")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ============================================================
// AUTOMATION
// ============================================================

function automationEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚡ Automation")
    .setDescription(
      "Automatic systems for your server."
    )
    .addFields(
      {
        name: "📜 Transcripts",
        value: status(
          data.automation.transcripts
        ),
        inline: true
      },
      {
        name: "👋 Auto Joins",
        value: status(
          data.automation.autoJoins
        ),
        inline: true
      },
      {
        name: "🚪 Auto Goodbyes",
        value: status(
          data.automation.autoGoodbyes
        ),
        inline: true
      },
      {
        name: "💬 Chat Logs",
        value: status(
          data.automation.autoChatLogs
        ),
        inline: true
      },
      {
        name: "🧹 Delete Logs",
        value: status(
          data.automation.autoDeleteLogs
        ),
        inline: true
      },
      {
        name: "👤 Auto Roles",
        value: status(
          data.automation.autoRoles
        ),
        inline: true
      },
      {
        name: "📁 Log Channel",
        value:
          channelMention(
            guild,
            data.channels.logs
          ),
        inline: true
      },
      {
        name: "👋 Welcome Channel",
        value:
          channelMention(
            guild,
            data.channels.welcome
          ),
        inline: true
      },
      {
        name: "🚪 Goodbye Channel",
        value:
          channelMention(
            guild,
            data.channels.goodbye
          ),
        inline: true
      }
    );
}

function automationButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("auto_transcripts")
        .setLabel("Transcripts")
        .setEmoji("📜")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("auto_joins")
        .setLabel("Joins")
        .setEmoji("👋")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("auto_goodbyes")
        .setLabel("Goodbyes")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Success)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("auto_chatlogs")
        .setLabel("Chat Logs")
        .setEmoji("💬")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("auto_delete")
        .setLabel("Delete Logs")
        .setEmoji("🧹")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("auto_roles")
        .setLabel("Auto Roles")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("automation_channels")
        .setLabel("Channel Setup")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("automation_role")
        .setLabel("Role Setup")
        .setEmoji("🎭")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton()
  ];
}

// ============================================================
// MODERATION
// ============================================================

function moderationEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .setDescription(
      "Server protection and moderation systems."
    )
    .addFields(
      {
        name: "⚠️ Warnings",
        value:
          status(data.moderation.warnings),
        inline: true
      },
      {
        name: "🤖 AutoMod",
        value:
          status(data.moderation.automod),
        inline: true
      },
      {
        name: "💬 Anti Spam",
        value:
          status(data.moderation.antiSpam),
        inline: true
      },
      {
        name: "🔗 Anti Links",
        value:
          status(data.moderation.antiLinks),
        inline: true
      },
      {
        name: "📢 Anti Mentions",
        value:
          status(data.moderation.antiMassMention),
        inline: true
      }
    );
}

function moderationButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mod_warnings")
        .setLabel("Warnings")
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("mod_automod")
        .setLabel("AutoMod")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mod_spam")
        .setLabel("Anti Spam")
        .setEmoji("💬")
        .setStyle(ButtonStyle.Danger)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mod_links")
        .setLabel("Anti Links")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mod_mentions")
        .setLabel("Anti Mentions")
        .setEmoji("📢")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mod_status")
        .setLabel("Status")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

// ============================================================
// SETTINGS
// ============================================================

function settingsEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .setDescription(
      "Configure the bot for this server."
    )
    .addFields(
      {
        name: "🤖 Bot Name",
        value:
          data.settings.botName ||
          client.user.username,
        inline: true
      },
      {
        name: "📜 Log Channel",
        value:
          channelMention(
            guild,
            data.channels.logs
          ),
        inline: true
      },
      {
        name: "👋 Welcome",
        value:
          channelMention(
            guild,
            data.channels.welcome
          ),
        inline: true
      },
      {
        name: "🚪 Goodbye",
        value:
          channelMention(
            guild,
            data.channels.goodbye
          ),
        inline: true
      }
    );
}

function settingsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setting_botname")
        .setLabel("Bot Name")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("setting_channels")
        .setLabel("Channels")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

// ============================================================
// LOOKUP
// ============================================================

function lookupEmbed() {
  return new EmbedBuilder()
    .setTitle("🔎 Admin Lookup")
    .setDescription(
      "**User Search**\n" +
      "Search a member using their Discord ID.\n\n" +

      "**Message Search**\n" +
      "Search recently accessible messages.\n\n" +

      "**Related Search**\n" +
      "Search messages containing any supplied word.\n\n" +

      "**Deleted Messages**\n" +
      "Deleted messages can only be recovered if the bot logged them."
    );
}

function lookupButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("lookup_user")
        .setLabel("User Search")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("lookup_messages")
        .setLabel("Message Search")
        .setEmoji("💬")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("lookup_related")
        .setLabel("Related")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

// ============================================================
// EMBEDS
// ============================================================

function embedsEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🧱 Embed Builder")
    .setDescription(
      "Create reusable server embeds.\n\n" +
      `Saved embeds: **${data.embeds.length}**`
    );
}

function embedsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("embed_create")
        .setLabel("Create Embed")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("embed_saved")
        .setLabel("Saved Embeds")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("embed_post")
        .setLabel("Post Embed")
        .setEmoji("📨")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton()
  ];
}

// ============================================================
// TEMPLATES
// ============================================================

function templatesEmbed(guild) {
  const data = getGuildData(guild.id);

  let description =
    "Reusable server messages.\n\n";

  if (!data.templates.length) {
    description +=
      "No templates saved yet.";
  } else {
    data.templates
      .slice(0, 10)
      .forEach((template, index) => {
        description +=
          `**${index + 1}. ${template.name}**\n` +
          `${template.content.slice(0, 150)}\n\n`;
      });
  }

  return new EmbedBuilder()
    .setTitle("📋 Templates")
    .setDescription(description);
}

function templatesButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("template_create")
        .setLabel("Create Template")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("template_use")
        .setLabel("Use Template")
        .setEmoji("📨")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton()
  ];
}

// ============================================================
// HELP
// ============================================================

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle("🥺 Help")
    .setDescription(
      "**Dashboard Access**\n" +
      "• Server Owner\n" +
      "• Administrator\n" +
      "• Manage Server\n" +
      "• Manage Channels + Manage Roles\n\n" +

      "**Command**\n" +
      "`/dashboard`\n\n" +

      "Dashboard sessions last 5 minutes."
    );
}

// ============================================================
// MODAL HELPERS
// ============================================================

function simpleModal(id, title, fields) {
  const modal = new ModalBuilder()
    .setCustomId(id)
    .setTitle(title);

  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(
        field.style || TextInputStyle.Short
      )
      .setRequired(
        field.required !== false
      );

    if (field.placeholder) {
      input.setPlaceholder(
        field.placeholder
      );
    }

    if (field.maxLength) {
      input.setMaxLength(
        field.maxLength
      );
    }

    modal.addComponents(
      new ActionRowBuilder()
        .addComponents(input)
    );
  }

  return modal;
}

// ============================================================
// DASHBOARD COMMAND
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (
      interaction.commandName !==
      "dashboard"
    ) {
      return;
    }

    if (
      !(await requireDashboard(interaction))
    ) {
      return;
    }

    const message =
      await interaction.reply({
        embeds: [
          homeEmbed(
            interaction.guild,
            interaction.user
          )
        ],
        components:
          homeButtons(),
        fetchReply: true
      });

    createSession(
      message.id,
      interaction.user.id
    );
  }
);

// ============================================================
// BUTTON HANDLER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isButton()) {
      return;
    }

    const id =
      interaction.customId;

    const dashboardButton =
      id.startsWith("home_") ||
      id.startsWith("auto_") ||
      id.startsWith("mod_") ||
      id.startsWith("setting_") ||
      id.startsWith("lookup_") ||
      id.startsWith("embed_") ||
      id.startsWith("template_") ||
      id.startsWith("automation_") ||
      id === "go_home";

    if (!dashboardButton) {
      return;
    }

    if (
      !(await requireDashboard(interaction))
    ) {
      return;
    }

    if (!sessionIsValid(interaction)) {
      return interaction.reply({
        content:
          "⏱️ This dashboard session expired or belongs to another user. Run `/dashboard` again.",
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // HOME
    // --------------------------------------------------------

    if (id === "go_home") {
      return interaction.update({
        embeds: [
          homeEmbed(
            interaction.guild,
            interaction.user
          )
        ],
        components:
          homeButtons()
      });
    }

    // --------------------------------------------------------
    // HOME TABS
    // --------------------------------------------------------

    if (id === "home_automation") {
      return interaction.update({
        embeds: [
          automationEmbed(
            interaction.guild
          )
        ],
        components:
          automationButtons()
      });
    }

    if (id === "home_moderation") {
      return interaction.update({
        embeds: [
          moderationEmbed(
            interaction.guild
          )
        ],
        components:
          moderationButtons()
      });
    }

    if (id === "home_lookup") {
      return interaction.update({
        embeds: [
          lookupEmbed()
        ],
        components:
          lookupButtons()
      });
    }

    if (id === "home_embeds") {
      return interaction.update({
        embeds: [
          embedsEmbed(
            interaction.guild
          )
        ],
        components:
          embedsButtons()
      });
    }

    if (id === "home_templates") {
      return interaction.update({
        embeds: [
          templatesEmbed(
            interaction.guild
          )
        ],
        components:
          templatesButtons()
      });
    }

    if (id === "home_settings") {
      return interaction.update({
        embeds: [
          settingsEmbed(
            interaction.guild
          )
        ],
        components:
          settingsButtons()
      });
    }

    if (id === "home_help") {
      return interaction.update({
        embeds: [
          helpEmbed()
        ],
        components:
          backButton()
      });
    }

    const data =
      getGuildData(
        interaction.guild.id
      );

    // --------------------------------------------------------
    // AUTOMATION
    // --------------------------------------------------------

    const autoMap = {
      auto_transcripts:
        "transcripts",

      auto_joins:
        "autoJoins",

      auto_goodbyes:
        "autoGoodbyes",

      auto_chatlogs:
        "autoChatLogs",

      auto_delete:
        "autoDeleteLogs",

      auto_roles:
        "autoRoles"
    };

    if (autoMap[id]) {

      const key =
        autoMap[id];

      data.automation[key] =
        !data.automation[key];

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        embeds: [
          automationEmbed(
            interaction.guild
          )
        ],
        components:
          automationButtons()
      });
    }

    // --------------------------------------------------------
    // AUTOMATION CHANNELS
    // --------------------------------------------------------

    if (
      id === "automation_channels"
    ) {

      const menu =
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_automation_channel"
          )
          .setPlaceholder(
            "Choose what channel to configure"
          )
          .setChannelTypes(
            ChannelType.GuildText
          );

      const typeMenu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_channel_type"
          )
          .setPlaceholder(
            "Choose channel type"
          )
          .addOptions(
            {
              label: "Logs / Transcripts",
              value: "logs",
              emoji: "📜"
            },
            {
              label: "Welcome",
              value: "welcome",
              emoji: "👋"
            },
            {
              label: "Goodbye",
              value: "goodbye",
              emoji: "🚪"
            }
          );

      return interaction.reply({
        content:
          "Choose the channel type, then select the channel.",
        components: [
          new ActionRowBuilder()
            .addComponents(typeMenu),
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // AUTO ROLE
    // --------------------------------------------------------

    if (id === "automation_role") {

      const menu =
        new RoleSelectMenuBuilder()
          .setCustomId(
            "select_auto_role"
          )
          .setPlaceholder(
            "Select the automatic role"
          );

      return interaction.reply({
        content:
          "🎭 Select the role new members should receive.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // MODERATION
    // --------------------------------------------------------

    const modMap = {

      mod_warnings:
        "warnings",

      mod_automod:
        "automod",

      mod_spam:
        "antiSpam",

      mod_links:
        "antiLinks",

      mod_mentions:
        "antiMassMention"

    };

    if (modMap[id]) {

      const key =
        modMap[id];

      data.moderation[key] =
        !data.moderation[key];

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        embeds: [
          moderationEmbed(
            interaction.guild
          )
        ],
        components:
          moderationButtons()
      });
    }

    if (id === "mod_status") {

      return interaction.reply({
        embeds: [
          moderationEmbed(
            interaction.guild
          )
        ],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // SETTINGS BOT NAME
    // --------------------------------------------------------

    if (id === "setting_botname") {

      return interaction.showModal(
        simpleModal(
          "modal_botname",
          "Change Bot Name",
          [
            {
              id: "botname",
              label: "Bot Nickname",
              maxLength: 32,
              placeholder:
                "Enter the bot nickname"
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // SETTINGS CHANNELS
    // --------------------------------------------------------

    if (id === "setting_channels") {

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_settings_channel_type"
          )
          .setPlaceholder(
            "Choose channel type"
          )
          .addOptions(
            {
              label: "Logs / Transcripts",
              value: "logs",
              emoji: "📜"
            },
            {
              label: "Welcome",
              value: "welcome",
              emoji: "👋"
            },
            {
              label: "Goodbye",
              value: "goodbye",
              emoji: "🚪"
            }
          );

      return interaction.reply({
        content:
          "Choose which channel you want to configure.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // LOOKUP USER
    // --------------------------------------------------------

    if (id === "lookup_user") {

      return interaction.showModal(
        simpleModal(
          "modal_lookup_user",
          "🔎 User Lookup",
          [
            {
              id: "userid",
              label: "Discord User ID",
              placeholder:
                "Enter a Discord user ID"
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // LOOKUP MESSAGE
    // --------------------------------------------------------

    if (id === "lookup_messages") {

      return interaction.showModal(
        simpleModal(
          "modal_lookup_messages",
          "💬 Message Search",
          [
            {
              id: "query",
              label: "Search Phrase",
              maxLength: 100,
              placeholder:
                "Example: hello"
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // RELATED SEARCH
    // --------------------------------------------------------

    if (id === "lookup_related") {

      return interaction.showModal(
        simpleModal(
          "modal_related",
          "🔗 Related Messages",
          [
            {
              id: "query",
              label: "Words or Phrase",
              maxLength: 100,
              placeholder:
                "Example: server raid"
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // CREATE EMBED
    // --------------------------------------------------------

    if (id === "embed_create") {

      return interaction.showModal(
        simpleModal(
          "modal_embed",
          "🧱 Create Embed",
          [
            {
              id: "title",
              label: "Title",
              maxLength: 256
            },
            {
              id: "description",
              label: "Description",
              style:
                TextInputStyle.Paragraph,
              maxLength: 4000
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // SAVED EMBEDS
    // --------------------------------------------------------

    if (id === "embed_saved") {

      if (!data.embeds.length) {
        return interaction.reply({
          content:
            "🧱 No saved embeds yet.",
          ephemeral: true
        });
      }

      const text =
        data.embeds
          .slice(0, 25)
          .map(
            (embed, index) =>
              `${index + 1}. **${embed.title}**`
          )
          .join("\n");

      return interaction.reply({
        content:
          `🧱 **Saved Embeds**\n\n${text}`,
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // POST EMBED
    // --------------------------------------------------------

    if (id === "embed_post") {

      if (!data.embeds.length) {
        return interaction.reply({
          content:
            "❌ You don't have any saved embeds.",
          ephemeral: true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_saved_embed"
          )
          .setPlaceholder(
            "Choose an embed"
          );

      data.embeds
        .slice(0, 25)
        .forEach(
          (embed, index) => {
            menu.addOptions({
              label:
                embed.title.slice(0, 100),
              value:
                String(index),
              emoji: "🧱"
            });
          }
        );

      return interaction.reply({
        content:
          "Choose the embed to post.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // CREATE TEMPLATE
    // --------------------------------------------------------

    if (id === "template_create") {

      return interaction.showModal(
        simpleModal(
          "modal_template",
          "📋 Create Template",
          [
            {
              id: "name",
              label: "Template Name",
              maxLength: 100
            },
            {
              id: "content",
              label: "Message",
              style:
                TextInputStyle.Paragraph,
              maxLength: 4000
            }
          ]
        )
      );
    }

    // --------------------------------------------------------
    // USE TEMPLATE
    // --------------------------------------------------------

    if (id === "template_use") {

      if (!data.templates.length) {
        return interaction.reply({
          content:
            "❌ No templates have been saved.",
          ephemeral: true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_template"
          )
          .setPlaceholder(
            "Choose a template"
          );

      data.templates
        .slice(0, 25)
        .forEach(
          (template, index) => {
            menu.addOptions({
              label:
                template.name.slice(0, 100),
              value:
                String(index),
              emoji: "📋"
            });
          }
        );

      return interaction.reply({
        content:
          "Choose the template you want to use.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }
  }
);

// ============================================================
// SELECT MENUS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isStringSelectMenu() &&
      !interaction.isChannelSelectMenu() &&
      !interaction.isRoleSelectMenu()
    ) {
      return;
    }

    if (
      !(await requireDashboard(interaction))
    ) {
      return;
    }

    // --------------------------------------------------------
    // CHANNEL TYPE
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "select_channel_type" ||
      interaction.customId ===
      "select_settings_channel_type"
    ) {

      const type =
        interaction.values[0];

      const menu =
        new ChannelSelectMenuBuilder()
          .setCustomId(
            `select_channel_${type}`
          )
          .setPlaceholder(
            "Select a text channel"
          )
          .setChannelTypes(
            ChannelType.GuildText
          );

      return interaction.update({
        content:
          `📁 Select the ${type} channel.`,
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ]
      });
    }

    // --------------------------------------------------------
    // AUTOMATION CHANNELS
    // --------------------------------------------------------

    if (
      interaction.customId.startsWith(
        "select_channel_"
      )
    ) {

      const type =
        interaction.customId.replace(
          "select_channel_",
          ""
        );

      if (
        ![
          "logs",
          "welcome",
          "goodbye"
        ].includes(type)
      ) {
        return;
      }

      const channelId =
        interaction.values[0];

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.channels[type] =
        channelId;

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        content:
          `✅ <#${channelId}> is now the ${type} channel.`,
        components: []
      });
    }

    // --------------------------------------------------------
    // AUTO ROLE
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "select_auto_role"
    ) {

      const roleId =
        interaction.values[0];

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.roles.autoRole =
        roleId;

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        content:
          `✅ <@&${roleId}> is now the automatic role.`,
        components: []
      });
    }

    // --------------------------------------------------------
    // SAVED EMBED
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "select_saved_embed"
    ) {

      const index =
        Number(
          interaction.values[0]
        );

      const data =
        getGuildData(
          interaction.guild.id
        );

      const saved =
        data.embeds[index];

      if (!saved) {
        return interaction.update({
          content:
            "❌ That embed no longer exists.",
          components: []
        });
      }

      const embed =
        new EmbedBuilder()
          .setTitle(saved.title)
          .setDescription(
            saved.description
          )
          .setFooter({
            text:
              interaction.guild.name
          });

      await interaction.channel.send({
        embeds: [embed]
      }).catch(() => {});

      return interaction.update({
        content:
          "✅ Embed posted.",
        components: []
      });
    }

    // --------------------------------------------------------
    // TEMPLATE
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "select_template"
    ) {

      const index =
        Number(
          interaction.values[0]
        );

      const data =
        getGuildData(
          interaction.guild.id
        );

      const template =
        data.templates[index];

      if (!template) {
        return interaction.update({
          content:
            "❌ That template no longer exists.",
          components: []
        });
      }

      await interaction.channel.send(
        template.content
      ).catch(() => {});

      return interaction.update({
        content:
          `✅ Template **${template.name}** posted.`,
        components: []
      });
    }
  }
);

// ============================================================
// MODALS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isModalSubmit()) {
      return;
    }

    if (
      !(await requireDashboard(interaction))
    ) {
      return;
    }

    const data =
      getGuildData(
        interaction.guild.id
      );

    // --------------------------------------------------------
    // BOT NAME
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "modal_botname"
    ) {

      const name =
        interaction.fields.getTextInputValue(
          "botname"
        );

      data.settings.botName =
        name;

      updateGuild(
        interaction.guild.id,
        data
      );

      try {
        await interaction.guild.members.me
          .setNickname(name);
      } catch {}

      return interaction.reply({
        content:
          `✅ Bot nickname changed to **${name}**.`,
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // USER LOOKUP
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "modal_lookup_user"
    ) {

      const userId =
        interaction.fields.getTextInputValue(
          "userid"
        );

      let member;

      try {
        member =
          await interaction.guild.members
            .fetch(userId);
      } catch {
        return interaction.reply({
          content:
            "❌ Couldn't find that member in this server.",
          ephemeral: true
        });
      }

      const roles =
        member.roles.cache
          .filter(
            role =>
              role.id !==
              interaction.guild.id
          )
          .map(
            role =>
              `<@&${role.id}>`
          )
          .slice(0, 20)
          .join(", ") ||
        "None";

      const embed =
        new EmbedBuilder()
          .setTitle("🔎 User Lookup")
          .setThumbnail(
            member.user.displayAvatarURL()
          )
          .addFields(
            {
              name: "User",
              value:
                `${member.user.tag}\n\`${member.id}\``
            },
            {
              name: "Joined",
              value:
                member.joinedTimestamp
                  ? `<t:${Math.floor(
                      member.joinedTimestamp /
                        1000
                    )}:F>`
                  : "Unknown"
            },
            {
              name: "Roles",
              value:
                roles
            }
          );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // MESSAGE SEARCH
    // --------------------------------------------------------

    if (
      interaction.customId ===
        "modal_lookup_messages" ||
      interaction.customId ===
        "modal_related"
    ) {

      const query =
        interaction.fields
          .getTextInputValue(
            "query"
          )
          .toLowerCase();

      await interaction.deferReply({
        ephemeral: true
      });

      const results = [];

      const channels =
        interaction.guild.channels.cache
          .filter(
            channel =>
              channel.type ===
                ChannelType.GuildText &&
              channel.viewable
          );

      for (
        const channel of channels.values()
      ) {

        if (
          results.length >= 20
        ) {
          break;
        }

        try {

          const messages =
            await channel.messages.fetch({
              limit: 100
            });

          for (
            const message of messages.values()
          ) {

            if (
              !message.content
            ) {
              continue;
            }

            const content =
              message.content.toLowerCase();

            let match = false;

            if (
              interaction.customId ===
              "modal_lookup_messages"
            ) {

              match =
                content.includes(query);

            } else {

              const words =
                query
                  .split(/\s+/)
                  .filter(Boolean);

              match =
                words.some(
                  word =>
                    content.includes(word)
                );
            }

            if (match) {

              results.push(
                `• ${message.author} in ${channel}\n` +
                `  ${message.content.slice(0, 250)}\n` +
                `  https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id}`
              );
            }

            if (
              results.length >= 20
            ) {
              break;
            }
          }

        } catch {}
      }

      return interaction.editReply({
        content:
          results.length
            ? `🔎 **Results for:** \`${query}\`\n\n${results.join("\n\n")}`
            : `❌ No accessible messages found for \`${query}\`.`
      });
    }

    // --------------------------------------------------------
    // EMBED
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "modal_embed"
    ) {

      const title =
        interaction.fields
          .getTextInputValue(
            "title"
          );

      const description =
        interaction.fields
          .getTextInputValue(
            "description"
          );

      data.embeds.push({
        title,
        description,
        created:
          Date.now()
      });

      updateGuild(
        interaction.guild.id,
        data
      );

      const embed =
        new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setFooter({
            text:
              interaction.guild.name
          });

      return interaction.reply({
        content:
          "✅ Embed created and saved.",
        embeds: [embed],
        ephemeral: true
      });
    }

    // --------------------------------------------------------
    // TEMPLATE
    // --------------------------------------------------------

    if (
      interaction.customId ===
      "modal_template"
    ) {

      const name =
        interaction.fields
          .getTextInputValue(
            "name"
          );

      const content =
        interaction.fields
          .getTextInputValue(
            "content"
          );

      data.templates.push({
        name,
        content,
        created:
          Date.now()
      });

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.reply({
        content:
          `✅ Template **${name}** saved.`,
        ephemeral: true
      });
    }
  }
);

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(
  "messageCreate",
  async message => {

    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    const data =
      getGuildData(
        message.guild.id
      );

    // --------------------------------------------------------
    // MESSAGE HISTORY
    // --------------------------------------------------------

    if (
      !data.messageLog[
        message.channel.id
      ]
    ) {
      data.messageLog[
        message.channel.id
      ] = [];
    }

    data.messageLog[
      message.channel.id
    ].push({
      id:
        message.id,

      user:
        message.author.id,

      username:
        message.author.username,

      content:
        message.content,

      timestamp:
        Date.now()
    });

    data.messageLog[
      message.channel.id
    ] =
      data.messageLog[
        message.channel.id
      ].slice(-200);

    // --------------------------------------------------------
    // CHAT LOG
    // --------------------------------------------------------

    if (
      data.automation.autoChatLogs &&
      data.channels.logs
    ) {

      const channel =
        message.guild.channels.cache.get(
          data.channels.logs
        );

      if (channel) {

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "💬 Message Log"
              )
              .addFields(
                {
                  name: "User",
                  value:
                    `${message.author}`,
                  inline: true
                },
                {
                  name: "Channel",
                  value:
                    `${message.channel}`,
                  inline: true
                },
                {
                  name: "Message",
                  value:
                    message.content
                      .slice(0, 1000) ||
                    "[No text]"
                }
              )
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    }

    // --------------------------------------------------------
    // ANTI SPAM
    // --------------------------------------------------------

    if (
      data.moderation.antiSpam
    ) {

      const recent =
        data.messageLog[
          message.channel.id
        ] || [];

      const userMessages =
        recent.filter(
          msg =>
            msg.user ===
              message.author.id &&
            Date.now() -
              msg.timestamp <
              5000
        );

      if (
        userMessages.length >= 6 &&
        message.member?.moderatable
      ) {

        await message.member
          .timeout(
            30_000,
            "Automatic anti-spam"
          )
          .catch(() => {});
      }
    }

    // --------------------------------------------------------
    // ANTI LINKS
    // --------------------------------------------------------

    if (
      data.moderation.antiLinks
    ) {

      const url =
        /(https?:\/\/|www\.)/i;

      const allowed =
        message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        );

      if (
        url.test(message.content) &&
        !allowed
      ) {

        await message.delete()
          .catch(() => {});

        return;
      }
    }

    // --------------------------------------------------------
    // ANTI MASS MENTION
    // --------------------------------------------------------

    if (
      data.moderation.antiMassMention
    ) {

      if (
        message.mentions.users.size >= 5
      ) {

        await message.delete()
          .catch(() => {});

        return;
      }
    }

    // IMPORTANT:
    // Persist the modified message history.
    updateGuild(
      message.guild.id,
      data
    );
  }
);

// ============================================================
// MESSAGE DELETE
// ============================================================

client.on(
  "messageDelete",
  async message => {

    if (!message.guild) {
      return;
    }

    const data =
      getGuildData(
        message.guild.id
      );

    if (
      !data.automation.autoDeleteLogs ||
      !data.channels.logs
    ) {
      return;
    }

    const channel =
      message.guild.channels.cache.get(
        data.channels.logs
      );

    if (!channel) {
      return;
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🗑️ Deleted Message"
          )
          .addFields(
            {
              name: "Author",
              value:
                message.author
                  ? `${message.author}`
                  : "Unknown"
            },
            {
              name: "Channel",
              value:
                `${message.channel}`
            },
            {
              name: "Content",
              value:
                message.content
                  ?.slice(0, 1000) ||
                "[Content unavailable]"
            }
          )
          .setTimestamp()
      ]
    }).catch(() => {});
  }
);

// ============================================================
// MEMBER JOIN
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const data =
      getGuildData(
        member.guild.id
      );

    // --------------------------------------------------------
    // WELCOME
    // --------------------------------------------------------

    if (
      data.automation.autoJoins &&
      data.channels.welcome
    ) {

      const channel =
        member.guild.channels.cache.get(
          data.channels.welcome
        );

      if (channel) {

        await channel.send(
          `👋 Welcome ${member} to **${member.guild.name}**!`
        ).catch(() => {});
      }
    }

    // --------------------------------------------------------
    // AUTO ROLE
    // --------------------------------------------------------

    if (
      data.automation.autoRoles &&
      data.roles.autoRole
    ) {

      const role =
        member.guild.roles.cache.get(
          data.roles.autoRole
        );

      if (
        role &&
        role.position <
          member.guild.members.me.roles.highest.position
      ) {

        await member.roles
          .add(
            role,
            "Zynko Control automatic role"
          )
          .catch(() => {});
      }
    }
  }
);

// ============================================================
// MEMBER LEAVE
// ============================================================

client.on(
  "guildMemberRemove",
  async member => {

    const data =
      getGuildData(
        member.guild.id
      );

    if (
      !data.automation.autoGoodbyes ||
      !data.channels.goodbye
    ) {
      return;
    }

    const channel =
      member.guild.channels.cache.get(
        data.channels.goodbye
      );

    if (!channel) {
      return;
    }

    await channel.send(
      `🚪 **${member.user.username}** has left the server.`
    ).catch(() => {});
  }
);

// ============================================================
// REGISTER /DASHBOARD
// ============================================================

async function registerCommands() {

  const command =
    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription(
        "Open the Zynko Control Dashboard"
      );

  const rest =
    new REST({
      version: "10"
    }).setToken(TOKEN);

  console.log(
    "🔄 Registering /dashboard..."
  );

  try {

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: [
          command.toJSON()
        ]
      }
    );

    console.log(
      "✅ /dashboard registered successfully."
    );

  } catch (error) {

    console.error(
      "❌ Slash command registration failed:",
      error
    );
  }
}

// ============================================================
// READY
// ============================================================

client.once(
  "ready",
  async () => {

    console.log(
      "===================================="
    );

    console.log(
      `✅ Logged in as ${client.user.tag}`
    );

    console.log(
      `🆔 Application ID: ${client.user.id}`
    );

    console.log(
      `🌐 Servers: ${client.guilds.cache.size}`
    );

    console.log(
      "===================================="
    );

    client.user.setActivity(
      "Server Dashboard",
      {
        type:
          ActivityType.Watching
      }
    );

    await registerCommands();
  }
);

// ============================================================
// ERRORS
// ============================================================

client.on(
  "error",
  error => {

    console.error(
      "Discord error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "Uncaught exception:",
      error
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);