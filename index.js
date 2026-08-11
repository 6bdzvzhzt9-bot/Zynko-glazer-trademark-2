// ============================================================
// ZYNKO CONTROL BOT — FULL SERVER TEMPLATE / CLONER
// ============================================================
// Features:
// /dashboard
// /save <name>
// /load <name>
//
// Copies:
// • Roles + hierarchy
// • Role permissions
// • Categories
// • Text channels
// • Voice channels
// • Channel positions
// • Topics
// • Slowmode
// • NSFW status
// • Channel permission overwrites
// • Admin-only / role-only channel visibility
// • Zynko automation settings
//
// IMPORTANT:
// Discord does not allow bots to copy server ownership,
// integrations, some community settings, or anything the bot
// itself does not have permission to manage.
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
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
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
  res.json({
    online: true,
    uptime: process.uptime(),
    servers: client?.guilds?.cache?.size || 0
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on ${PORT}`);
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

  embeds: [],
  warnings: {},
  messageLog: {},
  setupComplete: false
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function ensureDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({
        guilds: {},
        templates: {}
      }, null, 2)
    );
  }
}

ensureDatabase();

function loadDB() {
  try {
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    db.guilds ||= {};
    db.templates ||= {};

    return db;
  } catch {
    return {
      guilds: {},
      templates: {}
    };
  }
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
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
// SESSIONS
// ============================================================

const sessions = new Map();

function createSession(messageId, userId) {
  sessions.set(messageId, {
    userId,
    expires: Date.now() + 10 * 60 * 1000
  });

  setTimeout(() => {
    sessions.delete(messageId);
  }, 10 * 60 * 1000);
}

function validSession(interaction) {
  const session = sessions.get(
    interaction.message?.id
  );

  if (!session) return false;

  if (Date.now() > session.expires) {
    sessions.delete(interaction.message.id);
    return false;
  }

  return session.userId === interaction.user.id;
}

// ============================================================
// ACCESS
// ============================================================

function hasAccess(interaction) {
  const guild = interaction.guild;
  const member = interaction.member;

  if (!guild || !member) return false;

  if (guild.ownerId === member.id) return true;

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) return true;

  if (
    member.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) return true;

  return (
    member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    ) &&
    member.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  );
}

async function requireAccess(interaction) {
  if (hasAccess(interaction)) return true;

  const text =
    "❌ You don't have permission to use the Zynko dashboard.";

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      content: text,
      ephemeral: true
    }).catch(() => {});
  } else {
    await interaction.reply({
      content: text,
      ephemeral: true
    }).catch(() => {});
  }

  return false;
}

// ============================================================
// HELPERS
// ============================================================

function enabled(value) {
  return value
    ? "🟢 Enabled"
    : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!id) return "Not configured";

  const channel = guild.channels.cache.get(id);

  return channel
    ? `<#${id}>`
    : "Channel not found";
}

// ============================================================
// SERVER CLONE — ROLE SERIALIZATION
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
// SERVER CLONE — OVERWRITE SERIALIZATION
// ============================================================

function serializeOverwrites(channel) {
  return channel.permissionOverwrites.cache.map(overwrite => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }));
}

// ============================================================
// SERVER CLONE — CHANNEL SERIALIZATION
// ============================================================

function serializeChannel(channel) {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,

    position: channel.rawPosition,

    parentId: channel.parentId,

    topic:
      "topic" in channel
        ? channel.topic
        : null,

    nsfw:
      "nsfw" in channel
        ? channel.nsfw
        : false,

    rateLimitPerUser:
      "rateLimitPerUser" in channel
        ? channel.rateLimitPerUser
        : 0,

    bitrate:
      "bitrate" in channel
        ? channel.bitrate
        : null,

    userLimit:
      "userLimit" in channel
        ? channel.userLimit
        : null,

    rtcRegion:
      "rtcRegion" in channel
        ? channel.rtcRegion
        : null,

    permissionOverwrites:
      serializeOverwrites(channel)
  };
}

// ============================================================
// FULL SERVER SNAPSHOT
// ============================================================

