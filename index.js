const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  EmbedBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");

// ======================================================
// KEEP ALIVE
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);

// ======================================================
// DATABASE
// ======================================================

const DB = "./database.json";

if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, JSON.stringify({
    guilds: {}
  }, null, 2));
}

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch {
    return { guilds: {} };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

function getGuildData(guildId) {
  const db = loadDB();

  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      ownerRole: null,
      managerRole: null,

      botName: null,

      automation: {
        transcripts: false,
        autoJoins: false,
        autoGoodbyes: false,
        autoDeleteLogs: false,
        autoChatLogs: false,
        autoRoles: false
      },

      channels: {
        transcripts: null,
        logs: null,
        welcome: null,
        goodbye: null,
        moderation: null
      },

      moderation: {
        warnings: true,
        automod: false,
        antiSpam: false,
        antiLinks: false,
        antiMassMention: false
      },

      templates: [],

      embeds: []
    };

    db.guilds[guildId] = db.guilds[guildId];
    saveDB(db);
  }

  return db.guilds[guildId];
}

function updateGuildData(guildId, data) {
  const db = loadDB();

  db.guilds[guildId] = data;

  saveDB(db);
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// DASHBOARD ACCESS
// ======================================================

function canUseDashboard(interaction) {
  if (!interaction.guild) return false;

  // Actual Discord server owner always has access
  if (interaction.guild.ownerId === interaction.user.id) {
    return true;
  }

  const data = getGuildData(interaction.guild.id);

  const member = interaction.member;

  if (!member || !member.roles) return false;

  if (
    data.ownerRole &&
    member.roles.cache.has(data.ownerRole)
  ) {
    return true;
  }

  if (
    data.managerRole &&
    member.roles.cache.has(data.managerRole)
  ) {
    return true;
  }

  return false;
}

// ======================================================
// EMBEDS
// ======================================================

function dashboardEmbed(guild, user) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Control Dashboard")
    .setDescription(
      `Welcome to the control panel for **${guild.name}**.\n\n` +
      `Use the buttons below to manage your server systems.`
    )
    .addFields(
      {
        name: "🤖 Bot",
        value: data.botName || client.user.username,
        inline: true
      },
      {
        name: "🔐 Access",
        value:
          `${data.ownerRole ? `<@&${data.ownerRole}>` : "Owner role not set"}\n` +
          `${data.managerRole ? `<@&${data.managerRole}>` : "Manager role not set"}`,
        inline: true
      },
      {
        name: "⚡ Automation",
        value:
          `Transcripts: ${data.automation.transcripts ? "🟢" : "🔴"}\n` +
          `Joins: ${data.automation.autoJoins ? "🟢" : "🔴"}\n` +
          `Goodbyes: ${data.automation.autoGoodbyes ? "🟢" : "🔴"}`,
        inline: true
      }
    )
    .setFooter({
      text: `Opened by ${user.username} • Times out in 5 minutes`
    })
    .setTimestamp();
}

function automationEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚡ Automation")
    .setDescription("Automatic server systems.")
    .addFields(
      {
        name: "📜 Transcripts",
        value: data.automation.transcripts ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "👋 Auto Joins",
        value: data.automation.autoJoins ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "🚪 Auto Goodbyes",
        value: data.automation.autoGoodbyes ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "🧹 Auto Delete Logs",
        value: data.automation.autoDeleteLogs ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "💬 Auto Chat Logs",
        value: data.automation.autoChatLogs ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "👤 Auto Roles",
        value: data.automation.autoRoles ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      }
    );
}

function moderationEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("🛡️ Moderation")
    .setDescription("Moderation and server protection.")
    .addFields(
      {
        name: "⚠️ System Warnings",
        value: data.moderation.warnings ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "🤖 AutoMod",
        value: data.moderation.automod ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "💬 Anti Spam",
        value: data.moderation.antiSpam ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "🔗 Anti Links",
        value: data.moderation.antiLinks ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      },
      {
        name: "📢 Anti Mass Mention",
        value: data.moderation.antiMassMention ? "🟢 Enabled" : "🔴 Disabled",
        inline: true
      }
    );
}

