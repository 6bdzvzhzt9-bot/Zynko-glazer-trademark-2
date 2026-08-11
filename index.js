// ============================================================
// ZYNKO CONTROL BOT — UNIVERSAL TEMPLATE VERSION
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
      JSON.stringify({
        guilds: {},
        templates: {},
        serverTemplates: {}
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

function enabled(v) {
  return v ? "🟢 Enabled" : "🔴 Disabled";
}

function channelMention(guild, id) {
  if (!id) return "Not configured";

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
  const db = loadDB();

  return new EmbedBuilder()
    .setTitle("⚙️ Zynko Control Dashboard")
    .setDescription(
      "Your server control center.\n\n" +
      "Configure automation, moderation, embeds and universal templates."
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
        name: "📋 Universal Templates",
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
        `Opened by ${user.username} • 5 minute session`
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
      },
      {
        name: "📁 Log Channel",
        value: channelMention(guild, d.channels.logs),
        inline: true
      },
      {
        name: "👋 Welcome",
        value: channelMention(guild, d.channels.welcome),
        inline: true
      },
      {
        name: "🚪 Goodbye",
        value: channelMention(guild, d.channels.goodbye),
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
  const d = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .setDescription("Server protection systems.")
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
// TEMPLATES — UNIVERSAL
// ============================================================

function templateEmbed() {
  const db = loadDB();
  const templates = Object.values(db.templates);

  let text =
    "🌎 **Universal Templates**\n\n" +
    "Templates saved here can be used from ANY server where you have dashboard access.\n\n";

  if (!templates.length) {
    text += "❌ No templates saved yet.";
  } else {
    templates
      .slice(0, 15)
      .forEach((t, i) => {
        text +=
          `**${i + 1}. ${t.name}**\n` +
          `> ${t.content.slice(0, 120)}\n` +
          `Saved: <t:${Math.floor(t.created / 1000)}:R>\n\n`;
      });
  }

  return new EmbedBuilder()
    .setTitle("📋 Universal Templates")
    .setDescription(text);
}

function templateButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("template_create")
        .setLabel("Create")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("template_use")
        .setLabel("Use")
        .setEmoji("📨")
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
        .setLabel("Create Embed")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("embed_saved")
        .setLabel("Saved")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("embed_post")
        .setLabel("Post")
        .setEmoji("📨")
        .setStyle(ButtonStyle.Primary)
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
      "Search members and accessible messages."
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
        value: channelMention(guild, d.channels.logs),
        inline: true
      },
      {
        name: "👋 Welcome",
        value: channelMention(guild, d.channels.welcome),
        inline: true
      },
      {
        name: "🚪 Goodbye",
        value: channelMention(guild, d.channels.goodbye),
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
// HELP
// ============================================================

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle("🥺 Help")
    .setDescription(
      "**Commands**\n" +
      "`/dashboard` — Open dashboard\n" +
      "`/save` — Save this server as a universal template\n" +
      "`/load` — Load a universal server template\n\n" +

      "**Universal Templates**\n" +
      "A template saved on Matrix can be loaded on Sinking Town.\n\n" +

      "**Dashboard Access**\n" +
      "Server Owner, Administrator, Manage Server, or Manage Channels + Manage Roles."
    );
}

// ============================================================
// MODAL HELPER
// ============================================================

function modal(id, title, fields) {
  const m = new ModalBuilder()
    .setCustomId(id)
    .setTitle(title);

  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setStyle(f.style || TextInputStyle.Short)
      .setRequired(f.required !== false);

    if (f.placeholder)
      input.setPlaceholder(f.placeholder);

    if (f.maxLength)
      input.setMaxLength(f.maxLength);

    m.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return m;
}

// ============================================================
// /DASHBOARD
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "dashboard") return;

  if (!(await requireAccess(interaction))) return;

  const msg = await interaction.reply({
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
    msg.id,
    interaction.user.id
  );
});

// ============================================================
// /SAVE
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "save") return;

  if (!(await requireAccess(interaction))) return;

  const name = interaction.options.getString("name");

  await interaction.deferReply({
    ephemeral: true
  });

  const db = loadDB();

  // Save server configuration
  const guildData = getGuildData(
    interaction.guild.id
  );

  db.templates[name.toLowerCase()] = {
    name,
    created: Date.now(),
    ownerId: interaction.user.id,
    ownerName: interaction.user.username,

    sourceGuild: {
      id: interaction.guild.id,
      name: interaction.guild.name
    },

    data: clone(guildData)
  };

  saveDB(db);

  return interaction.editReply(
    `✅ **${name}** has been saved as a universal template.\n\n` +
    `You can now run \`/load ${name}\` in **any server** where you have access.`
  );
});

