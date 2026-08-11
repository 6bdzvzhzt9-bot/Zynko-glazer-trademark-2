// ============================================================
// ZYNKO CONTROL BOT — CLEAN UNIVERSAL DASHBOARD
// ============================================================
// COMMAND:
//   /dashboard
//
// DASHBOARD:
//   ⚡ Automation
//   🛡️ Moderation
//   🌎 Templates
//   ⚙️ Settings
//   🔎 Lookup
//   🧱 Embeds
//   ❓ Help
//
// TEMPLATES:
//   💾 Save Server
//   📥 Load Server
//   🗑️ Delete Template
//
// TEMPLATE COPIES:
//   • Roles
//   • Role permissions
//   • Role hierarchy
//   • Categories
//   • Text channels
//   • Voice channels
//   • Channel positions
//   • Topics
//   • Slowmode
//   • NSFW
//   • Role permission overwrites
//   • @everyone overwrites
//
// DOES NOT COPY:
//   • User-specific permission overwrites
//   • Invite Tracker role
//
// DASHBOARD:
//   • One message only
//   • Session lasts 10 minutes
//   • Original message changes to "Timed Out"
//   • No second timeout message
//   • Buttons stop working after timeout
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
const PORT = process.env.PORT || 3000;
const DB_FILE = "./database.json";

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing.");
  process.exit(1);
}

const SKIPPED_ROLES = new Set([
  "Invite Tracker"
]);

const DASHBOARD_TIMEOUT = 10 * 60 * 1000;

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

  embeds: [],
  warnings: {},
  messageLog: {},
  setupComplete: false
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        {
          guilds: {},
          templates: {}
        },
        null,
        2
      )
    );
  }
}

ensureDatabase();

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);

    if (!db || typeof db !== "object") {
      throw new Error("Invalid database.");
    }

    if (!db.guilds) db.guilds = {};
    if (!db.templates) db.templates = {};

    return db;
  } catch (error) {
    console.error("⚠️ Database read error:", error.message);

    return {
      guilds: {},
      templates: {}
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
    console.error("❌ Database write error:", error.message);
  }
}

function getGuildData(guildId) {
  const db = loadDB();

  if (!db.guilds[guildId]) {
    db.guilds[guildId] = clone(DEFAULT_GUILD);
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
// WEB SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Zynko Control Bot is online!");
});

app.get("/health", (req, res) => {
  res.json({
    online: true,
    uptime: process.uptime(),
    servers: client?.guilds?.cache?.size || 0
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ============================================================
// DASHBOARD SESSIONS
// ============================================================

const sessions = new Map();

function createDashboardSession(messageId, userId) {
  const session = {
    userId,
    expires: Date.now() + DASHBOARD_TIMEOUT,
    timer: null
  };

  session.timer = setTimeout(async () => {
    const current = sessions.get(messageId);

    if (!current) return;

    sessions.delete(messageId);

    try {
      const channel = await client.channels.fetch(
        current.channelId
      );

      if (!channel || !channel.isTextBased()) {
        return;
      }

      const message = await channel.messages.fetch(
        messageId
      );

      if (!message) return;

      const expiredEmbed = new EmbedBuilder()
        .setTitle("⏱️ Dashboard Timed Out")
        .setDescription(
          "This dashboard session has expired.\n\n" +
          "Run `/dashboard` to open a new control panel."
        )
        .setFooter({
          text: "Zynko Control"
        })
        .setTimestamp();

      await message.edit({
        embeds: [expiredEmbed],
        components: []
      });

    } catch (error) {
      console.log(
        `⚠️ Could not expire dashboard ${messageId}: ${error.message}`
      );
    }
  }, DASHBOARD_TIMEOUT);

  sessions.set(messageId, session);

  return session;
}

function setSessionChannel(messageId, channelId) {
  const session = sessions.get(messageId);

  if (!session) return;

  session.channelId = channelId;
}

function getSession(interaction) {
  const messageId = interaction.message?.id;

  if (!messageId) return null;

  const session = sessions.get(messageId);

  if (!session) return null;

  if (Date.now() >= session.expires) {
    sessions.delete(messageId);

    if (session.timer) {
      clearTimeout(session.timer);
    }

    return null;
  }

  return session;
}

function validSession(interaction) {
  const session = getSession(interaction);

  if (!session) return false;

  return session.userId === interaction.user.id;
}

// ============================================================
// ACCESS
// ============================================================

function hasAccess(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  if (!guild || !member) return false;

  if (guild.ownerId === member.id) {
    return true;
  }

  if (
    member.permissions?.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  if (
    member.permissions?.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) {
    return true;
  }

  return (
    member.permissions?.has(
      PermissionsBitField.Flags.ManageChannels
    ) &&
    member.permissions?.has(
      PermissionsBitField.Flags.ManageRoles
    )
  );
}

async function requireAccess(interaction) {
  if (hasAccess(interaction)) {
    return true;
  }

  const content =
    "❌ You don't have permission to use the Zynko dashboard.";

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content,
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content,
        ephemeral: true
      });
    }
  } catch {}

  return false;
}

// ============================================================
// SAFE HELPERS
// ============================================================

function enabled(value) {
  return value ? "🟢 Enabled" : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!guild || !id) {
    return "Not configured";
  }

  const channel = guild.channels?.cache?.get(id);

  return channel ? `<#${id}>` : "Channel not found";
}

