// ============================================================
// ZYNKO CONTROL BOT
// UNIVERSAL SERVER TEMPLATE + CONTROL DASHBOARD
// ============================================================
//
// COMMAND:
//   /dashboard
//
// DASHBOARD FEATURES:
//   • Universal server templates
//   • Save current server
//   • Load template into current server
//   • Delete templates
//   • Automation toggles
//   • Moderation toggles
//   • Bot nickname
//   • Embed storage
//   • User lookup
//   • Message lookup
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
//   • Permission overwrites
//   • @everyone overwrites
//
// DOES NOT COPY:
//   • User-specific permission overwrites
//   • Invite Tracker role
//
// IMPORTANT:
//   • Only /dashboard exists
//   • Dashboard expires after 10 minutes
//   • Expired dashboard edits THE SAME MESSAGE
//   • Buttons become disabled
//   • No duplicate dashboard messages
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

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing.");
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = "./database.json";

const DASHBOARD_TIMEOUT = 10 * 60 * 1000;

const SKIPPED_ROLES = new Set([
  "Invite Tracker"
]);

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

function clone(object) {
  return JSON.parse(JSON.stringify(object));
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
    const data = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    if (!data.guilds) data.guilds = {};
    if (!data.templates) data.templates = {};

    return data;
  } catch (error) {
    console.error("⚠️ Database read error:", error.message);

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
// SAFE HELPERS
// ============================================================

function getGuild(interaction) {
  return interaction?.guild || null;
}

function getMember(interaction) {
  if (!interaction) return null;

  if (interaction.member) {
    return interaction.member;
  }

  return null;
}

function getBotMember(guild) {
  if (!guild) return null;

  return guild.members?.me || null;
}

// ============================================================
// ACCESS
// ============================================================
//
// IMPORTANT:
// This deliberately does NOT require a fragile combination of
// permissions.
//
// Owner = allowed
// Administrator = allowed
// Manage Guild = allowed
// Manage Channels = allowed
// Manage Roles = allowed
//
// ============================================================

function hasAccess(interaction) {
  const guild = getGuild(interaction);

  if (!guild) return false;

  // Guild owner
  if (
    guild.ownerId &&
    interaction.user?.id === guild.ownerId
  ) {
    return true;
  }

  const member = getMember(interaction);

  if (!member) {
    return false;
  }

  // Discord interaction members normally expose permissions.
  const permissions = member.permissions;

  if (!permissions) {
    return false;
  }

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

  if (
    permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    return true;
  }

  if (
    permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  ) {
    return true;
  }

  return false;
}

async function requireAccess(interaction) {
  if (hasAccess(interaction)) {
    return true;
  }

  const response = {
    content:
      "❌ You don't have permission to use the Zynko dashboard.",
    ephemeral: true
  };

  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  } catch {}

  return false;
}

// ============================================================
// DASHBOARD SESSIONS
// ============================================================

const sessions = new Map();

function createDashboardSession(messageId, userId) {
  const expires = Date.now() + DASHBOARD_TIMEOUT;

  const timer = setTimeout(
    async () => {
      const session = sessions.get(messageId);

      if (!session) return;

      sessions.delete(messageId);

      try {
        const channel = await client.channels.fetch(
          session.channelId
        );

        if (!channel) return;

        const message = await channel.messages.fetch(
          messageId
        );

        const embed = new EmbedBuilder()
          .setTitle("⏱️ Dashboard Timed Out")
          .setDescription(
            "This dashboard session expired after 10 minutes.\n\n" +
            "Run `/dashboard` to open a new dashboard."
          )
          .setFooter({
            text: "Zynko Control Bot"
          })
          .setTimestamp();

        await message.edit({
          embeds: [embed],
          components: []
        });
      } catch (error) {
        console.log(
          `⚠️ Could not expire dashboard ${messageId}: ${error.message}`
        );
      }
    },
    DASHBOARD_TIMEOUT
  );

  sessions.set(messageId, {
    userId,
    channelId: null,
    expires,
    timer
  });

  return expires;
}

function attachSessionChannel(messageId, channelId) {
  const session = sessions.get(messageId);

  if (!session) return;

  session.channelId = channelId;
}

