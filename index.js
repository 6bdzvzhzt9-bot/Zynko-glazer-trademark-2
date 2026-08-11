// ============================================================
// ZYNKO CONTROL BOT — UNIVERSAL SERVER TEMPLATE
// FULL ONE-PASTE VERSION
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
      JSON.stringify(
        {
          guilds: {},
          templates: {},
          serverTemplates: {}
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
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    db.guilds ||= {};
    db.templates ||= {};
    db.serverTemplates ||= {};

    return db;
  } catch {
    return {
      guilds: {},
      templates: {},
      serverTemplates: {}
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
// DASHBOARD SESSIONS
// ============================================================

const sessions = new Map();

function createSession(messageId, userId) {
  sessions.set(messageId, {
    userId,
    expires: Date.now() + 5 * 60 * 1000
  });

  setTimeout(() => {
    sessions.delete(messageId);
  }, 5 * 60 * 1000);
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
  if (hasAccess(interaction)) return true;

  const text =
    "❌ You don't have permission to use the Zynko dashboard.";

  if (interaction.replied || interaction.deferred) {
    await interaction
      .followUp({
        content: text,
        ephemeral: true
      })
      .catch(() => {});
  } else {
    await interaction
      .reply({
        content: text,
        ephemeral: true
      })
      .catch(() => {});
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

  const channel =
    guild.channels.cache.get(id);

  return channel
    ? `<#${id}>`
    : "Channel not found";
}

// ============================================================
// UNIVERSAL SERVER SNAPSHOT
// ============================================================

function getPermissionSnapshot(overwrites) {
  if (!overwrites) return [];

  return [...overwrites.cache.values()].map(
    overwrite => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString()
    })
  );
}

function getServerSnapshot(guild) {
  const channels = [];

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement &&
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildCategory &&
      channel.type !== ChannelType.GuildStageVoice &&
      channel.type !== ChannelType.GuildForum
    ) {
      continue;
    }

    channels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId || null,
      position: channel.rawPosition ?? 0,
      topic:
        "topic" in channel
          ? channel.topic
          : null,
      nsfw:
        "nsfw" in channel
          ? channel.nsfw
          : false,
      bitrate:
        "bitrate" in channel
          ? channel.bitrate
          : null,
      userLimit:
        "userLimit" in channel
          ? channel.userLimit
          : null,
      rateLimitPerUser:
        "rateLimitPerUser" in channel
          ? channel.rateLimitPerUser
          : null,
      permissionOverwrites:
        getPermissionSnapshot(
          channel.permissionOverwrites
        )
    });
  }

  const roles = [];

  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id) continue;

    roles.push({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions:
        role.permissions.bitfield.toString(),
      position: role.position
    });
  }

  return {
    channels,
    roles
  };
}

// ============================================================
// LOAD SERVER STRUCTURE
// ============================================================

