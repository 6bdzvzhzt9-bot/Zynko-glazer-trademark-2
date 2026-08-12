// ============================================================
// ZYNKO CONTROL BOT
// ROLE + PIN ACCESS
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

const ACCESS_ROLE_NAME = "Zynko@$@";
const DASHBOARD_PIN = "2567";

const DB_FILE = "./database.json";
const SESSION_TIME = 10 * 60 * 1000;

// ============================================================
// STARTUP CHECK
// ============================================================

if (!TOKEN) {
  console.error("❌ TOKEN environment variable is missing.");
  process.exit(1);
}

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
    servers: client ? client.guilds.cache.size : 0
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
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    if (!db.guilds) db.guilds = {};
    if (!db.templates) db.templates = {};

    return db;
  } catch (error) {
    console.error("⚠️ Database error:", error.message);

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
// DASHBOARD SESSIONS
// ============================================================

const sessions = new Map();

function createSession(message, userId) {
  if (!message?.id) return;

  const timeout = setTimeout(async () => {
    const session = sessions.get(message.id);

    if (!session) return;

    sessions.delete(message.id);

    try {
      await message.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏱️ Dashboard Expired")
            .setDescription(
              "This dashboard session expired.\n\nRun `/dashboard` again."
            )
            .setFooter({
              text: "Zynko Control Bot"
            })
            .setTimestamp()
        ],
        components: []
      });
    } catch {}
  }, SESSION_TIME);

  sessions.set(message.id, {
    userId,
    expires: Date.now() + SESSION_TIME,
    timeout
  });
}

function destroySession(messageId) {
  const session = sessions.get(messageId);

  if (!session) return;

  clearTimeout(session.timeout);
  sessions.delete(messageId);
}

function validSession(interaction) {
  const messageId = interaction.message?.id;

  if (!messageId) return false;

  const session = sessions.get(messageId);

  if (!session) return false;

  if (Date.now() >= session.expires) {
    destroySession(messageId);
    return false;
  }

  return session.userId === interaction.user.id;
}

// ============================================================
// ROLE ACCESS
// ============================================================

function hasZynkoRole(member) {
  if (!member) return false;

  return member.roles.cache.some(
    role => role.name === ACCESS_ROLE_NAME
  );
}

function hasAccess(interaction) {
  if (!interaction.guild) return false;

  const member =
    interaction.member ||
    interaction.guild.members.cache.get(
      interaction.user.id
    );

  return hasZynkoRole(member);
}

async function requireAccess(interaction) {
  if (hasAccess(interaction)) return true;

  const response = {
    content:
      `🔒 You need the **${ACCESS_ROLE_NAME}** role to use Zynko.`,
    flags: 64
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  } catch {}

  return false;
}

// ============================================================
// PIN MODAL
// ============================================================

function pinModal() {
  return new ModalBuilder()
    .setCustomId("dashboard_pin")
    .setTitle("🔐 Zynko Dashboard")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pin")
          .setLabel("Enter dashboard PIN")
          .setPlaceholder("Enter PIN")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
      )
    );
}

// ============================================================
// HELPERS
// ============================================================

function enabled(value) {
  return value ? "🟢 Enabled" : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!guild || !id) return "Not configured";

  const channel = guild.channels.cache.get(id);

  return channel
    ? `<#${id}>`
    : "Channel not found";
}

// ============================================================
// DASHBOARD
// ============================================================

