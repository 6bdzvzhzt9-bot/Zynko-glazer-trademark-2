// ============================================================
// ZYNKO CONTROL BOT — UNIVERSAL SERVER CLONER
// /dashboard
// /save <name>
// /load <name>
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
// WEB SERVER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Zynko Control Bot is online.");
});

app.get("/health", (req, res) => {
  res.json({
    online: true,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ============================================================
// DATABASE
// ============================================================

function ensureDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({
        templates: {},
        guilds: {}
      }, null, 2)
    );
  }
}

ensureDB();

function loadDB() {
  try {
    const db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    db.templates ||= {};
    db.guilds ||= {};

    return db;
  } catch {
    return {
      templates: {},
      guilds: {}
    };
  }
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
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
// ACCESS
// ============================================================

function hasAccess(interaction) {
  if (!interaction.guild || !interaction.member) {
    return false;
  }

  const member = interaction.member;

  if (interaction.guild.ownerId === member.id) {
    return true;
  }

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
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

async function requireAccess(interaction) {
  if (hasAccess(interaction)) {
    return true;
  }

  await interaction.reply({
    content:
      "❌ You need Administrator, Manage Server, or Manage Channels + Manage Roles.",
    ephemeral: true
  }).catch(() => {});

  return false;
}

// ============================================================
// GUILD SETTINGS
// ============================================================

function getGuildSettings(guildId) {
  const db = loadDB();

  db.guilds[guildId] ||= {
    automation: {
      autoRoles: false,
      autoJoins: false,
      autoGoodbyes: false,
      autoChatLogs: false,
      autoDeleteLogs: false
    },

    autoRole: null,
    logsChannel: null,
    welcomeChannel: null,
    goodbyeChannel: null
  };

  saveDB(db);

  return db.guilds[guildId];
}

function setGuildSettings(guildId, data) {
  const db = loadDB();
  db.guilds[guildId] = data;
  saveDB(db);
}

// ============================================================
// DASHBOARD
// ============================================================

function dashboardEmbed(guild) {
  const settings = getGuildSettings(guild.id);

  return new EmbedBuilder()
    .setTitle("⚙️ Zynko Control Dashboard")
    .setDescription(
      "Universal server control center."
    )
    .addFields(
      {
        name: "📋 Universal Templates",
        value: "Use `/save` and `/load`",
        inline: true
      },
      {
        name: "⚡ Automation",
        value:
          settings.automation.autoRoles ||
          settings.automation.autoJoins ||
          settings.automation.autoGoodbyes ||
          settings.automation.autoChatLogs
            ? "🟢 Active"
            : "🔴 Disabled",
        inline: true
      },
      {
        name: "🧱 Server",
        value:
          `${guild.channels.cache.size} channels\n` +
          `${guild.roles.cache.size - 1} roles`,
        inline: true
      }
    )
    .setFooter({
      text: "Zynko Control"
    })
    .setTimestamp();
}

function dashboardButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("dash_templates")
        .setLabel("Templates")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("dash_automation")
        .setLabel("Automation")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("dash_refresh")
        .setLabel("Refresh")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// CAPTURE ROLE
// ============================================================

function captureRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.position
  };
}

// ============================================================
// CAPTURE CHANNEL
// ============================================================

function captureChannel(channel) {
  const overwrites = [];

  if (channel.permissionOverwrites) {
    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      overwrites.push({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString()
      });
    }
  }

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    parentId: channel.parentId,
    topic: channel.topic || null,
    nsfw: channel.nsfw || false,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    bitrate: channel.bitrate || null,
    userLimit: channel.userLimit || null,
    overwrites
  };
}

// ============================================================
// SAVE SERVER
// ============================================================

async function saveServer(guild, templateName, user) {
  await guild.channels.fetch();
  await guild.roles.fetch();

  const roles = guild.roles.cache
    .filter(role => role.id !== guild.id)
    .sort((a, b) => a.position - b.position)
    .map(captureRole);

  const channels = guild.channels.cache
    .sort((a, b) => a.position - b.position)
    .map(captureChannel);

  const settings = getGuildSettings(guild.id);

  const template = {
    name: templateName,
    created: Date.now(),

    sourceGuild: {
      id: guild.id,
      name: guild.name
    },

    roles,
    channels,

    settings: JSON.parse(
      JSON.stringify(settings)
    )
  };

  const db = loadDB();

  db.templates[
    templateName.toLowerCase()
  ] = template;

  saveDB(db);

  return template;
}

