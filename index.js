// ============================================================
// ZYNKO CONTROL BOT
// Single-command dashboard bot
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
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType: DiscordChannelType,
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
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);

// ============================================================
// DATABASE
// ============================================================

const DB_FILE = "./database.json";

const DEFAULT_GUILD = {
  channels: {
    transcripts: null,
    logs: null,
    welcome: null,
    goodbye: null,
    moderation: null
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

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({ guilds: {} }, null, 2)
  );
}

function loadDB() {
  try {
    return JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );
  } catch {
    return { guilds: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
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
// ACCESS SYSTEM
// ============================================================

function dashboardAccess(member, guild) {

  if (!member || !guild) {
    return false;
  }

  // Actual server owner
  if (guild.ownerId === member.id) {
    return true;
  }

  const permissions = member.permissions;

  // Manage Server
  if (
    permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) {
    return true;
  }

  // Manager-style access:
  // Must be able to manage BOTH channels and roles.
  const canManageChannels =
    permissions.has(
      PermissionsBitField.Flags.ManageChannels
    );

  const canManageRoles =
    permissions.has(
      PermissionsBitField.Flags.ManageRoles
    );

  if (
    canManageChannels &&
    canManageRoles
  ) {
    return true;
  }

  return false;
}

function requireDashboard(interaction) {

  if (
    !interaction.guild ||
    !dashboardAccess(
      interaction.member,
      interaction.guild
    )
  ) {
    interaction.reply({
      content:
        "❌ You don't have Manager/Owner permissions for the dashboard.",
      ephemeral: true
    });

    return false;
  }

  return true;
}

// ============================================================
// COMMON UI
// ============================================================

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
// HOME EMBED
// ============================================================

function homeEmbed(guild, user) {

  const data = getGuildData(guild.id);

  return new EmbedBuilder()

    .setTitle("⚙️ Control Dashboard")

    .setDescription(
      "Your server control center.\n\n" +
      "Everything is managed from this dashboard.\n" +
      "This session automatically expires after **5 minutes**."
    )

    .addFields(

      {
        name: "⚡ Automation",
        value:
          data.automation.transcripts
            ? "🟢 Active"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🛡️ Moderation",
        value:
          data.moderation.automod ||
          data.moderation.antiSpam ||
          data.moderation.antiLinks
            ? "🟢 Active"
            : "⚪ Basic",
        inline: true
      },

      {
        name: "📋 Templates",
        value:
          `${data.templates.length} saved`,
        inline: true
      }

    )

    .setFooter({
      text:
        `Opened by ${user.username} • 5 minute session`
    })

    .setTimestamp();
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
        value:
          data.automation.transcripts
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "👋 Auto Joins",
        value:
          data.automation.autoJoins
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🚪 Auto Goodbyes",
        value:
          data.automation.autoGoodbyes
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "💬 Chat Logs",
        value:
          data.automation.autoChatLogs
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🧹 Delete Logs",
        value:
          data.automation.autoDeleteLogs
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "👤 Auto Roles",
        value:
          data.automation.autoRoles
            ? "🟢 Enabled"
            : "🔴 Disabled",
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
        name: "⚠️ System Warnings",
        value:
          data.moderation.warnings
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🤖 AutoMod",
        value:
          data.moderation.automod
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "💬 Anti Spam",
        value:
          data.moderation.antiSpam
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🔗 Anti Links",
        value:
          data.moderation.antiLinks
            ? "🟢 Enabled"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "📢 Anti Mentions",
        value:
          data.moderation.antiMassMention
            ? "🟢 Enabled"
            : "🔴 Disabled",
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
        name: "📜 Transcript Channel",
        value:
          data.channels.transcripts
            ? `<#${data.channels.transcripts}>`
            : "Not configured",
        inline: true
      },

      {
        name: "📋 Log Channel",
        value:
          data.channels.logs
            ? `<#${data.channels.logs}>`
            : "Not configured",
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
      "Search information the bot can access.\n\n" +

      "**User Search**\n" +
      "Find a member and display their server information.\n\n" +

      "**Message Search**\n" +
      "Search messages currently accessible to the bot.\n\n" +

      "**Related Search**\n" +
      "Find messages with similar words or phrases.\n\n" +

      "**Deleted Messages**\n" +
      "Only messages that were logged before deletion can be shown."
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
// EMBED BUILDER
// ============================================================

function embedsEmbed() {

  return new EmbedBuilder()

    .setTitle("🧱 Embed Builder")

    .setDescription(
      "Create reusable embeds for your server.\n\n" +
      "Examples:\n" +
      "• PvP announcements\n" +
      "• Events\n" +
      "• Rules\n" +
      "• Server notices\n" +
      "• Ticket information"
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
        .setStyle(ButtonStyle.Secondary)

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
      "**Need help?**\n\n" +

      "Use the dashboard to manage the bot.\n\n" +

      "**Contact**\n" +
      "Contact the bot owner/server support team.\n\n" +

      "**Dashboard Access**\n" +
      "• Server owner\n" +
      "• Manage Server\n" +
      "• Manage Channels + Manage Roles\n\n" +

      "Only one command is used:\n" +
      "`/dashboard`"
    );
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

    if (!requireDashboard(interaction)) {
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

    // ========================================================
    // 5 MINUTE TIMEOUT
    // ========================================================

    setTimeout(
      async () => {

        try {

          await message.edit({

            embeds: [

              new EmbedBuilder()

                .setTitle(
                  "⏱️ Dashboard Timed Out"
                )

                .setDescription(
                  "This dashboard session expired after 5 minutes.\n\n" +
                  "Run `/dashboard` to open a new one."
                )

                .setTimestamp()

            ],

            components: []

          });

        } catch {}

      },
      5 * 60 * 1000
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
      id === "go_home";

    if (!dashboardButton) {
      return;
    }

    if (!requireDashboard(interaction)) {
      return;
    }

    // ========================================================
    // HOME
    // ========================================================

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

    // ========================================================
    // HOME TABS
    // ========================================================

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
          embedsEmbed()
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

    // ========================================================
    // AUTOMATION TOGGLES
    // ========================================================

    const data =
      getGuildData(
        interaction.guild.id
      );

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

    // ========================================================
    // MODERATION TOGGLES
    // ========================================================

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

    // ========================================================
    // MODERATION STATUS
    // ========================================================

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

    // ========================================================
    // SETTINGS - BOT NAME
    // ========================================================

    if (id === "setting_botname") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_botname"
          )
          .setTitle(
            "Change Bot Name"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "botname"
          )
          .setLabel(
            "Server Bot Nickname"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setMaxLength(32)
          .setRequired(true)
          .setPlaceholder(
            "Enter the bot nickname"
          );

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // SETTINGS - CHANNELS
    // ========================================================

    if (
      id === "setting_channels" ||
      id === "automation_channels"
    ) {

      const menu =
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_logchannel"
          )
          .setPlaceholder(
            "Select the log/transcript channel"
          )
          .setChannelTypes(
            ChannelType.GuildText
          );

      return interaction.reply({

        content:
          "📁 Select the channel to use for logs/transcripts.",

        components: [

          new ActionRowBuilder()
            .addComponents(menu)

        ],

        ephemeral: true

      });

    }

    // ========================================================
    // LOOKUP USER
    // ========================================================

    if (id === "lookup_user") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_lookup_user"
          )
          .setTitle(
            "🔎 User Lookup"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "userid"
          )
          .setLabel(
            "User ID"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setPlaceholder(
            "Enter a Discord user ID"
          );

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // LOOKUP MESSAGES
    // ========================================================

    if (id === "lookup_messages") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_lookup_messages"
          )
          .setTitle(
            "💬 Message Search"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "query"
          )
          .setLabel(
            "Search phrase"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder(
            "Example: chat gpt sucks"
          );

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // RELATED MESSAGE SEARCH
    // ========================================================

    if (id === "lookup_related") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_related"
          )
          .setTitle(
            "🔗 Related Messages"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "query"
          )
          .setLabel(
            "Words or phrase"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setPlaceholder(
            "Example: chat gpt"
          );

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // CREATE EMBED
    // ========================================================

    if (id === "embed_create") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_embed"
          )
          .setTitle(
            "🧱 Create Embed"
          );

      const title =
        new TextInputBuilder()
          .setCustomId(
            "title"
          )
          .setLabel(
            "Title"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(256);

      const description =
        new TextInputBuilder()
          .setCustomId(
            "description"
          )
          .setLabel(
            "Description"
          )
          .setStyle(
            TextInputStyle.Paragraph
          )
          .setRequired(true)
          .setMaxLength(4000);

      modal.addComponents(

        new ActionRowBuilder()
          .addComponents(title),

        new ActionRowBuilder()
          .addComponents(description)

      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // CREATE TEMPLATE
    // ========================================================

    if (id === "template_create") {

      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_template"
          )
          .setTitle(
            "📋 Create Template"
          );

      const name =
        new TextInputBuilder()
          .setCustomId(
            "name"
          )
          .setLabel(
            "Template Name"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(100);

      const content =
        new TextInputBuilder()
          .setCustomId(
            "content"
          )
          .setLabel(
            "Message"
          )
          .setStyle(
            TextInputStyle.Paragraph
          )
          .setRequired(true)
          .setMaxLength(4000);

      modal.addComponents(

        new ActionRowBuilder()
          .addComponents(name),

        new ActionRowBuilder()
          .addComponents(content)

      );

      return interaction.showModal(
        modal
      );

    }

    // ========================================================
    // SAVED EMBEDS
    // ========================================================

    if (id === "embed_saved") {

      const embeds =
        data.embeds;

      let text =
        "🧱 **Saved Embeds**\n\n";

      if (!embeds.length) {

        text +=
          "No saved embeds.";

      } else {

        embeds
          .slice(0, 10)
          .forEach((embed, index) => {

            text +=
              `${index + 1}. **${embed.title}**\n`;

          });

      }

      return interaction.reply({

        content: text,
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
      !interaction.isChannelSelectMenu()
    ) {
      return;
    }

    if (
      interaction.customId !==
      "select_logchannel"
    ) {
      return;
    }

    if (!requireDashboard(interaction)) {
      return;
    }

    const data =
      getGuildData(
        interaction.guild.id
      );

    const channelId =
      interaction.values[0];

    data.channels.logs =
      channelId;

    data.channels.transcripts =
      channelId;

    updateGuild(
      interaction.guild.id,
      data
    );

    await interaction.update({

      content:
        `✅ <#${channelId}> is now the log/transcript channel.`,

      components: []

    });

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

    if (!requireDashboard(interaction)) {
      return;
    }

    const data =
      getGuildData(
        interaction.guild.id
      );

    // ========================================================
    // BOT NAME
    // ========================================================

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

    // ========================================================
    // USER LOOKUP
    // ========================================================

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
          .filter(role =>
            role.id !==
            interaction.guild.id
          )
          .map(role => role.name)
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
                `<t:${Math.floor(
                  member.joinedTimestamp / 1000
                )}:F>`
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

    // ========================================================
    // MESSAGE SEARCH
    // ========================================================

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
          .filter(channel =>
            channel.type ===
              ChannelType.GuildText &&
            channel.viewable
          );

      for (
        const channel of channels.values()
      ) {

        if (results.length >= 20) {
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
                words.some(word =>
                  content.includes(word)
                );

            }

            if (match) {

              results.push(
                `• ${message.author} in ${channel}\n` +
                `  ${message.content.slice(0, 250)}\n` +
                `  [message](https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id})`
              );

            }

            if (results.length >= 20) {
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

    // ========================================================
    // EMBED
    // ========================================================

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

    // ========================================================
    // TEMPLATE
    // ========================================================

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
// MESSAGE LOGGING
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
    // Saved message history for lookup
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

      id: message.id,

      user:
        message.author.id,

      username:
        message.author.username,

      content:
        message.content,

      timestamp:
        Date.now()

    });

    // Keep only latest 200
    data.messageLog[
      message.channel.id
    ] =
      data.messageLog[
        message.channel.id
      ].slice(-200);

    // --------------------------------------------------------
    // Auto chat logs
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
    // Anti spam
    // --------------------------------------------------------

    if (
      data.moderation.antiSpam
    ) {

      const recent =
        data.messageLog[
          message.channel.id
        ];

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

        await message.member.timeout(
          30_000,
          "Automatic anti-spam"
        ).catch(() => {});

      }

    }

    // --------------------------------------------------------
    // Anti links
    // --------------------------------------------------------

    if (
      data.moderation.antiLinks
    ) {

      const url =
        /(https?:\/\/|www\.)/i;

      if (
        url.test(message.content) &&
        message.member &&
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {

        await message.delete()
          .catch(() => {});

      }

    }

    // --------------------------------------------------------
    // Anti mass mention
    // --------------------------------------------------------

    if (
      data.moderation.antiMassMention
    ) {

      if (
        message.mentions.users.size >= 5
      ) {

        await message.delete()
          .catch(() => {});

      }

    }

    // --------------------------------------------------------
    // Auto role
    // --------------------------------------------------------

    if (
      data.automation.autoRoles
    ) {

      // Role can be added later through
      // dashboard configuration.

    }

    saveDB(
      loadDB()
    );

  }
);

// ============================================================
// MESSAGE DELETE LOG
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

    if (
      !data.automation.autoJoins
    ) {
      return;
    }

    if (
      !data.channels.welcome
    ) {
      return;
    }

    const channel =
      member.guild.channels.cache.get(
        data.channels.welcome
      );

    if (!channel) {
      return;
    }

    await channel.send(
      `👋 Welcome ${member} to **${member.guild.name}**!`
    ).catch(() => {});

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
      !data.automation.autoGoodbyes
    ) {
      return;
    }

    if (
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
// READY
// ============================================================

client.once(
  "ready",
  async () => {

    console.log(
      `✅ ${client.user.tag} is online`
    );

    client.user.setActivity(
      "Server Dashboard",
      {
        type:
          ActivityType.Watching
      }
    );

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

// ============================================================
// LOGIN
// ============================================================

if (!process.env.TOKEN) {

  console.error(
    "❌ TOKEN environment variable is missing."
  );

  process.exit(1);
}

client.login(
  process.env.TOKEN
);