function roleMention(guild, id) {
  if (!guild || !id) {
    return "Not configured";
  }

  const role = guild.roles?.cache?.get(id);

  return role ? `<@&${id}>` : "Role not found";
}

// ============================================================
// ROLE SERIALIZATION
// ============================================================

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.hexColor,
    hoist: role.hoist,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable
  };
}

// ============================================================
// OVERWRITES
// ============================================================

function serializeOverwrites(channel) {
  if (!channel?.permissionOverwrites?.cache) {
    return [];
  }

  return channel.permissionOverwrites.cache
    .filter(overwrite => overwrite.type === 0)
    .map(overwrite => ({
      id: overwrite.id,
      type: 0,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString()
    }));
}

// ============================================================
// CHANNEL SERIALIZATION
// ============================================================

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition ?? 0,
    parentId: channel.parentId ?? null,

    topic:
      typeof channel.topic === "string"
        ? channel.topic
        : null,

    nsfw:
      typeof channel.nsfw === "boolean"
        ? channel.nsfw
        : false,

    rateLimitPerUser:
      typeof channel.rateLimitPerUser === "number"
        ? channel.rateLimitPerUser
        : 0,

    bitrate:
      typeof channel.bitrate === "number"
        ? channel.bitrate
        : null,

    userLimit:
      typeof channel.userLimit === "number"
        ? channel.userLimit
        : null,

    rtcRegion:
      channel.rtcRegion ?? null,

    permissionOverwrites:
      serializeOverwrites(channel)
  };
}

// ============================================================
// CREATE SNAPSHOT
// ============================================================

function createServerSnapshot(guild) {
  const roles = [];

  if (guild?.roles?.cache) {
    for (const role of guild.roles.cache.values()) {
      if (role.id === guild.id) continue;

      if (SKIPPED_ROLES.has(role.name)) {
        continue;
      }

      roles.push(serializeRole(role));
    }
  }

  roles.sort((a, b) => a.position - b.position);

  const channels = [];

  if (guild?.channels?.cache) {
    for (const channel of guild.channels.cache.values()) {
      channels.push(serializeChannel(channel));
    }
  }

  channels.sort(
    (a, b) => a.position - b.position
  );

  return {
    version: 4,

    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL()
    },

    roles,
    channels,
    created: Date.now()
  };
}

// ============================================================
// RESTORE ROLES
// ============================================================