// ============================================================
// LOAD SERVER
// ============================================================

async function loadServer(guild, template) {

  console.log(
    `📥 Loading "${template.name}" into ${guild.name}`
  );

  // ----------------------------------------------------------
  // ROLE MAP
  // ----------------------------------------------------------

  const roleMap = new Map();

  // Everyone role always maps to @everyone
  roleMap.set(
    guild.id,
    guild.roles.everyone.id
  );

  // ----------------------------------------------------------
  // CREATE ROLES
  // ----------------------------------------------------------

  const sortedRoles = [...template.roles]
    .sort((a, b) => a.position - b.position);

  for (const oldRole of sortedRoles) {

    // Don't recreate @everyone
    if (oldRole.name === "@everyone") {
      continue;
    }

    try {

      const existing =
        guild.roles.cache.find(
          role =>
            role.name === oldRole.name
        );

      let role = existing;

      if (!role) {
        role = await guild.roles.create({
          name: oldRole.name,
          color:
            oldRole.color || undefined,
          hoist: oldRole.hoist,
          mentionable: oldRole.mentionable,
          permissions:
            BigInt(oldRole.permissions),
          reason:
            `Zynko template load: ${template.name}`
        });
      }

      roleMap.set(
        oldRole.id,
        role.id
      );

    } catch (error) {
      console.log(
        `⚠️ Couldn't create role ${oldRole.name}:`,
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // ROLE POSITIONS
  // ----------------------------------------------------------

  for (const oldRole of sortedRoles) {

    const newRoleId =
      roleMap.get(oldRole.id);

    if (!newRoleId) continue;

    const role =
      guild.roles.cache.get(newRoleId);

    if (!role) continue;

    try {
      await role.setPosition(
        oldRole.position,
        {
          reason:
            `Zynko template load: ${template.name}`
        }
      );
    } catch {}
  }

  // ----------------------------------------------------------
  // CHANNEL MAP
  // ----------------------------------------------------------

  const channelMap = new Map();

  // ----------------------------------------------------------
  // CREATE CATEGORIES FIRST
  // ----------------------------------------------------------

  const categories =
    template.channels
      .filter(
        channel =>
          channel.type === ChannelType.GuildCategory
      )
      .sort(
        (a, b) => a.position - b.position
      );

  for (const oldChannel of categories) {

    try {

      let channel =
        guild.channels.cache.find(
          c =>
            c.type === ChannelType.GuildCategory &&
            c.name === oldChannel.name
        );

      if (!channel) {
        channel =
          await guild.channels.create({
            name: oldChannel.name,
            type: ChannelType.GuildCategory,
            reason:
              `Zynko template load: ${template.name}`
          });
      }

      channelMap.set(
        oldChannel.id,
        channel.id
      );

    } catch (error) {
      console.log(
        `⚠️ Couldn't create category ${oldChannel.name}:`,
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // CREATE NORMAL CHANNELS
  // ----------------------------------------------------------

  const normalChannels =
    template.channels
      .filter(
        channel =>
          channel.type !== ChannelType.GuildCategory
      )
      .sort(
        (a, b) => a.position - b.position
      );

  for (const oldChannel of normalChannels) {

    try {

      let channel =
        guild.channels.cache.find(
          c =>
            c.name === oldChannel.name &&
            c.type === oldChannel.type
        );

      const parent =
        oldChannel.parentId
          ? channelMap.get(
              oldChannel.parentId
            )
          : undefined;

      if (!channel) {

        const options = {
          name: oldChannel.name,
          type: oldChannel.type,
          reason:
            `Zynko template load: ${template.name}`
        };

        if (parent) {
          options.parent = parent;
        }

        if (
          oldChannel.type ===
          ChannelType.GuildText
        ) {
          options.topic =
            oldChannel.topic || undefined;

          options.nsfw =
            oldChannel.nsfw;

          options.rateLimitPerUser =
            oldChannel.rateLimitPerUser || 0;
        }

        if (
          oldChannel.type ===
          ChannelType.GuildVoice
        ) {
          if (oldChannel.bitrate) {
            options.bitrate =
              oldChannel.bitrate;
          }

          if (oldChannel.userLimit) {
            options.userLimit =
              oldChannel.userLimit;
          }
        }

        channel =
          await guild.channels.create(
            options
          );

      } else if (parent) {

        try {
          await channel.setParent(
            parent,
            {
              lockPermissions: false
            }
          );
        } catch {}

      }

      channelMap.set(
        oldChannel.id,
        channel.id
      );

      // ------------------------------------------------------
      // PERMISSION OVERWRITES
      // ------------------------------------------------------

      if (
        oldChannel.overwrites &&
        oldChannel.overwrites.length
      ) {

        const mappedOverwrites = [];

        for (
          const overwrite
          of oldChannel.overwrites
        ) {

          let targetId =
            roleMap.get(
              overwrite.id
            );

          // If it's a user overwrite,
          // only reuse it if that user exists
          if (!targetId) {

            const member =
              guild.members.cache.get(
                overwrite.id
              );

            if (member) {
              targetId = member.id;
            }
          }

          if (!targetId) {
            continue;
          }

          mappedOverwrites.push({
            id: targetId,
            type: overwrite.type,
            allow: BigInt(
              overwrite.allow
            ),
            deny: BigInt(
              overwrite.deny
            )
          });
        }

        if (mappedOverwrites.length) {

          try {

            await channel.permissionOverwrites.set(
              mappedOverwrites,
              `Zynko template load: ${template.name}`
            );

          } catch (error) {

            console.log(
              `⚠️ Permission overwrite failed for ${channel.name}:`,
              error.message
            );

          }
        }
      }

    } catch (error) {

      console.log(
        `⚠️ Couldn't create channel ${oldChannel.name}:`,
        error.message
      );

    }
  }

  // ----------------------------------------------------------
  // CHANNEL POSITIONS
  // ----------------------------------------------------------

  for (const oldChannel of template.channels) {

    const newId =
      channelMap.get(
        oldChannel.id
      );

    if (!newId) continue;

    const channel =
      guild.channels.cache.get(
        newId
      );

    if (!channel) continue;

    try {

      await channel.setPosition(
        oldChannel.position,
        {
          reason:
            `Zynko template load: ${template.name}`
        }
      );

    } catch {}
  }

  // ----------------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------------

  if (template.settings) {

    const settings =
      JSON.parse(
        JSON.stringify(
          template.settings
        )
      );

    // Translate old IDs to new IDs
    if (settings.autoRole) {

      settings.autoRole =
        roleMap.get(
          settings.autoRole
        ) || null;

    }

    if (settings.logsChannel) {

      settings.logsChannel =
        channelMap.get(
          settings.logsChannel
        ) || null;

    }

    if (settings.welcomeChannel) {

      settings.welcomeChannel =
        channelMap.get(
          settings.welcomeChannel
        ) || null;

    }

    if (settings.goodbyeChannel) {

      settings.goodbyeChannel =
        channelMap.get(
          settings.goodbyeChannel
        ) || null;

    }

    setGuildSettings(
      guild.id,
      settings
    );
  }

  return {
    rolesCreated: roleMap.size - 1,
    channelsCreated: channelMap.size
  };
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
      !(await requireAccess(
        interaction
      ))
    ) {
      return;
    }

    await interaction.reply({
      embeds: [
        dashboardEmbed(
          interaction.guild
        )
      ],
      components:
        dashboardButtons()
    });
  }
);

// ============================================================
// SAVE COMMAND
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (
      interaction.commandName !==
      "save"
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

    const name =
      interaction.options.getString(
        "name"
      );

    await interaction.deferReply({
      ephemeral: true
    });

    try {

      const template =
        await saveServer(
          interaction.guild,
          name,
          interaction.user
        );

      return interaction.editReply(
        `✅ **${template.name}** saved.\n\n` +
        `📁 Channels: **${template.channels.length}**\n` +
        `🎭 Roles: **${template.roles.length}**\n\n` +
        `You can now use \`/load ${template.name}\` in another server.`
      );

    } catch (error) {

      console.error(
        "SAVE ERROR:",
        error
      );

      return interaction.editReply(
        "❌ Failed to save the server. Check the bot console."
      );
    }
  }
);

// ============================================================
// LOAD COMMAND
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (
      interaction.commandName !==
      "load"
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

      const available =
        Object.values(
          db.templates
        )
        .slice(0, 20)
        .map(
          t => `• ${t.name}`
        )
        .join("\n");

      return interaction.editReply(
        `❌ Template **${name}** doesn't exist.\n\n` +
        `Available templates:\n` +
        `${available || "None"}`
      );
    }

    try {

      const result =
        await loadServer(
          interaction.guild,
          template
        );

      return interaction.editReply(
        `✅ **${template.name}** loaded into **${interaction.guild.name}**.\n\n` +
        `🎭 Roles processed: **${result.rolesCreated}**\n` +
        `📁 Channels processed: **${result.channelsCreated}**\n\n` +
        `The server structure has actually been created.`
      );

    } catch (error) {

      console.error(
        "LOAD ERROR:",
        error
      );

      return interaction.editReply(
        "❌ Loading failed. Check the bot console for the exact error."
      );
    }
  }
);

// ============================================================
// DASHBOARD BUTTONS
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
      interaction.customId ===
      "dash_refresh"
    ) {

      return interaction.update({
        embeds: [
          dashboardEmbed(
            interaction.guild
          )
        ],
        components:
          dashboardButtons()
      });
    }

    if (
      interaction.customId ===
      "dash_templates"
    ) {

      const db = loadDB();

      const templates =
        Object.values(
          db.templates
        );

      const text =
        templates.length
          ? templates
              .slice(0, 20)
              .map(
                t =>
                  `📋 **${t.name}** — ` +
                  `${t.channels?.length || 0} channels, ` +
                  `${t.roles?.length || 0} roles`
              )
              .join("\n")
          : "❌ No templates saved.";

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "📋 Universal Templates"
            )
            .setDescription(text)
        ],
        ephemeral: true
      });
    }

    if (
      interaction.customId ===
      "dash_automation"
    ) {

      const settings =
        getGuildSettings(
          interaction.guild.id
        );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "⚡ Automation"
            )
            .addFields(
              {
                name: "👤 Auto Roles",
                value:
                  settings.automation.autoRoles
                    ? "🟢"
                    : "🔴",
                inline: true
              },
              {
                name: "👋 Auto Join",
                value:
                  settings.automation.autoJoins
                    ? "🟢"
                    : "🔴",
                inline: true
              },
              {
                name: "🚪 Auto Goodbye",
                value:
                  settings.automation.autoGoodbyes
                    ? "🟢"
                    : "🔴",
                inline: true
              },
              {
                name: "💬 Chat Logs",
                value:
                  settings.automation.autoChatLogs
                    ? "🟢"
                    : "🔴",
                inline: true
              }
            )
        ],
        ephemeral: true
      });
    }
  }
);