function homeEmbed(guild, user) {
  const data = getGuildData(guild.id);
  const db = loadDB();

  const automationActive =
    Object.values(data.automation).some(Boolean);

  const moderationActive =
    Object.values(data.moderation).some(Boolean);

  return new EmbedBuilder()
    .setTitle("⚙️ Zynko Control Dashboard")
    .setDescription(
      "Universal server control center.\n\n" +
      "Manage automation, moderation, templates, embeds and server settings."
    )
    .addFields(
      {
        name: "⚡ Automation",
        value: automationActive
          ? "🟢 Active"
          : "🔴 Disabled",
        inline: true
      },
      {
        name: "🛡️ Moderation",
        value: moderationActive
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
        value: data.roles.autoRole
          ? `<@&${data.roles.autoRole}>`
          : "Not configured",
        inline: true
      }
    )
    .setFooter({
      text:
        `Access: ${ACCESS_ROLE_NAME} • Session: 10 minutes`
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
// TEMPLATES
// ============================================================

function serializeRole(role) {
  return {
    name: role.name,
    color: role.hexColor,
    hoist: role.hoist,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    mentionable: role.mentionable
  };
}

function serializeOverwrites(channel) {
  if (!channel.permissionOverwrites?.cache) {
    return [];
  }

  return [...channel.permissionOverwrites.cache.values()]
    .filter(x => x.type === 0 || x.type === "role")
    .map(x => ({
      roleName:
        channel.guild.roles.cache.get(x.id)?.name || null,
      allow: x.allow.bitfield.toString(),
      deny: x.deny.bitfield.toString()
    }))
    .filter(x => x.roleName);
}

function serializeChannel(channel) {
  return {
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition,
    parentName: channel.parent?.name || null,

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

    permissionOverwrites:
      serializeOverwrites(channel)
  };
}

function createServerSnapshot(guild) {
  const roles = [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id)
    .filter(role => role.name !== "@everyone")
    .filter(role => role.name !== "Invite Tracker")
    .sort((a, b) => a.position - b.position)
    .map(serializeRole);

  const channels = [...guild.channels.cache.values()]
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(serializeChannel);

  return {
    version: 6,

    guild: {
      name: guild.name
    },

    roles,
    channels,
    created: Date.now()
  };
}

function templateEmbed() {
  const db = loadDB();
  const templates = Object.values(db.templates);

  let description =
    "🌎 **Universal Server Templates**\n\n" +
    "Save one server and load its structure into another.\n\n";

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
// TEMPLATE LOADER
// ============================================================

async function restoreRoles(guild, snapshot) {
  const roleMap = {};

  for (const saved of snapshot.roles) {
    if (saved.name === "Invite Tracker") continue;

    let role = guild.roles.cache.find(
      r => r.name === saved.name
    );

    try {
      if (!role) {
        role = await guild.roles.create({
          name: saved.name,
          color: saved.color,
          hoist: saved.hoist,
          mentionable: saved.mentionable,
          permissions: BigInt(saved.permissions),
          reason: "Zynko template restore"
        });
      } else if (role.editable) {
        await role.edit({
          name: saved.name,
          color: saved.color,
          hoist: saved.hoist,
          mentionable: saved.mentionable,
          permissions: BigInt(saved.permissions),
          reason: "Zynko template restore"
        });
      }

      roleMap[saved.name] = role.id;
    } catch (error) {
      console.log(
        `⚠️ Role restore failed ${saved.name}: ${error.message}`
      );
    }
  }

  return roleMap;
}

async function restoreChannels(guild, snapshot, roleMap) {
  const categoryMap = {};

  const categories = snapshot.channels
    .filter(
      c => c.type === ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of categories) {
    try {
      let category = guild.channels.cache.find(
        c =>
          c.type === ChannelType.GuildCategory &&
          c.name === saved.name
      );

      if (!category) {
        category = await guild.channels.create({
          name: saved.name,
          type: ChannelType.GuildCategory,
          reason: "Zynko template restore"
        });
      }

      categoryMap[saved.name] = category.id;

      await applyPermissions(
        category,
        saved.permissionOverwrites,
        roleMap
      );
    } catch (error) {
      console.log(
        `⚠️ Category failed ${saved.name}: ${error.message}`
      );
    }
  }

  const channels = snapshot.channels
    .filter(
      c => c.type !== ChannelType.GuildCategory
    )
    .sort((a, b) => a.position - b.position);

  for (const saved of channels) {
    try {
      let channel = guild.channels.cache.find(
        c =>
          c.name === saved.name &&
          c.type === saved.type
      );

      const parent =
        saved.parentName
          ? categoryMap[saved.parentName] || null
          : null;

      if (!channel) {
        const options = {
          name: saved.name,
          type: saved.type,
          parent,
          reason: "Zynko template restore"
        };

        if (
          saved.type === ChannelType.GuildText ||
          saved.type === ChannelType.GuildAnnouncement
        ) {
          options.topic = saved.topic || undefined;
          options.nsfw = !!saved.nsfw;
          options.rateLimitPerUser =
            saved.rateLimitPerUser || 0;
        }

        channel = await guild.channels.create(options);
      } else {
        await channel.edit({
          parent,
          reason: "Zynko template restore"
        }).catch(() => {});
      }

      await applyPermissions(
        channel,
        saved.permissionOverwrites,
        roleMap
      );
    } catch (error) {
      console.log(
        `⚠️ Channel failed ${saved.name}: ${error.message}`
      );
    }
  }
}

async function applyPermissions(
  channel,
  overwrites,
  roleMap
) {
  if (!Array.isArray(overwrites)) return;

  const permissions = [];

  for (const overwrite of overwrites) {
    const roleId = roleMap[overwrite.roleName];

    if (!roleId) continue;

    permissions.push({
      id: roleId,
      type: 0,
      allow: BigInt(overwrite.allow || "0"),
      deny: BigInt(overwrite.deny || "0")
    });
  }

  try {
    await channel.permissionOverwrites.set(
      permissions,
      "Zynko template permissions"
    );
  } catch {}
}

async function loadServerSnapshot(guild, snapshot) {
  const me =
    guild.members.me ||
    await guild.members.fetchMe();

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageRoles
    )
  ) {
    throw new Error(
      "Bot needs Manage Roles."
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

  const roleMap =
    await restoreRoles(
      guild,
      snapshot
    );

  await restoreChannels(
    guild,
    snapshot,
    roleMap
  );

  return roleMap;
}

// ============================================================
// SETTINGS
// ============================================================

function settingsEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .addFields({
      name: "🤖 Bot Name",
      value:
        data.settings.botName ||
        client.user?.username ||
        "Zynko",
      inline: true
    });
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
    .setTitle("❓ Zynko Help")
    .setDescription(
      "**Access**\n" +
      `You need the **${ACCESS_ROLE_NAME}** role plus the dashboard PIN.\n\n` +

      "**Templates**\n" +
      "Save and load server structures.\n\n" +

      "**Copied:**\n" +
      "• Roles\n" +
      "• Role permissions\n" +
      "• Role hierarchy\n" +
      "• Categories\n" +
      "• Channels\n" +
      "• Topics\n" +
      "• Slowmode\n" +
      "• NSFW\n" +
      "• Permission overwrites\n\n" +

      "**Skipped:**\n" +
      "• Invite Tracker role\n" +
      "• Individual user overwrites"
    );
}

// ============================================================
// MODAL HELPER
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
        field.style ||
        TextInputStyle.Short
      )
      .setRequired(
        field.required !== false
      );

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
// DASHBOARD COMMAND
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== "dashboard") return;

    if (!interaction.guild) {
      return interaction.reply({
        content:
          "❌ Use `/dashboard` inside a server.",
        flags: 64
      });
    }

    if (!(await requireAccess(interaction))) return;

    return interaction.showModal(pinModal());
  }
);