async function loadServerStructure(
  guild,
  snapshot,
  oldData
) {
  const roleMap = new Map();
  const channelMap = new Map();

  let rolesCreated = 0;
  let channelsCreated = 0;

  // ----------------------------------------------------------
  // ROLES
  // ----------------------------------------------------------

  const sortedRoles = [...(snapshot.roles || [])]
    .sort((a, b) => a.position - b.position);

  for (const roleData of sortedRoles) {
    try {
      let role =
        guild.roles.cache.find(
          r =>
            r.name === roleData.name &&
            r.id !== guild.id
        );

      if (!role) {
        role = await guild.roles.create({
          name: roleData.name,
          color:
            roleData.color || 0,
          hoist:
            roleData.hoist || false,
          mentionable:
            roleData.mentionable || false,
          permissions:
            BigInt(
              roleData.permissions || "0"
            ),
          reason:
            "Zynko universal template"
        });

        rolesCreated++;
      }

      roleMap.set(
        roleData.id,
        role.id
      );
    } catch (error) {
      console.error(
        `Role creation failed: ${roleData.name}`,
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // CATEGORIES FIRST
  // ----------------------------------------------------------

  const categories =
    (snapshot.channels || [])
      .filter(
        c =>
          c.type ===
          ChannelType.GuildCategory
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (const channelData of categories) {
    try {
      let channel =
        guild.channels.cache.find(
          c =>
            c.name ===
              channelData.name &&
            c.type ===
              ChannelType.GuildCategory
        );

      if (!channel) {
        channel =
          await guild.channels.create({
            name: channelData.name,
            type:
              ChannelType.GuildCategory,
            reason:
              "Zynko universal template"
          });

        channelsCreated++;
      }

      channelMap.set(
        channelData.id,
        channel.id
      );
    } catch (error) {
      console.error(
        `Category creation failed: ${channelData.name}`,
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // OTHER CHANNELS
  // ----------------------------------------------------------

  const otherChannels =
    (snapshot.channels || [])
      .filter(
        c =>
          c.type !==
          ChannelType.GuildCategory
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (const channelData of otherChannels) {
    try {
      let channel =
        guild.channels.cache.find(
          c =>
            c.name ===
              channelData.name &&
            c.type ===
              channelData.type
        );

      const parentId =
        channelData.parentId
          ? channelMap.get(
              channelData.parentId
            ) || null
          : null;

      if (!channel) {
        const options = {
          name: channelData.name,
          type: channelData.type,
          parent: parentId || undefined,
          reason:
            "Zynko universal template"
        };

        if (
          channelData.topic &&
          (
            channelData.type ===
              ChannelType.GuildText ||
            channelData.type ===
              ChannelType.GuildAnnouncement
          )
        ) {
          options.topic =
            channelData.topic;
        }

        if (
          channelData.nsfw !== undefined &&
          (
            channelData.type ===
              ChannelType.GuildText ||
            channelData.type ===
              ChannelType.GuildAnnouncement
          )
        ) {
          options.nsfw =
            channelData.nsfw;
        }

        if (
          channelData.rateLimitPerUser !==
            null &&
          channelData.rateLimitPerUser !==
            undefined
        ) {
          options.rateLimitPerUser =
            channelData.rateLimitPerUser;
        }

        if (
          channelData.bitrate &&
          channelData.type ===
            ChannelType.GuildVoice
        ) {
          options.bitrate =
            channelData.bitrate;
        }

        if (
          channelData.userLimit &&
          channelData.type ===
            ChannelType.GuildVoice
        ) {
          options.userLimit =
            channelData.userLimit;
        }

        channel =
          await guild.channels.create(
            options
          );

        channelsCreated++;
      }

      channelMap.set(
        channelData.id,
        channel.id
      );

      // ------------------------------------------------------
      // PERMISSION OVERWRITES
      // ------------------------------------------------------

      if (
        channelData.permissionOverwrites
          ?.length
      ) {
        for (
          const overwrite of
            channelData.permissionOverwrites
        ) {
          let newId =
            overwrite.id;

          if (
            roleMap.has(
              overwrite.id
            )
          ) {
            newId =
              roleMap.get(
                overwrite.id
              );
          }

          // @everyone role
          if (
            overwrite.id ===
            guild.id
          ) {
            newId = guild.id;
          }

          try {
            await channel.permissionOverwrites.edit(
              newId,
              {
                allow:
                  BigInt(
                    overwrite.allow || "0"
                  ),
                deny:
                  BigInt(
                    overwrite.deny || "0"
                  )
              }
            );
          } catch {}
        }
      }
    } catch (error) {
      console.error(
        `Channel creation failed: ${channelData.name}`,
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // UPDATE CONFIGURED CHANNEL IDS
  // ----------------------------------------------------------

  const newData = clone(
    oldData
  );

  if (
    oldData.channels?.logs
  ) {
    newData.channels.logs =
      channelMap.get(
        oldData.channels.logs
      ) ||
      findChannelByOldId(
        snapshot,
        channelMap,
        oldData.channels.logs
      );
  }

  if (
    oldData.channels?.welcome
  ) {
    newData.channels.welcome =
      channelMap.get(
        oldData.channels.welcome
      ) ||
      findChannelByOldId(
        snapshot,
        channelMap,
        oldData.channels.welcome
      );
  }

  if (
    oldData.channels?.goodbye
  ) {
    newData.channels.goodbye =
      channelMap.get(
        oldData.channels.goodbye
      ) ||
      findChannelByOldId(
        snapshot,
        channelMap,
        oldData.channels.goodbye
      );
  }

  if (
    oldData.channels?.transcripts
  ) {
    newData.channels.transcripts =
      channelMap.get(
        oldData.channels.transcripts
      ) ||
      findChannelByOldId(
        snapshot,
        channelMap,
        oldData.channels.transcripts
      );
  }

  // ----------------------------------------------------------
  // AUTO ROLE
  // ----------------------------------------------------------

  if (
    oldData.roles?.autoRole
  ) {
    newData.roles.autoRole =
      roleMap.get(
        oldData.roles.autoRole
      ) || null;
  }

  updateGuild(
    guild.id,
    newData
  );

  return {
    roleMap,
    channelMap,
    rolesCreated,
    channelsCreated
  };
}

function findChannelByOldId(
  snapshot,
  channelMap,
  oldId
) {
  if (!oldId) return null;

  const found =
    snapshot.channels?.find(
      c => c.id === oldId
    );

  if (!found) return null;

  return (
    channelMap.get(found.id) ||
    null
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
    getGuildData(guild.id);

  const db =
    loadDB();

  return new EmbedBuilder()
    .setTitle(
      "⚙️ Zynko Control Dashboard"
    )
    .setDescription(
      "Your server control center.\n\n" +
      "Configure automation, moderation, embeds and universal templates."
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
        name:
          "📋 Universal Templates",
        value:
          `${Object.keys(
            db.serverTemplates
          ).length} saved`,
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
        `Opened by ${user.username} • 5 minute session`
    })
    .setTimestamp();
}

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

    new ActionRowBuilder()
      .addComponents(
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
// AUTOMATION
// ============================================================

function automationEmbed(
  guild
) {
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
      },
      {
        name: "📁 Log Channel",
        value:
          channelMention(
            guild,
            d.channels.logs
          ),
        inline: true
      },
      {
        name: "👋 Welcome",
        value:
          channelMention(
            guild,
            d.channels.welcome
          ),
        inline: true
      },
      {
        name: "🚪 Goodbye",
        value:
          channelMention(
            guild,
            d.channels.goodbye
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

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "automation_channels"
          )
          .setLabel(
            "Channel Setup"
          )
          .setEmoji("📁")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "automation_role"
          )
          .setLabel("Role Setup")
          .setEmoji("🎭")
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

function moderationEmbed(
  guild
) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .setDescription(
      "Server protection systems."
    )
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
            d.moderation
              .antiMassMention
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

    new ActionRowBuilder()
      .addComponents(
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
          .setLabel(
            "Anti Mentions"
          )
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
// TEMPLATES
// ============================================================

function templateEmbed() {
  const db =
    loadDB();

  const templates =
    Object.values(
      db.serverTemplates
    );

  let text =
    "🌎 **Universal Server Templates**\n\n" +
    "Save a server on one server and load its structure onto another.\n\n";

  if (!templates.length) {
    text +=
      "❌ No server templates saved yet.";
  } else {
    templates
      .slice(0, 15)
      .forEach((t, i) => {
        text +=
          `**${i + 1}. ${t.name}**\n` +
          `> ${t.sourceGuild?.name || "Unknown server"}\n` +
          `> ${t.snapshot?.channels?.length || 0} channels • ` +
          `${t.snapshot?.roles?.length || 0} roles\n` +
          `Saved: <t:${Math.floor(
            t.created / 1000
          )}:R>\n\n`;
      });
  }

  return new EmbedBuilder()
    .setTitle(
      "📋 Universal Templates"
    )
    .setDescription(text);
}

function templateButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "template_create"
          )
          .setLabel("Create")
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "template_use"
          )
          .setLabel("Use")
          .setEmoji("📨")
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
// EMBEDS
// ============================================================

function embedsEmbed(guild) {
  const d =
    getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🧱 Embed Builder")
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
          .setLabel(
            "Create Embed"
          )
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
          ),

        new ButtonBuilder()
          .setCustomId(
            "embed_post"
          )
          .setLabel("Post")
          .setEmoji("📨")
          .setStyle(
            ButtonStyle.Primary
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
      "Search members and accessible messages."
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
          .setLabel(
            "User Search"
          )
          .setEmoji("👤")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "lookup_messages"
          )
          .setLabel(
            "Message Search"
          )
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
      },
      {
        name: "👋 Welcome",
        value:
          channelMention(
            guild,
            d.channels.welcome
          ),
        inline: true
      },
      {
        name: "🚪 Goodbye",
        value:
          channelMention(
            guild,
            d.channels.goodbye
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
          .setLabel(
            "Bot Name"
          )
          .setEmoji("🤖")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "setting_channels"
          )
          .setLabel(
            "Channels"
          )
          .setEmoji("📁")
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
    .setTitle("🥺 Help")
    .setDescription(
      "**Commands**\n" +
      "`/dashboard` — Open dashboard\n" +
      "`/save` — Save complete server template\n" +
      "`/load` — Load complete server template\n\n" +

      "**Universal Templates**\n" +
      "A server saved on Matrix can be loaded onto Sinking Town.\n\n" +

      "**Load includes**\n" +
      "• Channels\n" +
      "• Categories\n" +
      "• Roles\n" +
      "• Permissions\n" +
      "• Automation settings\n" +
      "• Moderation settings\n" +
      "• Saved embeds\n\n" +

      "**Access**\n" +
      "Owner, Administrator, Manage Server, or Manage Channels + Manage Roles."
    );
}

// ============================================================
// MODAL HELPER
// ============================================================

function modal(
  id,
  title,
  fields
) {
  const m =
    new ModalBuilder()
      .setCustomId(id)
      .setTitle(title);

  for (const f of fields) {
    const input =
      new TextInputBuilder()
        .setCustomId(f.id)
        .setLabel(f.label)
        .setStyle(
          f.style ||
          TextInputStyle.Short
        )
        .setRequired(
          f.required !== false
        );

    if (f.placeholder)
      input.setPlaceholder(
        f.placeholder
      );

    if (f.maxLength)
      input.setMaxLength(
        f.maxLength
      );

    m.addComponents(
      new ActionRowBuilder()
        .addComponents(input)
    );
  }

  return m;
}

// ============================================================
// /DASHBOARD
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) return;

    if (
      interaction.commandName !==
      "dashboard"
    ) return;

    if (
      !(await requireAccess(
        interaction
      ))
    ) return;

    const msg =
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
      msg.id,
      interaction.user.id
    );
  }
);

// ============================================================
// /SAVE — FULL SERVER SAVE
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) return;

    if (
      interaction.commandName !==
      "save"
    ) return;

    if (
      !(await requireAccess(
        interaction
      ))
    ) return;

    const name =
      interaction.options.getString(
        "name"
      );

    await interaction.deferReply({
      ephemeral: true
    });

    const db =
      loadDB();

    const guildData =
      getGuildData(
        interaction.guild.id
      );

    const snapshot =
      getServerSnapshot(
        interaction.guild
      );

    db.serverTemplates[
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

      data:
        clone(guildData),

      snapshot
    };

    saveDB(db);

    return interaction.editReply(
      `✅ **${name}** saved successfully.\n\n` +
      `📁 Channels: **${snapshot.channels.length}**\n` +
      `🎭 Roles: **${snapshot.roles.length}**\n` +
      `⚡ Automation settings saved\n` +
      `🛡️ Moderation settings saved\n\n` +
      `You can now use **/load ${name}** in another server.`
    );
  }
);

// ============================================================
// /LOAD — ACTUALLY BUILDS SERVER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) return;

    if (
      interaction.commandName !==
      "load"
    ) return;

    if (
      !(await requireAccess(
        interaction
      ))
    ) return;

    const name =
      interaction.options.getString(
        "name"
      );

    await interaction.deferReply({
      ephemeral: true
    });

    const db =
      loadDB();

    const template =
      db.serverTemplates[
        name.toLowerCase()
      ];

    if (!template) {
      const names =
        Object.values(
          db.serverTemplates
        )
          .slice(0, 20)
          .map(
            t => `• ${t.name}`
          )
          .join("\n");

      return interaction.editReply(
        `❌ Template **${name}** doesn't exist.\n\n` +
        `Available templates:\n` +
        (names || "None")
      );
    }

    if (!template.snapshot) {
      return interaction.editReply(
        "❌ This is an old template format and doesn't contain a server blueprint.\n\n" +
        "Run `/save` again on the original server to create a new universal template."
      );
    }

    const current =
      getGuildData(
        interaction.guild.id
      );

    const loaded =
      clone(
        template.data
      );

    // Preserve local data
    loaded.messageLog =
      current.messageLog ||
      {};

    loaded.warnings =
      current.warnings ||
      {};

    // First save the settings
    updateGuild(
      interaction.guild.id,
      loaded
    );

    // Then actually create structure
    const result =
      await loadServerStructure(
        interaction.guild,
        template.snapshot,
        loaded
      );

    // Reload after IDs were remapped
    const finalData =
      getGuildData(
        interaction.guild.id
      );

    finalData.setupComplete =
      true;

    updateGuild(
      interaction.guild.id,
      finalData
    );

    // Bot nickname
    if (
      finalData.settings.botName
    ) {
      try {
        await interaction.guild.members.me
          ?.setNickname(
            finalData.settings.botName
          );
      } catch {}
    }

    return interaction.editReply(
      `✅ **${template.name}** loaded into **${interaction.guild.name}**.\n\n` +

      `📁 Channels created: **${result.channelsCreated}**\n` +
      `🎭 Roles created: **${result.rolesCreated}**\n\n` +

      `⚡ Automation settings restored\n` +
      `🛡️ Moderation settings restored\n` +
      `🧱 Embeds restored\n\n` +

      `Source: **${template.sourceGuild?.name || "Unknown"}**`
    );
  }
);

// ============================================================
// DASHBOARD BUTTONS
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
      !id.startsWith("home_") &&
      !id.startsWith("auto_") &&
      !id.startsWith("mod_") &&
      !id.startsWith("setting_") &&
      !id.startsWith("lookup_") &&
      !id.startsWith("embed_") &&
      !id.startsWith("template_") &&
      !id.startsWith("automation_") &&
      id !== "go_home"
    ) return;

    if (
      !(await requireAccess(
        interaction
      ))
    ) return;

    if (
      !validSession(
        interaction
      )
    ) {
      return interaction.reply({
        content:
          "⏱️ Dashboard expired. Run `/dashboard` again.",
        ephemeral: true
      });
    }

    const guild =
      interaction.guild;

    const data =
      getGuildData(
        guild.id
      );

    // HOME
    if (
      id === "go_home"
    ) {
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

    // AUTOMATION
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

    // CHANNEL SETUP
    if (
      id ===
      "automation_channels"
    ) {
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
              label:
                "Logs / Transcripts",
              value:
                "logs",
              emoji: "📜"
            },
            {
              label:
                "Welcome",
              value:
                "welcome",
              emoji: "👋"
            },
            {
              label:
                "Goodbye",
              value:
                "goodbye",
              emoji: "🚪"
            }
          );

      return interaction.reply({
        content:
          "Choose what channel you want to configure.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              typeMenu
            )
        ],
        ephemeral: true
      });
    }

    // AUTO ROLE
    if (
      id ===
      "automation_role"
    ) {
      const menu =
        new RoleSelectMenuBuilder()
          .setCustomId(
            "select_auto_role"
          )
          .setPlaceholder(
            "Select automatic role"
          );

      return interaction.reply({
        content:
          "🎭 Select the role new members receive.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ],
        ephemeral: true
      });
    }

    // MODERATION
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

    if (
      id ===
      "mod_status"
    ) {
      return interaction.reply({
        embeds: [
          moderationEmbed(
            guild
          )
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
        modal(
          "modal_botname",
          "Change Bot Name",
          [
            {
              id:
                "botname",
              label:
                "Bot Nickname",
              maxLength:
                32
            }
          ]
        )
      );
    }

    // SETTINGS CHANNELS
    if (
      id ===
      "setting_channels"
    ) {
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
              label:
                "Logs",
              value:
                "logs",
              emoji: "📜"
            },
            {
              label:
                "Welcome",
              value:
                "welcome",
              emoji: "👋"
            },
            {
              label:
                "Goodbye",
              value:
                "goodbye",
              emoji: "🚪"
            }
          );

      return interaction.reply({
        content:
          "Choose a channel type.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ],
        ephemeral: true
      });
    }

    // LOOKUP USER
    if (
      id ===
      "lookup_user"
    ) {
      return interaction.showModal(
        modal(
          "modal_lookup_user",
          "User Lookup",
          [
            {
              id:
                "userid",
              label:
                "Discord User ID"
            }
          ]
        )
      );
    }

    // LOOKUP MESSAGES
    if (
      id ===
      "lookup_messages"
    ) {
      return interaction.showModal(
        modal(
          "modal_lookup_messages",
          "Message Search",
          [
            {
              id:
                "query",
              label:
                "Search Phrase",
              maxLength:
                100
            }
          ]
        )
      );
    }

    if (
      id ===
      "lookup_related"
    ) {
      return interaction.showModal(
        modal(
          "modal_related",
          "Related Messages",
          [
            {
              id:
                "query",
              label:
                "Words or Phrase",
              maxLength:
                100
            }
          ]
        )
      );
    }

    // CREATE EMBED
    if (
      id ===
      "embed_create"
    ) {
      return interaction.showModal(
        modal(
          "modal_embed",
          "Create Embed",
          [
            {
              id:
                "title",
              label:
                "Title",
              maxLength:
                256
            },
            {
              id:
                "description",
              label:
                "Description",
              style:
                TextInputStyle.Paragraph,
              maxLength:
                4000
            }
          ]
        )
      );
    }

    if (
      id ===
      "embed_saved"
    ) {
      if (
        !data.embeds.length
      ) {
        return interaction.reply({
          content:
            "🧱 No saved embeds.",
          ephemeral:
            true
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
        ephemeral:
          true
      });
    }

    if (
      id ===
      "embed_post"
    ) {
      if (
        !data.embeds.length
      ) {
        return interaction.reply({
          content:
            "❌ No saved embeds.",
          ephemeral:
            true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_saved_embed"
          )
          .setPlaceholder(
            "Choose embed"
          );

      data.embeds
        .slice(0, 25)
        .forEach(
          (e, i) => {
            menu.addOptions({
              label:
                e.title.slice(
                  0,
                  100
                ),
              value:
                String(i),
              emoji:
                "🧱"
            });
          }
        );

      return interaction.reply({
        content:
          "Choose an embed.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ],
        ephemeral:
          true
      });
    }

    // TEMPLATE CREATE
    if (
      id ===
      "template_create"
    ) {
      return interaction.showModal(
        modal(
          "modal_template",
          "Create Universal Message Template",
          [
            {
              id:
                "name",
              label:
                "Template Name",
              maxLength:
                100
            },
            {
              id:
                "content",
              label:
                "Message",
              style:
                TextInputStyle.Paragraph,
              maxLength:
                4000
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
          db.serverTemplates
        );

      if (
        !templates.length
      ) {
        return interaction.reply({
          content:
            "❌ No universal server templates exist.",
          ephemeral:
            true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "select_server_template"
          )
          .setPlaceholder(
            "Choose server template"
          );

      templates
        .slice(0, 25)
        .forEach(
          t => {
            menu.addOptions({
              label:
                t.name.slice(
                  0,
                  100
                ),
              value:
                t.name.toLowerCase(),
              emoji:
                "🌎"
            });
          }
        );

      return interaction.reply({
        content:
          "🌎 Choose the server template to load.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ],
        ephemeral:
          true
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
          db.serverTemplates
        );

      if (
        !templates.length
      ) {
        return interaction.reply({
          content:
            "❌ No templates to delete.",
          ephemeral:
            true
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId(
            "delete_server_template"
          )
          .setPlaceholder(
            "Choose template"
          );

      templates
        .slice(0, 25)
        .forEach(
          t => {
            menu.addOptions({
              label:
                t.name.slice(
                  0,
                  100
                ),
              value:
                t.name.toLowerCase(),
              emoji:
                "🗑️"
            });
          }
        );

      return interaction.reply({
        content:
          "🗑️ Choose the template to delete.",
        components: [
          new ActionRowBuilder()
            .addComponents(
              menu
            )
        ],
        ephemeral:
          true
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
    ) return;

    if (
      !(await requireAccess(
        interaction
      ))
    ) return;

    // CHANNEL TYPE
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
            .addComponents(
              menu
            )
        ]
      });
    }

    // CHANNEL
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
      ) return;

      const data =
        getGuildData(
          interaction.guild.id
        );

      data.channels[type] =
        interaction.values[0];

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        content:
          `✅ <#${interaction.values[0]}> configured as ${type}.`,
        components: []
      });
    }

    // AUTO ROLE
    if (
      interaction.customId ===
      "select_auto_role"
    ) {
      const data =
        getGuildData(
          interaction.guild.id
        );

      data.roles.autoRole =
        interaction.values[0];

      updateGuild(
        interaction.guild.id,
        data
      );

      return interaction.update({
        content:
          `✅ <@&${interaction.values[0]}> is now the automatic role.`,
        components: []
      });
    }

    // LOAD SERVER TEMPLATE
    if (
      interaction.customId ===
      "select_server_template"
    ) {
      const name =
        interaction.values[0];

      await interaction.update({
        content:
          `⏳ Loading **${name}**...`,
        components: []
      });

      const db =
        loadDB();

      const template =
        db.serverTemplates[
          name
        ];

      if (!template) {
        return interaction.editReply({
          content:
            "❌ Template no longer exists."
        });
      }

      if (
        !template.snapshot
      ) {
        return interaction.editReply({
          content:
            "❌ This template has no server blueprint. Save the original server again."
        });
      }

      const loaded =
        clone(
          template.data
        );

      const result =
        await loadServerStructure(
          interaction.guild,
          template.snapshot,
          loaded
        );

      const finalData =
        getGuildData(
          interaction.guild.id
        );

      finalData.setupComplete =
        true;

      updateGuild(
        interaction.guild.id,
        finalData
      );

      return interaction.editReply({
        content:
          `✅ **${template.name}** loaded!\n\n` +
          `📁 Channels created: **${result.channelsCreated}**\n` +
          `🎭 Roles created: **${result.rolesCreated}**\n\n` +
          `⚡ Automation restored\n` +
          `🛡️ Moderation restored\n` +
          `🧱 Embeds restored`
      });
    }

    // DELETE SERVER TEMPLATE
    if (
      interaction.customId ===
      "delete_server_template"
    ) {
      const db =
        loadDB();

      const key =
        interaction.values[0];

      if (
        !db.serverTemplates[key]
      ) {
        return interaction.update({
          content:
            "❌ Template no longer exists.",
          components: []
        });
      }

      const name =
        db.serverTemplates[key]
          .name;

      delete db.serverTemplates[
        key
      ];

      saveDB(db);

      return interaction.update({
        content:
          `🗑️ Deleted **${name}**.`,
        components: []
      });
    }

    // SAVED EMBED
    if (
      interaction.customId ===
      "select_saved_embed"
    ) {
      const data =
        getGuildData(
          interaction.guild.id
        );

      const index =
        Number(
          interaction.values[0]
        );

      const saved =
        data.embeds[index];

      if (!saved) {
        return interaction.update({
          content:
            "❌ Embed no longer exists.",
          components: []
        });
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            saved.title
          )
          .setDescription(
            saved.description
          )
          .setFooter({
            text:
              interaction.guild.name
          });

      await interaction.channel
        .send({
          embeds: [
            embed
          ]
        })
        .catch(() => {});

      return interaction.update({
        content:
          "✅ Embed posted.",
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
      !(await requireAccess(
        interaction
      ))
    ) return;

    const data =
      getGuildData(
        interaction.guild.id
      );

    // BOT NAME
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
        await interaction.guild
          .members
          .me
          ?.setNickname(name);
      } catch {}

      return interaction.reply({
        content:
          `✅ Bot nickname changed to **${name}**.`,
        ephemeral:
          true
      });
    }

    // USER LOOKUP
    if (
      interaction.customId ===
      "modal_lookup_user"
    ) {
      const id =
        interaction.fields.getTextInputValue(
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
            "❌ Couldn't find that member.",
          ephemeral:
            true
        });
      }

      const roles =
        member.roles.cache
          .filter(
            r =>
              r.id !==
              interaction.guild.id
          )
          .map(
            r =>
              `<@&${r.id}>`
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
              name:
                "User",
              value:
                `${member.user.tag}\n\`${member.id}\``
            },
            {
              name:
                "Joined",
              value:
                member.joinedTimestamp
                  ? `<t:${Math.floor(
                      member.joinedTimestamp /
                        1000
                    )}:F>`
                  : "Unknown"
            },
            {
              name:
                "Roles",
              value:
                roles
            }
          );

      return interaction.reply({
        embeds: [
          embed
        ],
        ephemeral:
          true
      });
    }

    // MESSAGE SEARCH
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
        ephemeral:
          true
      });

      const results = [];

      const channels =
        interaction.guild.channels.cache.filter(
          c =>
            c.type ===
              ChannelType.GuildText &&
            c.viewable
        );

      for (
        const channel of
          channels.values()
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
            const message of
              messages.values()
          ) {
            if (
              !message.content
            ) continue;

            const content =
              message.content.toLowerCase();

            let match;

            if (
              interaction.customId ===
              "modal_lookup_messages"
            ) {
              match =
                content.includes(
                  query
                );
            } else {
              match =
                query
                  .split(/\s+/)
                  .some(
                    word =>
                      content.includes(
                        word
                      )
                  );
            }

            if (!match)
              continue;

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

    // EMBED
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
        ],
        ephemeral:
          true
      });
    }

    // MESSAGE TEMPLATE
    if (
      interaction.customId ===
      "modal_template"
    ) {
      const name =
        interaction.fields.getTextInputValue(
          "name"
        );

      const content =
        interaction.fields.getTextInputValue(
          "content"
        );

      const db =
        loadDB();

      db.templates[
        name.toLowerCase()
      ] = {
        name,
        content,
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
        }
      };

      saveDB(db);

      return interaction.reply({
        content:
          `🌎 ✅ Universal message template **${name}** saved.`,
        ephemeral:
          true
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
        await channel
          .send({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "💬 Message Log"
                )
                .addFields(
                  {
                    name:
                      "User",
                    value:
                      `${message.author}`,
                    inline:
                      true
                  },
                  {
                    name:
                      "Channel",
                    value:
                      `${message.channel}`,
                    inline:
                      true
                  },
                  {
                    name:
                      "Message",
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
          })
          .catch(() => {});
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
          m =>
            m.user ===
              message.author.id &&
            Date.now() -
              m.timestamp <
              5000
        ).length;

      if (
        count >= 6 &&
        message.member
          ?.moderatable
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
        /(https?:\/\/|www\.)/i.test(
          message.content
        );

      const allowed =
        message.member?.permissions.has(
          PermissionsBitField.Flags
            .ManageMessages
        );

      if (
        hasLink &&
        !allowed
      ) {
        await message
          .delete()
          .catch(() => {});

        return;
      }
    }

    // ANTI MASS MENTION
    if (
      data.moderation
        .antiMassMention &&
      message.mentions.users.size >=
        5
    ) {
      await message
        .delete()
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
    if (
      !message.guild
    ) return;

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

    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🗑️ Deleted Message"
            )
            .addFields(
              {
                name:
                  "Author",
                value:
                  message.author
                    ? `${message.author}`
                    : "Unknown"
              },
              {
                name:
                  "Channel",
                value:
                  `${message.channel}`
              },
              {
                name:
                  "Content",
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
      })
      .catch(() => {});
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
        await channel
          .send(
            `👋 Welcome ${member} to **${member.guild.name}**!`
          )
          .catch(() => {});
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
        await member.roles
          .add(
            role,
            "Zynko automatic role"
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

    await channel
      .send(
        `🚪 **${member.user.username}** has left the server.`
      )
      .catch(() => {});
  }
);

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName(
        "dashboard"
      )
      .setDescription(
        "Open the Zynko Control Dashboard"
      ),

    new SlashCommandBuilder()
      .setName("save")
      .setDescription(
        "Save this server as a universal server template"
      )
      .addStringOption(
        option =>
          option
            .setName("name")
            .setDescription(
              "Name of the template"
            )
            .setRequired(
              true
            )
      ),

    new SlashCommandBuilder()
      .setName("load")
      .setDescription(
        "Load a universal server template"
      )
      .addStringOption(
        option =>
          option
            .setName("name")
            .setDescription(
              "Template to load"
            )
            .setRequired(
              true
            )
      )
  ];

  const rest =
    new REST({
      version:
        "10"
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
            c =>
              c.toJSON()
          )
      }
    );

    console.log(
      "✅ /dashboard /save /load registered."
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

client.login(
  TOKEN
);