async function restoreRoles(guild, snapshot) {
  const roleMap = {};

  roleMap[snapshot.guild.id] = guild.id;

  if (!guild.roles?.cache) {
    throw new Error("Guild role cache is unavailable.");
  }

  const existingRoleCount = guild.roles.cache.size;

  const availableSlots =
    Math.max(0, 250 - existingRoleCount);

  let createdCount = 0;

  const sortedRoles = [...snapshot.roles]
    .sort((a, b) => a.position - b.position);

  for (const savedRole of sortedRoles) {
    if (SKIPPED_ROLES.has(savedRole.name)) {
      continue;
    }

    let existing = guild.roles.cache.find(
      role =>
        role.name === savedRole.name &&
        role.id !== guild.id
    );

    try {
      if (existing) {
        roleMap[savedRole.id] = existing.id;

        if (existing.editable) {
          await existing.edit({
            name: savedRole.name,
            permissions: BigInt(savedRole.permissions),
            hoist: savedRole.hoist,
            mentionable: savedRole.mentionable,
            color: savedRole.color,
            reason: "Zynko server template"
          });
        }

        continue;
      }

      if (createdCount >= availableSlots) {
        console.log(
          `⚠️ Role limit reached. Skipping ${savedRole.name}`
        );

        continue;
      }

      existing = await guild.roles.create({
        name: savedRole.name,
        permissions: BigInt(savedRole.permissions),
        hoist: savedRole.hoist,
        mentionable: savedRole.mentionable,
        color: savedRole.color,
        reason: "Zynko server template"
      });

      createdCount++;

      roleMap[savedRole.id] = existing.id;

    } catch (error) {
      console.log(
        `⚠️ Role "${savedRole.name}" failed: ${error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // HIERARCHY
  // ----------------------------------------------------------

  const positions = [];

  for (const savedRole of snapshot.roles) {
    const newId = roleMap[savedRole.id];

    if (!newId) continue;

    const role = guild.roles.cache.get(newId);

    if (!role || !role.editable) continue;

    positions.push({
      role: newId,
      position: savedRole.position
    });
  }

  if (positions.length) {
    try {
      await guild.roles.setPositions(positions);
    } catch (error) {
      console.log(
        `⚠️ Some role positions could not be restored: ${error.message}`
      );
    }
  }

  return roleMap;
}

// ============================================================
// APPLY OVERWRITES
// ============================================================

async function applyOverwrites(
  channel,
  overwrites,
  roleMap
) {
  if (!channel) return;

  if (!Array.isArray(overwrites)) {
    return;
  }

  const permissions = [];

  for (const overwrite of overwrites) {
    // Only role overwrites.
    if (overwrite.type !== 0) {
      continue;
    }

    const targetId = roleMap[overwrite.id];

    if (!targetId) {
      continue;
    }

    permissions.push({
      id: targetId,
      type: 0,
      allow: BigInt(overwrite.allow || "0"),
      deny: BigInt(overwrite.deny || "0")
    });
  }

  try {
    await channel.permissionOverwrites.set(
      permissions,
      "Zynko server template permissions"
    );
  } catch (error) {
    console.log(
      `⚠️ Permissions failed for #${channel.name}: ${error.message}`
    );
  }
}

// ============================================================
// RESTORE CATEGORIES
// ============================================================

async function restoreCategories(
  guild,
  snapshot,
  roleMap
) {
  const channelMap = {};

  const categories = snapshot.channels
    .filter(
      channel =>
        channel.type === ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of categories) {
    try {
      let category = guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildCategory &&
          channel.name === saved.name
      );

      if (!category) {
        category = await guild.channels.create({
          name: saved.name,
          type: ChannelType.GuildCategory,
          reason: "Zynko server template"
        });
      }

      channelMap[saved.id] = category.id;

      await applyOverwrites(
        category,
        saved.permissionOverwrites,
        roleMap
      );

      await category
        .setPosition(saved.position)
        .catch(() => {});

    } catch (error) {
      console.log(
        `⚠️ Category "${saved.name}" failed: ${error.message}`
      );
    }
  }

  return channelMap;
}

// ============================================================
// RESTORE CHANNELS
// ============================================================

async function restoreChannels(
  guild,
  snapshot,
  roleMap,
  channelMap
) {
  const channels = snapshot.channels
    .filter(
      channel =>
        channel.type !== ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of channels) {
    try {
      let channel = guild.channels.cache.find(
        existing =>
          existing.name === saved.name &&
          existing.type === saved.type
      );

      const parentId = saved.parentId
        ? channelMap[saved.parentId] || null
        : null;

      if (!channel) {
        const options = {
          name: saved.name,
          type: saved.type,
          parent: parentId,
          reason: "Zynko server template"
        };

        if (saved.type === ChannelType.GuildText) {
          options.topic = saved.topic || undefined;
          options.nsfw = Boolean(saved.nsfw);
          options.rateLimitPerUser =
            saved.rateLimitPerUser || 0;
        }

        if (saved.type === ChannelType.GuildVoice) {
          if (saved.bitrate) {
            options.bitrate = saved.bitrate;
          }

          if (saved.userLimit) {
            options.userLimit = saved.userLimit;
          }

          if (saved.rtcRegion) {
            options.rtcRegion = saved.rtcRegion;
          }
        }

        channel = await guild.channels.create(options);

      } else {
        const editOptions = {
          parent: parentId
        };

        if (saved.type === ChannelType.GuildText) {
          editOptions.topic = saved.topic || null;
          editOptions.nsfw = Boolean(saved.nsfw);
          editOptions.rateLimitPerUser =
            saved.rateLimitPerUser || 0;
        }

        await channel.edit(editOptions).catch(() => {});
      }

      channelMap[saved.id] = channel.id;

      await applyOverwrites(
        channel,
        saved.permissionOverwrites,
        roleMap
      );

      await channel
        .setPosition(saved.position)
        .catch(() => {});

    } catch (error) {
      console.log(
        `⚠️ Channel "${saved.name}" failed: ${error.message}`
      );
    }
  }
}

// ============================================================
// FULL TEMPLATE LOAD
// ============================================================