function settingsEmbed(guild) {
  const data = getGuildData(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .setDescription("Configure the bot for this server.")
    .addFields(
      {
        name: "🤖 Bot Name",
        value: data.botName || client.user.username,
        inline: false
      },
      {
        name: "👑 Owner Role",
        value: data.ownerRole ? `<@&${data.ownerRole}>` : "Not configured",
        inline: true
      },
      {
        name: "🛡️ Manager Role",
        value: data.managerRole ? `<@&${data.managerRole}>` : "Not configured",
        inline: true
      }
    );
}

function lookupEmbed() {
  return new EmbedBuilder()
    .setTitle("🔎 Admin Lookup")
    .setDescription(
      "Search information available to the bot.\n\n" +
      "This can include:\n" +
      "• User information\n" +
      "• Roles\n" +
      "• Channels\n" +
      "• Server information\n" +
      "• Recent messages available to the bot\n" +
      "• Related messages found in accessible channels\n\n" +
      "Deleted messages are only available if the bot logged them **before deletion**."
    );
}

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle("🥺 Help")
    .setDescription(
      "Need help with the bot?\n\n" +
      "**Contact**\n" +
      "Contact the bot owner/server support team.\n\n" +
      "**Dashboard**\n" +
      "Use `/dashboard` if you have dashboard access.\n\n" +
      "**Access**\n" +
      "The server owner, configured Owner role, or configured Manager role can use the dashboard."
    );
}

function embedBuilderEmbed() {
  return new EmbedBuilder()
    .setTitle("🧱 Embed Builder")
    .setDescription(
      "Create reusable server embeds from the dashboard.\n\n" +
      "Templates can be saved and reused for announcements, PvP events, rules, notices, and more."
    );
}

// ======================================================
// DASHBOARD BUTTONS
// ======================================================

function mainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("dash_automation")
        .setLabel("Automation")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("dash_moderation")
        .setLabel("Moderation")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("dash_lookup")
        .setLabel("Lookup")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_embeds")
        .setLabel("Embeds")
        .setEmoji("🧱")
        .setStyle(ButtonStyle.Success)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("dash_settings")
        .setLabel("Settings")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_templates")
        .setLabel("Templates")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("dash_help")
        .setLabel("Help")
        .setEmoji("🥺")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("dash_home")
      .setLabel("Back")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
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
        .setLabel("Auto Joins")
        .setEmoji("👋")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("auto_goodbyes")
        .setLabel("Auto Goodbyes")
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
        .setCustomId("auto_deletelogs")
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

function settingsButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("settings_botname")
        .setLabel("Change Bot Name")
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("settings_ownerrole")
        .setLabel("Owner Role")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("settings_managerrole")
        .setLabel("Manager Role")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

// ======================================================
// DASHBOARD
// ======================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "dashboard") return;

  if (!canUseDashboard(interaction)) {
    return interaction.reply({
      content: "❌ You don't have access to the dashboard.",
      ephemeral: true
    });
  }

  const message = await interaction.reply({
    embeds: [
      dashboardEmbed(interaction.guild, interaction.user)
    ],
    components: mainButtons(),
    fetchReply: true
  });

  // ====================================================
  // 5 MINUTE TIMEOUT
  // ====================================================

  setTimeout(async () => {

    try {

      await message.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("⏱️ Dashboard Timed Out")
            .setDescription(
              "This dashboard session expired after 5 minutes.\n\n" +
              "Run `/dashboard` again to open a new session."
            )
            .setTimestamp()
        ],
        components: []
      });

    } catch {}

  }, 5 * 60 * 1000);
});