function validSession(interaction) {
  const messageId = interaction.message?.id;

  if (!messageId) return false;

  const session = sessions.get(messageId);

  if (!session) return false;

  if (Date.now() >= session.expires) {
    clearTimeout(session.timer);
    sessions.delete(messageId);
    return false;
  }

  return session.userId === interaction.user.id;
}

async function expireImmediately(interaction) {
  const messageId = interaction.message?.id;

  if (!messageId) return;

  const session = sessions.get(messageId);

  if (session) {
    clearTimeout(session.timer);
    sessions.delete(messageId);
  }

  try {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("⏱️ Dashboard Timed Out")
          .setDescription(
            "This dashboard session has expired.\n\n" +
            "Run `/dashboard` to open a new dashboard."
          )
          .setFooter({
            text: "Zynko Control Bot"
          })
          .setTimestamp()
      ],
      components: []
    });
  } catch {}
}

// ============================================================
// GENERAL HELPERS
// ============================================================

function enabled(value) {
  return value ? "🟢 Enabled" : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!id) return "Not configured";

  const channel = guild.channels?.cache?.get(id);

  return channel ? `<#${id}>` : "Channel not found";
}

function roleMention(guild, id) {
  if (!id) return "Not configured";

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
// OVERWRITE SERIALIZATION
// ============================================================

function serializeOverwrites(channel) {
  if (!channel?.permissionOverwrites?.cache) {
    return [];
  }

  return channel.permissionOverwrites.cache
    .map(overwrite => ({
      id: overwrite.id,
      type: overwrite.type,
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
    position: channel.rawPosition,
    parentId: channel.parentId || null,

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
// SERVER SNAPSHOT
// ============================================================

function createServerSnapshot(guild) {
  if (!guild) {
    throw new Error("Guild was not found.");
  }

  if (!guild.roles?.cache) {
    throw new Error("Guild role cache is unavailable.");
  }

  if (!guild.channels?.cache) {
    throw new Error("Guild channel cache is unavailable.");
  }

  const roles = [...guild.roles.cache.values()]
    .filter(role => {
      if (role.id === guild.id) return false;

      if (SKIPPED_ROLES.has(role.name)) {
        return false;
      }

      return true;
    })
    .sort(
      (a, b) => b.position - a.position
    )
    .map(serializeRole);

  const channels = [...guild.channels.cache.values()]
    .sort(
      (a, b) =>
        a.rawPosition - b.rawPosition
    )
    .map(serializeChannel);

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
// ROLE RESTORE
// ============================================================

async function restoreRoles(guild, snapshot) {
  const roleMap = {};

  roleMap[snapshot.guild.id] = guild.id;

  if (!guild.roles?.cache) {
    throw new Error("Guild role cache unavailable.");
  }

  const existingRoleCount =
    guild.roles.cache.size;

  const availableSlots =
    Math.max(
      0,
      250 - existingRoleCount
    );

  console.log(
    `🎭 Existing roles: ${existingRoleCount}`
  );

  console.log(
    `🎭 Available role slots: ${availableSlots}`
  );

  const sortedRoles = [...snapshot.roles]
    .sort(
      (a, b) =>
        a.position - b.position
    );

  let createdCount = 0;

  for (const savedRole of sortedRoles) {
    if (
      SKIPPED_ROLES.has(
        savedRole.name
      )
    ) {
      console.log(
        `⏭️ Skipping role: ${savedRole.name}`
      );

      continue;
    }

    let existing =
      guild.roles.cache.find(
        role =>
          role.name === savedRole.name &&
          role.id !== guild.id
      );

    try {
      // --------------------------------------------------------
      // EXISTING
      // --------------------------------------------------------

      if (existing) {
        roleMap[savedRole.id] =
          existing.id;

        if (existing.editable) {
          await existing.edit({
            name: savedRole.name,
            permissions: BigInt(
              savedRole.permissions
            ),
            hoist: savedRole.hoist,
            mentionable: savedRole.mentionable,
            color: savedRole.color,
            reason:
              "Zynko server template"
          }).catch(() => {});
        }

        continue;
      }

      // --------------------------------------------------------
      // ROLE LIMIT
      // --------------------------------------------------------

      if (
        createdCount >=
        availableSlots
      ) {
        console.log(
          `⚠️ Role limit reached: ${savedRole.name}`
        );

        continue;
      }

      // --------------------------------------------------------
      // CREATE
      // --------------------------------------------------------

      existing =
        await guild.roles.create({
          name: savedRole.name,

          permissions:
            BigInt(
              savedRole.permissions
            ),

          hoist:
            savedRole.hoist,

          mentionable:
            savedRole.mentionable,

          color:
            savedRole.color,

          reason:
            "Zynko server template"
        });

      createdCount++;

      roleMap[savedRole.id] =
        existing.id;

      console.log(
        `✅ Created role: ${savedRole.name}`
      );
    } catch (error) {
      console.log(
        `⚠️ Role failed ${savedRole.name}: ${error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // HIERARCHY
  // ----------------------------------------------------------

  const hierarchy = [];

  for (const savedRole of snapshot.roles) {
    const newId =
      roleMap[savedRole.id];

    if (!newId) continue;

    const role =
      guild.roles.cache.get(newId);

    if (!role) continue;

    if (!role.editable) continue;

    hierarchy.push({
      id: role.id,
      position: savedRole.position
    });
  }

  hierarchy.sort(
    (a, b) =>
      a.position - b.position
  );

  try {
    if (hierarchy.length) {
      await guild.roles.setPositions(
        hierarchy.map(role => ({
          role: role.id,
          position: role.position
        }))
      );
    }
  } catch (error) {
    console.log(
      `⚠️ Hierarchy restore failed: ${error.message}`
    );
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
  if (
    !channel?.permissionOverwrites ||
    !Array.isArray(overwrites)
  ) {
    return;
  }

  const permissions = [];

  for (const overwrite of overwrites) {
    // Only role overwrites.
    // Discord uses 0 for role overwrites.
    if (overwrite.type !== 0) {
      continue;
    }

    const targetId =
      roleMap[overwrite.id];

    if (!targetId) {
      console.log(
        `⚠️ Role overwrite could not be mapped on #${channel.name}`
      );

      continue;
    }

    permissions.push({
      id: targetId,

      type: 0,

      allow: BigInt(
        overwrite.allow || "0"
      ),

      deny: BigInt(
        overwrite.deny || "0"
      )
    });
  }

  try {
    await channel.permissionOverwrites.set(
      permissions,
      "Zynko server template permissions"
    );

    console.log(
      `🔒 Permissions restored: #${channel.name}`
    );
  } catch (error) {
    console.log(
      `⚠️ Permission restore failed on #${channel.name}: ${error.message}`
    );
  }
}

// ============================================================
// CATEGORY RESTORE
// ============================================================

async function restoreCategories(
  guild,
  snapshot,
  roleMap
) {
  const channelMap = {};

  const categories =
    snapshot.channels
      .filter(
        channel =>
          channel.type ===
          ChannelType.GuildCategory
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (const saved of categories) {
    let category =
      guild.channels.cache.find(
        channel =>
          channel.type ===
            ChannelType.GuildCategory &&
          channel.name === saved.name
      );

    try {
      if (!category) {
        category =
          await guild.channels.create({
            name: saved.name,
            type: ChannelType.GuildCategory,
            position: saved.position,
            reason:
              "Zynko server template"
          });
      }

      channelMap[saved.id] =
        category.id;

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
        `⚠️ Category failed ${saved.name}: ${error.message}`
      );
    }
  }

  return channelMap;
}

// ============================================================
// CHANNEL RESTORE
// ============================================================

async function restoreChannels(
  guild,
  snapshot,
  roleMap,
  channelMap
) {
  const channels =
    snapshot.channels
      .filter(
        channel =>
          channel.type !==
          ChannelType.GuildCategory
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (const saved of channels) {
    let channel =
      guild.channels.cache.find(
        c =>
          c.name === saved.name &&
          c.type === saved.type
      );

    const parentId =
      saved.parentId
        ? channelMap[saved.parentId] ||
          null
        : null;

    try {
      if (!channel) {
        const options = {
          name: saved.name,
          type: saved.type,
          parent: parentId,
          position: saved.position,
          reason:
            "Zynko server template"
        };

        // ------------------------------------------------------
        // TEXT
        // ------------------------------------------------------

        if (
          saved.type ===
          ChannelType.GuildText
        ) {
          options.topic =
            saved.topic || undefined;

          options.nsfw =
            Boolean(saved.nsfw);

          options.rateLimitPerUser =
            Number(
              saved.rateLimitPerUser
            ) || 0;
        }

        // ------------------------------------------------------
        // VOICE
        // ------------------------------------------------------

        if (
          saved.type ===
          ChannelType.GuildVoice
        ) {
          if (saved.bitrate) {
            options.bitrate =
              saved.bitrate;
          }

          if (saved.userLimit) {
            options.userLimit =
              saved.userLimit;
          }

          if (saved.rtcRegion) {
            options.rtcRegion =
              saved.rtcRegion;
          }
        }

        channel =
          await guild.channels.create(
            options
          );
      } else {
        // ------------------------------------------------------
        // UPDATE EXISTING
        // ------------------------------------------------------

        await channel.edit({
          parent: parentId,
          position: saved.position,
          reason:
            "Zynko server template"
        }).catch(() => {});

        if (
          saved.type ===
          ChannelType.GuildText
        ) {
          await channel.edit({
            topic:
              saved.topic || null,

            nsfw:
              Boolean(saved.nsfw),

            rateLimitPerUser:
              Number(
                saved.rateLimitPerUser
              ) || 0,

            reason:
              "Zynko server template"
          }).catch(() => {});
        }
      }

      channelMap[saved.id] =
        channel.id;

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
        `⚠️ Channel failed ${saved.name}: ${error.message}`
      );
    }
  }
}

// ============================================================
// FULL LOAD
// ============================================================

async function loadServerSnapshot(
  guild,
  snapshot
) {
  if (!guild) {
    throw new Error("Destination server not found.");
  }

  const me =
    getBotMember(guild);

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
      "Zynko needs Manage Channels."
    );
  }

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  ) {
    throw new Error(
      "Zynko needs Manage Roles."
    );
  }

  console.log(
    `📥 Loading ${snapshot.guild.name} → ${guild.name}`
  );

  const roleMap =
    await restoreRoles(
      guild,
      snapshot
    );

  const channelMap =
    await restoreCategories(
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
  const data =
    getGuildData(guild.id);

  const db =
    loadDB();

  return new EmbedBuilder()
    .setTitle(
      "⚙️ Zynko Control Dashboard"
    )
    .setDescription(
      "Your server control center.\n\n" +
      "Manage automation, moderation and universal server templates."
    )
    .addFields(
      {
        name: "⚡ Automation",
        value:
          Object.values(
            data.automation
          ).some(Boolean)
            ? "🟢 Active"
            : "🔴 Disabled",
        inline: true
      },

      {
        name: "🛡️ Moderation",
        value:
          Object.values(
            data.moderation
          ).some(Boolean)
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
          roleMention(
            guild,
            data.roles.autoRole
          ),
        inline: true
      }
    )
    .setFooter({
      text:
        `Opened by ${user.username} • Expires in 10 minutes`
    })
    .setTimestamp();
}

// ============================================================
// HOME BUTTONS
// ============================================================

function homeButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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
            "home_templates"
          )
          .setLabel("Templates")
          .setEmoji("🌎")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "home_settings"
          )
          .setLabel("Settings")
          .setEmoji("⚙️")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
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
          ),

        new ButtonBuilder()
          .setCustomId(
            "home_help"
          )
          .setLabel("Help")
          .setEmoji("❓")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

// ============================================================
// BACK BUTTON
// ============================================================

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
// AUTOMATION
// ============================================================

function automationEmbed(guild) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚡ Automation")
    .setDescription(
      "Automatic server systems."
    )
    .addFields(
      {
        name: "📜 Transcripts",
        value:
          enabled(
            d.automation.transcripts
          ),
        inline: true
      },

      {
        name: "👋 Auto Joins",
        value:
          enabled(
            d.automation.autoJoins
          ),
        inline: true
      },

      {
        name: "🚪 Auto Goodbyes",
        value:
          enabled(
            d.automation.autoGoodbyes
          ),
        inline: true
      },

      {
        name: "💬 Chat Logs",
        value:
          enabled(
            d.automation.autoChatLogs
          ),
        inline: true
      },

      {
        name: "🧹 Delete Logs",
        value:
          enabled(
            d.automation.autoDeleteLogs
          ),
        inline: true
      },

      {
        name: "👤 Auto Roles",
        value:
          enabled(
            d.automation.autoRoles
          ),
        inline: true
      }
    );
}

function automationButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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

    new ActionRowBuilder()
      .addComponents(
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

    backButton()
  ];
}

// ============================================================
// MODERATION
// ============================================================

function moderationEmbed(guild) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .addFields(
      {
        name: "⚠️ Warnings",
        value:
          enabled(
            d.moderation.warnings
          ),
        inline: true
      },

      {
        name: "🤖 AutoMod",
        value:
          enabled(
            d.moderation.automod
          ),
        inline: true
      },

      {
        name: "💬 Anti Spam",
        value:
          enabled(
            d.moderation.antiSpam
          ),
        inline: true
      },

      {
        name: "🔗 Anti Links",
        value:
          enabled(
            d.moderation.antiLinks
          ),
        inline: true
      },

      {
        name: "📢 Anti Mentions",
        value:
          enabled(
            d.moderation.antiMassMention
          ),
        inline: true
      }
    );
}

function moderationButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "mod_warnings"
          )
          .setLabel("Warnings")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "mod_automod"
          )
          .setLabel("AutoMod")
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            "mod_spam"
          )
          .setLabel("Anti Spam")
          .setStyle(
            ButtonStyle.Danger
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "mod_links"
          )
          .setLabel("Anti Links")
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            "mod_mentions"
          )
          .setLabel("Anti Mentions")
          .setStyle(
            ButtonStyle.Danger
          )
      ),

    backButton()
  ];
}