async function loadServerSnapshot(
  guild,
  snapshot
) {
  if (!guild) {
    throw new Error("Guild unavailable.");
  }

  const me = guild.members?.me;

  if (!me) {
    throw new Error("Bot member could not be found.");
  }

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    throw new Error("Bot needs Manage Channels.");
  }

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  ) {
    throw new Error("Bot needs Manage Roles.");
  }

  const roleMap = await restoreRoles(
    guild,
    snapshot
  );

  const channelMap = await restoreCategories(
    guild,
    snapshot,
    roleMap
  );

  await restoreChannels(
    guild,
    snapshot,
    roleMap,
    channelMap
  );

  return {
    roleMap,
    channelMap
  };
}

// ============================================================
// HOME EMBED
// ============================================================

function homeEmbed(guild, user) {
  const data = getGuildData(guild.id);
  const db = loadDB();

  return new EmbedBuilder()
    .setTitle("⚙️ Zynko Control Dashboard")
    .setDescription(
      "Your server control center.\n\n" +
      "Manage automation, moderation and universal server templates."
    )
    .addFields(
      {
        name: "⚡ Automation",
        value:
          Object.values(data.automation).some(Boolean)
            ? "🟢 Active"
            : "🔴 Disabled",
        inline: true
      },
      {
        name: "🛡️ Moderation",
        value:
          Object.values(data.moderation).some(Boolean)
            ? "🟢 Active"
            : "⚪ Basic",
        inline: true
      },
      {
        name: "🌎 Templates",
        value: `${Object.keys(db.templates).length} saved`,
        inline: true
      },
      {
        name: "🧱 Embeds",
        value: `${data.embeds.length} saved`,
        inline: true
      },
      {
        name: "📜 Logs",
        value: channelMention(
          guild,
          data.channels.logs
        ),
        inline: true
      },
      {
        name: "👤 Auto Role",
        value: roleMention(
          guild,
          data.roles.autoRole
        ),
        inline: true
      }
    )
    .setFooter({
      text: `Opened by ${user.username} • 10 minute session`
    })
    .setTimestamp();
}

// ============================================================
// HOME BUTTONS
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
        .setCustomId("home_templates")
        .setLabel("Templates")
        .setEmoji("🌎")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("home_settings")
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("home_lookup")
        .setLabel("Lookup")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("home_embeds")
        .setLabel("Embeds")
        .setEmoji("🧱")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("home_help")
        .setLabel("Help")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// BACK BUTTON
