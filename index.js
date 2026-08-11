// ============================================================
// ZYNKO CONTROL BOT
// FULL SINGLE-FILE SERVER CONTROL + TEMPLATE SYSTEM
// discord.js v14+
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
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID =
  process.env.CLIENT_ID ||
  process.env.DISCORD_CLIENT_ID;

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error(
    "❌ CLIENT_ID or DISCORD_CLIENT_ID environment variable is missing."
  );
  process.exit(1);
}

// ============================================================
// KEEP ALIVE
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Zynko Control Bot is online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive server started.");
});

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

  autoRole: {
    roleId: null
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

  embeds: [],

  warnings: {},

  messageLog: {},

  setupComplete: false
};

function emptyDB() {
  return {
    guilds: {},
    templates: {}
  };
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(emptyDB(), null, 2)
  );
}

function loadDB() {
  try {
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    if (!db.guilds) db.guilds = {};
    if (!db.templates) db.templates = {};

    return db;
  } catch {
    return emptyDB();
  }
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function cloneDefault() {
  return clone(DEFAULT_GUILD);
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
// PERMISSION SYSTEM
// ============================================================

function dashboardAccess(member, guild) {
  if (!member || !guild) return false;

  if (guild.ownerId === member.id) {
    return true;
  }

  if (
    member.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) {
    return true;
  }

  return (
    member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    ) &&
    member.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  );
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
        "❌ You don't have permission to use the dashboard.",
      ephemeral: true
    }).catch(() => {});

    return false;
  }

  return true;
}

// ============================================================
// COMMAND REGISTRATION
// ============================================================

async function registerCommands() {
  const commands = [

    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription(
        "Open the Zynko Control Dashboard."
      ),

    new SlashCommandBuilder()
      .setName("save")
      .setDescription(
        "Save this server as a universal template."
      )
      .addStringOption(option =>
        option
          .setName("name")
          .setDescription(
            "Name for the template."
          )
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("load")
      .setDescription(
        "Load a universal server template."
      )
      .addStringOption(option =>
        option
          .setName("name")
          .setDescription(
            "Template name."
          )
          .setRequired(true)
      )

  ].map(command => command.toJSON());

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    {
      body: commands
    }
  );

  console.log("✅ Slash commands registered.");
}

// ============================================================
// TEMPLATE SYSTEM
// ============================================================

function buildServerTemplate(guild) {

  const roles = guild.roles.cache
    .filter(role =>
      role.id !== guild.id &&
      !role.managed
    )
    .sort(
      (a, b) =>
        a.position - b.position
    )
    .map(role => ({
      name: role.name,
      color: role.hexColor,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions:
        role.permissions.bitfield.toString()
    }));

  const channels = guild.channels.cache
    .filter(channel =>
      !channel.isThread()
    )
    .sort(
      (a, b) =>
        a.rawPosition - b.rawPosition
    )
    .map(channel => {

      let type = "text";

      if (
        channel.type ===
        ChannelType.GuildVoice
      ) {
        type = "voice";
      }

      if (
        channel.type ===
        ChannelType.GuildCategory
      ) {
        type = "category";
      }

      if (
        channel.type ===
        ChannelType.GuildAnnouncement
      ) {
        type = "announcement";
      }

      if (
        channel.type ===
        ChannelType.GuildStageVoice
      ) {
        type = "stage";
      }

      return {
        name: channel.name,
        type,
        parent:
          channel.parent?.name || null,
        position:
          channel.rawPosition,
        topic:
          channel.topic || null,
        nsfw:
          Boolean(channel.nsfw),
        rateLimitPerUser:
          channel.rateLimitPerUser || 0,
        bitrate:
          channel.bitrate || null,
        userLimit:
          channel.userLimit || 0
      };
    });

  const data =
    getGuildData(guild.id);

  return {
    version: 1,

    name: guild.name,

    roles,

    channels,

    automation:
      clone(data.automation),

    autoRole:
      clone(data.autoRole),

    moderation:
      clone(data.moderation),

    settings:
      clone(data.settings),

    embeds:
      clone(data.embeds),

    created:
      Date.now()
  };
}

async function saveTemplate(guild, name) {

  const db = loadDB();

  const key =
    name.trim().toLowerCase();

  db.templates[key] =
    buildServerTemplate(guild);

  db.templates[key].displayName =
    name.trim();

  saveDB(db);

  return db.templates[key];
}

function getTemplate(name) {

  const db = loadDB();

  return (
    db.templates[
      name.trim().toLowerCase()
    ] || null
  );
}