// ============================================================
// BUTTON HANDLER
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.isButton()) return;

    if (!(await requireAccess(interaction))) return;

    if (!validSession(interaction)) {
      return interaction.reply({
        content:
          "⏱️ Dashboard expired. Run `/dashboard` again.",
        flags: 64
      }).catch(() => {});
    }

    const guild = interaction.guild;
    if (!guild) return;

    const id = interaction.customId;
    const data = getGuildData(guild.id);

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
        embeds: [
          automationEmbed(guild)
        ],
        components: automationButtons()
      });
    }

    if (id === "home_moderation") {
      return interaction.update({
        embeds: [
          moderationEmbed(guild)
        ],
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
        embeds: [
          settingsEmbed(guild)
        ],
        components: settingsButtons()
      });
    }

    if (id === "home_embeds") {
      return interaction.update({
        embeds: [
          embedsEmbed(guild)
        ],
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

    // AUTOMATION

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
        embeds: [
          automationEmbed(guild)
        ],
        components: automationButtons()
      });
    }

    // MODERATION

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
        embeds: [
          moderationEmbed(guild)
        ],
        components: moderationButtons()
      });
    }

    // TEMPLATE SAVE

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

    // TEMPLATE LOAD

    if (id === "template_use") {
      const db = loadDB();
      const templates =
        Object.values(db.templates);

      if (!templates.length) {
        return interaction.reply({
          content: "❌ No templates saved.",
          flags: 64
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId("select_template")
          .setPlaceholder(
            "Choose a server template"
          );

      templates.slice(0, 25).forEach(template => {
        menu.addOptions({
          label: template.name.slice(0, 100),
          value: template.name
            .toLowerCase()
            .slice(0, 100),
          emoji: "📥"
        });
      });

      return interaction.reply({
        content:
          "🌎 Choose the server template to load.",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        flags: 64
      });
    }

    // TEMPLATE DELETE

    if (id === "template_delete") {
      const db = loadDB();
      const templates =
        Object.values(db.templates);

      if (!templates.length) {
        return interaction.reply({
          content: "❌ No templates.",
          flags: 64
        });
      }

      const menu =
        new StringSelectMenuBuilder()
          .setCustomId("delete_template")
          .setPlaceholder(
            "Choose template"
          );

      templates.slice(0, 25).forEach(template => {
        menu.addOptions({
          label: template.name.slice(0, 100),
          value: template.name
            .toLowerCase()
            .slice(0, 100),
          emoji: "🗑️"
        });
      });

      return interaction.reply({
        content:
          "🗑️ Choose a template to delete.",
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        flags: 64
      });
    }

    // BOT NAME

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

    // EMBED

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

    if (id === "embed_saved") {
      if (!data.embeds.length) {
        return interaction.reply({
          content: "🧱 No saved embeds.",
          flags: 64
        });
      }

      return interaction.reply({
        content:
          "🧱 **Saved Embeds**\n\n" +
          data.embeds
            .map(
              (x, i) =>
                `${i + 1}. **${x.title}**`
            )
            .join("\n"),
        flags: 64
      });
    }

    // LOOKUP USER

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

    // LOOKUP MESSAGES

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
    if (!interaction.isStringSelectMenu()) return;

    if (!(await requireAccess(interaction))) return;

    if (!validSession(interaction)) {
      return interaction.update({
        content:
          "⏱️ Dashboard expired. Run `/dashboard` again.",
        embeds: [],
        components: []
      }).catch(() => {});
    }

    if (interaction.customId === "select_template") {
      const db = loadDB();

      const key =
        interaction.values[0].toLowerCase();

      const template =
        db.templates[key];

      if (!template) {
        return interaction.update({
          content:
            "❌ Template no longer exists.",
          components: []
        });
      }

      await interaction.update({
        content:
          `⏳ Loading **${template.name}**...`,
        components: []
      });

      try {
        const roleMap =
          await loadServerSnapshot(
            interaction.guild,
            template.snapshot
          );

        await interaction.editReply({
          content:
            `✅ **${template.name}** loaded successfully.\n\n` +
            `🎭 Roles processed: **${Object.keys(roleMap).length}**\n` +
            "📁 Categories processed\n" +
            "💬 Channels processed\n" +
            "🔒 Permissions processed"
        });
      } catch (error) {
        console.error(error);

        await interaction.editReply({
          content:
            `❌ Load failed:\n\`${error.message}\``
        });
      }

      return;
    }

    if (interaction.customId === "delete_template") {
      const db = loadDB();

      const key =
        interaction.values[0].toLowerCase();

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
    if (!interaction.isModalSubmit()) return;

    // ========================================================
    // PIN
    // ========================================================

    if (interaction.customId === "dashboard_pin") {
      if (!(await requireAccess(interaction))) return;

      const entered =
        interaction.fields
          .getTextInputValue("pin")
          .trim();

      if (entered !== DASHBOARD_PIN) {
        return interaction.reply({
          content:
            "❌ Incorrect PIN.",
          flags: 64
        });
      }

      await interaction.reply({
        content:
          "✅ Dashboard unlocked.",
        flags: 64
      });

      const message =
        await interaction.followUp({
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
        message,
        interaction.user.id
      );

      return;
    }

    // EVERYTHING ELSE

    if (!(await requireAccess(interaction))) return;

    // SAVE TEMPLATE

    if (interaction.customId === "modal_template") {
      const name =
        interaction.fields
          .getTextInputValue("name")
          .trim();

      if (!name) {
        return interaction.reply({
          content:
            "❌ Template name cannot be empty.",
          flags: 64
        });
      }

      await interaction.deferReply({
        flags: 64
      });

      try {
        const snapshot =
          createServerSnapshot(
            interaction.guild
          );

        const db = loadDB();

        const key = name.toLowerCase();

        db.templates[key] = {
          name,
          created: Date.now(),
          ownerId: interaction.user.id,
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
          "🔒 Permission overwrites included.\n" +
          "⏭️ Invite Tracker skipped."
        );
      } catch (error) {
        console.error(error);

        return interaction.editReply(
          `❌ Save failed:\n\`${error.message}\``
        );
      }
    }

    // BOT NAME

    if (interaction.customId === "modal_botname") {
      const name =
        interaction.fields
          .getTextInputValue("botname")
          .trim();

      if (!name) {
        return interaction.reply({
          content:
            "❌ Bot name cannot be empty.",
          flags: 64
        });
      }

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
        const me =
          interaction.guild.members.me ||
          await interaction.guild.members.fetchMe();

        await me.setNickname(name);
      } catch {}

      return interaction.reply({
        content:
          `✅ Bot nickname changed to **${name}**.`,
        flags: 64
      });
    }

    // EMBED

    if (interaction.customId === "modal_embed") {
      const title =
        interaction.fields
          .getTextInputValue("title");

      const description =
        interaction.fields
          .getTextInputValue("description");

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
        content:
          "✅ Embed saved.",
        embeds: [
          new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
        ],
        flags: 64
      });
    }

    // USER LOOKUP

    if (
      interaction.customId ===
      "modal_lookup_user"
    ) {
      const id =
        interaction.fields
          .getTextInputValue("userid")
          .trim();

      let member;

      try {
        member =
          await interaction.guild.members.fetch(id);
      } catch {
        return interaction.reply({
          content:
            "❌ Member not found.",
          flags: 64
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
        flags: 64
      });
    }

    // MESSAGE LOOKUP

    if (
      interaction.customId ===
      "modal_lookup_messages"
    ) {
      const query =
        interaction.fields
          .getTextInputValue("query")
          .toLowerCase();

      await interaction.deferReply({
        flags: 64
      });

      const results = [];

      const channels =
        interaction.guild.channels.cache.filter(
          channel =>
            channel.type === ChannelType.GuildText &&
            channel.viewable
        );

      for (const channel of channels.values()) {
        if (results.length >= 20) break;

        try {
          const messages =
            await channel.messages.fetch({
              limit: 100
            });

          for (const message of messages.values()) {
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

            if (results.length >= 20) break;
          }
        } catch {}
      }

      return interaction.editReply({
        content:
          results.length
            ? `🔎 **Results:**\n\n${results.join("\n\n")}`
            : `❌ No results for \`${query}\`.`
      });
    }
  }
);

// ============================================================
// MESSAGE SYSTEMS
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

    if (!data.messageLog) {
      data.messageLog = {};
    }

    data.messageLog[message.channel.id] ||= [];

    data.messageLog[message.channel.id].push({
      id: message.id,
      user: message.author.id,
      username: message.author.username,
      content: message.content,
      timestamp: Date.now()
    });

    data.messageLog[message.channel.id] =
      data.messageLog[message.channel.id].slice(-200);

    // CHAT LOGS

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
                    message.content.slice(0, 1000) ||
                    "[No text]"
                }
              )
              .setTimestamp()
          ]
        }).catch(() => {});
      }
    }

    // ANTI SPAM

    if (data.moderation.antiSpam) {
      const recent =
        data.messageLog[message.channel.id] || [];

      const count =
        recent.filter(
          entry =>
            entry.user === message.author.id &&
            Date.now() - entry.timestamp < 5000
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

    if (data.moderation.antiLinks) {
      const hasLink =
        /(https?:\/\/|www\.)/i.test(
          message.content
        );

      const allowed =
        message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        );

      if (hasLink && !allowed) {
        await message.delete().catch(() => {});
        updateGuild(
          message.guild.id,
          data
        );
        return;
      }
    }

    // ANTI MASS MENTION

    if (
      data.moderation.antiMassMention &&
      message.mentions.users.size >= 5
    ) {
      await message.delete().catch(() => {});

      updateGuild(
        message.guild.id,
        data
      );

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

    if (!channel) return;

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
                message.content?.slice(0, 1000) ||
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

      if (channel) {
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
        member.guild.members.me ||
        await member.guild.members.fetchMe()
          .catch(() => null);

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
      !data.automation.autoGoodbyes ||
      !data.channels.goodbye
    ) {
      return;
    }

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

  const rest =
    new REST({
      version: "10"
    }).setToken(TOKEN);

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

    console.log("✅ /dashboard registered.");
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
      `🌎 Servers: ${client.guilds.cache.size}`
    );

    console.log(
      `🔐 Access role: ${ACCESS_ROLE_NAME}`
    );

    console.log(
      "🔑 PIN protection: ENABLED"
    );

    console.log(
      "===================================="
    );

    client.user.setActivity(
      "Zynko Dashboard",
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