// ============================================================
// TEMPLATE EMBED
// ============================================================

function templateEmbed() {
  const db =
    loadDB();

  const templates =
    Object.values(
      db.templates
    );

  let description =
    "🌎 **Universal Server Templates**\n\n" +
    "Save one server and load its structure into another server.\n\n";

  if (!templates.length) {
    description +=
      "❌ No templates saved.";
  } else {
    for (
      const template of
        templates.slice(0, 15)
    ) {
      description +=
        `**${template.name}**\n` +
        `> ${
          template.snapshot?.roles?.length || 0
        } roles • ` +
        `${
          template.snapshot?.channels?.length || 0
        } channels\n\n`;
    }
  }

  return new EmbedBuilder()
    .setTitle(
      "🌎 Universal Templates"
    )
    .setDescription(
      description
    );
}

function templateButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "template_create"
          )
          .setLabel("Save Server")
          .setEmoji("💾")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "template_use"
          )
          .setLabel("Load Server")
          .setEmoji("📥")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "template_delete"
          )
          .setLabel("Delete")
          .setEmoji("🗑️")
          .setStyle(
            ButtonStyle.Danger
          )
      ),

    backButton()
  ];
}

// ============================================================
// SETTINGS
// ============================================================

function settingsEmbed(guild) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .addFields(
      {
        name: "🤖 Bot Name",
        value:
          d.settings.botName ||
          client.user?.username ||
          "Zynko",
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
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "setting_botname"
          )
          .setLabel("Bot Name")
          .setEmoji("🤖")
          .setStyle(
            ButtonStyle.Primary
          )
      ),

    backButton()
  ];
}