// ============================================================
// LOAD TEMPLATE
// ============================================================

async function loadTemplate(
  guild,
  template
) {

  const botMember =
    guild.members.me;

  if (!botMember) {
    throw new Error(
      "Bot member could not be found."
    );
  }

  // ----------------------------------------------------------
  // CREATE ROLES
  // ----------------------------------------------------------

  const roleMap =
    new Map();

  const existingRoles =
    guild.roles.cache;

  for (
    const savedRole of template.roles
  ) {

    let role =
      existingRoles.find(
        r =>
          !r.managed &&
          r.name === savedRole.name
      );

    if (!role) {

      try {

        role =
          await guild.roles.create({
            name:
              savedRole.name,

            colors:
              savedRole.color === "#000000"
                ? undefined
                : savedRole.color,

            hoist:
              savedRole.hoist,

            mentionable:
              savedRole.mentionable,

            permissions:
              BigInt(
                savedRole.permissions
              ),

            reason:
              "Zynko template load"
          });

      } catch (error) {

        console.log(
          `Role creation failed for ${savedRole.name}:`,
          error.message
        );

        continue;
      }

    }

    roleMap.set(
      savedRole.name,
      role
    );
  }

  // ----------------------------------------------------------
  // CREATE CATEGORIES FIRST
  // ----------------------------------------------------------

  const categoryMap =
    new Map();

  const categories =
    template.channels
      .filter(
        channel =>
          channel.type === "category"
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (
    const savedChannel of categories
  ) {

    let category =
      guild.channels.cache.find(
        channel =>
          channel.type ===
            ChannelType.GuildCategory &&
          channel.name ===
            savedChannel.name
      );

    if (!category) {

      try {

        category =
          await guild.channels.create({
            name:
              savedChannel.name,

            type:
              ChannelType.GuildCategory,

            reason:
              "Zynko template load"
          });

      } catch (error) {

        console.log(
          `Category creation failed for ${savedChannel.name}:`,
          error.message
        );

        continue;
      }
    }

    categoryMap.set(
      savedChannel.name,
      category
    );
  }

  // ----------------------------------------------------------
  // CREATE CHANNELS
  // ----------------------------------------------------------

  const normalChannels =
    template.channels
      .filter(
        channel =>
          channel.type !== "category"
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (
    const savedChannel of normalChannels
  ) {

    let type =
      ChannelType.GuildText;

    if (
      savedChannel.type ===
      "voice"
    ) {
      type =
        ChannelType.GuildVoice;
    }

    if (
      savedChannel.type ===
      "announcement"
    ) {
      type =
        ChannelType.GuildAnnouncement;
    }

    if (
      savedChannel.type ===
      "stage"
    ) {
      type =
        ChannelType.GuildStageVoice;
    }

    let channel =
      guild.channels.cache.find(
        existing =>
          existing.name ===
            savedChannel.name &&
          existing.type === type
      );

    const parent =
      savedChannel.parent
        ? categoryMap.get(
            savedChannel.parent
          )
        : null;

    if (!channel) {

      try {

        const options = {
          name:
            savedChannel.name,

          type,

          parent:
            parent?.id || undefined,

          reason:
            "Zynko template load"
        };

        if (
          type ===
            ChannelType.GuildText ||
          type ===
            ChannelType.GuildAnnouncement
        ) {

          if (
            savedChannel.topic
          ) {
            options.topic =
              savedChannel.topic;
          }

          options.nsfw =
            Boolean(
              savedChannel.nsfw
            );

          options.rateLimitPerUser =
            savedChannel.rateLimitPerUser || 0;
        }

        if (
          type ===
          ChannelType.GuildVoice
        ) {

          if (
            savedChannel.bitrate
          ) {
            options.bitrate =
              savedChannel.bitrate;
          }

          if (
            savedChannel.userLimit
          ) {
            options.userLimit =
              savedChannel.userLimit;
          }
        }

        channel =
          await guild.channels.create(
            options
          );

      } catch (error) {

        console.log(
          `Channel creation failed for ${savedChannel.name}:`,
          error.message
        );

        continue;
      }

    } else if (parent) {

      try {
        await channel.setParent(
          parent.id,
          {
            lockPermissions: false,
            reason:
              "Zynko template load"
          }
        );
      } catch {}

    }
  }

  // ----------------------------------------------------------
  // APPLY ROLE POSITIONS
  // ----------------------------------------------------------

  for (
    const savedRole of template.roles
  ) {

    const role =
      roleMap.get(
        savedRole.name
      );

    if (!role) continue;

    if (
      role.position >=
      botMember.roles.highest.position
    ) {
      continue;
    }

    try {

      await role.setPosition(
        Math.min(
          savedRole.position || 1,
          botMember.roles.highest.position - 1
        ),
        "Zynko template load"
      );

    } catch {}
  }

  // ----------------------------------------------------------
  // RESTORE BOT SETTINGS
  // ----------------------------------------------------------

  const data =
    getGuildData(guild.id);

  data.automation =
    clone(template.automation);

  data.autoRole =
    clone(template.autoRole);

  data.moderation =
    clone(template.moderation);

  data.settings =
    clone(template.settings);

  data.embeds =
    clone(template.embeds);

  // Try to match saved channels.
  const currentChannels =
    guild.channels.cache;

  function findChannelByName(name) {
    if (!name) return null;

    return currentChannels.find(
      channel =>
        channel.name === name
    );
  }

  const savedChannelData =
    template.channels;

  const logChannel =
    savedChannelData.find(
      c =>
        c.name ===
        guild.channels.cache.get(
          data.channels.logs
        )?.name
    );

  if (logChannel) {

    const actual =
      findChannelByName(
        logChannel.name
      );

    if (actual) {
      data.channels.logs =
        actual.id;
      data.channels.transcripts =
        actual.id;
    }
  }

  updateGuild(
    guild.id,
    data
  );

  return true;
}

// ============================================================
// DASHBOARD UI
// ============================================================

function homeButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "home_automation"
        )
        .setLabel("Automation")
        .setEmoji("⚡")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "home_moderation"
        )
        .setLabel("Moderation")
        .setEmoji("🛡️")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "home_lookup"
        )
        .setLabel("Lookup")
        .setEmoji("🔎")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "home_embeds"
        )
        .setLabel("Embeds")
        .setEmoji("🧱")
        .setStyle(
          ButtonStyle.Success
        )

    ),

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "home_templates"
        )
        .setLabel("Templates")
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "home_settings"
        )
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "home_help"
        )
        .setLabel("Help")
        .setEmoji("🥺")
        .setStyle(
          ButtonStyle.Secondary
        )

    )
  ];
}