// ============================================================
// /LOAD
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "load") return;

  if (!(await requireAccess(interaction))) return;

  const name = interaction.options.getString("name");

  await interaction.deferReply({
    ephemeral: true
  });

  const db = loadDB();

  const template =
    db.templates[name.toLowerCase()];

  if (!template) {
    const names =
      Object.values(db.templates)
        .slice(0, 20)
        .map(t => `• ${t.name}`)
        .join("\n");

    return interaction.editReply(
      `❌ Template **${name}** doesn't exist.\n\n` +
      `Available templates:\n${names || "None"}`
    );
  }

  // Never blindly overwrite with old broken data
  const current = getGuildData(
    interaction.guild.id
  );

  const loaded = clone(template.data);

  // Preserve target-server message history
  loaded.messageLog =
    current.messageLog || {};

  // Preserve target-server warnings
  loaded.warnings =
    current.warnings || {};

  updateGuild(
    interaction.guild.id,
    loaded
  );

  return interaction.editReply(
    `✅ Loaded **${template.name}** into **${interaction.guild.name}**.\n\n` +
    `Source: **${template.sourceGuild?.name || "Unknown"}**`
  );
});

// ============================================================
// DASHBOARD BUTTONS
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const id = interaction.customId;

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

  if (!(await requireAccess(interaction))) return;

  if (!validSession(interaction)) {
    return interaction.reply({
      content:
        "⏱️ Dashboard expired. Run `/dashboard` again.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const data = getGuildData(guild.id);

  // ----------------------------------------------------------
  // HOME
  // ----------------------------------------------------------

  if (id === "go_home") {
    return interaction.update({
      embeds: [
        homeEmbed(guild, interaction.user)
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

  if (id === "home_lookup") {
    return interaction.update({
      embeds: [lookupEmbed()],
      components: lookupButtons()
    });
  }

  if (id === "home_embeds") {
    return interaction.update({
      embeds: [embedsEmbed(guild)],
      components: embedsButtons()
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

  if (id === "home_help") {
    return interaction.update({
      embeds: [helpEmbed()],
      components: [backButton()]
    });
  }

  // ----------------------------------------------------------
  // AUTOMATION
  // ----------------------------------------------------------

  const autoMap = {
    auto_transcripts: "transcripts",
    auto_joins: "autoJoins",
    auto_goodbyes: "autoGoodbyes",
    auto_chatlogs: "autoChatLogs",
    auto_delete: "autoDeleteLogs",
    auto_roles: "autoRoles"
  };

  if (autoMap[id]) {
    const key = autoMap[id];

    data.automation[key] =
      !data.automation[key];

    updateGuild(guild.id, data);

    return interaction.update({
      embeds: [automationEmbed(guild)],
      components: automationButtons()
    });
  }

  // ----------------------------------------------------------
  // AUTOMATION CHANNELS
  // ----------------------------------------------------------

  if (id === "automation_channels") {
    const typeMenu =
      new StringSelectMenuBuilder()
        .setCustomId("select_channel_type")
        .setPlaceholder("Choose channel type")
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
        "Choose what channel you want to configure.",
      components: [
        new ActionRowBuilder()
          .addComponents(typeMenu)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // AUTO ROLE
  // ----------------------------------------------------------

  if (id === "automation_role") {
    const menu =
      new RoleSelectMenuBuilder()
        .setCustomId("select_auto_role")
        .setPlaceholder("Select automatic role");

    return interaction.reply({
      content:
        "🎭 Select the role new members receive.",
      components: [
        new ActionRowBuilder()
          .addComponents(menu)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // MODERATION
  // ----------------------------------------------------------

  const modMap = {
    mod_warnings: "warnings",
    mod_automod: "automod",
    mod_spam: "antiSpam",
    mod_links: "antiLinks",
    mod_mentions: "antiMassMention"
  };

  if (modMap[id]) {
    const key = modMap[id];

    data.moderation[key] =
      !data.moderation[key];

    updateGuild(guild.id, data);

    return interaction.update({
      embeds: [moderationEmbed(guild)],
      components: moderationButtons()
    });
  }

  if (id === "mod_status") {
    return interaction.reply({
      embeds: [moderationEmbed(guild)],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // BOT NAME
  // ----------------------------------------------------------

  if (id === "setting_botname") {
    return interaction.showModal(
      modal(
        "modal_botname",
        "Change Bot Name",
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

  // ----------------------------------------------------------
  // SETTINGS CHANNELS
  // ----------------------------------------------------------

  if (id === "setting_channels") {
    const menu =
      new StringSelectMenuBuilder()
        .setCustomId(
          "select_settings_channel_type"
        )
        .setPlaceholder("Choose channel type")
        .addOptions(
          {
            label: "Logs",
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
        "Choose a channel type.",
      components: [
        new ActionRowBuilder()
          .addComponents(menu)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // LOOKUPS
  // ----------------------------------------------------------

  if (id === "lookup_user") {
    return interaction.showModal(
      modal(
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

  if (id === "lookup_messages") {
    return interaction.showModal(
      modal(
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

  if (id === "lookup_related") {
    return interaction.showModal(
      modal(
        "modal_related",
        "Related Messages",
        [
          {
            id: "query",
            label: "Words or Phrase",
            maxLength: 100
          }
        ]
      )
    );
  }

  // ----------------------------------------------------------
  // EMBEDS
  // ----------------------------------------------------------

  if (id === "embed_create") {
    return interaction.showModal(
      modal(
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

  if (id === "embed_post") {
    if (!data.embeds.length) {
      return interaction.reply({
        content: "❌ No saved embeds.",
        ephemeral: true
      });
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId("select_saved_embed")
        .setPlaceholder("Choose embed");

    data.embeds
      .slice(0, 25)
      .forEach((e, i) => {
        menu.addOptions({
          label: e.title.slice(0, 100),
          value: String(i),
          emoji: "🧱"
        });
      });

    return interaction.reply({
      content: "Choose an embed.",
      components: [
        new ActionRowBuilder()
          .addComponents(menu)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // UNIVERSAL TEMPLATE CREATE
  // ----------------------------------------------------------

  if (id === "template_create") {
    return interaction.showModal(
      modal(
        "modal_template",
        "Create Universal Template",
        [
          {
            id: "name",
            label: "Template Name",
            maxLength: 100,
            placeholder: "Example: Main Server"
          },
          {
            id: "content",
            label: "Message",
            style: TextInputStyle.Paragraph,
            maxLength: 4000
          }
        ]
      )
    );
  }

  // ----------------------------------------------------------
  // UNIVERSAL TEMPLATE USE
  // ----------------------------------------------------------

  if (id === "template_use") {
    const db = loadDB();
    const templates =
      Object.values(db.templates);

    if (!templates.length) {
      return interaction.reply({
        content:
          "❌ No universal templates exist.",
        ephemeral: true
      });
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId("select_template")
        .setPlaceholder("Choose universal template");

    templates
      .slice(0, 25)
      .forEach((t) => {
        menu.addOptions({
          label: t.name.slice(0, 100),
          value: t.name.toLowerCase(),
          emoji: "📋"
        });
      });

    return interaction.reply({
      content:
        "🌎 Choose a universal template.",
      components: [
        new ActionRowBuilder()
          .addComponents(menu)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // DELETE TEMPLATE
  // ----------------------------------------------------------

  if (id === "template_delete") {
    const db = loadDB();
    const templates =
      Object.values(db.templates);

    if (!templates.length) {
      return interaction.reply({
        content:
          "❌ No templates to delete.",
        ephemeral: true
      });
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId("delete_template")
        .setPlaceholder("Choose template to delete");

    templates
      .slice(0, 25)
      .forEach(t => {
        menu.addOptions({
          label: t.name.slice(0, 100),
          value: t.name.toLowerCase(),
          emoji: "🗑️"
        });
      });

    return interaction.reply({
      content:
        "🗑️ Choose the universal template to delete.",
      components: [
        new ActionRowBuilder()
          .addComponents(menu)
      ],
      ephemeral: true
    });
  }
});

// ============================================================
// SELECT MENUS
// ============================================================

client.on("interactionCreate", async interaction => {
  if (
    !interaction.isStringSelectMenu() &&
    !interaction.isChannelSelectMenu() &&
    !interaction.isRoleSelectMenu()
  ) return;

  if (!(await requireAccess(interaction))) return;

  // ----------------------------------------------------------
  // CHANNEL TYPE
  // ----------------------------------------------------------

  if (
    interaction.customId === "select_channel_type" ||
    interaction.customId === "select_settings_channel_type"
  ) {
    const type = interaction.values[0];

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

  // ----------------------------------------------------------
  // CHANNEL
  // ----------------------------------------------------------

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
      !["logs", "welcome", "goodbye"]
        .includes(type)
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

  // ----------------------------------------------------------
  // AUTO ROLE
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // UNIVERSAL TEMPLATE
  // ----------------------------------------------------------

  if (
    interaction.customId ===
    "select_template"
  ) {
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

    await interaction.channel.send(
      template.content
    ).catch(() => {});

    return interaction.update({
      content:
        `✅ **${template.name}** posted.`,
      components: []
    });
  }

  // ----------------------------------------------------------
  // DELETE TEMPLATE
  // ----------------------------------------------------------

  if (
    interaction.customId ===
    "delete_template"
  ) {
    const db = loadDB();

    const key =
      interaction.values[0].toLowerCase();

    if (!db.templates[key]) {
      return interaction.update({
        content:
          "❌ Template no longer exists.",
        components: []
      });
    }

    const name =
      db.templates[key].name;

    delete db.templates[key];

    saveDB(db);

    return interaction.update({
      content:
        `🗑️ Deleted universal template **${name}**.`,
      components: []
    });
  }

  // ----------------------------------------------------------
  // SAVED EMBED
  // ----------------------------------------------------------

  if (
    interaction.customId ===
    "select_saved_embed"
  ) {
    const data =
      getGuildData(
        interaction.guild.id
      );

    const index =
      Number(interaction.values[0]);

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
        .setTitle(saved.title)
        .setDescription(saved.description)
        .setFooter({
          text: interaction.guild.name
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
});

// ============================================================
// MODALS
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  if (!(await requireAccess(interaction))) return;

  const data =
    getGuildData(
      interaction.guild.id
    );

  // ----------------------------------------------------------
  // BOT NAME
  // ----------------------------------------------------------

  if (
    interaction.customId ===
    "modal_botname"
  ) {
    const name =
      interaction.fields.getTextInputValue(
        "botname"
      );

    data.settings.botName = name;

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

  // ----------------------------------------------------------
  // USER LOOKUP
  // ----------------------------------------------------------

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
        await interaction.guild.members
          .fetch(id);
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
          r => r.id !== interaction.guild.id
        )
        .map(r => `<@&${r.id}>`)
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
            name: "Joined",
            value:
              member.joinedTimestamp
                ? `<t:${Math.floor(
                    member.joinedTimestamp / 1000
                  )}:F>`
                : "Unknown"
          },
          {
            name: "Roles",
            value: roles
          }
        );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // MESSAGE SEARCH
  // ----------------------------------------------------------

  if (
    interaction.customId ===
      "modal_lookup_messages" ||
    interaction.customId ===
      "modal_related"
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
        c =>
          c.type === ChannelType.GuildText &&
          c.viewable
      );

    for (
      const channel of channels.values()
    ) {
      if (results.length >= 20) break;

      try {
        const messages =
          await channel.messages.fetch({
            limit: 100
          });

        for (
          const message of messages.values()
        ) {
          if (!message.content) continue;

          const content =
            message.content.toLowerCase();

          let match;

          if (
            interaction.customId ===
            "modal_lookup_messages"
          ) {
            match =
              content.includes(query);
          } else {
            match =
              query
                .split(/\s+/)
                .some(word =>
                  content.includes(word)
                );
          }

          if (!match) continue;

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

  // ----------------------------------------------------------
  // EMBED
  // ----------------------------------------------------------

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
      created: Date.now()
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
          .setDescription(description)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // DASHBOARD TEMPLATE
  // ----------------------------------------------------------

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

    const db = loadDB();

    db.templates[
      name.toLowerCase()
    ] = {
      name,
      content,
      created: Date.now(),
      ownerId: interaction.user.id,
      ownerName: interaction.user.username,
      sourceGuild: {
        id: interaction.guild.id,
        name: interaction.guild.name
      }
    };

    saveDB(db);

    return interaction.reply({
      content:
        `🌎 ✅ Universal template **${name}** saved.\n\n` +
        `It can now be used from another server.`,
      ephemeral: true
    });
  }
});

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on("messageCreate", async message => {
  if (
    !message.guild ||
    message.author.bot
  ) return;

  const data =
    getGuildData(
      message.guild.id
    );

  data.messageLog[message.channel.id] ||= [];

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

  // ANTI SPAM

  if (data.moderation.antiSpam) {
    const recent =
      data.messageLog[
        message.channel.id
      ] || [];

    const count =
      recent.filter(
        m =>
          m.user === message.author.id &&
          Date.now() - m.timestamp < 5000
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
      /(https?:\/\/|www\.)/i
        .test(message.content);

    const allowed =
      message.member?.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      );

    if (hasLink && !allowed) {
      await message.delete()
        .catch(() => {});
      return;
    }
  }

  // ANTI MASS MENTION

  if (
    data.moderation.antiMassMention &&
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
});

// ============================================================
// MESSAGE DELETE
// ============================================================

client.on("messageDelete", async message => {
  if (!message.guild) return;

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
});

// ============================================================
// MEMBER JOIN
// ============================================================

client.on("guildMemberAdd", async member => {
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
      member.guild.members.me;

    if (
      role &&
      me &&
      role.position < me.roles.highest.position
    ) {
      await member.roles.add(
        role,
        "Zynko automatic role"
      ).catch(() => {});
    }
  }
});

// ============================================================
// MEMBER LEAVE
// ============================================================

client.on("guildMemberRemove", async member => {
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
});

// ============================================================
// REGISTER COMMANDS
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
        "Save this server as a universal template"
      )
      .addStringOption(option =>
        option
          .setName("name")
          .setDescription(
            "Name of the template"
          )
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("load")
      .setDescription(
        "Load a universal template into this server"
      )
      .addStringOption(option =>
        option
          .setName("name")
          .setDescription(
            "Template to load"
          )
          .setRequired(true)
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
          commands.map(c => c.toJSON())
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

client.once("ready", async () => {
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
      type: ActivityType.Watching
    }
  );

  await registerCommands();
});

// ============================================================
// ERRORS
// ============================================================

client.on("error", error => {
  console.error(
    "Discord error:",
    error
  );
});

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