// ======================================================
// DASHBOARD BUTTON HANDLER
// ======================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isButton()) return;

  const id = interaction.customId;

  if (!id.startsWith("dash_") &&
      !id.startsWith("auto_") &&
      !id.startsWith("mod_") &&
      !id.startsWith("settings_")) {
    return;
  }

  if (!canUseDashboard(interaction)) {
    return interaction.reply({
      content: "❌ You don't have dashboard access.",
      ephemeral: true
    });
  }

  // ====================================================
  // HOME
  // ====================================================

  if (id === "dash_home") {

    return interaction.update({
      embeds: [
        dashboardEmbed(interaction.guild, interaction.user)
      ],
      components: mainButtons()
    });

  }

  // ====================================================
  // AUTOMATION
  // ====================================================

  if (id === "dash_automation") {

    return interaction.update({
      embeds: [
        automationEmbed(interaction.guild)
      ],
      components: automationButtons()
    });

  }

  // ====================================================
  // MODERATION
  // ====================================================

  if (id === "dash_moderation") {

    return interaction.update({
      embeds: [
        moderationEmbed(interaction.guild)
      ],
      components: moderationButtons()
    });

  }

  // ====================================================
  // LOOKUP
  // ====================================================

  if (id === "dash_lookup") {

    return interaction.update({
      embeds: [
        lookupEmbed()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("lookup_user")
            .setLabel("User Search")
            .setEmoji("👤")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("lookup_messages")
            .setLabel("Messages")
            .setEmoji("💬")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("lookup_related")
            .setLabel("Related")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Secondary)
        ),
        backButton()
      ]
    });

  }

  // ====================================================
  // EMBEDS
  // ====================================================

  if (id === "dash_embeds") {

    return interaction.update({
      embeds: [
        embedBuilderEmbed()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("embed_create")
            .setLabel("Create Embed")
            .setEmoji("➕")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("embed_templates")
            .setLabel("Templates")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
        ),
        backButton()
      ]
    });

  }

  // ====================================================
  // TEMPLATES
  // ====================================================

  if (id === "dash_templates") {

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 Templates")
          .setDescription(
            "Reusable messages and embeds.\n\n" +
            "Use templates for things like:\n" +
            "• PvP announcements\n" +
            "• Rules\n" +
            "• Tickets\n" +
            "• Events\n" +
            "• Server notices"
          )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("template_create")
            .setLabel("Create Template")
            .setEmoji("➕")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("template_view")
            .setLabel("View Templates")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Primary)
        ),
        backButton()
      ]
    });

  }

  // ====================================================
  // SETTINGS
  // ====================================================

  if (id === "dash_settings") {

    return interaction.update({
      embeds: [
        settingsEmbed(interaction.guild)
      ],
      components: settingsButtons()
    });

  }

  // ====================================================
  // HELP
  // ====================================================

  if (id === "dash_help") {

    return interaction.update({
      embeds: [
        helpEmbed()
      ],
      components: [
        backButton()
      ]
    });

  }

  // ====================================================
  // AUTOMATION TOGGLES
  // ====================================================

  const data = getGuildData(interaction.guild.id);

  const automationMap = {
    auto_transcripts: "transcripts",
    auto_joins: "autoJoins",
    auto_goodbyes: "autoGoodbyes",
    auto_chatlogs: "autoChatLogs",
    auto_deletelogs: "autoDeleteLogs",
    auto_roles: "autoRoles"
  };

  if (automationMap[id]) {

    const key = automationMap[id];

    data.automation[key] =
      !data.automation[key];

    updateGuildData(
      interaction.guild.id,
      data
    );

    return interaction.update({
      embeds: [
        automationEmbed(interaction.guild)
      ],
      components: automationButtons()
    });

  }

  // ====================================================
  // MODERATION TOGGLES
  // ====================================================

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

    updateGuildData(
      interaction.guild.id,
      data
    );

    return interaction.update({
      embeds: [
        moderationEmbed(interaction.guild)
      ],
      components: moderationButtons()
    });

  }

  // ====================================================
  // MODERATION STATUS
  // ====================================================

  if (id === "mod_status") {

    return interaction.reply({
      embeds: [
        moderationEmbed(interaction.guild)
      ],
      ephemeral: true
    });

  }

  // ====================================================
  // SETTINGS ROLE PICKERS
  // ====================================================

  if (
    id === "settings_ownerrole" ||
    id === "settings_managerrole"
  ) {

    const roleSelect =
      new RoleSelectMenuBuilder()
        .setCustomId(
          id === "settings_ownerrole"
            ? "select_ownerrole"
            : "select_managerrole"
        )
        .setPlaceholder(
          id === "settings_ownerrole"
            ? "Select the Owner role"
            : "Select the Manager role"
        )
        .setMinValues(1)
        .setMaxValues(1);

    return interaction.reply({
      content: "Choose the role:",
      components: [
        new ActionRowBuilder()
          .addComponents(roleSelect)
      ],
      ephemeral: true
    });

  }

  // ====================================================
  // BOT NAME
  // ====================================================

  if (id === "settings_botname") {

    return interaction.reply({
      content:
        "To change the bot's server nickname, use the bot's nickname controls from the server settings.",
      ephemeral: true
    });

  }

});