function backButton() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId("go_home")
        .setLabel("Back")
        .setEmoji("↩️")
        .setStyle(
          ButtonStyle.Secondary
        )

    );
}

// ============================================================
// HOME
// ============================================================

function homeEmbed(
  guild,
  user
) {

  const data =
    getGuildData(
      guild.id
    );

  const moderationActive =
    data.moderation.automod ||
    data.moderation.antiSpam ||
    data.moderation.antiLinks ||
    data.moderation.antiMassMention;

  const db =
    loadDB();

  return new EmbedBuilder()

    .setTitle(
      "⚙️ Zynko Control Dashboard"
    )

    .setDescription(
      "Your server control center.\n\n" +
      "Use the buttons below to configure automation, moderation, templates, embeds and server settings.\n\n" +
      "Dashboard sessions expire after **5 minutes**."
    )

    .addFields(

      {
        name: "⚡ Automation",
        value:
          data.automation.transcripts ||
          data.automation.autoChatLogs ||
          data.automation.autoRoles ||
          data.automation.autoJoins ||
          data.automation.autoGoodbyes
            ? "🟢 Active"
            : "⚪ Disabled",
        inline: true
      },

      {
        name: "🛡️ Moderation",
        value:
          moderationActive
            ? "🟢 Active"
            : "⚪ Basic",
        inline: true
      },

      {
        name: "📋 Templates",
        value:
          `${Object.keys(db.templates).length} saved`,
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

  const data =
    getGuildData(
      guild.id
    );

  return new EmbedBuilder()

    .setTitle(
      "⚡ Automation"
    )

    .setDescription(
      "Configure automatic server systems."
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
            ? data.autoRole.roleId
              ? `🟢 <@&${data.autoRole.roleId}>`
              : "🟡 Enabled — no role"
            : "🔴 Disabled",
        inline: true
      }

    );
}

function automationButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "auto_transcripts"
        )
        .setLabel("Transcripts")
        .setEmoji("📜")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "auto_joins"
        )
        .setLabel("Joins")
        .setEmoji("👋")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "auto_goodbyes"
        )
        .setLabel("Goodbyes")
        .setEmoji("🚪")
        .setStyle(
          ButtonStyle.Success
        )

    ),

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "auto_chatlogs"
        )
        .setLabel("Chat Logs")
        .setEmoji("💬")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "auto_delete"
        )
        .setLabel("Delete Logs")
        .setEmoji("🧹")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "auto_roles"
        )
        .setLabel("Auto Roles")
        .setEmoji("👤")
        .setStyle(
          ButtonStyle.Secondary
        )

    ),

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "automation_channels"
        )
        .setLabel("Channel Setup")
        .setEmoji("📁")
        .setStyle(
          ButtonStyle.Primary
        )

    ),

    backButton()
  ];
}