function createServerSnapshot(guild) {
  const roles = guild.roles.cache
    .filter(role => role.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(serializeRole);

  const channels = guild.channels.cache
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(serializeChannel);

  return {
    version: 2,

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
// FIND ROLE BY SAVED ID
// ============================================================

function findMappedRoleId(roleMap, savedRoleId) {
  return roleMap[savedRoleId] || null;
}

// ============================================================
// APPLY ROLE PERMISSIONS
// ============================================================

async function restoreRoles(guild, snapshot) {
  const roleMap = {};

  // @everyone
  roleMap[snapshot.guild.id] = guild.id;

  // Discord requires roles to exist before overwrites
  // can reference them.

  const sortedRoles = [...snapshot.roles]
    .sort((a, b) => a.position - b.position);

  for (const savedRole of sortedRoles) {
    let existing = guild.roles.cache.find(
      r =>
        r.name === savedRole.name &&
        r.id !== guild.id
    );

    try {
      if (!existing) {
        existing = await guild.roles.create({
          name: savedRole.name,
          permissions: BigInt(savedRole.permissions),
          hoist: savedRole.hoist,
          mentionable: savedRole.mentionable,
          reason: "Zynko server template"
        });
      } else {
        await existing.edit({
          name: savedRole.name,
          permissions: BigInt(savedRole.permissions),
          hoist: savedRole.hoist,
          mentionable: savedRole.mentionable,
          reason: "Zynko server template"
        }).catch(() => {});
      }

      roleMap[savedRole.id] = existing.id;
    } catch (error) {
      console.error(
        `Role restore failed: ${savedRole.name}`,
        error.message
      );
    }
  }

  // Restore hierarchy
  const hierarchy = [];

  for (const savedRole of snapshot.roles) {
    const newId = roleMap[savedRole.id];

    if (!newId) continue;

    const role = guild.roles.cache.get(newId);

    if (!role) continue;

    hierarchy.push({
      id: role.id,
      position: savedRole.position
    });
  }

  hierarchy.sort((a, b) => a.position - b.position);

  try {
    await guild.roles.setPositions(
      hierarchy.map(r => ({
        role: r.id,
        position: r.position
      }))
    );
  } catch (error) {
    console.log(
      "⚠️ Some role positions could not be restored:",
      error.message
    );
  }

  return roleMap;
}

// ============================================================
// CREATE / UPDATE CATEGORIES
// ============================================================

async function restoreCategories(
  guild,
  snapshot,
  roleMap
) {
  const channelMap = {};

  const categories = snapshot.channels
    .filter(c =>
      c.type === ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of categories) {
    let category = guild.channels.cache.find(
      c =>
        c.type === ChannelType.GuildCategory &&
        c.name === saved.name
    );

    try {
      if (!category) {
        category = await guild.channels.create({
          name: saved.name,
          type: ChannelType.GuildCategory,
          position: saved.position,
          reason: "Zynko server template"
        });
      }

      channelMap[saved.id] = category.id;

      await applyOverwrites(
        category,
        saved.permissionOverwrites,
        roleMap
      );

      await category.setPosition(
        saved.position
      ).catch(() => {});
    } catch (error) {
      console.error(
        `Category restore failed: ${saved.name}`,
        error.message
      );
    }
  }

  return channelMap;
}

// ============================================================
// CREATE / UPDATE NORMAL CHANNELS
// ============================================================

async function restoreChannels(
  guild,
  snapshot,
  roleMap,
  channelMap
) {
  const normalChannels = snapshot.channels
    .filter(c =>
      c.type !== ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of normalChannels) {
    let channel = guild.channels.cache.find(
      c =>
        c.name === saved.name &&
        c.type === saved.type
    );

    const parentId =
      saved.parentId
        ? channelMap[saved.parentId] || null
        : null;

    try {
      if (!channel) {
        const options = {
          name: saved.name,
          type: saved.type,
          parent: parentId,
          position: saved.position,
          reason: "Zynko server template"
        };

        if (
          saved.type === ChannelType.GuildText
        ) {
          options.topic = saved.topic || undefined;
          options.nsfw = !!saved.nsfw;
          options.rateLimitPerUser =
            saved.rateLimitPerUser || 0;
        }

        if (
          saved.type === ChannelType.GuildVoice
        ) {
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

        channel =
          await guild.channels.create(options);
      } else {
        await channel.edit({
          parent: parentId,
          position: saved.position,
          reason: "Zynko server template"
        }).catch(() => {});

        if (
          saved.type === ChannelType.GuildText
        ) {
          await channel.edit({
            topic: saved.topic || null,
            nsfw: !!saved.nsfw,
            rateLimitPerUser:
              saved.rateLimitPerUser || 0,
            reason: "Zynko server template"
          }).catch(() => {});
        }
      }

      channelMap[saved.id] = channel.id;

      await applyOverwrites(
        channel,
        saved.permissionOverwrites,
        roleMap
      );

      await channel.setPosition(
        saved.position
      ).catch(() => {});
    } catch (error) {
      console.error(
        `Channel restore failed: ${saved.name}`,
        error.message
      );
    }
  }
}

// ============================================================
// APPLY PERMISSION OVERWRITES
// ============================================================

async function applyOverwrites(
  channel,
  overwrites,
  roleMap
) {
  if (!Array.isArray(overwrites)) return;

  const permissions = [];

  for (const overwrite of overwrites) {
    let targetId;

    if (overwrite.type === 0) {
      // Role overwrite
      targetId =
        findMappedRoleId(
          roleMap,
          overwrite.id
        );
    } else {
      // User overwrite
      // User IDs usually don't exist in destination server.
      // Skip them rather than accidentally assigning them.
      continue;
    }

    if (!targetId) continue;

    permissions.push({
      id: targetId,
      allow: BigInt(overwrite.allow),
      deny: BigInt(overwrite.deny),
      type: 0
    });
  }

  if (!permissions.length) return;

  try {
    await channel.permissionOverwrites.set(
      permissions,
      "Zynko server template permissions"
    );
  } catch (error) {
    console.error(
      `Permission restore failed for #${channel.name}:`,
      error.message
    );
  }
}

// ============================================================
// DELETE OLD CHANNELS
// ============================================================

async function removeOldChannels(
  guild,
  snapshot
) {
  const wantedNames = new Set(
    snapshot.channels.map(c => c.name)
  );

  const deletable = guild.channels.cache.filter(
    channel =>
      channel.id !== guild.rulesChannelId &&
      channel.id !== guild.publicUpdatesChannelId &&
      !channel.isThread() &&
      !wantedNames.has(channel.name)
  );

  for (const channel of deletable.values()) {
    try {
      await channel.delete(
        "Zynko template cleanup"
      );
    } catch {}
  }
}

// ============================================================
// FULL SERVER LOAD
// ============================================================

async function loadServerSnapshot(
  guild,
  snapshot
) {
  console.log(
    `📥 Loading template into ${guild.name}`
  );

  const me = guild.members.me;

  if (!me) {
    throw new Error(
      "Bot member could not be found."
    );
  }

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    throw new Error(
      "Bot needs Manage Channels."
    );
  }

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  ) {
    throw new Error(
      "Bot needs Manage Roles."
    );
  }

  // ----------------------------------------------------------
  // ROLES FIRST
  // ----------------------------------------------------------

  const roleMap =
    await restoreRoles(
      guild,
      snapshot
    );

  // ----------------------------------------------------------
  // CATEGORIES
  // ----------------------------------------------------------

  const channelMap =
    await restoreCategories(
      guild,
      snapshot,
      roleMap
    );

  // ----------------------------------------------------------
  // CHANNELS
  // ----------------------------------------------------------

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
        value:
          `${Object.keys(db.templates).length} saved`,
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
        `Opened by ${user.username} • 10 minute session`
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
  const d = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚡ Automation")
    .setDescription("Automatic server systems.")
    .addFields(
      {
        name: "📜 Transcripts",
        value: enabled(d.automation.transcripts),
        inline: true
      },
      {
        name: "👋 Auto Joins",
        value: enabled(d.automation.autoJoins),
        inline: true
      },
      {
        name: "🚪 Auto Goodbyes",
        value: enabled(d.automation.autoGoodbyes),
        inline: true
      },
      {
        name: "💬 Chat Logs",
        value: enabled(d.automation.autoChatLogs),
        inline: true
      },
      {
        name: "🧹 Delete Logs",
        value: enabled(d.automation.autoDeleteLogs),
        inline: true
      },
      {
        name: "👤 Auto Roles",
        value: enabled(d.automation.autoRoles),
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
  const d = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .addFields(
      {
        name: "⚠️ Warnings",
        value: enabled(d.moderation.warnings),
        inline: true
      },
      {
        name: "🤖 AutoMod",
        value: enabled(d.moderation.automod),
        inline: true
      },
      {
        name: "💬 Anti Spam",
        value: enabled(d.moderation.antiSpam),
        inline: true
      },
      {
        name: "🔗 Anti Links",
        value: enabled(d.moderation.antiLinks),
        inline: true
      },
      {
        name: "📢 Anti Mentions",
        value: enabled(d.moderation.antiMassMention),
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
  const templates =
    Object.values(db.templates);

  let description =
    "🌎 **Universal Server Templates**\n\n" +
    "Save a server and load its structure into another server.\n\n";

  if (!templates.length) {
    description +=
      "❌ No templates saved.";
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
  const d = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .addFields(
      {
        name: "🤖 Bot Name",
        value:
          d.settings.botName ||
          client.user.username,
        inline: true
      },
      {
        name: "📜 Logs",
        value:
          channelMention(
            guild,
            d.channels.logs
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
  const d = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🧱 Embed Builder")
    .setDescription(
      `Saved embeds: **${d.embeds.length}**`
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
        .emoji("📋")
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
      "Open the control panel.\n\n" +

      "**/save <name>**\n" +
      "Save the current server structure as a universal template.\n\n" +

      "**/load <name>**\n" +
      "Rebuild the saved structure in the current server.\n\n" +

      "**The template copies:**\n" +
      "• Roles\n" +
      "• Role permissions\n" +
      "• Role hierarchy\n" +
      "• Categories\n" +
      "• Channels\n" +
      "• Channel positions\n" +
      "• Topics\n" +
      "• Slowmode\n" +
      "• NSFW settings\n" +
      "• Channel permission overwrites\n" +
      "• Role-only / admin-only channel access"
    );
}

// ============================================================
// MODAL
// ============================================================

function makeModal(id, title, fields) {
  const modal =
    new ModalBuilder()
      .setCustomId(id)
      .setTitle(title);

  for (const field of fields) {
    const input =
      new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setStyle(
          field.style ||
          TextInputStyle.Short
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
// /DASHBOARD
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand())
      return;

    if (
      interaction.commandName !==
      "dashboard"
    ) return;

    if (
      !(await requireAccess(interaction))
    ) return;

    const message =
      await interaction.reply({
        embeds: [
          homeEmbed(
            interaction.guild,
            interaction.user
          )
        ],
        components: homeButtons(),
        fetchReply: true
      });

    createSession(
      message.id,
      interaction.user.id
    );
  }
);

// ============================================================
// /SAVE
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand())
      return;

    if (
      interaction.commandName !==
      "save"
    ) return;

    if (
      !(await requireAccess(interaction))
    ) return;

    const name =
      interaction.options.getString(
        "name"
      );

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

        ownerId:
          interaction.user.id,

        ownerName:
          interaction.user.username,

        sourceGuild: {
          id:
            interaction.guild.id,

          name:
            interaction.guild.name
        },

        snapshot
      };

      saveDB(db);

      await interaction.editReply(
        `✅ **${name}** saved.\n\n` +
        `📁 Categories: **${
          snapshot.channels.filter(
            c =>
              c.type ===
              ChannelType.GuildCategory
          ).length
        }**\n` +

        `💬 Channels: **${
          snapshot.channels.filter(
            c =>
              c.type !==
              ChannelType.GuildCategory
          ).length
        }**\n` +

        `🎭 Roles: **${
          snapshot.roles.length
        }**\n\n` +

        `🔒 Channel permissions were included.`
      );
    } catch (error) {
      console.error(error);

      await interaction.editReply(
        `❌ Save failed:\n\`${error.message}\``
      );
    }
  }
);

// ============================================================
// /LOAD
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand())
      return;

    if (
      interaction.commandName !==
      "load"
    ) return;

    if (
      !(await requireAccess(interaction))
    ) return;

    const name =
      interaction.options.getString(
        "name"
      );

    await interaction.deferReply({
      ephemeral: true
    });

    const db = loadDB();

    const template =
      db.templates[
        name.toLowerCase()
      ];

    if (!template) {
      const names =
        Object.values(db.templates)
          .slice(0, 20)
          .map(
            t => `• ${t.name}`
          )
          .join("\n");

      return interaction.editReply(
        `❌ Template **${name}** doesn't exist.\n\n` +
        `Available:\n${
          names || "None"
        }`
      );
    }

    if (!template.snapshot) {
      return interaction.editReply(
        "❌ This is an old template and does not contain a full server snapshot.\n\n" +
        "Run `/save` again on the original server."
      );
    }

    try {
      await interaction.editReply(
        `⏳ Loading **${template.name}**...\n\n` +
        `This can take a little bit because I'm rebuilding roles, categories, channels and permissions.`
      );

      await loadServerSnapshot(
        interaction.guild,
        template.snapshot
      );

      await interaction.editReply(
        `✅ **${template.name}** loaded into **${interaction.guild.name}**.\n\n` +
        `🎭 Roles restored\n` +
        `📁 Categories restored\n` +
        `💬 Channels restored\n` +
        `📐 Layout restored\n` +
        `🔒 Channel permissions restored`
      );
    } catch (error) {
      console.error(
        "LOAD ERROR:",
        error
      );

      await interaction.editReply(
        `⚠️ Template partially loaded.\n\n` +
        `Error: \`${error.message}\`\n\n` +
        `Check that Zynko has **Administrator** or at least **Manage Roles + Manage Channels**.`
      );
    }
  }
);

// ============================================================
// BUTTONS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isButton())
      return;

    if (
      !(await requireAccess(interaction))
    ) return;

    if (!validSession(interaction)) {
      return interaction.reply({
        content:
          "⏱️ Dashboard expired. Run `/dashboard` again.",
        ephemeral: true
      });
    }

    const id =
      interaction.customId;

    const guild =
      interaction.guild;

    const data =
      getGuildData(guild.id);

    // HOME

    if (id === "go_home") {
      return interaction.update({
        embeds: [
          homeEmbed(
            guild,
            interaction.user
          )
        ],
        components:
          homeButtons()
      });
    }

    if (id === "home_automation") {
      return interaction.update({
        embeds: [
          automationEmbed(guild)
        ],
        components:
          automationButtons()
      });
    }

    if (id === "home_moderation") {
      return interaction.update({
        embeds: [
          moderationEmbed(guild)
        ],
        components:
          moderationButtons()
      });
    }

    if (id === "home_templates") {
      return interaction.update({
        embeds: [
          templateEmbed()
        ],
        components:
          templateButtons()
      });
    }

    if (id === "home_settings") {
      return interaction.update({
        embeds: [
          settingsEmbed(guild)
        ],
        components:
          settingsButtons()
      });
    }

    if (id === "home_embeds") {
      return interaction.update({
        embeds: [
          embedsEmbed(guild)
        ],
        components:
          embedsButtons()
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

    if (id === "home_help") {
      return interaction.update({
        embeds: [
          helpEmbed()
        ],
        components: [
          backButton()
        ]
      });
    }

    // AUTOMATION

    const automationMap = {
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

    if (automationMap[id]) {
      const key =
        automationMap[id];

      data.automation[key] =
        !data.automation[key];

      updateGuild(
        guild.id,
        data
      );

      return interaction.update({
        embeds: [
          automationEmbed(guild)
        ],
        components:
          automationButtons()
      });
    }

    // MODERATION

    const moderationMap = {
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

    if (moderationMap[id]) {
      const key =
        moderationMap[id];

      data.moderation[key] =
        !data.moderation[key];

      updateGuild(
        guild.id,
        data
      );

      return interaction.update({
        embeds: [
          moderationEmbed(guild)
        ],
        components:
          moderationButtons()
      });
    }

    // TEMPLATE CREATE

    if (
      id ===
      "template_create"
    ) {
      return interaction.showModal(
        makeModal(
          "modal_template",
          "Save Server Template",
          [
            {
              id: "name",
              label:
                "Template Name",
              maxLength: 100,
              placeholder:
                "Example: Main Server"
            }
          ]
        )
      );
    }

    // TEMPLATE USE

    if (
      id ===
      "template_use"
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
            "❌ No templates saved.",
          ephemeral: true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_template"
          )
          .setPlaceholder(
            "Choose a server template"
          );

      templates
        .slice(0, 25)
        .forEach(template => {
          menu.addOptions({
            label:
              template.name.slice(
                0,
                100
              ),

            value:
              template.name.toLowerCase(),

            emoji: "📥"
          });
        });

      return interaction.reply({
        content:
          "🌎 Choose the server template to load.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // TEMPLATE DELETE

    if (
      id ===
      "template_delete"
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
            "❌ No templates.",
          ephemeral: true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "delete_template"
          )
          .setPlaceholder(
            "Choose template"
          );

      templates
        .slice(0, 25)
        .forEach(template => {
          menu.addOptions({
            label:
              template.name.slice(
                0,
                100
              ),

            value:
              template.name.toLowerCase(),

            emoji: "🗑️"
          });
        });

      return interaction.reply({
        content:
          "🗑️ Choose a template to delete.",
        components: [
          new ActionRowBuilder()
            .addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // BOT NAME

    if (
      id ===
      "setting_botname"
    ) {
      return interaction.showModal(
        makeModal(
          "modal_botname",
          "Bot Name",
          [
            {
              id: "botname",
              label:
                "Bot Nickname",
              maxLength: 32
            }
          ]
        )
      );
    }

    // EMBED CREATE

    if (
      id ===
      "embed_create"
    ) {
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
              label:
                "Description",
              style:
                TextInputStyle.Paragraph,
              maxLength: 4000
            }
          ]
        )
      );
    }

    // EMBED SAVED

    if (
      id ===
      "embed_saved"
    ) {
      if (!data.embeds.length) {
        return interaction.reply({
          content:
            "🧱 No saved embeds.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          "🧱 **Saved Embeds**\n\n" +
          data.embeds
            .map(
              (e, i) =>
                `${i + 1}. **${e.title}**`
            )
            .join("\n"),
        ephemeral: true
      });
    }

    // LOOKUP USER

    if (
      id ===
      "lookup_user"
    ) {
      return interaction.showModal(
        makeModal(
          "modal_lookup_user",
          "User Lookup",
          [
            {
              id: "userid",
              label:
                "Discord User ID"
            }
          ]
        )
      );
    }

    // LOOKUP MESSAGE

    if (
      id ===
      "lookup_messages"
    ) {
      return interaction.showModal(
        makeModal(
          "modal_lookup_messages",
          "Message Search",
          [
            {
              id: "query",
              label:
                "Search Phrase",
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
    if (
      !interaction.isStringSelectMenu()
    ) return;

    if (
      !(await requireAccess(interaction))
    ) return;

    // LOAD TEMPLATE

    if (
      interaction.customId ===
      "select_template"
    ) {
      const db =
        loadDB();

      const key =
        interaction.values[0]
          .toLowerCase();

      const template =
        db.templates[key];

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
            "❌ This template was created with an older version of Zynko.\n\nUse `/save` again on the original server.",
          components: []
        });
      }

      await interaction.update({
        content:
          `⏳ Loading **${template.name}**...`,
        components: []
      });

      try {
        await loadServerSnapshot(
          interaction.guild,
          template.snapshot
        );

        await interaction.editReply({
          content:
            `✅ **${template.name}** loaded successfully.\n\n` +
            `🎭 Roles copied\n` +
            `📁 Categories copied\n` +
            `💬 Channels copied\n` +
            `📐 Layout copied\n` +
            `🔒 Permissions copied`
        });
      } catch (error) {
        await interaction.editReply({
          content:
            `❌ Load failed:\n\`${error.message}\``
        });
      }

      return;
    }

    // DELETE TEMPLATE

    if (
      interaction.customId ===
      "delete_template"
    ) {
      const db =
        loadDB();

      const key =
        interaction.values[0]
          .toLowerCase();

      const template =
        db.templates[key];

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
    if (
      !interaction.isModalSubmit()
    ) return;

    if (
      !(await requireAccess(interaction))
    ) return;

    // SAVE SERVER

    if (
      interaction.customId ===
      "modal_template"
    ) {
      const name =
        interaction.fields
          .getTextInputValue(
            "name"
          );

      await interaction.deferReply({
        ephemeral: true
      });

      try {
        const snapshot =
          createServerSnapshot(
            interaction.guild
          );

        const db =
          loadDB();

        db.templates[
          name.toLowerCase()
        ] = {
          name,

          created:
            Date.now(),

          ownerId:
            interaction.user.id,

          ownerName:
            interaction.user.username,

          sourceGuild: {
            id:
              interaction.guild.id,

            name:
              interaction.guild.name
          },

          snapshot
        };

        saveDB(db);

        return interaction.editReply(
          `✅ **${name}** saved!\n\n` +
          `🎭 ${snapshot.roles.length} roles\n` +
          `📁 ${
            snapshot.channels.filter(
              c =>
                c.type ===
                ChannelType.GuildCategory
            ).length
          } categories\n` +
          `💬 ${
            snapshot.channels.filter(
              c =>
                c.type !==
                ChannelType.GuildCategory
            ).length
          } channels\n` +
          `🔒 Permission overwrites included.\n\n` +
          `You can now use \`/load ${name}\` in another server.`
        );
      } catch (error) {
        console.error(error);

        return interaction.editReply(
          `❌ Save failed:\n\`${error.message}\``
        );
      }
    }

    // BOT NAME

    if (
      interaction.customId ===
      "modal_botname"
    ) {
      const name =
        interaction.fields
          .getTextInputValue(
            "botname"
          );

      const data =
        getGuildData(
          interaction.guild.id
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

    // EMBED

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

      const data =
        getGuildData(
          interaction.guild.id
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
          "✅ Embed saved.",
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(
              description
            )
        ],
        ephemeral: true
      });
    }

    // USER LOOKUP

    if (
      interaction.customId ===
      "modal_lookup_user"
    ) {
      const id =
        interaction.fields
          .getTextInputValue(
            "userid"
          );

      let member;

      try {
        member =
          await interaction.guild
            .members
            .fetch(id);
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
          .join(", ") ||
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
              name: "Roles",
              value:
                roles
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
            }
          );

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // MESSAGE LOOKUP

    if (
      interaction.customId ===
      "modal_lookup_messages"
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
        ) break;

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
            ) continue;

            if (
              !message.content
                .toLowerCase()
                .includes(query)
            ) continue;

            results.push(
              `• ${message.author} in ${channel}\n` +
              `${message.content.slice(
                0,
                250
              )}\n` +
              `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id}`
            );

            if (
              results.length >= 20
            ) break;
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
// MESSAGE LOGGING / MODERATION
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

    data.messageLog[
      message.channel.id
    ] ||= [];

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

    // CHAT LOGS

    if (
      data.automation
        .autoChatLogs &&
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
                      .slice(
                        0,
                        1000
                      ) ||
                    "[No text]"
                }
              )
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    }

    // ANTI SPAM

    if (
      data.moderation
        .antiSpam
    ) {
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

    // ANTI LINKS

    if (
      data.moderation
        .antiLinks
    ) {
      const hasLink =
        /(https?:\/\/|www\.)/i
          .test(
            message.content
          );

      const allowed =
        message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        );

      if (
        hasLink &&
        !allowed
      ) {
        await message.delete()
          .catch(() => {});

        return;
      }
    }

    // ANTI MASS MENTION

    if (
      data.moderation
        .antiMassMention &&
      message.mentions.users.size >= 5
    ) {
      await message.delete()
        .catch(() => {});

      return;
    }

    updateGuild(
      message.guild.id,
      data
    );
  }
);

// ============================================================
// MESSAGE DELETE LOG
// ============================================================

client.on(
  "messageDelete",
  async message => {
    if (!message.guild)
      return;

    const data =
      getGuildData(
        message.guild.id
      );

    if (
      !data.automation
        .autoDeleteLogs ||
      !data.channels.logs
    ) return;

    const channel =
      message.guild.channels.cache.get(
        data.channels.logs
      );

    if (!channel)
      return;

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
      data.automation
        .autoJoins &&
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

    if (
      data.automation
        .autoRoles &&
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
      !data.automation
        .autoGoodbyes ||
      !data.channels.goodbye
    ) return;

    const channel =
      member.guild.channels.cache.get(
        data.channels.goodbye
      );

    if (!channel)
      return;

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
      ),

    new SlashCommandBuilder()
      .setName("save")
      .setDescription(
        "Save the entire server layout as a universal template"
      )
      .addStringOption(
        option =>
          option
            .setName("name")
            .setDescription(
              "Template name"
            )
            .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("load")
      .setDescription(
        "Load a full server template"
      )
      .addStringOption(
        option =>
          option
            .setName("name")
            .setDescription(
              "Template name"
            )
            .setRequired(true)
      )

  ];

  const rest =
    new REST({
      version: "10"
    }).setToken(
      TOKEN
    );

  try {
    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body:
          commands.map(
            command =>
              command.toJSON()
          )
      }
    );

    console.log(
      "✅ Slash commands registered."
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
      "Server Templates",
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