// ============================================================
// AUTO ROLE
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const settings =
      getGuildSettings(
        member.guild.id
      );

    if (
      !settings.automation.autoRoles ||
      !settings.autoRole
    ) {
      return;
    }

    const role =
      member.guild.roles.cache.get(
        settings.autoRole
      );

    const bot =
      member.guild.members.me;

    if (!role || !bot) {
      return;
    }

    if (
      role.position >=
      bot.roles.highest.position
    ) {
      console.log(
        `⚠️ Can't give ${role.name} because it's above the bot.`
      );
      return;
    }

    await member.roles.add(
      role,
      "Zynko automatic role"
    ).catch(() => {});
  }
);

// ============================================================
// WELCOME
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const settings =
      getGuildSettings(
        member.guild.id
      );

    if (
      !settings.automation.autoJoins ||
      !settings.welcomeChannel
    ) {
      return;
    }

    const channel =
      member.guild.channels.cache.get(
        settings.welcomeChannel
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
// GOODBYE
// ============================================================

client.on(
  "guildMemberRemove",
  async member => {

    const settings =
      getGuildSettings(
        member.guild.id
      );

    if (
      !settings.automation.autoGoodbyes ||
      !settings.goodbyeChannel
    ) {
      return;
    }

    const channel =
      member.guild.channels.cache.get(
        settings.goodbyeChannel
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
        "Save this server structure as a universal template"
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
        "Load a universal server template"
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

    console.log(
      "✅ Commands registered."
    );

  } catch (error) {

    console.error(
      "❌ Command registration error:",
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
      "Universal Server Templates",
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