// ============================================================
// MODERATION
// ============================================================

function moderationEmbed(guild) {

  const data =
    getGuildData(
      guild.id
    );

  return new EmbedBuilder()

    .setTitle(
      "🛡️ Moderation"
    )

    .setDescription(
      "Server protection and moderation."
    )

    .addFields(

      {
        name: "⚠️ Warnings",
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
        .setCustomId(
          "mod_warnings"
        )
        .setLabel("Warnings")
        .setEmoji("⚠️")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "mod_automod"
        )
        .setLabel("AutoMod")
        .setEmoji("🤖")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "mod_spam"
        )
        .setLabel("Anti Spam")
        .setEmoji("💬")
        .setStyle(
          ButtonStyle.Danger
        )

    ),

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "mod_links"
        )
        .setLabel("Anti Links")
        .setEmoji("🔗")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "mod_mentions"
        )
        .setLabel("Anti Mentions")
        .setEmoji("📢")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "mod_status"
        )
        .setLabel("Status")
        .setEmoji("📊")
        .setStyle(
          ButtonStyle.Secondary
        )

    ),

    backButton()
  ];
}

// ============================================================
// SETTINGS
// ============================================================

function settingsEmbed(guild) {

  const data =
    getGuildData(
      guild.id
    );

  return new EmbedBuilder()

    .setTitle(
      "⚙️ Settings"
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
        name: "📜 Logs",
        value:
          data.channels.logs
            ? `<#${data.channels.logs}>`
            : "Not configured",
        inline: true
      },

      {
        name: "👋 Welcome",
        value:
          data.channels.welcome
            ? `<#${data.channels.welcome}>`
            : "Not configured",
        inline: true
      },

      {
        name: "🚪 Goodbye",
        value:
          data.channels.goodbye
            ? `<#${data.channels.goodbye}>`
            : "Not configured",
        inline: true
      }

    );
}

function settingsButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "setting_botname"
        )
        .setLabel("Bot Name")
        .setEmoji("🤖")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "setting_channels"
        )
        .setLabel("Channels")
        .setEmoji("📁")
        .setStyle(
          ButtonStyle.Secondary
        )

    ),

    backButton()
  ];
}

// ============================================================
// LOOKUP
// ============================================================

function lookupEmbed() {

  return new EmbedBuilder()

    .setTitle(
      "🔎 Admin Lookup"
    )

    .setDescription(
      "**User Search**\n" +
      "Search a member by Discord ID.\n\n" +

      "**Message Search**\n" +
      "Search messages stored by the bot.\n\n" +

      "**Related Search**\n" +
      "Search messages containing any supplied word.\n\n" +

      "The bot can only search messages it has actually stored."
    );
}

function lookupButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "lookup_user"
        )
        .setLabel("User Search")
        .setEmoji("👤")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "lookup_messages"
        )
        .setLabel("Message Search")
        .setEmoji("💬")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "lookup_related"
        )
        .setLabel("Related")
        .setEmoji("🔗")
        .setStyle(
          ButtonStyle.Secondary
        )

    ),

    backButton()
  ];
}

// ============================================================
// EMBEDS
// ============================================================

function embedsEmbed() {

  return new EmbedBuilder()

    .setTitle(
      "🧱 Embed Builder"
    )

    .setDescription(
      "Create reusable server embeds.\n\n" +
      "Saved embeds remain available in the dashboard."
    );
}

function embedsButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "embed_create"
        )
        .setLabel("Create Embed")
        .setEmoji("➕")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "embed_saved"
        )
        .setLabel("Saved Embeds")
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        )

    ),

    backButton()
  ];
}

// ============================================================
// TEMPLATES
// ============================================================

function templatesEmbed() {

  const db =
    loadDB();

  const templates =
    Object.values(
      db.templates
    );

  let description =
    "Universal server templates.\n\n";

  if (!templates.length) {

    description +=
      "No templates saved yet.\n\n" +
      "Use `/save <name>` to save this server.";

  } else {

    templates
      .slice(0, 15)
      .forEach((template, index) => {

        description +=
          `**${index + 1}. ${template.displayName || template.name}**\n` +
          `Roles: ${template.roles.length} • Channels: ${template.channels.length}\n\n`;

      });
  }

  return new EmbedBuilder()

    .setTitle(
      "📋 Universal Templates"
    )

    .setDescription(
      description
    );
}