// ============================================================

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
    .setDescription("Automatic server systems.")
    .addFields(
      {
        name: "📜 Transcripts",
        value: enabled(data.automation.transcripts),
        inline: true
      },
      {
        name: "👋 Auto Joins",
        value: enabled(data.automation.autoJoins),
        inline: true
      },
      {
        name: "🚪 Auto Goodbyes",
        value: enabled(data.automation.autoGoodbyes),
        inline: true
      },
      {
        name: "💬 Chat Logs",
        value: enabled(data.automation.autoChatLogs),
        inline: true
      },
      {
        name: "🧹 Delete Logs",
        value: enabled(data.automation.autoDeleteLogs),
        inline: true
      },
      {
        name: "👤 Auto Roles",
        value: enabled(data.automation.autoRoles),
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
    .addFields(
      {
        name: "⚠️ Warnings",
        value: enabled(data.moderation.warnings),
        inline: true
      },
      {
        name: "🤖 AutoMod",
        value: enabled(data.moderation.automod),
        inline: true
      },
      {
        name: "💬 Anti Spam",
        value: enabled(data.moderation.antiSpam),
        inline: true
      },
      {
        name: "🔗 Anti Links",
        value: enabled(data.moderation.antiLinks),
        inline: true
      },
      {
        name: "📢 Anti Mentions",
        value: enabled(data.moderation.antiMassMention),
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
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("mod_automod")
        .setLabel("AutoMod")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mod_spam")
        .setLabel("Anti Spam")
        .setStyle(ButtonStyle.Danger)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mod_links")
        .setLabel("Anti Links")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mod_mentions")
        .setLabel("Anti Mentions")
        .setStyle(ButtonStyle.Danger)
    ),

    backButton()
  ];
}

// ============================================================
// TEMPLATE EMBED
// ============================================================

function templateEmbed() {
  const db = loadDB();
  const templates = Object.values(db.templates);

  let description =
    "🌎 **Universal Server Templates**\n\n" +
    "Save a server and load its structure into another server.\n\n";

  if (!templates.length) {
    description += "❌ No templates saved.";
  } else {
    for (const template of templates.slice(0, 15)) {
      description +=
        `**${template.name}**\n` +
        `> ${template.snapshot?.roles?.length || 0} roles • ` +
        `${template.snapshot?.channels?.length || 0} channels\n\n`;
    }
  }

  return new EmbedBuilder()
    .setTitle("🌎 Universal Templates")
    .setDescription(description);
}

function templateButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("template_create")
        .setLabel("Save Server")
        .setEmoji("💾")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("template_use")
        .setLabel("Load Server")
        .setEmoji("📥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("template_delete")
        .setLabel("Delete")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
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
    .addFields(
      {
        name: "🤖 Bot Name",
        value:
          data.settings.botName ||
          client.user?.username ||
          "Zynko",
        inline: true
      },
      {
        name: "📜 Logs",
        value: channelMention(
          guild,
          data.channels.logs
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
        .setStyle(ButtonStyle.Primary)
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
      `Saved embeds: **${data.embeds.length}**`
    );
}

function embedsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("embed_create")
        .setLabel("Create")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("embed_saved")
        .setLabel("Saved")
        .setEmoji("📋")
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
    .setTitle("🔎 Lookup")
    .setDescription(
      "Search members and recent messages."
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
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

// ============================================================
// HELP
// ============================================================

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle("❓ Help")
    .setDescription(
      "**/dashboard**\n" +
      "Open the Zynko Control Dashboard.\n\n" +

      "**Templates**\n" +
      "Use the dashboard to save and load universal server templates.\n\n" +

      "**Templates copy:**\n" +
      "• Roles\n" +
      "• Role permissions\n" +
      "• Role hierarchy\n" +
      "• Categories\n" +
      "• Channels\n" +
      "• Channel positions\n" +
      "• Topics\n" +
      "• Slowmode\n" +
      "• NSFW\n" +
      "• Permission overwrites\n" +
      "• Role-only channels\n" +
      "• Admin-only channels\n\n" +

      "**Skipped:**\n" +
      "• Invite Tracker\n" +
      "• Individual user permission overwrites"
    );
}

// ============================================================
// MODAL BUILDER
// ============================================================

function makeModal(id, title, fields) {
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
      .setRequired(field.required !== false);

    if (field.placeholder) {
      input.setPlaceholder(field.placeholder);
    }

    if (field.maxLength) {
      input.setMaxLength(field.maxLength);
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// ============================================================
// /DASHBOARD ONLY
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== "dashboard") {
      return;
    }

    if (!(await requireAccess(interaction))) {
      return;
    }

    try {
      const message = await interaction.reply({
        embeds: [
          homeEmbed(
            interaction.guild,
            interaction.user
          )
        ],
        components: homeButtons(),
        fetchReply: true
      });

      createDashboardSession(
        message.id,
        interaction.user.id
      );

      setSessionChannel(
        message.id,
        message.channelId
      );

    } catch (error) {
      console.error(
        "❌ Dashboard error:",
        error
      );
    }
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

    if (!(await requireAccess(interaction))) {
      return;
    }

    const session = getSession(interaction);

    if (!session) {
      try {
        await interaction.reply({
          content:
            "⏱️ This dashboard has expired. Run `/dashboard` again.",
          ephemeral: true
        });
      } catch {}

      return;
    }

    if (session.userId !== interaction.user.id) {
      try {
        await interaction.reply({
          content:
            "❌ This dashboard belongs to another user.",
          ephemeral: true
        });
      } catch {}

      return;
    }

    const id = interaction.customId;
    const guild = interaction.guild;

    if (!guild) return;

    const data = getGuildData(guild.id);

    // ========================================================
    // HOME
    // ========================================================

    if (id === "go_home") {
      return interaction.update({
        embeds: [
          homeEmbed(
            guild,
            interaction.user
          )
        ],
        components: homeButtons()
      });
    }

    if (id === "home_automation") {
      return interaction.update({
        embeds: [automationEmbed(guild)],
        components: automationButtons()
      });
    }

    if (id === "home_moderation") {
      return interaction.update({
        embeds: [moderationEmbed(guild)],
        components: moderationButtons()
      });
    }

    if (id === "home_templates") {
      return interaction.update({
        embeds: [templateEmbed()],
        components: templateButtons()
      });
    }

    if (id === "home_settings") {
      return interaction.update({
        embeds: [settingsEmbed(guild)],
        components: settingsButtons()
      });
    }

    if (id === "home_embeds") {
      return interaction.update({
        embeds: [embedsEmbed(guild)],
        components: embedsButtons()
      });
    }

    if (id === "home_lookup") {
      return interaction.update({
        embeds: [lookupEmbed()],
        components: lookupButtons()
      });
    }

    if (id === "home_help") {
      return interaction.update({
        embeds: [helpEmbed()],
        components: [backButton()]
      });
    }

    // ========================================================
    // AUTOMATION
    // ========================================================

    const automationMap = {
      auto_transcripts: "transcripts",
      auto_joins: "autoJoins",
      auto_goodbyes: "autoGoodbyes",
      auto_chatlogs: "autoChatLogs",
      auto_delete: "autoDeleteLogs",
      auto_roles: "autoRoles"
    };

    if (automationMap[id]) {
      const key = automationMap[id];

      data.automation[key] =
        !data.automation[key];

      updateGuild(guild.id, data);

      return interaction.update({
        embeds: [automationEmbed(guild)],
        components: automationButtons()
      });
    }

    // ========================================================
    // MODERATION
    // ========================================================

    const moderationMap = {
      mod_warnings: "warnings",
      mod_automod: "automod",
      mod_spam: "antiSpam",
      mod_links: "antiLinks",
      mod_mentions: "antiMassMention"
    };

    if (moderationMap[id]) {
      const key = moderationMap[id];

      data.moderation[key] =
        !data.moderation[key];

      updateGuild(guild.id, data);

      return interaction.update({
        embeds: [moderationEmbed(guild)],
        components: moderationButtons()
      });
    }

    // ========================================================
    // SAVE TEMPLATE
    // ========================================================

    if (id === "template_create") {
      return interaction.showModal(
        makeModal(
          "modal_template",
          "Save Server Template",
          [
            {
              id: "name",
              label: "Template Name",
              maxLength: 100
            }
          ]
        )
      );
    }

    // ========================================================
    // LOAD TEMPLATE MENU
    // ========================================================

    if (id === "template_use") {
      const db = loadDB();

      const templates = Object.values(
        db.templates
      );

      if (!templates.length) {
        return interaction.reply({
          content: "❌ No templates saved.",
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("select_template")
        .setPlaceholder(
          "Choose a server template"
        );

      templates
        .slice(0, 25)
        .forEach(template => {
          menu.addOptions({
            label: template.name.slice(0, 100),
            value: template.name.toLowerCase(),
            emoji: "📥"
          });
        });

      return interaction.reply({
        content:
          "🌎 Choose the server template to load.",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // ========================================================
    // DELETE TEMPLATE MENU
    // ========================================================

    if (id === "template_delete") {
      const db = loadDB();

      const templates = Object.values(
        db.templates
      );

      if (!templates.length) {
        return interaction.reply({
          content: "❌ No templates.",
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("delete_template")
        .setPlaceholder(
          "Choose a template"
        );

      templates
        .slice(0, 25)
        .forEach(template => {
          menu.addOptions({
            label: template.name.slice(0, 100),
            value: template.name.toLowerCase(),
            emoji: "🗑️"
          });
        });

      return interaction.reply({
        content:
          "🗑️ Choose a template to delete.",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // ========================================================
    // BOT NAME
    // ========================================================

    if (id === "setting_botname") {
      return interaction.showModal(
        makeModal(
          "modal_botname",
          "Bot Name",
          [
            {
              id: "botname",
              label: "Bot Nickname",
              maxLength: 32
            }
          ]
        )
      );
    }

    // ========================================================
    // EMBED CREATE
    // ========================================================

    if (id === "embed_create") {
      return interaction.showModal(
        makeModal(
          "modal_embed",
          "Create Embed",
          [
            {
              id: "title",
              label: "Title",
              maxLength: 256
            },
            {
              id: "description",
              label: "Description",
              style: TextInputStyle.Paragraph,
              maxLength: 4000
            }
          ]
        )
      );
    }

    // ========================================================
    // SAVED EMBEDS
    // ========================================================

    if (id === "embed_saved") {
      if (!data.embeds.length) {
        return interaction.reply({
          content: "🧱 No saved embeds.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          "🧱 **Saved Embeds**\n\n" +
          data.embeds
            .map(
              (embed, index) =>
                `${index + 1}. **${embed.title}**`
            )
            .join("\n"),
        ephemeral: true
      });
    }

    // ========================================================
    // USER LOOKUP
    // ========================================================

    if (id === "lookup_user") {
      return interaction.showModal(
        makeModal(
          "modal_lookup_user",
          "User Lookup",
          [
            {
              id: "userid",
              label: "Discord User ID"
            }
          ]
        )
      );
    }

    // ========================================================
    // MESSAGE LOOKUP
    // ========================================================

    if (id === "lookup_messages") {
      return interaction.showModal(
        makeModal(
          "modal_lookup_messages",
          "Message Search",
          [
            {
              id: "query",
              label: "Search Phrase",
              maxLength: 100
            }
          ]
        )
      );
    }
  }
);

// ============================================================
// SELECT MENUS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isStringSelectMenu()) {
      return;
    }

    if (!(await requireAccess(interaction))) {
      return;
    }

    // ========================================================
    // LOAD TEMPLATE
    // ========================================================

    if (
      interaction.customId ===
      "select_template"
    ) {
      const db = loadDB();

      const key =
        interaction.values?.[0]?.toLowerCase();

      if (!key) {
        return interaction.update({
          content: "❌ Invalid template.",
          components: []
        });
      }

      const template = db.templates[key];

      if (!template) {
        return interaction.update({
          content:
            "❌ Template no longer exists.",
          components: []
        });
      }

      if (!template.snapshot) {
        return interaction.update({
          content:
            "❌ This template is outdated.",
          components: []
        });
      }

      await interaction.update({
        content:
          `⏳ Loading **${template.name}**...\n\n` +
          "🎭 Restoring roles...\n" +
          "📁 Restoring categories...\n" +
          "💬 Restoring channels...\n" +
          "🔒 Restoring permissions...",
        components: []
      });

      try {
        const result =
          await loadServerSnapshot(
            interaction.guild,
            template.snapshot
          );

        await interaction.editReply({
          content:
            `✅ **${template.name}** loaded successfully.\n\n` +
            `🎭 ${Math.max(
              0,
              Object.keys(result.roleMap).length - 1
            )} roles mapped\n` +
            `📁 Categories restored\n` +
            `💬 Channels restored\n` +
            `📐 Layout restored\n` +
            `🔒 Permissions restored`
        });

      } catch (error) {
        console.error(
          "❌ TEMPLATE LOAD ERROR:",
          error
        );

        await interaction.editReply({
          content:
            `❌ Load failed:\n\`${error.message}\``
        });
      }

      return;
    }

    // ========================================================
    // DELETE TEMPLATE
    // ========================================================

    if (
      interaction.customId ===
      "delete_template"
    ) {
      const db = loadDB();

      const key =
        interaction.values?.[0]?.toLowerCase();

      const template = db.templates[key];

      if (!template) {
        return interaction.update({
          content:
            "❌ Template no longer exists.",
          components: []
        });
      }

      delete db.templates[key];

      saveDB(db);

      return interaction.update({
        content:
          `🗑️ Deleted **${template.name}**.`,
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

    if (!(await requireAccess(interaction))) {
      return;
    }

    // ========================================================
    // SAVE TEMPLATE
    // ========================================================

    if (
      interaction.customId ===
      "modal_template"
    ) {
      const name =
        interaction.fields.getTextInputValue(
          "name"
        ).trim();

      if (!name) {
        return interaction.reply({
          content:
            "❌ Template name cannot be empty.",
          ephemeral: true
        });
      }

      await interaction.deferReply({
        ephemeral: true
      });

      try {
        const snapshot =
          createServerSnapshot(
            interaction.guild
          );

        const db = loadDB();

        db.templates[
          name.toLowerCase()
        ] = {
          name,
          created: Date.now(),
          ownerId: interaction.user.id,
          ownerName: interaction.user.username,

          sourceGuild: {
            id: interaction.guild.id,
            name: interaction.guild.name
          },

          snapshot
        };

        saveDB(db);

        return interaction.editReply(
          `✅ **${name}** saved!\n\n` +
          `🎭 ${snapshot.roles.length} roles\n` +
          `📁 ${
            snapshot.channels.filter(
              channel =>
                channel.type ===
                ChannelType.GuildCategory
            ).length
          } categories\n` +
          `💬 ${
            snapshot.channels.filter(
              channel =>
                channel.type !==
                ChannelType.GuildCategory
            ).length
          } channels\n` +
          "🔒 Permission overwrites included.\n" +
          "⏭️ Invite Tracker skipped."
        );

      } catch (error) {
        console.error(
          "❌ TEMPLATE SAVE ERROR:",
          error
        );

        return interaction.editReply(
          `❌ Save failed:\n\`${error.message}\``
        );
      }
    }

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

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.settings.botName = name;

      updateGuild(
        interaction.guild.id,
        data
      );

      try {
        await interaction.guild.members.me?.setNickname(
          name
        );
      } catch {}

      return interaction.reply({
        content:
          `✅ Bot nickname changed to **${name}**.`,
        ephemeral: true
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
        interaction.fields.getTextInputValue(
          "title"
        );

      const description =
        interaction.fields.getTextInputValue(
          "description"
        );

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.embeds.push({
        title,
        description,
        created: Date.now()
      });

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.reply({
        content: "✅ Embed saved.",
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
        ],
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
      const id =
        interaction.fields.getTextInputValue(
          "userid"
        ).trim();

      let member;

      try {
        member =
          await interaction.guild.members.fetch(
            id
          );
      } catch {
        return interaction.reply({
          content:
            "❌ Member not found.",
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
          .join(", ") || "None";

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
              name: "Roles",
              value: roles
            },
            {
              name: "Joined",
              value:
                member.joinedTimestamp
                  ? `<t:${Math.floor(
                      member.joinedTimestamp / 1000
                    )}:F>`
                  : "Unknown"
            }
          );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // ========================================================
    // MESSAGE LOOKUP
    // ========================================================

    if (
      interaction.customId ===
      "modal_lookup_messages"
    ) {
      const query =
        interaction.fields
          .getTextInputValue("query")
          .toLowerCase();

      await interaction.deferReply({
        ephemeral: true
      });

      const results = [];

      const channels =
        interaction.guild.channels.cache.filter(
          channel =>
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
            if (!message.content) continue;

            if (
              !message.content
                .toLowerCase()
                .includes(query)
            ) {
              continue;
            }

            results.push(
              `• ${message.author} in ${channel}\n` +
              `${message.content.slice(0, 250)}\n` +
              `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id}`
            );

            if (results.length >= 20) {
              break;
            }
          }
        } catch {}
      }

      return interaction.editReply({
        content:
          results.length
            ? `🔎 **Results:**\n\n${results.join(
                "\n\n"
              )}`
            : `❌ No results for \`${query}\`.`
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
    if (!message.guild || message.author.bot) {
      return;
    }

    const data =
      getGuildData(
        message.guild.id
      );

    if (!data.messageLog) {
      data.messageLog = {};
    }

    data.messageLog[
      message.channel.id
    ] ||= [];

    data.messageLog[
      message.channel.id
    ].push({
      id: message.id,
      user: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: Date.now()
    });

    data.messageLog[
      message.channel.id
    ] =
      data.messageLog[
        message.channel.id
      ].slice(-200);

    // ========================================================
    // CHAT LOGS
    // ========================================================

    if (
      data.automation.autoChatLogs &&
      data.channels.logs
    ) {
      const channel =
        message.guild.channels.cache.get(
          data.channels.logs
        );

      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("💬 Message Log")
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
                },
                {
                  name: "Message",
                  value:
                    message.content.slice(
                      0,
                      1000
                    ) || "[No text]"
                }
              )
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    }

    // ========================================================
    // ANTI SPAM
    // ========================================================

    if (data.moderation.antiSpam) {
      const recent =
        data.messageLog[
          message.channel.id
        ] || [];

      const count =
        recent.filter(
          entry =>
            entry.user ===
              message.author.id &&
            Date.now() -
              entry.timestamp <
              5000
        ).length;

      if (
        count >= 6 &&
        message.member?.moderatable
      ) {
        await message.member
          .timeout(
            30000,
            "Zynko anti-spam"
          )
          .catch(() => {});
      }
    }

    // ========================================================
    // ANTI LINKS
    // ========================================================

    if (data.moderation.antiLinks) {
      const hasLink =
        /(https?:\/\/|www\.)/i.test(
          message.content
        );

      const allowed =
        message.member?.permissions?.has(
          PermissionsBitField.Flags.ManageMessages
        );

      if (hasLink && !allowed) {
        await message.delete().catch(() => {});
        return;
      }
    }

    // ========================================================
    // ANTI MASS MENTION
    // ========================================================

    if (
      data.moderation.antiMassMention &&
      message.mentions.users.size >= 5
    ) {
      await message.delete().catch(() => {});
      return;
    }

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

    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🗑️ Deleted Message")
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
              value: `${message.channel}`
            },
            {
              name: "Content",
              value:
                message.content?.slice(
                  0,
                  1000
                ) ||
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
      data.automation.autoJoins &&
      data.channels.welcome
    ) {
      const channel =
        member.guild.channels.cache.get(
          data.channels.welcome
        );

      if (channel?.isTextBased()) {
        await channel.send(
          `👋 Welcome ${member} to **${member.guild.name}**!`
        ).catch(() => {});
      }
    }

    if (
      data.automation.autoRoles &&
      data.roles.autoRole
    ) {
      const role =
        member.guild.roles.cache.get(
          data.roles.autoRole
        );

      const me =
        member.guild.members.me;

      if (
        role &&
        me &&
        role.position <
          me.roles.highest.position
      ) {
        await member.roles.add(
          role,
          "Zynko automatic role"
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
    ) {
      return;
    }

    const channel =
      member.guild.channels.cache.get(
        data.channels.goodbye
      );

    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send(
      `🚪 **${member.user.username}** has left the server.`
    ).catch(() => {});
  }
);

// ============================================================
// COMMAND REGISTRATION
// ============================================================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription(
        "Open the Zynko Control Dashboard"
      )
  ];

  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands.map(
          command => command.toJSON()
        )
      }
    );

    console.log(
      "✅ /dashboard registered."
    );

    console.log(
      "🗑️ /save and /load are NOT registered."
    );

  } catch (error) {
    console.error(
      "❌ Command registration failed:",
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
      "Zynko Control",
      {
        type: ActivityType.Watching
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
});

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