// ======================================================
// ROLE SELECT HANDLER
// ======================================================

client.on("interactionCreate", async interaction => {

  if (!interaction.isRoleSelectMenu()) return;

  if (
    interaction.customId !== "select_ownerrole" &&
    interaction.customId !== "select_managerrole"
  ) {
    return;
  }

  if (!canUseDashboard(interaction)) {
    return interaction.reply({
      content: "❌ You don't have dashboard access.",
      ephemeral: true
    });
  }

  const roleId = interaction.values[0];

  const data =
    getGuildData(interaction.guild.id);

  if (interaction.customId === "select_ownerrole") {
    data.ownerRole = roleId;
  }

  if (interaction.customId === "select_managerrole") {
    data.managerRole = roleId;
  }

  updateGuildData(
    interaction.guild.id,
    data
  );

  await interaction.update({
    content: `✅ ${interaction.customId === "select_ownerrole"
      ? "Owner"
      : "Manager"} role saved.`,
    components: []
  });

});

// ======================================================
// MESSAGE LOGGER
// ======================================================

client.on("messageCreate", async message => {

  if (!message.guild) return;

  if (message.author.bot) return;

  const data =
    getGuildData(message.guild.id);

  if (!data.automation.autoChatLogs) return;

  if (!data.channels.logs) return;

  const channel =
    message.guild.channels.cache.get(
      data.channels.logs
    );

  if (!channel) return;

  const embed =
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
          value: message.content?.slice(0, 1000) || "[No text]"
        }
      )
      .setTimestamp();

  await channel.send({
    embeds: [embed]
  }).catch(() => {});

});

// ======================================================
// MEMBER JOIN
// ======================================================

client.on("guildMemberAdd", async member => {

  const data =
    getGuildData(member.guild.id);

  if (!data.automation.autoJoins) return;

  if (!data.channels.welcome) return;

  const channel =
    member.guild.channels.cache.get(
      data.channels.welcome
    );

  if (!channel) return;

  await channel.send(
    `👋 Welcome ${member} to **${member.guild.name}**!`
  ).catch(() => {});

  if (data.automation.autoRoles) {

    // Auto-role can later be configured
    // through the dashboard.
  }

});

// ======================================================
// MEMBER LEAVE
// ======================================================

client.on("guildMemberRemove", async member => {

  const data =
    getGuildData(member.guild.id);

  if (!data.automation.autoGoodbyes) return;

  if (!data.channels.goodbye) return;

  const channel =
    member.guild.channels.cache.get(
      data.channels.goodbye
    );

  if (!channel) return;

  await channel.send(
    `🚪 **${member.user.username}** has left the server.`
  ).catch(() => {});

});

// ======================================================
// MESSAGE DELETE LOGGER
// ======================================================

client.on("messageDelete", async message => {

  if (!message.guild) return;

  const data =
    getGuildData(message.guild.id);

  if (!data.automation.autoDeleteLogs) return;

  if (!data.channels.logs) return;

  const channel =
    message.guild.channels.cache.get(
      data.channels.logs
    );

  if (!channel) return;

  const embed =
    new EmbedBuilder()
      .setTitle("🗑️ Deleted Message")
      .addFields(
        {
          name: "Author",
          value: message.author
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
      .setTimestamp();

  await channel.send({
    embeds: [embed]
  }).catch(() => {});

});

// ======================================================
// READY
// ======================================================

client.once("ready", () => {

  console.log(
    `✅ ${client.user.tag} is online`
  );

  client.user.setActivity(
    "Server Dashboard",
    {
      type: ActivityType.Watching
    }
  );

});

// ======================================================
// ERRORS
// ======================================================

client.on("error", console.error);

process.on(
  "unhandledRejection",
  console.error
);

// ======================================================
// LOGIN
// ======================================================

if (!process.env.TOKEN) {
  console.error(
    "❌ TOKEN environment variable is missing."
  );

  process.exit(1);
}

client.login(process.env.TOKEN);