function templatesButtons() {

  return [

    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(
          "template_list"
        )
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "template_load"
        )
        .setLabel("Load Template")
        .setEmoji("📥")
        .setStyle(
          ButtonStyle.Primary
        )

    ),

    backButton()
  ];
}

// ============================================================
// HELP
// ============================================================

function helpEmbed() {

  return new EmbedBuilder()

    .setTitle(
      "🥺 Help"
    )

    .setDescription(
      "**Dashboard access**\n" +
      "• Server Owner\n" +
      "• Manage Server\n" +
      "• Manage Channels + Manage Roles\n\n" +

      "**Commands**\n" +
      "`/dashboard` — Open control panel\n" +
      "`/save <name>` — Save server template\n" +
      "`/load <name>` — Load server template\n\n" +

      "**Universal Templates**\n" +
      "Templates store the server's roles, channels and bot configuration so they can be reused across servers."
    );
}

// ============================================================
// DASHBOARD COMMAND
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (
      interaction.commandName ===
      "dashboard"
    ) {

      if (
        !requireDashboard(
          interaction
        )
      ) return;

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
                    "Run `/dashboard` to open another one."
                  )

                  .setTimestamp()

              ],

              components: []

            });

          } catch {}

        },
        5 * 60 * 1000
      );

      return;
    }

    // ========================================================
    // SAVE COMMAND
    // ========================================================

    if (
      interaction.commandName ===
      "save"
    ) {

      if (
        !requireDashboard(
          interaction
        )
      ) return;

      const name =
        interaction.options.getString(
          "name",
          true
        );

      await interaction.deferReply({
        ephemeral: true
      });

      try {

        const template =
          await saveTemplate(
            interaction.guild,
            name
          );

        return interaction.editReply({

          embeds: [

            new EmbedBuilder()

              .setTitle(
                "✅ Template Saved"
              )

              .setDescription(
                `**${name}** has been saved as a universal server template.`
              )

              .addFields(

                {
                  name: "Roles",
                  value:
                    `${template.roles.length}`,
                  inline: true
                },

                {
                  name: "Channels",
                  value:
                    `${template.channels.length}`,
                  inline: true
                }

              )

              .setTimestamp()

          ]

        });

      } catch (error) {

        console.error(error);

        return interaction.editReply(
          "❌ Failed to save the server template."
        );
      }
    }

    // ========================================================
    // LOAD COMMAND
    // ========================================================

    if (
      interaction.commandName ===
      "load"
    ) {

      if (
        !requireDashboard(
          interaction
        )
      ) return;

      const name =
        interaction.options.getString(
          "name",
          true
        );

      const template =
        getTemplate(name);

      if (!template) {

        return interaction.reply({

          content:
            `❌ Template **${name}** doesn't exist.`,

          ephemeral: true

        });
      }

      const confirmRow =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                `confirm_load:${name}`
              )
              .setLabel(
                "Load Template"
              )
              .setEmoji("📥")
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId(
                "cancel_load"
              )
              .setLabel(
                "Cancel"
              )
              .setStyle(
                ButtonStyle.Secondary
              )

          );

      return interaction.reply({

        embeds: [

          new EmbedBuilder()

            .setTitle(
              "⚠️ Confirm Template Load"
            )

            .setDescription(
              `You're about to load **${name}** into **${interaction.guild.name}**.\n\n` +
              `This can create roles and channels and modify the bot's configuration.\n\n` +
              "**Existing channels and roles are not automatically deleted.**"
            )

            .addFields(

              {
                name: "Roles",
                value:
                  `${template.roles.length}`,
                inline: true
              },

              {
                name: "Channels",
                value:
                  `${template.channels.length}`,
                inline: true
              }

            )

        ],

        components: [
          confirmRow
        ],

        ephemeral: true

      });
    }
  }
);