// ============================================================
// EMBEDS
// ============================================================

function embedsEmbed(guild) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle(
      "🧱 Embed Builder"
    )
    .setDescription(
      `Saved embeds: **${d.embeds.length}**`
    );
}

function embedsButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "embed_create"
          )
          .setLabel("Create")
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "embed_saved"
          )
          .setLabel("Saved")
          .setEmoji("📋")
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
    .setTitle("🔎 Lookup")
    .setDescription(
      "Search members and recent messages."
    );
}

function lookupButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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
    .setTitle("❓ Help")
    .setDescription(
      "**/dashboard**\n" +
      "Open the Zynko Control Dashboard.\n\n" +

      "**Templates**\n" +
      "Save a server and load it into another server.\n\n" +

      "**Copied:**\n" +
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
      "• Invite Tracker role\n" +
      "• Individual user permission overwrites\n\n" +

      "⏱️ Dashboard sessions expire after 10 minutes."
    );
}

// ============================================================
// MODAL BUILDER
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
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (
      interaction.commandName !==
      "dashboard"
    ) {
      return;
    }

    if (
      !(await requireAccess(
        interaction
      ))
    ) {
      return;
    }

    const guild =
      getGuild(interaction);

    if (!guild) {
      return interaction.reply({
        content:
          "❌ This command can only be used inside a server.",
        ephemeral: true
      });
    }

    try {
      const message =
        await interaction.reply({
          embeds: [
            homeEmbed(
              guild,
              interaction.user
            )
          ],

          components:
            homeButtons(),

          fetchReply: true
        });

      const expires =
        createDashboardSession(
          message.id,
          interaction.user.id
        );

      attachSessionChannel(
        message.id,
        message.channelId
      );

      const session =
        sessions.get(message.id);

      if (session) {
        session.expires = expires;
      }

      console.log(
        `📊 Dashboard opened by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error(
        "DASHBOARD ERROR:",
        error
      );

      if (!interaction.replied) {
        await interaction.reply({
          content:
            `❌ Dashboard failed: ${error.message}`,
          ephemeral: true
        }).catch(() => {});
      }
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

    if (
      !(await requireAccess(
        interaction
      ))
    ) {
      return;
    }

    if (
      !validSession(
        interaction
      )
    ) {
      return expireImmediately(
        interaction
      );
    }

    const id =
      interaction.customId;

    const guild =
      getGuild(interaction);

    if (!guild) {
      return interaction.reply({
        content:
          "❌ Server could not be found.",
        ephemeral: true
      });
    }

    const data =
      getGuildData(
        guild.id
      );

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
        components:
          homeButtons()
      });
    }

    if (
      id ===
      "home_automation"
    ) {
      return interaction.update({
        embeds: [
          automationEmbed(
            guild
          )
        ],
        components:
          automationButtons()
      });
    }

    if (
      id ===
      "home_moderation"
    ) {
      return interaction.update({
        embeds: [
          moderationEmbed(
            guild
          )
        ],
        components:
          moderationButtons()
      });
    }

    if (
      id ===
      "home_templates"
    ) {
      return interaction.update({
        embeds: [
          templateEmbed()
        ],
        components:
          templateButtons()
      });
    }

    if (
      id ===
      "home_settings"
    ) {
      return interaction.update({
        embeds: [
          settingsEmbed(
            guild
          )
        ],
        components:
          settingsButtons()
      });
    }

    if (
      id ===
      "home_embeds"
    ) {
      return interaction.update({
        embeds: [
          embedsEmbed(
            guild
          )
        ],
        components:
          embedsButtons()
      });
    }

    if (
      id ===
      "home_lookup"
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
      id ===
      "home_help"
    ) {
      return interaction.update({
        embeds: [
          helpEmbed()
        ],
        components: [
          backButton()
        ]
      });
    }

    // ========================================================
    // AUTOMATION
    // ========================================================

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

    if (
      automationMap[id]
    ) {
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
          automationEmbed(
            guild
          )
        ],
        components:
          automationButtons()
      });
    }

    // ========================================================
    // MODERATION
    // ========================================================

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

    if (
      moderationMap[id]
    ) {
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
          moderationEmbed(
            guild
          )
        ],
        components:
          moderationButtons()
      });
    }

    // ========================================================
    // SAVE TEMPLATE
    // ========================================================

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
              label: "Template Name",
              maxLength: 100
            }
          ]
        )
      );
    }

    // ========================================================
    // LOAD TEMPLATE
    // ========================================================

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
              template.name
                .toLowerCase()
                .slice(0, 100),

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

    // ========================================================
    // DELETE TEMPLATE
    // ========================================================

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
            "❌ No templates saved.",
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
              template.name
                .toLowerCase()
                .slice(0, 100),

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

    // ========================================================
    // BOT NAME
    // ========================================================

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
              label: "Description",
              style:
                TextInputStyle.Paragraph,
              maxLength: 4000
            }
          ]
        )
      );
    }

    // ========================================================
    // SAVED EMBEDS
    // ========================================================

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
              label: "Discord User ID"
            }
          ]
        )
      );
    }

    // ========================================================
    // MESSAGE LOOKUP
    // ========================================================

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
// SELECT MENU HANDLER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isStringSelectMenu()
    ) {
      return;
    }

    if (
      !(await requireAccess(
        interaction
      ))
    ) {
      return;
    }

    // ========================================================
    // LOAD TEMPLATE
    // ========================================================

    if (
      interaction.customId ===
      "select_template"
    ) {
      if (
        !validSession(
          interaction
        )
      ) {
        return expireImmediately(
          interaction
        );
      }

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
            "❌ This template is outdated.",
          components: []
        });
      }

      await interaction.update({
        content:
          `⏳ Loading **${template.name}**...\n\n` +
          "🎭 Roles\n" +
          "📁 Categories\n" +
          "💬 Channels\n" +
          "🔒 Permissions",

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
            `🎭 Roles mapped: **${
              Object.keys(
                result.roleMap
              ).length - 1
            }**\n` +
            "📁 Categories restored\n" +
            "💬 Channels restored\n" +
            "📐 Layout restored\n" +
            "🔒 Permissions restored"
        });
      } catch (error) {
        console.error(
          "LOAD ERROR:",
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
      if (
        !validSession(
          interaction
        )
      ) {
        return expireImmediately(
          interaction
        );
      }

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
// MODAL HANDLER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isModalSubmit()
    ) {
      return;
    }

    if (
      !(await requireAccess(
        interaction
      ))
    ) {
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
        interaction.fields
          .getTextInputValue(
            "name"
          )
          .trim();

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

        await interaction.editReply(
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
          "🔒 Permission overwrites included\n" +
          "⏭️ Invite Tracker skipped"
        );
      } catch (error) {
        console.error(
          "TEMPLATE SAVE ERROR:",
          error
        );

        await interaction.editReply(
          `❌ Save failed:\n\`${error.message}\``
        );
      }

      return;
    }

    // ========================================================
    // BOT NAME
    // ========================================================

    if (
      interaction.customId ===
      "modal_botname"
    ) {
      const name =
        interaction.fields
          .getTextInputValue(
            "botname"
          )
          .trim();

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
        const me =
          getBotMember(
            interaction.guild
          );

        if (me) {
          await me.setNickname(
            name
          );
        }
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

    // ========================================================
    // USER LOOKUP
    // ========================================================

    if (
      interaction.customId ===
      "modal_lookup_user"
    ) {
      const id =
        interaction.fields
          .getTextInputValue(
            "userid"
          )
          .trim();

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
              value: roles
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

    // ========================================================
    // MESSAGE LOOKUP
    // ========================================================

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
        const channel of
          channels.values()
      ) {
        if (
          results.length >=
          20
        ) {
          break;
        }

        try {
          const messages =
            await channel.messages.fetch({
              limit: 100
            });

          for (
            const message of
              messages.values()
          ) {
            if (
              !message.content
            ) {
              continue;
            }

            if (
              !message.content
                .toLowerCase()
                .includes(query)
            ) {
              continue;
            }

            results.push(
              `• ${message.author} in ${channel}\n` +
              `${message.content.slice(
                0,
                250
              )}\n` +
              `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${message.id}`
            );

            if (
              results.length >=
              20
            ) {
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

      if (
        channel &&
        typeof channel.send ===
          "function"
      ) {
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
                    message.content.slice(
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

    // ========================================================
    // ANTI SPAM
    // ========================================================

    if (
      data.moderation.antiSpam
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

    // ========================================================
    // ANTI LINKS
    // ========================================================

    if (
      data.moderation.antiLinks
    ) {
      const hasLink =
        /(https?:\/\/|www\.)/i.test(
          message.content
        );

      const allowed =
        message.member?.permissions?.has(
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

    // ========================================================
    // ANTI MASS MENTION
    // ========================================================

    if (
      data.moderation
        .antiMassMention &&
      message.mentions.users.size >=
        5
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
// MESSAGE DELETE
// ============================================================

client.on(
  "messageDelete",
  async message => {
    if (!message.guild) return;

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

    if (
      !channel ||
      typeof channel.send !==
        "function"
    ) {
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

      if (
        channel &&
        typeof channel.send ===
          "function"
      ) {
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
        getBotMember(
          member.guild
        );

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

    if (
      !channel ||
      typeof channel.send !==
        "function"
    ) {
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
//
// ONLY /dashboard
//
// ============================================================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("dashboard")
      .setDescription(
        "Open the Zynko Control Dashboard"
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
      "✅ /dashboard registered."
    );

    console.log(
      "🧹 /save and /load are NOT registered."
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
      `🌐 Servers: ${
        client.guilds?.cache?.size || 0
      }`
    );

    console.log(
      "===================================="
    );

    client.user.setActivity(
      "Zynko Dashboard",
      {
        type:
          ActivityType.Watching
      }
    );

    await registerCommands();
  }
);

// ============================================================
// DISCORD ERROR
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

// ============================================================
// UNHANDLED REJECTION
// ============================================================

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
// UNCAUGHT EXCEPTION
// ============================================================

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