// ============================================================
// BUTTON HANDLER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isButton()
    ) return;

    const id =
      interaction.customId;

    if (
      id.startsWith(
        "confirm_load:"
      )
    ) {

      if (
        !requireDashboard(
          interaction
        )
      ) return;

      const name =
        id.substring(
          "confirm_load:".length
        );

      const template =
        getTemplate(name);

      if (!template) {

        return interaction.update({

          content:
            "❌ Template no longer exists.",

          embeds: [],

          components: []

        });
      }

      await interaction.update({

        content:
          "⏳ Loading template...",

        embeds: [],

        components: []

      });

      try {

        await loadTemplate(
          interaction.guild,
          template
        );

        return interaction.editReply({

          content:
            `✅ **${name}** has been loaded into **${interaction.guild.name}**.`

        });

      } catch (error) {

        console.error(error);

        return interaction.editReply({

          content:
            "❌ Something went wrong while loading the template."

        });
      }
    }

    if (
      id === "cancel_load"
    ) {

      return interaction.update({

        content:
          "❌ Template load cancelled.",

        embeds: [],

        components: []

      });
    }

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

    if (
      !requireDashboard(
        interaction
      )
    ) return;

    // --------------------------------------------------------
    // HOME
    // --------------------------------------------------------

    if (
      id === "go_home"
    ) {

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

    if (
      id === "home_automation"
    ) {

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

    if (
      id === "home_moderation"
    ) {

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

    if (
      id === "home_lookup"
    ) {

      return interaction.update({

        embeds: [
          lookupEmbed()
        ],

        components:
          lookupButtons()

      });
    }

    if (
      id === "home_embeds"
    ) {

      return interaction.update({

        embeds: [
          embedsEmbed()
        ],

        components:
          embedsButtons()

      });
    }

    if (
      id === "home_templates"
    ) {

      return interaction.update({

        embeds: [
          templatesEmbed()
        ],

        components:
          templatesButtons()

      });
    }

    if (
      id === "home_settings"
    ) {

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

    if (
      id === "home_help"
    ) {

      return interaction.update({

        embeds: [
          helpEmbed()
        ],

        components:
          backButton()

      });
    }

    // --------------------------------------------------------
    // AUTOMATION
    // --------------------------------------------------------

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

    if (
      autoMap[id]
    ) {

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
    // AUTO ROLE CONFIG
    // --------------------------------------------------------

    if (
      id === "auto_roles"
    ) {

      const roleMenu =
        new RoleSelectMenuBuilder()
          .setCustomId(
            "select_autorole"
          )
          .setPlaceholder(
            "Select the automatic role"
          )
          .setMinValues(1)
          .setMaxValues(1);

      return interaction.reply({

        content:
          "👤 Select the role new members should automatically receive.",

        components: [

          new ActionRowBuilder()
            .addComponents(
              roleMenu
            )

        ],

        ephemeral: true

      });
    }

    // --------------------------------------------------------
    // CHANNEL SETUP
    // --------------------------------------------------------

    if (
      id === "automation_channels" ||
      id === "setting_channels"
    ) {

      const menu =
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_channel_type"
          )
          .setPlaceholder(
            "Choose a channel to configure"
          )
          .setChannelTypes(
            ChannelType.GuildText
          );

      return interaction.reply({

        content:
          "📁 Select the channel you want to configure. The next menu will ask what it's for.",

        components: [

          new ActionRowBuilder()
            .addComponents(
              menu
            )

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

    if (
      modMap[id]
    ) {

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

    if (
      id === "mod_status"
    ) {

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
    // BOT NAME
    // --------------------------------------------------------

    if (
      id === "setting_botname"
    ) {

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
            "Bot Nickname"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(32);

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );
    }

    // --------------------------------------------------------
    // USER LOOKUP
    // --------------------------------------------------------

    if (
      id === "lookup_user"
    ) {

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
            "Discord User ID"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setPlaceholder(
            "123456789012345678"
          );

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );
    }

    // --------------------------------------------------------
    // MESSAGE SEARCH
    // --------------------------------------------------------

    if (
      id === "lookup_messages" ||
      id === "lookup_related"
    ) {

      const modal =
        new ModalBuilder()
          .setCustomId(
            id === "lookup_messages"
              ? "modal_lookup_messages"
              : "modal_related"
          )
          .setTitle(
            id === "lookup_messages"
              ? "💬 Message Search"
              : "🔗 Related Messages"
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
          .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input)
      );

      return interaction.showModal(
        modal
      );
    }

    // --------------------------------------------------------
    // CREATE EMBED
    // --------------------------------------------------------

    if (
      id === "embed_create"
    ) {

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
          .addComponents(
            title
          ),

        new ActionRowBuilder()
          .addComponents(
            description
          )

      );

      return interaction.showModal(
        modal
      );
    }

    // --------------------------------------------------------
    // SAVED EMBEDS
    // --------------------------------------------------------

    if (
      id === "embed_saved"
    ) {

      const embeds =
        data.embeds;

      const text =
        embeds.length
          ? embeds
              .slice(0, 20)
              .map(
                (embed, index) =>
                  `${index + 1}. **${embed.title}**`
              )
              .join("\n")
          : "No saved embeds.";

      return interaction.reply({

        content:
          `🧱 **Saved Embeds**\n\n${text}`,

        ephemeral: true

      });
    }

    // --------------------------------------------------------
    // TEMPLATE REFRESH
    // --------------------------------------------------------

    if (
      id === "template_list"
    ) {

      return interaction.update({

        embeds: [
          templatesEmbed()
        ],

        components:
          templatesButtons()

      });
    }

    // --------------------------------------------------------
    // TEMPLATE LOAD MENU
    // --------------------------------------------------------

    if (
      id === "template_load"
    ) {

      const db =
        loadDB();

      const templates =
        Object.values(
          db.templates
        );

      if (!templates.length) {

        return interaction.reply({

          content:
            "❌ No templates have been saved yet.",

          ephemeral: true

        });
      }

      const options =
        templates
          .slice(0, 25)
          .map(template => ({
            label:
              (
                template.displayName ||
                template.name ||
                "Template"
              ).slice(0, 100),

            value:
              (
                template.displayName ||
                template.name
              )
                .toLowerCase()
                .slice(0, 100),

            description:
              `${template.roles.length} roles • ${template.channels.length} channels`
          }));

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_template"
          )
          .setPlaceholder(
            "Choose a template"
          )
          .addOptions(
            options
          );

      return interaction.reply({

        content:
          "📥 Select the template you want to load.",

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
      !requireDashboard(
        interaction
      )
    ) {
      if (
        interaction.isRoleSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isStringSelectMenu()
      ) {
        return;
      }
    }

    // --------------------------------------------------------
    // AUTO ROLE
    // --------------------------------------------------------

    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId ===
        "select_autorole"
    ) {

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.autoRole.roleId =
        interaction.values[0];

      data.automation.autoRoles =
        true;

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({

        content:
          `✅ Auto role set to <@&${interaction.values[0]}>.`,

        components: []

      });
    }

    // --------------------------------------------------------
    // CHANNEL TYPE SELECT
    // --------------------------------------------------------

    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId ===
        "select_channel_type"
    ) {

      const channelId =
        interaction.values[0];

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            `channel_purpose:${channelId}`
          )
          .setPlaceholder(
            "What should this channel be used for?"
          )
          .addOptions(

            {
              label:
                "Logs / Transcripts",
              value:
                "logs",
              emoji:
                "📜"
            },

            {
              label:
                "Welcome Messages",
              value:
                "welcome",
              emoji:
                "👋"
            },

            {
              label:
                "Goodbye Messages",
              value:
                "goodbye",
              emoji:
                "🚪"
            },

            {
              label:
                "Moderation Logs",
              value:
                "moderation",
              emoji:
                "🛡️"
            }

          );

      return interaction.update({

        content:
          "📁 What should this channel be used for?",

        components: [

          new ActionRowBuilder()
            .addComponents(
              menu
            )

        ]

      });
    }

    // --------------------------------------------------------
    // CHANNEL PURPOSE
    // --------------------------------------------------------

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith(
        "channel_purpose:"
      )
    ) {

      const channelId =
        interaction.customId.split(":")[1];

      const purpose =
        interaction.values[0];

      const data =
        getGuildData(
          interaction.guild.id
        );

      if (
        purpose === "logs"
      ) {

        data.channels.logs =
          channelId;

        data.channels.transcripts =
          channelId;

      }

      if (
        purpose === "welcome"
      ) {

        data.channels.welcome =
          channelId;

      }

      if (
        purpose === "goodbye"
      ) {

        data.channels.goodbye =
          channelId;

      }

      if (
        purpose === "moderation"
      ) {

        data.channels.moderation =
          channelId;

      }

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({

        content:
          `✅ <#${channelId}> configured for **${purpose}**.`,

        components: []

      });
    }

    // --------------------------------------------------------
    // TEMPLATE SELECT
    // --------------------------------------------------------

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "select_template"
    ) {

      const templateName =
        interaction.values[0];

      const template =
        getTemplate(
          templateName
        );

      if (!template) {

        return interaction.update({

          content:
            "❌ That template no longer exists.",

          components: []

        });
      }

      const confirm =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                `confirm_load:${templateName}`
              )
              .setLabel(
                "Load Template"
              )
              .setEmoji("📥")
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId(
                "cancel_load"
              )
              .setLabel(
                "Cancel"
              )
              .setStyle(
                ButtonStyle.Secondary
              )

          );

      return interaction.update({

        content:
          `⚠️ Load **${template.displayName || templateName}**?\n\n` +
          `Roles: **${template.roles.length}**\n` +
          `Channels: **${template.channels.length}**\n\n` +
          "Existing server content will not automatically be deleted.",

        components: [
          confirm
        ]

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

    if (
      !interaction.isModalSubmit()
    ) return;

    if (
      !requireDashboard(
        interaction
      )
    ) return;

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
            "❌ Couldn't find that member.",

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
          .join(" ") ||
        "None";

      const embed =
        new EmbedBuilder()

          .setTitle(
            "🔎 User Lookup"
          )

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

          )

          .setTimestamp();

      return interaction.reply({

        embeds: [
          embed
        ],

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

      const db =
        loadDB();

      const guildData =
        db.guilds[
          interaction.guild.id
        ];

      if (!guildData) {

        return interaction.reply({

          content:
            "❌ No message history exists yet.",

          ephemeral: true

        });
      }

      const results = [];

      for (
        const messages
        of Object.values(
          guildData.messageLog || {}
        )
      ) {

        for (
          const message
          of messages
        ) {

          if (
            results.length >= 20
          ) break;

          const content =
            String(
              message.content || ""
            ).toLowerCase();

          let match;

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
              `• **${message.username}**\n` +
              `${String(
                message.content || "[No text]"
              ).slice(0, 300)}\n` +
              `\`${new Date(
                message.timestamp
              ).toLocaleString()}\``
            );
          }
        }

        if (
          results.length >= 20
        ) break;
      }

      return interaction.reply({

        content:
          results.length
            ? `🔎 Results for \`${query}\`\n\n${results.join("\n\n")}`
            : `❌ No stored messages matched \`${query}\`.`,

        ephemeral: true

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

      return interaction.reply({

        content:
          "✅ Embed created and saved.",

        embeds: [

          new EmbedBuilder()
            .setTitle(title)
            .setDescription(
              description
            )
            .setTimestamp()

        ],

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
    ) return;

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
    // CHAT LOGS
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

        if (
          data.channels.moderation
        ) {

          const modChannel =
            message.guild.channels.cache.get(
              data.channels.moderation
            );

          modChannel?.send(
            `🛡️ ${message.author} was timed out for suspected spam.`
          ).catch(() => {});
        }
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

      const bypass =
        message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        );

      if (
        url.test(
          message.content
        ) &&
        !bypass
      ) {

        await message.delete()
          .catch(() => {});
      }
    }

    // --------------------------------------------------------
    // ANTI MASS MENTION
    // --------------------------------------------------------

    if (
      data.moderation.antiMassMention &&
      message.mentions.users.size >= 5
    ) {

      await message.delete()
        .catch(() => {});
    }

    // --------------------------------------------------------
    // SIMPLE AUTOMOD
    // --------------------------------------------------------

    if (
      data.moderation.automod
    ) {

      const bannedPatterns = [
        "discord.gg/",
        "@everyone",
        "@here"
      ];

      const lower =
        message.content.toLowerCase();

      const matched =
        bannedPatterns.some(
          pattern =>
            lower.includes(
              pattern
            )
        );

      if (
        matched &&
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {

        await message.delete()
          .catch(() => {});
      }
    }

    saveDB(
      loadDB()
    );
  }
);

// ============================================================
// MESSAGE DELETE
// ============================================================

client.on(
  "messageDelete",
  async message => {

    if (
      !message.guild
    ) return;

    const data =
      getGuildData(
        message.guild.id
      );

    if (
      !data.automation.autoDeleteLogs ||
      !data.channels.logs
    ) return;

    const channel =
      message.guild.channels.cache.get(
        data.channels.logs
      );

    if (!channel) return;

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
                String(
                  message.content ||
                  "[Content unavailable]"
                ).slice(0, 1000)
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
    // AUTO ROLE
    // --------------------------------------------------------

    if (
      data.automation.autoRoles &&
      data.autoRole.roleId
    ) {

      const role =
        member.guild.roles.cache.get(
          data.autoRole.roleId
        );

      if (
        role &&
        role.position <
          member.guild.members.me.roles.highest.position
      ) {

        await member.roles.add(
          role,
          "Zynko automatic role"
        ).catch(() => {});
      }
    }

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
    ) return;

    const channel =
      member.guild.channels.cache.get(
        data.channels.goodbye
      );

    if (!channel) return;

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
      `✅ ${client.user.tag} is online.`
    );

    client.user.setActivity(
      "Server Dashboard",
      {
        type:
          ActivityType.Watching
      }
    );

    try {

      await registerCommands();

    } catch (error) {

      console.error(
        "❌ Command registration failed:",
        error
      );
    }
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

client.login(TOKEN);