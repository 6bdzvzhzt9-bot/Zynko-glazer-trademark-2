const { nitradoCommands, handleNitradoCommand } = require('./nitrado-commands');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, ActivityType, AttachmentBuilder,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags, SeparatorSpacingSize
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DB_FILE = path.resolve(process.env.DB_FILE || path.join(DATA_DIR, 'database.json'));
const CREDITS_FILE = path.join(DATA_DIR, 'credits.json');
const MYSTERY_BOXES_FILE = path.join(DATA_DIR, 'mystery-boxes.json');

// ---- Developer settings (shown in the "unauthorized" notice) ----
const DEV_NAME = 'Zynko Development';
const DEV_EMAIL = 'Zynkodevsop@gmail.com';
// Your Discord user ID(s), comma separated. If empty, the owner of the home server is the developer.
const OWNER_IDS = String(process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
// The ONLY servers where /authorize, /deauthorize and /authorized exist and work.
const CONTROL_GUILD_IDS = String(process.env.CONTROL_GUILD_IDS || process.env.CONTROL_GUILD_ID || '1564446720606081144,1538986273233047562').split(',').map(s => s.trim()).filter(Boolean);
const isControl = id => CONTROL_GUILD_IDS.includes(id);

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing required env: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const app = express();
app.get('/', (_req, res) => res.status(200).send('Bot is online'));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, bot: 'Discord bot', uptime: process.uptime() }));
app.listen(PORT, () => console.log(`Keep-alive on port ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction]
});

// keep the bot alive: log errors instead of crashing
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));
client.on('error', err => console.error('Client error:', err));
client.on('warn', msg => console.warn('Client warning:', msg));

const TICKET_TYPES = [
  { key: 'support', name: 'SUPPORT', emoji: 'ℹ️' },
  { key: 'mesh-support', name: 'MESH SUPPORT', emoji: '🛸' },
  { key: 'meshed-foundation', name: 'MESHED FOUNDATION', emoji: '🧱' },
  { key: 'news', name: 'NEWS', emoji: '📰' }
];

const DEFAULT_REWARDS = {
  'The Island': {
    'Ice': { base: 10, raid: 15 }, 'Easy UW': { base: 10, raid: 15 }, 'Hard UW': { base: 8, raid: 12 },
    'Carno': { base: 5, raid: 10 }, 'Pack': { base: 3, raid: 8 }, 'Hunter': { base: 3, raid: 8 },
    'Pearl': { base: 3, raid: 3 }, 'Swamp': { base: 2, raid: 3 }, 'Lava': { base: 2, raid: 5 }
  },
  'The Center': {
    'North Ice': { base: 20, raid: 25 }, 'Small Side': { base: 10, raid: 10 }, 'Pearl': { base: 10, raid: 15 },
    'Underworld Crouch': { base: 15, raid: 15 }, 'Redwoods Waterfall': { base: 10, raid: 15 },
    'Underworld Lava': { base: 15, raid: 15 }, 'Double Bear': { base: 3, raid: 7 }, 'Spider': { base: 5, raid: 5 }
  },
  'Genesis 2': {
    'Fishbowl': { base: 5, raid: 12 }, 'Goblin Plat 90/90': { base: 3, raid: 8 }, 'Air Tunnel': { base: 4, raid: 4 },
    'Corner Vent': { base: 4, raid: 5 }, 'Tentacle Cave': { base: 5, raid: 7 }, 'Green Cave': { base: 4, raid: 5 },
    'Small Tek': { base: 3, raid: 4 }, 'Side Tunnel': { base: 4, raid: 5 }, 'Metal Warehouse': { base: 5, raid: 8 },
    'Big Poison Cave': { base: 4, raid: 5 }, 'Small Poison Cave': { base: 4, raid: 4 },
    'Tower (special)': { base: 3, raid: 2 }, '100+ Turretlings (special)': { base: 3, raid: 2 },
    'Big Outside TPS 200+ Turrets (special)': { base: 3, raid: 3 }, 'Smaller Outside TPS 100+ Turrets (special)': { base: 2, raid: 2 },
    'Winning KOTH (special)': { base: 0, raid: 0, fixed: 40 }, 'Unlisted Cave Mod (special)': { base: 5, raid: 5 }
  },
  'Fjordur': {
    'Lab Cave': { base: 10, raid: 15 }, 'Swamp Cave': { base: 8, raid: 12 }, 'Bee Cave': { base: 10, raid: 15 },
    'Cave 10/60': { base: 5, raid: 5 }, 'Cave 60/80': { base: 5, raid: 5 }, 'Cave 88/16': { base: 3, raid: 5 },
    'Cave 10/49': { base: 3, raid: 5 }, 'Cave 20/10': { base: 2, raid: 4 }, 'Cave 30/40': { base: 2, raid: 4 },
    'Big Ice Cave 08/23': { base: 5, raid: 8 }, 'Big Lava 91/78': { base: 3, raid: 5 }, 'Small Lava 21/57': { base: 2, raid: 5 },
    'Darth Cave 29/39': { base: 5, raid: 8 }, 'Big UW Cave 76/65': { base: 5, raid: 8 }, 'UW Moonpool 90/40': { base: 5, raid: 8 },
    'Desmo Cave': { base: 6, raid: 10 }, 'Golden Hall': { base: 3, raid: 4 }, 'Snow Church': { base: 5, raid: 5 }, 'Rad Cave': { base: 5, raid: 8 }
  },
  'Valguero': {
    'Triple Waterfall Cave': { base: 15, raid: 15 }, 'Oil Cave': { base: 8, raid: 15 }, 'Spider Cave': { base: 5, raid: 8 },
    'Dark Cave': { base: 5, raid: 15 }, 'Alpha Tree': { base: 8, raid: 10 }, 'Castle Cave 41/88': { base: 5, raid: 7 },
    'Lava Cave': { base: 3, raid: 5 }, 'Blossom Cave': { base: 3, raid: 5 }, 'Green Obb Cave': { base: 3, raid: 5 },
    'Button Cave': { base: 8, raid: 15 }, 'Skylight': { base: 8, raid: 10 }, 'Jungle Cave': { base: 5, raid: 5 },
    'Little Jungle Cave': { base: 4, raid: 5 }, 'Little Ice Cave': { base: 5, raid: 5 }, 'Wyvern Trench': { base: 6, raid: 8 }
  },
  'Crystal Isles': {
    'Dragon Cave': { base: 5, raid: 8 }, 'Basi Block 16/74': { base: 3, raid: 8 }, 'Baboon Tree 40/73': { base: 8, raid: 5 },
    'Bichopalin': { base: 10, raid: 15 }, 'Spider Cave': { base: 5, raid: 5 }
  },
  'Scorched Earth': {
    'Central Cave': { base: 10, raid: 10 }, 'Church': { base: 10, raid: 10 }, '10/10 Cave': { base: 10, raid: 10 }, 'Blue Ob Cave': { base: 3, raid: 7 }
  },
  'Aberration': {
    'Shadow Cave': { base: 10, raid: 15 }, 'Rad Surface': { base: 15, raid: 15 }, 'Glowtail': { base: 5, raid: 5 },
    'Fertile Surface': { base: 8, raid: 15 }, 'Alpha Tree': { base: 5, raid: 8 }, 'Rad Ceiling': { base: 5, raid: 8 }
  },
  'Extinction': {
    'Sunken Tree': { base: 12, raid: 20 }, 'Skylight': { base: 12, raid: 15 }, 'Wasteland': { base: 5, raid: 8 },
    'Red Light': { base: 5, raid: 12 }, 'South Gate': { base: 3, raid: 5 }, 'King Titan Plat': { base: 5, raid: 10 },
    'Forest Titan': { base: 5, raid: 8 }, 'Pipe Cave': { base: 8, raid: 5 }, 'Ramp': { base: 6, raid: 7 },
    'Garage Cave': { base: 7, raid: 7 }, 'Sulphure Cave': { base: 3, raid: 5 }
  },
  'Genesis 1': {
    'Big Lunar': { base: 15, raid: 20 }, 'Other Lunars': { base: 8, raid: 15 }, 'H Pillar': { base: 5, raid: 10 },
    'TP Astroid': { base: 3, raid: 10 }, 'UW Cubes': { base: 2, raid: 5 }, 'Reaper Lunar': { base: 15, raid: 15 },
    'Moonpool Cave': { base: 7, raid: 7 }, 'Snow V1': { base: 4, raid: 4 }, 'Snow V2': { base: 4, raid: 4 },
    'Snow V3': { base: 4, raid: 4 }, 'UW Cube': { base: 6, raid: 8 }
  }
};

const MAPS = Object.keys(DEFAULT_REWARDS);

function defaultPayCategories() {
  return [
    { id: 'normal', name: 'Normal Ticket', rate: 2, typeKeys: [], isDefault: true },
    { id: 'news', name: 'News Ticket', rate: 5, typeKeys: ['news'], isDefault: false },
    { id: 'mesh', name: 'Mesh Support', rate: 2, typeKeys: ['mesh-support'], isDefault: false }
  ];
}

const DEFAULT_WELCOME = '**{bot} Support**\nThank you for opening a ticket! Please explain your issue and provide any relevant evidence.\n\nOur staff will be with you shortly. Please be patient and avoid pinging staff repeatedly.\n\nThank you for your patience!';

const OLD_PANEL_TITLE = 'PrimeArk Support';
const OLD_PANEL_DESC = 'Choose a category below to open a support ticket.';
const DEFAULT_PANEL = {
  title: '#{bot} Tickets',
  titleEmoji: '',
  description: '',
  color: '#ff0000',
  footer: '',
  placeholder: 'Choose a ticket type',
  thumbnail: 'avatar',
  bannerUrl: '',
  bannerFile: ''
};

const freshDB = () => ({
  config: {
    ticketCategoryId: null,
    ticketStaffRoleIds: [],
    ticketPanelChannelId: null,
    ticketPanelMessageId: null,
    ticketTranscriptChannelId: null,
    staffStatsForumId: null,
    leaderboardChannelId: null,
    leaderboardMessageId: null,
    backupChannelId: null,
    auditChannelId: null,
    donoLogChannelId: null,
    pointsLogChannelId: null,
    ownerRoleIds: [],
    adminRoleIds: [],
    higherPointRoleIds: [],
    authorizedRenameRoleIds: [],
    ticketPanel: { ...DEFAULT_PANEL },
    ticketWelcomeMessage: DEFAULT_WELCOME,
    ticketTypes: TICKET_TYPES.map(t => ({ ...t })),
    rewardValues: JSON.parse(JSON.stringify(DEFAULT_REWARDS)),
    ssnMultiplier: 2,
    onlineRaidRate: 0.5,
    offlineRaidRate: 0.25,
    claimEnabled: true,
    closeEnabled: true,
    transcriptSaving: true,
    lb: {},
    botStatus: null,
    wipe: { at: null, tz: 'UTC', message: 'Get your bases ready!' },
    perms: {},
    dash: { bannerUrl: '', bannerFile: '' },
    permsSeeded: false,
    pollEmojis: ['\u{1F1E6}', '\u{1F1E7}', '\u{1F1E8}', '\u{1F1E9}', '\u{1F1EA}'],
    hype: {
      title: 'HYPE SQUAD',
      emoji: '🔥', highlight: 'FREE CREDIT TO WIN', color: '#e67e22', bannerUrl: '', giveawayChannelId: null,
      name: '', strictName: '', roleId: null, limit: 100,
      verifyChannelId: null, infoChannelId: null, infoMessageId: null,
      perks: '\u2728 Access to **MORE EXCLUSIVE** giveaways!',
      members: []
    },
    donoPrizes: [
      { name: 'Supply Cache', value: 'Supply Cache', chance: 50 },
      { name: 'Rare Loot Cache', value: 'Rare Loot Cache', chance: 30 },
      { name: 'Tek Reward', value: 'Tek Reward', chance: 15 },
      { name: 'Legendary Prize', value: 'Legendary Prize', chance: 5 }
    ],
    donoDropChances: {
      'Supply Cache': 50,
      'Rare Loot Cache': 30,
      'Tek Reward': 15,
      'Legendary Prize': 5
    }
  },
  tickets: {},
  staff: {},
  tribes: {},
  pointHistory: [],
  auditLog: [],
  backups: [],
  polls: {},
  giveaways: {},
  dono: {
    balances: {},
    boxes: {},
    openings: [],
    transactions: []
  }
});

// ---------- STORAGE: one file, a separate data set for every server ----------
const OLD_WELCOME = '**PrimeArk Support**\nThank you for opening a ticket! Please explain your issue and provide any relevant evidence.\n\nOur staff will be with you shortly. Please be patient and avoid pinging staff repeatedly.\n\nThank you for your patience!';

const als = new AsyncLocalStorage();
let root = { version: 2, guilds: {}, auth: {}, botBio: '', botStatus: null };

function ctx() {
  const s = als.getStore();
  if (!s) throw new Error('No server context');
  return s;
}
// `db` always points at the data of the server the current event belongs to
const db = new Proxy({}, {
  get: (_t, p) => ctx().data[p],
  set: (_t, p, v) => { ctx().data[p] = v; return true; }
});
const curGuild = () => als.getStore()?.guild || null;
const brandName = () => botDisplayName(curGuild());

function isAuthorized(gid) {
  if (gid === GUILD_ID || isControl(gid)) return true;
  const a = root.auth[gid];
  if (!a) return false;
  return !a.expiresAt || Date.parse(a.expiresAt) > Date.now();
}
function guildData(gid, create = false) {
  if (root.guilds[gid]) return root.guilds[gid];
  const fresh = normalize(freshDB());
  if (create) root.guilds[gid] = fresh;
  return fresh;
}
function runIn(guild, fn) {
  return als.run({ guild, gid: guild.id, data: guildData(guild.id, isAuthorized(guild.id)) }, fn);
}

const pendingCalcs = new Map();
const embedDrafts = new Map();
const wipeCooldown = new Map();

function saveDB() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(root, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('Database save failed:', e);
  }
}

// Brings one server's data up to date (fills new fields, migrates old defaults)
function normalize(parsed) {
  const defaults = freshDB();
  const d = {
    ...defaults,
    ...parsed,
    config: { ...defaults.config, ...(parsed.config || {}) },
    dono: { ...defaults.dono, ...(parsed.dono || {}) }
  };
  const c = d.config;
  c.ticketTypes ||= TICKET_TYPES.map(t => ({ ...t }));
  for (const t of c.ticketTypes) {
    if (t.emoji === undefined) t.emoji = TICKET_TYPES.find(x => x.key === t.key)?.emoji || '';
  }
  c.ticketPanel = { ...DEFAULT_PANEL, ...(c.ticketPanel || {}) };
  if (c.ticketPanel.title === OLD_PANEL_TITLE) c.ticketPanel.title = DEFAULT_PANEL.title;
  if (c.ticketPanel.description === OLD_PANEL_DESC) c.ticketPanel.description = '';
  if (typeof c.ticketPanel.bannerFile !== 'string') c.ticketPanel.bannerFile = '';
  c.wipe = { ...defaults.config.wipe, ...(c.wipe || {}) };
  c.hype = { ...defaults.config.hype, ...(c.hype || {}) };
  c.hype.members ||= [];
  if (c.hype.title === '🔥 | HYPE SQUAD') c.hype.title = 'HYPE SQUAD';
  c.perms ||= {};
  c.dash = { bannerUrl: '', bannerFile: '', ...(c.dash || {}) };
  c.pollEmojis = Array.isArray(c.pollEmojis) && c.pollEmojis.length >= 5 ? c.pollEmojis : defaults.config.pollEmojis;
  c.lb ||= {};
  c.autorole = { enabled: false, roleId: null, ...(c.autorole || {}) };
  c.ticketPrice = (c.ticketPrice !== null && c.ticketPrice !== undefined && c.ticketPrice !== '' && Number.isFinite(Number(c.ticketPrice))) ? Number(c.ticketPrice) : 5;
  c.ticketCategoryMap = (c.ticketCategoryMap && typeof c.ticketCategoryMap === 'object') ? c.ticketCategoryMap : {};
  if (typeof c.ticketAutoRoute !== 'boolean') c.ticketAutoRoute = true;
  c.staffPay = { categories: [], ...(c.staffPay || {}) };
  if (!Array.isArray(c.staffPay.categories) || !c.staffPay.categories.length) c.staffPay.categories = defaultPayCategories();
  for (const pc of c.staffPay.categories) {
    pc.typeKeys = Array.isArray(pc.typeKeys) ? pc.typeKeys : [];
    pc.rate = Number(pc.rate) || 0;
  }
  if (!c.staffPay.categories.some(x => x.isDefault)) c.staffPay.categories[0].isDefault = true;
  if (!c.rewardValues || !Object.keys(c.rewardValues).length) {
    c.rewardValues = JSON.parse(JSON.stringify(DEFAULT_REWARDS));
  } else {
    for (const [mapName, caves] of Object.entries(DEFAULT_REWARDS)) {
      c.rewardValues[mapName] ||= {};
      for (const [caveName, value] of Object.entries(caves)) {
        const old = c.rewardValues[mapName][caveName];
        if (!old || (old.base === undefined && old.raid === undefined)) {
          c.rewardValues[mapName][caveName] = { ...value };
        }
      }
    }
  }
  if (!Array.isArray(c.donoPrizes) || c.donoPrizes.length === 0) c.donoPrizes = defaults.config.donoPrizes;
  if (!c.donoDropChances || Object.keys(c.donoDropChances).length === 0) c.donoDropChances = defaults.config.donoDropChances;
  if (!c.ticketWelcomeMessage || c.ticketWelcomeMessage === OLD_WELCOME) c.ticketWelcomeMessage = DEFAULT_WELCOME;
  d.tickets ||= {};
  d.staff ||= {};
  // pay system: every staff record gets a current pay period + payment history (old claims are carried over)
  for (const s of Object.values(d.staff)) {
    if (!s.period) {
      const byType = {};
      for (const [name, n] of Object.entries(s.byType || {})) {
        const key = (c.ticketTypes.find(t => t.name === name) || {}).key || name;
        byType[key] = (byType[key] || 0) + Number(n || 0);
      }
      s.period = { byType, since: stamp() };
    }
    s.payments ||= [];
  }
  d.tribes ||= {};
  d.pointHistory ||= [];
  d.auditLog ||= [];
  d.backups ||= [];
  d.polls ||= {};
  d.giveaways ||= {};
  d.dono.balances ||= {};
  d.dono.boxes ||= {};
  d.dono.openings ||= [];
  d.dono.transactions ||= [];
  return d;
}

function loadRoot() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (parsed.version === 2) {
        root = { version: 2, guilds: {}, auth: parsed.auth || {}, botBio: parsed.botBio || '', botStatus: parsed.botStatus || null };
        for (const [gid, data] of Object.entries(parsed.guilds || {})) root.guilds[gid] = normalize(data);
      } else {
        // old single-server file: it becomes the data of your home server
        try { fs.copyFileSync(DB_FILE, DB_FILE + '.v1.bak'); } catch {}
        const home = normalize(parsed);
        try {
          if (fs.existsSync(CREDITS_FILE)) home.dono.balances = JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
        } catch {}
        try {
          if (fs.existsSync(MYSTERY_BOXES_FILE)) {
            const m = JSON.parse(fs.readFileSync(MYSTERY_BOXES_FILE, 'utf8'));
            home.dono.boxes = m.boxes || {};
            home.dono.openings = m.openings || [];
            home.dono.transactions = m.transactions || [];
          }
        } catch {}
        root.guilds[GUILD_ID] = home;
        root.botBio = parsed.config?.botBio || '';
        root.botStatus = parsed.config?.botStatus || null;
      }
    }
  } catch (e) {
    console.error('Could not load database:', e);
  }
  root.guilds[GUILD_ID] ||= normalize(freshDB());
  saveDB();
}

const stamp = () => new Date().toISOString();
const clip = (s, n = 1000) => {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
};
const safeName = (s, fallback = 'ticket') =>
  String(s || fallback).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || fallback;

const row = (...items) => new ActionRowBuilder().addComponents(...items);
function btn(id, label, style = ButtonStyle.Secondary, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
}
function embed(title, description, color = 0x5865f2) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: `${brandName()} • Settings save automatically` });
}

// ---------- PERMISSIONS (role based, stored by role ID so roles can be renamed) ----------
const ABILITIES = {
  leaderboard: 'Edit the leaderboard and tribe points',
  tickets: 'Claim, close, add and remove users in tickets',
  ticketdash: 'Open the ticket dashboard',
  news: 'See and handle NEWS tickets',
  polls: 'Create and end polls',
  giveaways: 'Create and manage giveaways',
  hype: 'Set up and manage the hype squad',
  embeds: 'Use the embed creator',
  rename: 'Rename ticket channels',
  dono: 'Credits, mystery boxes and the dono dashboard',
  botprofile: 'Change the bot nickname (and profile in the home server)',
  config: 'Use /config',
  panel: 'Use /panel',
  wipe: 'Use /wipe',
  season: 'Use /season end'
};

// Only the owner ("." role, server owner or developer) can use these, whatever abilities roles were given.
const OWNER_ONLY = new Set(['dono', 'polls', 'giveaways', 'hype', 'botprofile', 'staffpay']);

const hasAnyRole = (member, ids = []) => Boolean(member?.roles?.cache && (ids || []).some(id => member.roles.cache.has(id)));

// Owner = the server owner, or anyone with an owner role (set in /config role). Owners can do everything.
function isOwner(member) {
  if (!member?.roles?.cache) return false;
  if (member.guild && member.id === member.guild.ownerId) return true;
  if (OWNER_IDS.includes(member.id)) return true;   // the developer (OWNER_IDS env) can never be locked out
  if (member.roles.cache.some(r => r.name === '.')) return true;   // the "." role is the full owner role
  return hasAnyRole(member, db.config.ownerRoleIds);
}
function can(member, ability) {
  if (!member?.roles?.cache) return false;
  if (isOwner(member)) return true;
  if (OWNER_ONLY.has(ability)) return false;
  return hasAnyRole(member, db.config.perms?.[ability]);
}

const isDonoOwner = member => can(member, 'dono');
const canEditLeaderboard = member => can(member, 'leaderboard');
const isTicketStaff = member => hasAnyRole(member, db.config.ticketStaffRoleIds) || can(member, 'ticketdash');
const canManageTickets = member => can(member, 'tickets') || can(member, 'news');
// NEWS tickets are handled by the NEWS ability, normal tickets by the tickets ability (owners can do both)
const canHandleTicket = (member, ticket) => ticket?.typeKey === 'news' ? (can(member, 'news') || can(member, 'tickets')) : can(member, 'tickets');
const canRename = member => hasAnyRole(member, db.config.authorizedRenameRoleIds) || can(member, 'rename');
const canUseEmbedCreator = member => isTicketStaff(member) || can(member, 'embeds');   // the leaderboard role does NOT get embeds

// First time a server is used: connect your existing role names (. / .👑 / 📰) to their role IDs
function seedPerms(guild) {
  const c = db.config;
  c.perms ||= {};
  c.ownerRoleIds ||= [];
  const find = n => guild.roles.cache.find(r => r.name === n)?.id;
  const dot = find('.');
  const crown = find('👑') || find('.👑');
  const news = find('📰');
  let changed = false;
  const add = (ability, id) => {
    if (!id) return;
    c.perms[ability] ||= [];
    if (!c.perms[ability].includes(id)) { c.perms[ability].push(id); changed = true; }
  };
  // the "." role is ALWAYS an owner role (checked every time, so a role created later still works)
  if (dot && !c.ownerRoleIds.includes(dot)) { c.ownerRoleIds.push(dot); changed = true; }
  // first run: the crown role handles normal tickets, the news role gets the leaderboard and NEWS tickets
  if (!c.permsSeeded && (crown || news)) {
    add('tickets', crown);
    add('news', news);
    add('leaderboard', news);
    c.permsSeeded = true;
    changed = true;
  }
  // older versions also gave the crown role polls/giveaways/hype: those are owner-only now
  if (!c.permsV2) {
    if (crown) {
      for (const a of ['polls', 'giveaways', 'hype']) {
        if (c.perms[a]?.includes(crown)) { c.perms[a] = c.perms[a].filter(id => id !== crown); changed = true; }
      }
    }
    c.permsV2 = true;
    changed = true;
  }
  if (changed) saveDB();
}

function staffRec(id) {
  const s = db.staff[id] ||= { claimed: 0, closed: 0, handling: 0, byType: {}, forumPostId: null };
  s.period ||= { byType: {}, since: stamp() };
  s.payments ||= [];
  return s;
}

// What a staff member is owed right now (current pay period only), per pay category
function payBreakdown(s) {
  const cats = db.config.staffPay?.categories || [];
  if (!cats.length) return { lines: [], total: 0 };
  const def = cats.find(c => c.isDefault) || cats[0];
  const counts = new Map();
  for (const [key, n] of Object.entries(s?.period?.byType || {})) {
    const cat = cats.find(c => (c.typeKeys || []).includes(key)) || def;
    counts.set(cat.id, (counts.get(cat.id) || 0) + Number(n || 0));
  }
  const lines = cats.filter(c => counts.get(c.id) > 0).map(c => {
    const count = counts.get(c.id);
    const rate = Number(c.rate) || 0;
    return { id: c.id, name: c.name, count, rate, total: Math.round(count * rate * 100) / 100 };
  });
  return { lines, total: Math.round(lines.reduce((n, l) => n + l.total, 0) * 100) / 100 };
}


function addAudit(guildId, actorId, action, details = {}) {
  db.auditLog.unshift({ at: stamp(), guildId, actorId, action, details });
  db.auditLog = db.auditLog.slice(0, 5000);
  saveDB();
  const ch = guildId && db.config.auditChannelId ? client.guilds.cache.get(guildId)?.channels.cache.get(db.config.auditChannelId) : null;
  if (ch?.isTextBased()) {
    ch.send({
      embeds: [embed(`${brandName()} Audit Log`, `**Action:** ${clip(action, 200)}\n**Actor:** ${actorId ? `<@${actorId}>` : 'System'}\n**Details:**\n\`${clip(JSON.stringify(details), 700)}\``, 0x5865f2).setTimestamp()]
    }).catch(() => {});
  }
}

function addPointHistory(actorId, action, details) {
  db.pointHistory.unshift({ at: stamp(), actorId, action, details });
  db.pointHistory = db.pointHistory.slice(0, 5000);
  saveDB();
}

async function sendBackup(guild, reason) {
  const snapshot = { at: stamp(), reason, tribes: JSON.parse(JSON.stringify(db.tribes)) };
  db.backups.unshift(snapshot);
  db.backups = db.backups.slice(0, 100);
  saveDB();
  const ch = db.config.backupChannelId ? guild.channels.cache.get(db.config.backupChannelId) : null;
  if (ch?.isTextBased()) {
    const lines = Object.values(db.tribes).sort((a, b) => b.points - a.points).map(t => `${t.name} | ${t.map} | ${t.base} | ${t.points} pts`);
    await ch.send({ content: clip(`**${brandName()} Backup**\nReason: ${reason}\n${snapshot.at}\n${lines.join('\n') || 'No tribes.'}`, 1900) }).catch(() => {});
  }
}

// ---------- LEADERBOARD (customizable via /config leaderboard) ----------
const LB_DEFAULTS = {
  title: '👑 {bot}', header: '🏆 TRIBE LEADERBOARD', footer: '⚔️ {bot}',
  line: '━━━━━━━━━━━━━━━━━━━━━━━━━━', medals: '🥇,🥈,🥉', marker: '🔹',
  baseLabel: '🗺️ Main Base', pointsLabel: '💎 Points',
  note: '🔄 Updates automatically every 3 minutes', color: '#2ecc71', max: 15
};
const LB_FIELDS = Object.keys(LB_DEFAULTS);
const lb = () => ({ ...LB_DEFAULTS, ...(db.config.lb || {}) });
const CHANNEL_KEYS = { leaderboard: 'leaderboardChannelId', backup: 'backupChannelId', audit: 'auditChannelId', pointslog: 'pointsLogChannelId', donolog: 'donoLogChannelId', creditaddlog: 'creditAddLogChannelId', creditremovelog: 'creditRemoveLogChannelId', transcript: 'ticketTranscriptChannelId', statsforum: 'staffStatsForumId', ticketcategory: 'ticketCategoryId' };
const ROLE_KEYS = { staff: 'ticketStaffRoleIds', owner: 'ownerRoleIds', admin: 'adminRoleIds', rename: 'authorizedRenameRoleIds', higherpoints: 'higherPointRoleIds' };
const TOGGLE_KEYS = { claiming: 'claimEnabled', closing: 'closeEnabled', transcripts: 'transcriptSaving' };
const TEXT_KEYS = ['panel_title', 'panel_description', 'welcome'];
const choiceList = arr => arr.map(k => ({ name: k, value: k }));

function leaderboardEmbed() {
  const L = lb();
  const list = Object.values(db.tribes).filter(t => t.name && t.name.trim()).sort((a, b) => b.points - a.points);
  const medals = String(L.medals).split(',').map(s => s.trim());
  const entries = list.slice(0, Number(L.max) || 15).map((t, i) =>
    `${medals[i] || L.marker} #${i + 1}  | **${clip(t.name, 60)}**\n      ${L.baseLabel}: ${clip(t.base || 'Not set', 60)}\n      ${L.pointsLabel}: ${Math.floor(Number(t.points) || 0)}`);
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const desc = `**${L.header}**\n${L.line}\n\n${entries.join('\n\n') || 'No tribes have been added yet.'}\n\n${L.line}\n📊 Total Tribes: ${list.length}\n🕒 Last Updated: ${date}\n${L.note}`;
  return new EmbedBuilder()
    .setColor(parseInt(String(L.color).replace('#', ''), 16) || 0x2ecc71)
    .setTitle(clip(fillVars(L.title, curGuild()), 256)).setDescription(clip(desc, 4000)).setFooter({ text: clip(fillVars(L.footer, curGuild()), 2048) });
}

async function refreshLeaderboard(guild) {
  const ch = db.config.leaderboardChannelId ? guild.channels.cache.get(db.config.leaderboardChannelId) : null;
  if (!ch?.isTextBased()) return;
  let msg = db.config.leaderboardMessageId ? await ch.messages.fetch(db.config.leaderboardMessageId).catch(() => null) : null;
  if (msg) {
    await msg.edit({ embeds: [leaderboardEmbed()] }).catch(() => {});
  } else {
    msg = await ch.send({ embeds: [leaderboardEmbed()] }).catch(() => null);
    if (msg) {
      db.config.leaderboardMessageId = msg.id;
      saveDB();
    }
  }
}

const statsLocks = new Map();
// One update at a time per staff member, so a double click can never create two forum posts.
function postStaffStats(guild, userId, extraContent = null) {
  const key = `${guild.id}:${userId}`;
  const prev = statsLocks.get(key) || Promise.resolve();
  const next = prev.then(() => postStaffStatsNow(guild, userId, extraContent)).catch(e => console.error('Staff stats update failed:', e));
  statsLocks.set(key, next);
  next.then(() => { if (statsLocks.get(key) === next) statsLocks.delete(key); });
  return next;
}

async function postStaffStatsNow(guild, userId, extraContent) {
  const forum = db.config.staffStatsForumId ? guild.channels.cache.get(db.config.staffStatsForumId) : null;
  if (!forum || forum.type !== ChannelType.GuildForum) return;
  const s = staffRec(userId);
  const byType = Object.entries(s.byType).map(([name, count]) => `• ${name}: ${count}`).join('\n') || 'No claims by ticket type yet.';
  const pay = payBreakdown(s);
  const payLines = pay.lines.map(l => `• ${l.name}: ${l.count} × €${l.rate.toFixed(2)} = **€${l.total.toFixed(2)}**`).join('\n') || 'No unpaid claims.';
  const last = s.payments[0];
  const lastPaid = last ? `\n**Last paid:** <t:${Math.floor(Date.parse(last.at) / 1000)}:d> (€${Number(last.total).toFixed(2)})` : '';
  const content = clip(`**Staff Statistics — <@${userId}>**\n\n**Claimed:** ${s.claimed}\n**Closed:** ${s.closed}\n**Currently handling:** ${s.handling}\n\n**Claims by ticket type**\n${byType}\n\n**Current pay period**\n${payLines}\n**Total owed: €${pay.total.toFixed(2)}**${lastPaid}\n\nUpdated: <t:${Math.floor(Date.now() / 1000)}:F>`, 1900);

  let thread = null;
  if (s.forumPostId) {
    try {
      thread = await forum.threads.fetch(s.forumPostId);
    } catch (e) {
      if (e?.code === 10003 || e?.status === 404) s.forumPostId = null; // the post was deleted: make a new one
      else throw e; // temporary Discord problem: never create a duplicate
    }
    if (!thread && s.forumPostId) return;
  }
  if (thread) {
    if (thread.archived) await thread.setArchived(false).catch(() => {});
    const first = await thread.fetchStarterMessage().catch(() => null);
    if (first) await first.edit({ content }).catch(e => console.error('Stats edit failed:', e.message));
    else await thread.send({ content }).catch(() => {});
  } else {
    const user = await client.users.fetch(userId).catch(() => null);
    thread = await forum.threads.create({
      name: `staff-${safeName(user?.username || userId)}`,
      message: { content }
    }).catch(e => { console.error('Stats post create failed:', e.message); return null; });
    if (!thread) return;
    s.forumPostId = thread.id;
    saveDB();
  }
  if (extraContent) await thread.send({ content: clip(extraContent, 1900) }).catch(() => {});
}


async function saveTranscript(guild, ticket, closerId, closeReason = '') {
  const messages = [];
  let before;
  const channel = guild.channels.cache.get(ticket.channelId);
  if (channel?.isTextBased()) {
    for (let page = 0; page < 10; page++) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
      if (!batch?.size) break;
      messages.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
    }
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const transcript = messages.map(m =>
    `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag || m.author?.id || 'Unknown'}: ${m.content || ''}${m.attachments.size ? `\nAttachments: ${[...m.attachments.values()].map(a => a.url).join(' ')}` : ''}`
  ).join('\n\n');
  const history = (ticket.claimHistory || []).map(x => `<@${x.userId}> — ${x.at}${x.note ? ` (${x.note})` : ''}`).join('\n') || 'Never claimed';
  const header = `**Type:** ${ticket.typeName}\n**Owner:** <@${ticket.ownerId}>\n**Claim history:**\n${history}\n**Closed by:** <@${closerId}>\n**Close Reason:** ${closeReason || 'None'}\n**Closed at:** ${stamp()}`;

  if (db.config.transcriptSaving && db.config.ticketTranscriptChannelId) {
    const dest = guild.channels.cache.get(db.config.ticketTranscriptChannelId);
    if (dest?.isTextBased()) {
      await dest.send({ embeds: [embed('🎫 Ticket Transcript', header, 0x5865f2)] }).catch(() => {});
      const chunks = transcript.match(/[\s\S]{1,1800}/g) || ['No messages captured.'];
      for (let i = 0; i < Math.min(chunks.length, 10); i++) {
        await dest.send({ content: `**Transcript ${i + 1}/${Math.min(chunks.length, 10)}**\n${chunks[i]}` }).catch(() => {});
      }
    }
  }

  if (ticket.claimantId) {
    const extra = `**Transcript for ticket ${ticket.typeName}**\n${header}\n\n${clip(transcript, 1500)}`;
    await postStaffStats(guild, ticket.claimantId, extra);
  }
}

// ---------- TICKET PANEL MESSAGE (fully customizable, follows the bot nickname) ----------
const isUrl = s => /^https?:\/\/\S+$/i.test(s || '');

function botDisplayName(guild) {
  return guild?.members?.me?.displayName || client.user?.displayName || client.user?.username || 'Bot';
}
// {bot} = bot nickname in this server (or username), {bio} = bot bio, {server} = server name
function fillVars(s, guild) {
  return String(s ?? '')
    .replace(/\{bot\}/gi, botDisplayName(guild))
    .replace(/\{bio\}/gi, root.botBio || '')
    .replace(/\{server\}/gi, guild?.name || '');
}
function parseEmoji(s) {
  s = String(s || '').trim();
  if (!s) return undefined;
  const m = s.match(/^<(a?):(\w+):(\d+)>$/);
  if (m) return { animated: Boolean(m[1]), name: m[2], id: m[3] };
  return s;
}
function validEmoji(s) {
  s = String(s || '').trim();
  return /^<a?:\w+:\d+>$/.test(s) || /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3)/u.test(s);
}

function ticketPanelRows(noEmoji = false) {
  const p = db.config.ticketPanel;
  const options = db.config.ticketTypes.slice(0, 25).map(t => {
    const o = {
      label: clip(t.name, 100),
      value: t.key,
      description: clip(`Open a ${t.name.replace(/[^\w ]/g, '').trim() || 'support'} ticket`, 100)
    };
    const e = (!noEmoji && validEmoji(t.emoji)) ? parseEmoji(String(t.emoji).trim()) : undefined;
    if (e) o.emoji = e;
    return o;
  });
  return options.length
    ? [row(new StringSelectMenuBuilder().setCustomId('ticket:create').setPlaceholder(clip(p.placeholder || 'Choose a ticket type', 150)).addOptions(options))]
    : [];
}

function panelPayload(guild, forEdit = false, noEmoji = false) {
  const p = db.config.ticketPanel;
  const head = `${p.titleEmoji ? `${p.titleEmoji} | ` : ''}***__${fillVars(p.title, guild)}__***`;
  const lines = db.config.ticketTypes.map(t => `> ${t.emoji ? `${t.emoji} | ` : ''}**${t.name}**`);
  const parts = [head, ...lines];
  if (p.description) parts.push(fillVars(p.description, guild));

  const e = new EmbedBuilder()
    .setColor(/^#?[0-9a-f]{6}$/i.test(p.color) ? parseInt(p.color.replace('#', ''), 16) : 0xff0000)
    .setDescription(clip(parts.join('\n\n'), 4000));

  if (p.thumbnail === 'avatar') {
    const av = guild?.members?.me?.displayAvatarURL({ extension: 'png', size: 256 }) || client.user?.displayAvatarURL({ extension: 'png', size: 256 });
    if (av) e.setThumbnail(av);
  } else if (isUrl(p.thumbnail)) {
    e.setThumbnail(p.thumbnail);
  }

  const files = [];
  const bannerPath = p.bannerFile ? path.join(DATA_DIR, p.bannerFile) : null;
  if (bannerPath && fs.existsSync(bannerPath)) {
    files.push(new AttachmentBuilder(bannerPath, { name: p.bannerFile }));
    e.setImage(`attachment://${p.bannerFile}`);
  } else if (isUrl(p.bannerUrl)) {
    e.setImage(p.bannerUrl);
  }
  if (p.footer) e.setFooter({ text: clip(fillVars(p.footer, guild), 2048) });

  const payload = { embeds: [e], components: ticketPanelRows(noEmoji), files };
  if (forEdit) payload.attachments = [];
  return payload;
}

async function postPanel(guild, channel) {
  let msg;
  try {
    msg = await channel.send(panelPayload(guild));
  } catch (e) {
    console.error('Panel post failed, retrying without emojis:', e.message);
    msg = await channel.send(panelPayload(guild, false, true));
  }
  db.config.ticketPanelChannelId = channel.id;
  db.config.ticketPanelMessageId = msg.id;
  saveDB();
  return msg;
}

// Edits the already-posted panel in place. Returns true if it was updated.
async function refreshPanel(guild) {
  const c = db.config;
  if (!c.ticketPanelChannelId || !c.ticketPanelMessageId) return false;
  const ch = guild.channels.cache.get(c.ticketPanelChannelId);
  if (!ch?.isTextBased()) return false;
  const msg = await ch.messages.fetch(c.ticketPanelMessageId).catch(() => null);
  if (!msg) return false;
  try {
    try {
      await msg.edit(panelPayload(guild, true));
    } catch (e1) {
      // an emoji Discord does not accept would block every update: retry without the emojis
      console.error('Panel refresh failed, retrying without emojis:', e1.message);
      await msg.edit(panelPayload(guild, true, true));
    }
    return true;
  } catch (e) {
    console.error('Panel refresh failed:', e.message);
    return false;
  }
}

// deletes a message the bot posted earlier (ticket panel, hype info, mystery box). true = it is gone.
async function removePostedMessage(guild, channelId, messageId) {
  if (!channelId || !messageId) return false;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return true;                       // the channel itself was deleted
  if (!ch.isTextBased()) return false;
  const msg = await ch.messages.fetch(messageId).catch(() => null);
  if (!msg) return true;                      // already deleted
  try { await msg.delete(); return true; } catch { return false; }
}
async function sendTracked(chan, payload) {
  const m = await chan.send(payload);
  return { channelId: chan.id, messageId: m.id };
}

// ---------- TICKET CATEGORY ROUTING ----------
// 1) the category you picked for that ticket type in /panel -> Tickets -> Ticket categories
// 2) (if auto-match is on) a category whose name matches the ticket name, e.g. anything with "Mesh" -> the Mesh category
// 3) the fallback category (/panel -> Channels -> ticketcategory)
function resolveTicketCategory(guild, type) {
  const c = db.config;
  const isCat = id => id && guild.channels.cache.get(id)?.type === ChannelType.GuildCategory;
  const mapped = c.ticketCategoryMap?.[type.key];
  if (isCat(mapped)) return mapped;
  if (c.ticketAutoRoute !== false) {
    const GENERIC = new Set(['support', 'help']);
    const words = [...new Set(`${type.name} ${type.key}`.toLowerCase().match(/[a-z0-9]+/g) || [])];
    const specific = words.filter(w => w.length >= 3 && !GENERIC.has(w) && w !== 'ticket' && w !== 'tickets');
    const generic = words.filter(w => GENERIC.has(w));
    const cats = [...guild.channels.cache.values()].filter(ch => ch.type === ChannelType.GuildCategory);
    const matches = (w, ch) => {
      const n = ch.name.toLowerCase();
      if (n.includes(w)) return true;
      return (n.match(/[a-z0-9]+/g) || []).some(cw => cw.length >= 4 && w.startsWith(cw));
    };
    for (const w of (specific.length ? specific : generic)) {
      const hit = cats.find(ch => matches(w, ch));
      if (hit) return hit.id;
    }
  }
  return isCat(c.ticketCategoryId) ? c.ticketCategoryId : undefined;
}

// if the category is full or unusable, still create the ticket (without a category) instead of failing
async function createTicketChannel(guild, opts) {
  try {
    return await guild.channels.create(opts);
  } catch (e) {
    if (!opts.parent) throw e;
    console.error('Ticket category unusable, creating the ticket without one:', e.message);
    return await guild.channels.create({ ...opts, parent: undefined });
  }
}


// ---------- TICKET CREATION (shared by /ticket and the panel dropdown) ----------
async function createTicket(interaction, type) {
  const guild = interaction.guild;
  // FIX: only block a second ticket of the SAME type
  const existing = Object.values(db.tickets).find(t => t.ownerId === interaction.user.id && t.status === 'open' && t.typeKey === type.key);
  if (existing) return interaction.reply({ content: `You already have an open ${type.name} ticket: <#${existing.channelId}>`, ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  const base = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages];
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
  ];

  if (type.key === 'news') {
    // owners + roles with the "news" ability can see it; roles that only manage normal tickets cannot
    const allowIds = new Set([...(db.config.ownerRoleIds || []), ...(db.config.perms?.news || [])]);
    const denyIds = new Set((db.config.perms?.tickets || []).filter(id => !allowIds.has(id)));
    for (const id of allowIds) if (guild.roles.cache.has(id)) overwrites.push({ id, allow: base });
    for (const id of denyIds) if (guild.roles.cache.has(id)) overwrites.push({ id, deny: [PermissionFlagsBits.ViewChannel] });
  } else {
    for (const id of db.config.ticketStaffRoleIds) if (guild.roles.cache.has(id)) overwrites.push({ id, allow: base });
  }

  const channel = await createTicketChannel(guild, {
    name: safeName(`${type.key}-${interaction.user.username}`),
    type: ChannelType.GuildText,
    parent: resolveTicketCategory(guild, type) || undefined,
    permissionOverwrites: overwrites,
    topic: `${brandName()} ticket | owner=${interaction.user.id} | type=${type.name}`
  });

  db.tickets[channel.id] = {
    id: channel.id, channelId: channel.id, ownerId: interaction.user.id,
    typeKey: type.key, typeName: type.name, status: 'open', price: Number(db.config.ticketPrice),
    claimantId: null, claimHistory: [], createdAt: stamp(), closedAt: null, closedBy: null, closeReason: null
  };
  saveDB();

  const notifyRoleIds = type.key === 'news'
    ? [...new Set([...(db.config.ownerRoleIds || [])])]
    : [...new Set([...(db.config.ticketStaffRoleIds || []), ...(db.config.ownerRoleIds || []), ...(db.config.adminRoleIds || [])])];
  const roleMentions = notifyRoleIds.map(id => `<@&${id}>`).join(' ');

  await channel.send({
    content: roleMentions || undefined,
    embeds: [embed(`🎫 ${type.name}`, fillVars(db.config.ticketWelcomeMessage, guild), 0x2ecc71)],
    components: ticketActionRows(channel.id),
    allowedMentions: { roles: notifyRoleIds }
  });

  addAudit(guild.id, interaction.user.id, 'ticket_created', { channelId: channel.id, type: type.name });
  return interaction.editReply({ content: `Your ticket has been created: ${channel}` });
}

function ticketActionRows(ticketId) {
  return [row(
    btn(`ticket:claim:${ticketId}`, 'Claim Ticket', ButtonStyle.Success, '🟢'),
    btn(`ticket:adduser:${ticketId}`, 'Add User', ButtonStyle.Primary, '➕'),
    btn(`ticket:removeuser:${ticketId}`, 'Remove User', ButtonStyle.Secondary, '➖'),
    btn(`ticket:rename:${ticketId}`, 'Rename', ButtonStyle.Secondary, '✏️'),
    btn(`ticket:close:${ticketId}`, 'Close Ticket', ButtonStyle.Danger, '🔒')
  )];
}

function ticketDashboardRows() {
  return [
    row(btn('td:panel', 'Edit Panel Appearance', ButtonStyle.Primary), btn('td:welcome', 'Edit Welcome Message'), btn('td:types', 'Manage Ticket Options')),
    row(btn('td:place', 'Place Panel'), btn('td:settings', 'Channel & Staff Settings'), btn('td:admin', 'Admin: Stats / Transcripts')),
    row(btn('td:close', 'Close Dashboard', ButtonStyle.Danger))
  ];
}

function leaderboardRows() {
  return [
    row(btn('ld:add', 'Add Tribe', ButtonStyle.Success), btn('ld:edit', 'Edit Tribe'), btn('ld:points', 'Manage Points', ButtonStyle.Primary)),
    row(btn('ld:remove', 'Remove Tribe', ButtonStyle.Danger), btn('ld:refresh', 'Force Refresh'), btn('ld:settings', 'Channels / Settings')),
    row(btn('ld:close', 'Close Dashboard', ButtonStyle.Secondary))
  ];
}

function donoRows() {
  return [row(btn('dd:boxes', 'Mystery Box', ButtonStyle.Primary, '🎁'), btn('dd:credit', 'Credit', ButtonStyle.Secondary, '💳'), btn('dd:settings', 'Log Channel'))];
}

function modalText(id, label, value = '', style = TextInputStyle.Short, required = true, max = 100) {
  return new TextInputBuilder().setCustomId(id).setLabel(String(label).slice(0, 45)).setStyle(style).setRequired(required).setMaxLength(max).setValue(String(value).slice(0, max));
}
function modal(id, title, fields) {
  const m = new ModalBuilder().setCustomId(id).setTitle(String(title).slice(0, 45));
  for (const f of fields) m.addComponents(row(f));
  return m;
}
function payCategoryFields(pc) {
  const T = TextInputStyle;
  return [
    modalText('name', 'Category name', pc?.name || '', T.Short, true, 50),
    modalText('rate', 'Pay per claim in € (e.g. 2.00)', pc ? Number(pc.rate).toFixed(2) : '2.00', T.Short, true, 8),
    modalText('types', 'Ticket type keys (* = all others)', (pc?.typeKeys || []).join(', '), T.Short, false, 200),
    modalText('default', 'Default for all other ticket types? (yes/no)', pc?.isDefault ? 'yes' : 'no', T.Short, false, 3)
  ];
}


function tribeChoices() {
  return Object.values(db.tribes).filter(t => t.name && t.name.trim()).slice(0, 25).map(t => ({ label: clip(t.name, 100), value: t.id }));
}
function mapChoices() {
  return MAPS.slice(0, 25).map(m => ({ label: m, value: m }));
}
function tribeByName(name) {
  return Object.values(db.tribes).find(t => t.name.toLowerCase() === name.toLowerCase());
}
function createTribeId() {
  return 't_' + Math.random().toString(36).slice(2, 10);
}

async function logAction(guild, content) {
  const ch = db.config.donoLogChannelId ? guild.channels.cache.get(db.config.donoLogChannelId) : null;
  if (ch?.isTextBased()) await ch.send({ content }).catch(() => {});
}
// credit additions and removals go to two different channels
async function logCredit(guild, kind, userId, amount, before, after, adminId, reason = '') {
  try {
    const adding = kind === 'give_credit';
    const id = db.config[adding ? 'creditAddLogChannelId' : 'creditRemoveLogChannelId'];
    const ch = id ? guild.channels.cache.get(id) : null;
    if (!ch?.isTextBased()) return;
    const bal = (before === null || before === undefined || after === null || after === undefined) ? '' : `\nBalance: €${Number(before).toFixed(2)} → €${Number(after).toFixed(2)}`;
    await ch.send({
      content: `${adding ? '➕ **Credit added**' : '➖ **Credit removed**'}\nUser: <@${userId}>\nAmount: €${Number(amount).toFixed(2)}${bal}\nBy: ${adminId ? `<@${adminId}>` : 'System'}\nReason: ${clip(reason || '—', 200)}`,
      allowedMentions: { parse: [] }
    }).catch(() => {});
  } catch (e) {
    console.error('Credit log failed:', e);
  }
}

async function logPoints(guild, content) {
  const ch = db.config.pointsLogChannelId ? guild.channels.cache.get(db.config.pointsLogChannelId) : null;
  if (ch?.isTextBased()) await ch.send({ content }).catch(() => {});
}

// ---------- WIPE SCHEDULE HELPERS ----------
function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
function tzOffsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs));
  const g = t => Number(parts.find(p => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}
function zonedToUtcMs(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - tzOffsetMs(guess, tz);
  utc = guess - tzOffsetMs(utc, tz);
  return utc;
}
function parseTime(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2] || 0);
  if (mi > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
  } else if (h > 23) return null;
  return { h, mi };
}
function wipeEmbed(guild) {
  const w = db.config.wipe || {};
  const ms = w.at ? Date.parse(w.at) : NaN;
  const color = parseInt(String(db.config.ticketPanel.color || '#ff0000').replace('#', ''), 16) || 0xff0000;
  const e = new EmbedBuilder().setColor(color).setTitle('🗓️ Server Wipe');
  if (Number.isFinite(ms) && ms > Date.now()) {
    const ts = Math.floor(ms / 1000);
    e.setDescription(`**<t:${ts}:F>**\n<t:${ts}:R>${w.message ? `\n\n${clip(fillVars(w.message, guild), 1500)}` : ''}`);
  } else {
    e.setDescription('No wipe is scheduled right now. Check back soon!');
  }
  return e;
}

// ---------- EMBED CREATOR ----------
const newDraft = () => ({ title: 'New Embed', description: 'Edit me with the buttons below.', color: '#2ecc71', thumbnail: '', image: '', footer: '', author: '', fields: [] });

function buildDraftEmbed(d) {
  const e = new EmbedBuilder().setColor(/^#?[0-9a-f]{6}$/i.test(d.color) ? parseInt(d.color.replace('#', ''), 16) : 0x2ecc71);
  if (d.title) e.setTitle(clip(d.title, 256));
  if (d.description) e.setDescription(clip(d.description, 4000));
  if (isUrl(d.thumbnail)) e.setThumbnail(d.thumbnail);
  if (isUrl(d.image)) e.setImage(d.image);
  if (d.footer) e.setFooter({ text: clip(d.footer, 2048) });
  if (d.author) e.setAuthor({ name: clip(d.author, 256) });
  if (d.fields.length) e.addFields(d.fields.slice(0, 25));
  if (!d.title && !d.description && !d.fields.length && !isUrl(d.image) && !d.author) e.setDescription('\u200b');
  return e;
}

function embedCreatorPanel(d) {
  return {
    content: '**Embed Creator** — live preview below',
    embeds: [buildDraftEmbed(d)],
    components: [
      row(btn('ec:main', 'Title / Desc / Color', ButtonStyle.Primary), btn('ec:extra', 'Images / Footer / Author'), btn('ec:addfield', 'Add Field', ButtonStyle.Success), btn('ec:clearfields', 'Clear Fields')),
      row(btn('ec:send', 'Send to Channel', ButtonStyle.Success), btn('ec:cancel', 'Close', ButtonStyle.Danger))
    ]
  };
}

// ---------- HELP PAGE ----------
function helpEmbed(guild) {
  const e = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👑 ${brandName()} — Help`)
    .setDescription('Everything is controlled from **/panel**. Server owners and owner roles can do everything; give other roles abilities in **/panel → Roles**.')
    .addFields(
      { name: '/panel (staff)', value: 'Account, Channels, Roles, Toggles, Tickets, Hype Squad, Leaderboard, Events (polls & giveaways), Economy, Wipe & Season, Embeds. You only see the sections your role may use.' },
      { name: 'Everyone', value: '• Open a ticket with the **ticket panel dropdown**\n• Vote in polls, enter giveaways, join the Hype Squad\n• `/open-mystery-box` or the **Open** button on the mystery box message, and **Check Balance**\n• `!wipe` — see when the next server wipe is\n• `/help` — this page' }
    )
    .setFooter({ text: `⚔️ ${brandName()}` });
  return e;
}

// ---------- AUTHORIZATION ----------
function unauthorizedEmbed() {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setDescription([
      '## 🚨・UNAUTHORIZED BOT USAGE',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️・**NOTICE**',
      '',
      `This bot is the property of ${DEV_NAME} and is not authorized for use without the developer’s Authorization.`,
      '',
      'If you are using this bot without authorization, please contact the developer immediately to resolve the issue.',
      '',
      '💻・**DEVELOPER CONTACT**',
      '',
      `📧 **GMAIL:** ${DEV_EMAIL}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '🔒・**UNAUTHORIZED USE IS NOT PERMITTED**'
    ].join('\n'));
}

// the developer (you): listed in OWNER_IDS, or if that is empty, the owner of the home server
function isBotOwner(user, guild) {
  if (OWNER_IDS.includes(user.id)) return true;
  return OWNER_IDS.length === 0 && isControl(guild?.id) && guild.ownerId === user.id;
}

// ---------- SMALL HELPERS ----------
function parseDuration(s) {
  const m = String(s || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(m|h|d)$/);
  if (!m) return null;
  const ms = Math.floor(Number(m[1]) * { m: 60000, h: 3600000, d: 86400000 }[m[2]]);
  return ms >= 60000 ? ms : null;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- POLLS ----------
const POLL_COLOR = 0x8e44ad;

function pollEmbed(p, counts = null) {
  const lines = p.options.map((o, i) => `${p.emojis[i] || '▫️'} - ${o}`);
  let desc = `**${p.title}**\n${lines.join('\n')}`;
  if (counts) {
    const max = Math.max(...counts);
    const total = counts.reduce((a, b) => a + b, 0);
    desc += `\n\n**FINAL RESULT**\n${p.options.map((o, i) => `${max > 0 && counts[i] === max ? '🏆' : '▫️'} ${p.emojis[i] || ''} ${o} — **${counts[i]}**${total ? ` (${Math.round((counts[i] / total) * 100)}%)` : ''}`).join('\n')}`;
  } else if (p.endsAt) {
    desc += `\n\n⏳ Ends <t:${Math.floor(p.endsAt / 1000)}:R>`;
  }
  return new EmbedBuilder().setColor(POLL_COLOR).setDescription(clip(desc, 4000));
}

async function endPoll(guild, msgId) {
  const p = db.polls[msgId];
  if (!p || p.ended) return null;
  p.ended = true;
  const ch = guild.channels.cache.get(p.channelId);
  const msg = ch?.isTextBased() ? await ch.messages.fetch(msgId).catch(() => null) : null;
  const counts = p.options.map((_o, i) => {
    const r = msg?.reactions.cache.find(x => x.emoji.toString() === p.emojis[i]);
    return r ? Math.max(0, r.count - (r.me ? 1 : 0)) : 0;
  });
  p.counts = counts;
  saveDB();
  if (msg) {
    await msg.edit({ embeds: [pollEmbed(p, counts)] }).catch(() => {});
    await msg.reactions.removeAll().catch(() => {});
  }
  return counts;
}

// ---------- GIVEAWAYS ----------
function giveawayEmbed(g) {
  const e = new EmbedBuilder().setColor(g.ended ? 0x95a5a6 : 0xf1c40f).setTitle(clip(`🎉 ${g.prize}`, 250));
  const ts = Math.floor(g.endsAt / 1000);
  const extras = `${g.hypeOnly ? '\n🔥 **Hype Squad only**' : ''}${g.credit ? `\n💳 **Prize:** €${Number(g.credit).toFixed(2)} credit` : ''}`;
  if (g.cancelled) {
    e.setDescription(`This giveaway was cancelled.${extras}`);
  } else if (g.ended) {
    const w = g.winnersList || [];
    e.setDescription(`**Winner${w.length === 1 ? '' : 's'}:** ${w.length ? w.map(id => `<@${id}>`).join(', ') : 'No valid entries'}\n**Hosted by:** <@${g.hostId}>${extras}`);
  } else {
    e.setDescription(`Press **Enter Giveaway** to join!\n\n**Winners:** ${g.winners}\n**Ends:** <t:${ts}:R> (<t:${ts}:F>)\n**Hosted by:** <@${g.hostId}>${extras}`);
  }
  return e.setFooter({ text: `Entries: ${g.entries.length}` });
}
const giveawayRows = (disabled = false) => [row(btn('gw:enter', 'Enter Giveaway', ButtonStyle.Success, '🎉').setDisabled(disabled))];

// ends a giveaway (or rerolls it) and announces the winners
async function endGiveaway(guild, msgId, reroll = false) {
  const g = db.giveaways[msgId];
  if (!g || g.cancelled) return null;
  if (g.ended && !reroll) return null;
  const exclude = reroll ? (g.winnersList || []) : [];
  const winners = shuffle(g.entries.filter(id => !exclude.includes(id))).slice(0, g.winners);
  g.ended = true;
  g.endedAt = stamp();
  g.winnersList = reroll ? [...exclude, ...winners] : winners;
  if (g.credit && !reroll) {
    for (const w of winners) {
      const old = Number(db.dono.balances[w] || 0);
      const next = Math.round((old + Number(g.credit)) * 100) / 100;
      db.dono.balances[w] = next;
      db.dono.transactions.unshift({ at: stamp(), kind: 'giveaway_credit', userId: w, amount: Number(g.credit), before: old, after: next, adminId: g.hostId, reason: `Giveaway: ${g.prize}` });
    }
  }
  saveDB();
  const ch = guild.channels.cache.get(g.channelId);
  if (!ch?.isTextBased()) return winners;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit({ embeds: [giveawayEmbed(g)], components: giveawayRows(true) }).catch(() => {});
  const creditNote = g.credit ? (reroll ? '\n(Credit is not re-sent on a reroll. Use `/credits` if needed.)' : `\n💳 **€${Number(g.credit).toFixed(2)}** credit was added to your balance.`) : '';
  await ch.send({
    content: winners.length
      ? `🎉 Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won **${g.prize}**!${creditNote}`
      : `No valid entries for **${g.prize}**, so there is no winner.`,
    allowedMentions: { users: winners },
    reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined
  }).catch(() => {});
  if (g.credit && !reroll && winners.length) for (const w of winners) await logCredit(guild, 'give_credit', w, Number(g.credit), null, null, g.hostId, `Giveaway: ${g.prize}`);
  return winners;
}

// ---------- HYPE SQUAD ----------
// Lookalike letters from other alphabets: looks identical, but can't be typed on a normal keyboard.
// Only a copy-pasted name matches.
const LOOKALIKE = {
  A: '\u0410', B: '\u0412', C: '\u0421', E: '\u0415', H: '\u041D', I: '\u0406', J: '\u0408', K: '\u041A', M: '\u041C',
  O: '\u041E', P: '\u0420', S: '\u0405', T: '\u0422', X: '\u0425', Y: '\u03A5',
  a: '\u0430', c: '\u0441', e: '\u0435', i: '\u0456', j: '\u0458', o: '\u043E', p: '\u0440', s: '\u0455', x: '\u0445', y: '\u0443'
};
const strictName = n => [...String(n || '').trim()].map(ch => LOOKALIKE[ch] || ch).join('');

function hypeEmbed() {
  const h = db.config.hype;
  const em = h.emoji ? `${h.emoji} ` : '';
  const emR = h.emoji ? ` ${h.emoji}` : '';
  const lines = [
    `# ${em}__${h.title}__${emR}`,
    '',
    '## __Change your name to:__',
    '```' + (h.strictName || 'not set yet') + '```',
    h.perks,
    ''
  ];
  if (h.highlight) lines.push(`## ${h.highlight}`);
  if (h.giveawayChannelId) lines.push(`<#${h.giveawayChannelId}>`);
  if (h.highlight || h.giveawayChannelId) lines.push('');
  lines.push(`## ${h.members.length}/${h.limit} Limit only`, '', '## __AFTER RENAME:__',
    '↪ you get the role automatically, no verification needed');
  const e = new EmbedBuilder()
    .setColor(/^#?[0-9a-f]{6}$/i.test(h.color) ? parseInt(h.color.replace('#', ''), 16) : 0xe67e22)
    .setDescription(clip(lines.join('\n'), 4000))
    .setFooter({ text: `${brandName()} • Hype Squad` });
  if (isUrl(h.bannerUrl)) e.setImage(h.bannerUrl);
  return e;
}
async function refreshHypePost(guild) {
  const h = db.config.hype;
  if (!h.infoChannelId || !h.infoMessageId) return false;
  const ch = guild.channels.cache.get(h.infoChannelId);
  const msg = ch?.isTextBased() ? await ch.messages.fetch(h.infoMessageId).catch(() => null) : null;
  if (!msg) return false;
  await msg.edit({ embeds: [hypeEmbed()] }).catch(() => {});
  return true;
}

// ---------- HYPE SQUAD: the role is given automatically when the name is set (no verification) ----------
const hypeBusy = new Set();
const hypeFailed = new Map();

// Looks at ONE member: right name -> gets the role (once), name changed back -> loses it.
async function syncHypeMember(member) {
  try {
    const h = db.config.hype;
    if (!h?.roleId || !h.strictName || !member || member.user?.bot) return;
    const guild = member.guild;
    const key = `${guild.id}:${member.id}`;
    if (hypeBusy.has(key)) return;   // already being handled: never assign twice
    hypeBusy.add(key);
    try {
      const role = guild.roles.cache.get(h.roleId);
      if (!role) return;
      const nameOk = (member.nickname || '').trim() === h.strictName;
      const hasRole = member.roles.cache.has(h.roleId);
      const listed = h.members.includes(member.id);
      let changed = false;
      if (nameOk) {
        if (!hasRole) {
          if (!listed && h.members.length >= h.limit) return;                 // squad is full
          if ((hypeFailed.get(key) || 0) > Date.now()) return;                // recently failed: do not spam retries
          try {
            await member.roles.add(role, 'Hype Squad name detected');
            hypeFailed.delete(key);
          } catch (e) {
            hypeFailed.set(key, Date.now() + 10 * 60 * 1000);
            console.warn(`Hype Squad: could not give the role to ${member.user.tag}: ${e.message}. Move my role above the Hype Squad role.`);
            return;
          }
          changed = true;
        }
        if (!listed) { h.members.push(member.id); changed = true; }
      } else if (hasRole && listed) {
        await member.roles.remove(role, 'Hype Squad name changed').catch(() => {});
        h.members = h.members.filter(id => id !== member.id);
        changed = true;
      } else if (!hasRole && listed) {
        h.members = h.members.filter(id => id !== member.id);
        changed = true;
      }
      if (changed) {
        saveDB();
        await refreshHypePost(guild);
      }
    } finally {
      hypeBusy.delete(key);
    }
  } catch (e) {
    console.error('Hype sync error:', e);
  }
}

// kept for the message handler: any message also re-checks that member
async function handleHype(message) {
  if (message.member) await syncHypeMember(message.member);
}

// safety net: re-checks everyone who has the name or the role (cache only, cheap)
async function hypeSweep() {
  for (const guild of client.guilds.cache.values()) {
    if (!isAuthorized(guild.id)) continue;
    await runIn(guild, async () => {
      const h = db.config.hype;
      if (!h.roleId || !h.strictName) return;
      const listed = new Set(h.members);
      for (const m of guild.members.cache.values()) {
        if (m.user.bot) continue;
        if ((m.nickname || '').trim() === h.strictName || m.roles.cache.has(h.roleId) || listed.has(m.id)) await syncHypeMember(m);
      }
    }).catch(e => console.error('hype sweep', e));
  }
}


// ---------- !wipe (30 second cooldown per person) ----------
async function wipeReply(message, unauthorized) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const st = wipeCooldown.get(key);
  if (st && now < st.until) {
    if (now >= (st.noticeAt || 0)) {
      st.noticeAt = now + 5000;
      const secs = Math.ceil((st.until - now) / 1000);
      const m = await message.reply({ content: `⏳ Please wait **${secs}s** before using \`!wipe\` again.`, allowedMentions: { repliedUser: false } }).catch(() => null);
      if (m) setTimeout(() => m.delete().catch(() => {}), 5000);
    }
    return;
  }
  wipeCooldown.set(key, { until: now + 30000 });
  await message.reply({ embeds: [unauthorized ? unauthorizedEmbed() : wipeEmbed(message.guild)], allowedMentions: { repliedUser: false } }).catch(() => {});
}

// ---------- TIMERS (ends polls and giveaways, cleans up) ----------
async function sweepTimers() {
  const now = Date.now();
  for (const [k, v] of wipeCooldown) if (now > v.until + 10000) wipeCooldown.delete(k);
  for (const [k, v] of pendingUploads) if (now > v.expires) pendingUploads.delete(k);
  for (const guild of client.guilds.cache.values()) {
    if (!isAuthorized(guild.id)) continue;
    await runIn(guild, async () => {
      for (const [id, p] of Object.entries(db.polls)) {
        if (!p.ended && p.endsAt && p.endsAt <= now) await endPoll(guild, id).catch(e => console.error('poll end', e));
      }
      for (const [id, g] of Object.entries(db.giveaways)) {
        if (!g.ended && !g.cancelled && g.endsAt <= now) await endGiveaway(guild, id).catch(e => console.error('giveaway end', e));
      }
    });
  }
}

// ---------- BOT STATUS ----------
function applyStatus() {
  const s = root.botStatus;
  if (!s?.text) return;
  client.user.setActivity(s.text, { type: ActivityType[s.type] ?? ActivityType.Playing });
}

// ================== CONTROL PANEL (/panel) ==================
// One dashboard for everything. Pages are described as plain data and drawn by renderPage().
// Uses the new Discord "components v2" layout when your discord.js supports it
// (ContainerBuilder exists), otherwise it falls back to an embed + buttons.
const pendingUploads = new Map();
const PNL_LISTS = { staff: 'ticketStaffRoleIds', owner: 'ownerRoleIds', admin: 'adminRoleIds', rename: 'authorizedRenameRoleIds', higherpoints: 'higherPointRoleIds' };
const PNL_LIST_LABEL = { staff: 'Ticket staff roles', owner: 'Owner roles', admin: 'Admin roles (pinged on tickets)', rename: 'Ticket rename roles', higherpoints: 'Higher point roles' };
const TOGGLE_DESC = { claiming: 'Staff can claim tickets', closing: 'Staff can close tickets', transcripts: 'Save a transcript when a ticket closes' };
const V2 = typeof ContainerBuilder === 'function';

const S = (id, emoji, name, desc, label = 'Open', style = ButtonStyle.Secondary) => ({ id, emoji, name, desc, label, style });
const NAV_CLOSE = { id: 'pnl:close', label: 'Close', style: ButtonStyle.Danger, emoji: '✖️' };
const navBack = (to = 'main') => ({ id: `pnl:p:${to}`, label: 'Back', emoji: '↩️' });
const roleList = ids => (ids?.length ? ids.map(i => `<@&${i}>`).join(' ') : '_none_');
const chanText = id => (id ? `<#${id}>` : '_not set_');

// ---------- drawing ----------
function pagePayload(spec) {
  const d = db.config.dash || {};
  const files = [];
  let ref = null;
  if (spec.banner !== false) {
    const fp = d.bannerFile ? path.join(DATA_DIR, d.bannerFile) : null;
    if (fp && fs.existsSync(fp)) {
      files.push(new AttachmentBuilder(fp, { name: d.bannerFile }));
      ref = `attachment://${d.bannerFile}`;
    } else if (isUrl(d.bannerUrl)) {
      ref = d.bannerUrl;
    }
  }
  const hex = db.config.ticketPanel.color;
  const color = /^#?[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.replace('#', ''), 16) : 0xff0000;
  const items = spec.items || [];
  const rows = spec.rows || [];
  const nav = spec.nav || [];
  const navRow = nav.length ? row(...nav.map(n => btn(n.id, n.label, n.style || ButtonStyle.Secondary, n.emoji))) : null;

  let base;
  if (V2) {
    const c = new ContainerBuilder().setAccentColor(color);
    if (ref) c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(ref)));
    const head = [`## ${spec.title}`];
    if (spec.notice) head.push(`> ${spec.notice}`);
    if (spec.intro) head.push(spec.intro);
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(clip(head.join('\n'), 1800)));
    c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    for (const it of items) {
      c.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(clip(`**${it.emoji ? `${it.emoji} ` : ''}${it.name}**\n↳ ${it.desc}`, 300)))
          .setButtonAccessory(btn(it.id, it.label || 'Open', it.style || ButtonStyle.Secondary, it.btnEmoji))
      );
    }
    if (items.length && (rows.length || navRow)) c.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    for (const r of rows) c.addActionRowComponents(r);
    if (navRow) c.addActionRowComponents(navRow);
    base = { components: [c], files, attachments: [], flags: MessageFlags.IsComponentsV2 };
  } else {
    const e = new EmbedBuilder().setColor(color).setTitle(clip(spec.title, 250));
    const text = [spec.notice ? `> ${spec.notice}` : '', spec.intro || '', ...items.map(it => `**${it.emoji ? `${it.emoji} ` : ''}${it.name}**\n↳ ${it.desc}`)].filter(Boolean).join('\n\n');
    e.setDescription(clip(text, 4000) || '\u200b');
    if (ref) e.setImage(ref);
    const comps = [];
    const itemBtns = items.map(it => btn(it.id, clip(it.name, 80), it.style === ButtonStyle.Danger ? ButtonStyle.Danger : ButtonStyle.Secondary, it.btnEmoji));
    for (let i = 0; i < itemBtns.length; i += 5) comps.push(row(...itemBtns.slice(i, i + 5)));
    comps.push(...rows);
    if (navRow) comps.push(navRow);
    base = { embeds: [e], components: comps.slice(0, 5), files, attachments: [] };
  }
  return { update: base, reply: { ...base, attachments: undefined, flags: (base.flags || 0) | MessageFlags.Ephemeral } };
}

function showPage(i, spec) {
  const p = pagePayload(spec);
  if (i.isMessageComponent?.() || i.isFromMessage?.()) return i.update(p.update);
  return i.reply(p.reply);
}
function editPage(i, spec) {
  return i.editReply(pagePayload(spec).update);
}

// ---------- pages ----------
function buildPage(kind, a, c) {
  const { member, guild, user } = c;
  const cfg = db.config;
  const spec = { title: '', intro: '', items: [], rows: [], nav: [navBack(), NAV_CLOSE], notice: c.notice };
  const owner = isOwner(member);
  const dev = guild.id === GUILD_ID || isControl(guild.id) || isBotOwner(user, guild);

  switch (kind) {
    case 'main': {
      spec.title = '📖 Main page';
      spec.intro = `Settings for **${botDisplayName(guild)}**`;
      spec.nav = [NAV_CLOSE];
      const add = (ok, it) => { if (ok) spec.items.push(it); };
      add(can(member, 'botprofile'), S('pnl:p:account', '👤', 'Account', 'Customize the bot profile and this panel image'));
      add(can(member, 'config'), S('pnl:p:channels', '#️⃣', 'Channels', 'Customize channel settings'));
      add(can(member, 'config'), S('pnl:p:roles', '🎭', 'Roles', 'Customize role settings and abilities'));
      add(can(member, 'config'), S('pnl:p:toggles', '⏻', 'Toggles', 'Customize togglable settings'));
      add(can(member, 'panel'), S('pnl:p:tickets', '🎫', 'Tickets', 'Customize the ticket panel and options'));
      add(can(member, 'hype'), S('pnl:p:hype', '🔥', 'Hype Squad', 'Customize hype squad settings'));
      add(can(member, 'staffpay'), S('pnl:p:pay', '💶', 'Staff Pay', 'Pay categories, rates and mark staff as paid'));
      const tools = [];
      if (can(member, 'leaderboard')) tools.push(btn('pnl:p:lb', 'Leaderboard', ButtonStyle.Secondary, '🏆'));
      if (can(member, 'polls') || can(member, 'giveaways')) tools.push(btn('pnl:p:events', 'Events', ButtonStyle.Secondary, '🎉'));
      if (can(member, 'dono')) tools.push(btn('pnl:p:eco', 'Economy', ButtonStyle.Secondary, '💳'));
      if (can(member, 'wipe') || can(member, 'season')) tools.push(btn('pnl:p:wipe', 'Wipe & Season', ButtonStyle.Secondary, '🗓️'));
      if (canUseEmbedCreator(member)) tools.push(btn('pnl:emb', 'Embeds', ButtonStyle.Secondary, '📝'));
      if (tools.length) spec.rows.push(row(...tools));
      if (!spec.items.length && !tools.length) spec.intro += '\n\nYou do not have access to any settings.';
      return spec;
    }

    case 'account': {
      spec.title = '👤 Account';
      spec.intro = `Nickname here: **${botDisplayName(guild)}**\nUsername: **${client.user.username}**${dev ? '' : '\n_Name, avatar, bio and status can only be changed by the bot developer._'}`;
      spec.items.push(S('pnl:ac:nick', '✏️', 'Nickname', 'Rename the bot in this server (the whole panel follows it)', 'Change'));
      if (dev) {
        spec.items.push(S('pnl:ac:uname', '🏷️', 'Username', 'Change the bot username everywhere', 'Change'));
        spec.items.push(S('pnl:ac:avatar', '🖼️', 'Avatar', 'Send a new profile picture', 'Upload'));
        spec.items.push(S('pnl:ac:bio', '📝', 'Bio', 'Change the bot "About Me"', 'Change'));
        spec.items.push(S('pnl:ac:status', '💬', 'Status', 'Change what the bot is playing or watching', 'Change'));
      }
      spec.items.push(S('pnl:p:img:dash', '🌄', 'Panel image', 'The image shown at the top of this panel', 'Set'));
      return spec;
    }

    case 'channels': {
      const key = a[0];
      spec.title = '#️⃣ Channels';
      spec.intro = Object.entries(CHANNEL_KEYS).map(([k, v]) => `**${k}:** ${chanText(cfg[v])}`).join('\n');
      spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:chkey').setPlaceholder(key ? `Editing: ${key}` : 'Choose a channel setting')
        .addOptions(Object.keys(CHANNEL_KEYS).map(k => ({ label: k, value: k, default: k === key })))));
      if (key && CHANNEL_KEYS[key]) {
        const types = key === 'statsforum' ? [ChannelType.GuildForum] : key === 'ticketcategory' ? [ChannelType.GuildCategory] : [ChannelType.GuildText, ChannelType.GuildAnnouncement];
        spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId(`pnl:chset:${key}`).setPlaceholder(`Pick the ${key} channel`).setChannelTypes(...types)));
      }
      return spec;
    }

    case 'roles': {
      const key = a[0]; // "list:staff" or "perm:polls"
      spec.title = '🎭 Roles';
      spec.intro = `Server owners and owner roles can always do everything.\nPick a list or an ability, then choose the roles that get it.`;
      const opts = [
        ...Object.keys(PNL_LISTS).map(k => ({ label: `List: ${k}`, value: `list:${k}`, description: PNL_LIST_LABEL[k].slice(0, 100), default: key === `list:${k}` })),
        ...Object.keys(ABILITIES).filter(k => !OWNER_ONLY.has(k)).map(k => ({ label: `Ability: ${k}`, value: `perm:${k}`, description: ABILITIES[k].slice(0, 100), default: key === `perm:${k}` })),
        { label: 'Autorole', value: 'auto:autorole', description: 'Give new members a role automatically', default: key === 'auto:autorole' }
      ];
      spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:rlkey').setPlaceholder(key ? `Editing: ${key.replace(':', ' ')}` : 'Choose what to edit').addOptions(opts)));
      if (key) {
        const [type, name] = key.split(':');
        if (type === 'auto') {
          const ar = cfg.autorole;
          const valid = Boolean(ar.roleId && guild.roles.cache.has(ar.roleId));
          const meR = guild.members.me;
          const cantGive = Boolean(valid && meR && (!meR.permissions.has(PermissionFlagsBits.ManageRoles) || guild.roles.cache.get(ar.roleId).comparePositionTo(meR.roles.highest) >= 0));
          spec.intro += `\n\n**Autorole** — ${ar.enabled ? '🟢 on' : '🔴 off'}\nRole: ${ar.roleId ? (valid ? `<@&${ar.roleId}>` : '_deleted or invalid, pick a new one_') : '_not set_'}\nNew members get this role when they join. Only one role can be set. Turning it off keeps your choice.`;
          if (cantGive) spec.intro += '\n⚠️ I cannot give that role: I need the **Manage Roles** permission and my role must be **above** it (Server Settings → Roles).';
          const rs2 = new RoleSelectMenuBuilder().setCustomId('pnl:arset').setPlaceholder('Select the autorole').setMinValues(1).setMaxValues(1);
          if (valid) rs2.setDefaultRoles(ar.roleId);
          spec.rows.push(row(rs2));
          spec.rows.push(row(btn('pnl:artg', ar.enabled ? 'Turn off' : 'Turn on', ar.enabled ? ButtonStyle.Danger : ButtonStyle.Success, ar.enabled ? '🔴' : '🟢')));
          return spec;
        }
        const cur = type === 'list' ? cfg[PNL_LISTS[name]] : cfg.perms[name];
        const ids = (cur || []).filter(id => guild.roles.cache.has(id));
        spec.intro += `\n\n**${type === 'list' ? PNL_LIST_LABEL[name] : `${name} — ${ABILITIES[name]}`}**\nNow: ${roleList(ids)}`;
        const rs = new RoleSelectMenuBuilder().setCustomId(`pnl:rlset:${type}:${name}`).setPlaceholder('Select the roles').setMinValues(0).setMaxValues(10);
        if (ids.length) rs.setDefaultRoles(...ids.slice(0, 10));
        spec.rows.push(row(rs));
      }
      return spec;
    }

    case 'toggles': {
      spec.title = '⏻ Toggles';
      for (const [k, v] of Object.entries(TOGGLE_KEYS)) {
        const on = Boolean(cfg[v]);
        spec.items.push(S(`pnl:tg:${k}`, on ? '🟢' : '🔴', k.charAt(0).toUpperCase() + k.slice(1), TOGGLE_DESC[k] || k, on ? 'On' : 'Off', on ? ButtonStyle.Success : ButtonStyle.Danger));
      }
      return spec;
    }

    case 'tickets': {
      spec.title = '🎫 Tickets';
      spec.intro = `Panel posted: ${cfg.ticketPanelChannelId ? `<#${cfg.ticketPanelChannelId}>` : '_not yet_'}\nTitle: **${fillVars(cfg.ticketPanel.title, guild)}**`;
      spec.items.push(S('pnl:tk:look', '🎨', 'Panel text & look', 'Title, emoji, extra text, footer and color', 'Edit'));
      spec.items.push(S('pnl:tk:look2', '🔽', 'Dropdown & thumbnail', 'Dropdown placeholder and the small picture', 'Edit'));
      spec.items.push(S('pnl:p:img:ticket', '🌄', 'Panel image', 'The big image on the ticket panel', 'Set'));
      spec.items.push(S('pnl:p:opts', '📋', 'Ticket options', 'Add, rename, reorder and remove options', 'Manage'));
      spec.items.push(S('pnl:p:tcat', '🗂️', 'Ticket categories', 'Choose the Discord category for each ticket type', 'Manage'));
      spec.items.push(S('pnl:tk:welcome', '💬', 'Welcome message', 'Shown when a ticket is opened', 'Edit'));
      spec.items.push(S('pnl:p:tpost', '📤', 'Post panel', 'Post or update the ticket panel message', 'Open'));
      return spec;
    }

    case 'opts': {
      const key = a[0];
      spec.title = '📋 Ticket options';
      spec.intro = cfg.ticketTypes.map((t, i) => `${i + 1}. ${t.emoji ? `${t.emoji} ` : ''}**${t.name}** \`${t.key}\``).join('\n') || '_no options yet_';
      spec.nav = [navBack('tickets'), NAV_CLOSE];
      if (cfg.ticketTypes.length) {
        spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:opsel').setPlaceholder(key ? `Selected: ${key}` : 'Select an option to edit')
          .addOptions(cfg.ticketTypes.slice(0, 25).map(t => ({ label: clip(t.name, 100), value: t.key, default: t.key === key })))));
      }
      if (key && cfg.ticketTypes.some(t => t.key === key)) {
        spec.rows.push(row(
          btn(`pnl:opedit:${key}`, 'Rename / emoji', ButtonStyle.Primary, '✏️'),
          btn(`pnl:opup:${key}`, 'Up', ButtonStyle.Secondary, '⬆️'),
          btn(`pnl:opdown:${key}`, 'Down', ButtonStyle.Secondary, '⬇️'),
          btn(`pnl:oprm:${key}`, 'Remove', ButtonStyle.Danger, '🗑️')
        ));
      }
      spec.items.push(S('pnl:opadd', '➕', 'Add option', 'Add a new ticket option', 'Add', ButtonStyle.Success));
      return spec;
    }

    case 'tpost': {
      spec.title = '📤 Post panel';
      spec.intro = `Now posted: ${cfg.ticketPanelChannelId ? `<#${cfg.ticketPanelChannelId}>` : '_not yet_'}\nChoose a channel to post a new panel. After that, every change edits the posted message automatically.`;
      spec.nav = [navBack('tickets'), NAV_CLOSE];
      spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId('pnl:tpostch').setPlaceholder('Post the ticket panel in...').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));
      spec.items.push(S('pnl:tk:refresh', '🔄', 'Update now', 'Re-edit the posted panel message', 'Refresh'));
      spec.items.push(S('pnl:tk:rmpanel', '🗑️', 'Remove panel', 'Delete the posted ticket panel from its channel', 'Remove', ButtonStyle.Danger));
      return spec;
    }

    case 'img': {
      const t = a[0] === 'ticket' ? 'ticket' : 'dash';
      const cur = t === 'ticket' ? cfg.ticketPanel : cfg.dash;
      spec.title = t === 'ticket' ? '🌄 Ticket panel image' : '🌄 Panel image';
      spec.intro = `Now: ${cur.bannerFile ? '**uploaded image**' : cur.bannerUrl ? `link ${cur.bannerUrl}` : '_no image_'}`;
      spec.nav = [navBack(t === 'ticket' ? 'tickets' : 'account'), NAV_CLOSE];
      if (t === 'ticket') spec.banner = false;
      spec.items.push(S(`pnl:im:set:${t}`, '🔗', 'Image link', 'Use a picture from a link', 'Set'));
      spec.items.push(S(`pnl:im:up:${t}`, '📤', 'Upload', 'Send a picture in this channel', 'Upload'));
      spec.items.push(S(`pnl:im:rm:${t}`, '🗑️', 'Remove', 'Remove the image', 'Remove', ButtonStyle.Danger));
      return spec;
    }

    case 'lb': {
      const L = lb();
      spec.title = '🏆 Leaderboard';
      spec.intro = `Channel: ${chanText(cfg.leaderboardChannelId)}\nTribes: **${Object.keys(db.tribes).length}**\nLook: title \`${clip(L.title, 40)}\` · color \`${L.color}\``;
      spec.items.push(S('pnl:ld:open', '👥', 'Tribes & points', 'Add, edit and remove tribes and points', 'Open'));
      spec.items.push(S('pnl:ld:exact', '🎯', 'Set exact points', 'Set a tribe to an exact total', 'Set'));
      spec.items.push(S('pnl:ld:hist', '📜', 'Point history', 'The latest point changes', 'View'));
      spec.items.push(S('pnl:ld:reward', '🪙', 'Cave rewards', 'Change the points a cave gives', 'Edit'));
      spec.items.push(S('pnl:ld:refresh', '🔄', 'Refresh board', 'Update the posted leaderboard now', 'Refresh'));
      spec.items.push(S('pnl:ld:reset', '♻️', 'Reset look', 'Back to the default leaderboard style', 'Reset', ButtonStyle.Danger));
      spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:lbsel').setPlaceholder('Edit how the leaderboard looks...')
        .addOptions(LB_FIELDS.map(f => ({ label: f, value: f, description: clip(String(L[f]), 100) })))));
      return spec;
    }

    case 'events': {
      spec.title = '🎉 Events';
      const polls = Object.values(db.polls).filter(p => !p.ended).length;
      const gws = Object.values(db.giveaways).filter(g => !g.ended && !g.cancelled).length;
      spec.intro = `Running polls: **${polls}** · Running giveaways: **${gws}**\nPolls and giveaways are posted in the channel where you open this panel.`;
      if (can(member, 'polls')) {
        spec.items.push(S('pnl:ev:pollnew', '📊', 'New poll', 'Create a poll with letter reactions', 'Create', ButtonStyle.Success));
        spec.items.push(S('pnl:p:polls', '🗳️', 'Manage polls', 'Close running polls', 'Manage'));
        spec.items.push(S('pnl:ev:pollemo', '🔤', 'Poll emojis', 'Change the A to E vote emojis', 'Edit'));
      }
      if (can(member, 'giveaways')) {
        spec.items.push(S('pnl:ev:gwnew', '🎁', 'New giveaway', 'Start a giveaway', 'Start', ButtonStyle.Success));
        spec.items.push(S('pnl:p:gws', '🏅', 'Manage giveaways', 'End, reroll or cancel', 'Manage'));
      }
      return spec;
    }

    case 'polls': {
      spec.title = '🗳️ Manage polls';
      spec.nav = [navBack('events'), NAV_CLOSE];
      const active = Object.entries(db.polls).filter(([, p]) => !p.ended).slice(0, 25);
      spec.intro = active.length ? active.map(([, p]) => `• **${clip(p.title, 60)}** — <#${p.channelId}> — ${p.endsAt ? `closes <t:${Math.floor(p.endsAt / 1000)}:R>` : 'manual close'}`).join('\n') : 'No running polls.';
      if (active.length) spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:pollsel').setPlaceholder('Select a poll to CLOSE it')
        .addOptions(active.map(([id, p]) => ({ label: clip(p.title, 100), value: id })))));
      return spec;
    }

    case 'gws': {
      const id = a[0];
      spec.title = '🏅 Manage giveaways';
      spec.nav = [navBack('events'), NAV_CLOSE];
      const all = Object.entries(db.giveaways).sort((x, y) => (x[1].ended - y[1].ended) || (y[1].endsAt - x[1].endsAt)).slice(0, 25);
      spec.intro = all.length ? all.map(([, g]) => `• **${clip(g.prize, 50)}** — ${g.cancelled ? 'cancelled' : g.ended ? 'ended' : `ends <t:${Math.floor(g.endsAt / 1000)}:R>`} — ${g.entries.length} entries`).join('\n') : 'No giveaways yet.';
      if (all.length) spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:gwsel').setPlaceholder(id ? 'Selected' : 'Select a giveaway')
        .addOptions(all.map(([gid, g]) => ({ label: clip(g.prize, 100), value: gid, description: g.cancelled ? 'Cancelled' : g.ended ? 'Ended' : 'Running', default: gid === id })))));
      const g = id ? db.giveaways[id] : null;
      if (g) {
        const btns = [];
        if (!g.ended && !g.cancelled) btns.push(btn(`pnl:gwact:end:${id}`, 'End now', ButtonStyle.Success, '🏁'), btn(`pnl:gwact:cancel:${id}`, 'Cancel', ButtonStyle.Danger, '🛑'));
        if (g.ended && !g.cancelled) btns.push(btn(`pnl:gwact:reroll:${id}`, 'Reroll', ButtonStyle.Primary, '🎲'));
        if (btns.length) spec.rows.push(row(...btns));
      }
      return spec;
    }

    case 'hype': {
      const h = cfg.hype;
      spec.title = '🔥 Hype Squad';
      spec.intro = `Name: ${h.name ? `\`${h.name}\`` : '_not set_'}\nRole: ${h.roleId ? `<@&${h.roleId}>` : '_not set_'} · Giveaways: ${chanText(h.giveawayChannelId)}\nMembers: **${h.members.length}/${h.limit}** · Posted: ${h.infoChannelId ? `<#${h.infoChannelId}>` : '_not yet_'}`;
      spec.items.push(S('pnl:hy:settings', '⚙️', 'Settings', 'Name, limit, title, perks and highlight line', 'Edit'));
      spec.items.push(S('pnl:hy:look', '🎨', 'Look', 'Emoji, color and banner of the info message', 'Edit'));
      spec.items.push(S('pnl:p:hsel', '🧩', 'Role & channels', 'Hype role, verify channel, giveaway channel', 'Open'));
      spec.items.push(S('pnl:p:hpost', '📤', 'Info message', 'Post or update the info message', 'Open'));
      spec.items.push(S('pnl:p:hmem', '👥', 'Members', 'See and remove members', 'Open'));
      return spec;
    }

    case 'hsel': {
      const key = a[0];
      spec.title = '🧩 Hype role & channels';
      spec.nav = [navBack('hype'), NAV_CLOSE];
      spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:hkey').setPlaceholder(key ? `Editing: ${key}` : 'Choose what to set').addOptions([
        { label: 'Hype Squad role', value: 'role', default: key === 'role' },
        { label: 'Exclusive giveaway channel', value: 'gchan', default: key === 'gchan' }
      ])));
      if (key === 'role') spec.rows.push(row(new RoleSelectMenuBuilder().setCustomId('pnl:hset:role').setPlaceholder('Select the Hype Squad role').setMinValues(1).setMaxValues(1)));
      else if (key === 'gchan') spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId(`pnl:hset:${key}`).setPlaceholder('Select the channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));
      return spec;
    }

    case 'hpost': {
      spec.title = '📤 Hype Squad info message';
      spec.nav = [navBack('hype'), NAV_CLOSE];
      spec.intro = `Posted: ${cfg.hype.infoChannelId ? `<#${cfg.hype.infoChannelId}>` : '_not yet_'}\nNeeds a name and a role first. Members get the role automatically when they set the name, and the counter updates by itself.`;
      spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId('pnl:hpostch').setPlaceholder('Post the info message in...').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));
      spec.items.push(S('pnl:hy:refresh', '🔄', 'Update now', 'Re-edit the posted info message', 'Refresh'));
      spec.items.push(S('pnl:hy:rmpost', '🗑️', 'Remove message', 'Delete the posted info message from its channel', 'Remove', ButtonStyle.Danger));
      return spec;
    }

    case 'hmem': {
      const h = cfg.hype;
      spec.title = '👥 Hype Squad members';
      spec.nav = [navBack('hype'), NAV_CLOSE];
      spec.intro = `**${h.members.length}/${h.limit}**\n${h.members.slice(0, 40).map(id => `<@${id}>`).join(' ') || '_nobody yet_'}`;
      spec.rows.push(row(new UserSelectMenuBuilder().setCustomId('pnl:hkick').setPlaceholder('Select someone to remove').setMinValues(1).setMaxValues(1)));
      return spec;
    }

    case 'wipe': {
      const w = cfg.wipe;
      const ms = w.at ? Date.parse(w.at) : NaN;
      spec.title = '🗓️ Wipe & Season';
      spec.intro = `Next wipe: ${Number.isFinite(ms) && ms > Date.now() ? `<t:${Math.floor(ms / 1000)}:F> (<t:${Math.floor(ms / 1000)}:R>)` : '_none scheduled_'}`;
      if (can(member, 'wipe')) {
        spec.items.push(S('pnl:wp:set', '📅', 'Set wipe date', 'Month, day, time and timezone', 'Set'));
        spec.items.push(S('pnl:wp:msg', '💬', 'Wipe message', 'The text shown with !wipe', 'Edit'));
        spec.items.push(S('pnl:wp:prev', '👁️', 'Preview', 'See what !wipe shows', 'View'));
        spec.items.push(S('pnl:wp:clear', '🧹', 'Clear wipe', 'Remove the scheduled wipe', 'Clear', ButtonStyle.Danger));
      }
      if (can(member, 'season')) spec.items.push(S('pnl:wp:season', '⚠️', 'End season', 'Deletes the WHOLE leaderboard', 'End', ButtonStyle.Danger));
      return spec;
    }

    case 'eco': {
      spec.title = '💳 Economy';
      spec.intro = 'Credits and mystery boxes. Players use the buttons on the mystery box message.';
      spec.items.push(S('pnl:dn:open', '💳', 'Credits & boxes', 'Give or remove credit, manage prizes and boxes', 'Open'));
      spec.items.push(S('pnl:p:mbpost', '🎁', 'Mystery box message', 'Post the Open / Balance buttons for players', 'Open'));
      spec.items.push(S('pnl:p:channels:creditaddlog', '➕', 'Credit Add Log', 'Channel where added credit is logged', 'Set'));
      spec.items.push(S('pnl:p:channels:creditremovelog', '➖', 'Credit Remove Log', 'Channel where removed credit is logged', 'Set'));
      return spec;
    }

    case 'mbpost': {
      spec.title = '🎁 Mystery box message';
      spec.nav = [navBack('eco'), NAV_CLOSE];
      spec.intro = 'Choose a channel. Players get an **Open Mystery Box** and a **Check Balance** button.';
      spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId('pnl:mbpostch').setPlaceholder('Post it in...').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));
      spec.items.push(S('pnl:mbrm', '🗑️', 'Remove message', 'Delete the last mystery box message I posted', 'Remove', ButtonStyle.Danger));
      return spec;
    }

    case 'tcat': {
      const key = a[0];
      spec.title = '🗂️ Ticket categories';
      spec.nav = [navBack('tickets'), NAV_CLOSE];
      const catName = id => { const ch = id ? guild.channels.cache.get(id) : null; return ch?.type === ChannelType.GuildCategory ? ch.name : null; };
      const lines = cfg.ticketTypes.map(t => {
        const n = catName(cfg.ticketCategoryMap[t.key]);
        return `${t.emoji ? `${t.emoji} ` : ''}**${t.name}** → ${n ? `**${n}**` : (cfg.ticketAutoRoute ? '_auto (matched by name)_' : '_fallback_')}`;
      });
      const fb = catName(cfg.ticketCategoryId);
      spec.intro = `${lines.join('\n') || '_no ticket options yet_'}\n\nFallback: ${fb ? `**${fb}**` : '_not set (Channels → ticketcategory)_'}`;
      if (cfg.ticketTypes.length) {
        spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:tcsel').setPlaceholder(key ? `Selected: ${key}` : 'Choose a ticket type')
          .addOptions(cfg.ticketTypes.slice(0, 25).map(t => ({ label: clip(t.name, 100), value: t.key, default: t.key === key })))));
      }
      const sel = key ? cfg.ticketTypes.find(t => t.key === key) : null;
      if (sel) {
        spec.rows.push(row(new ChannelSelectMenuBuilder().setCustomId(`pnl:tcset:${sel.key}`).setPlaceholder(`Category for ${clip(sel.name, 60)}`).setChannelTypes(ChannelType.GuildCategory)));
        if (cfg.ticketCategoryMap[sel.key]) spec.rows.push(row(btn(`pnl:tcclear:${sel.key}`, 'Use auto / fallback', ButtonStyle.Secondary, '🧹')));
      }
      spec.items.push(S('pnl:tcauto', cfg.ticketAutoRoute ? '🟢' : '🔴', 'Auto-match by name', 'With no category chosen, match the ticket name (e.g. Mesh) to a category', cfg.ticketAutoRoute ? 'On' : 'Off', cfg.ticketAutoRoute ? ButtonStyle.Success : ButtonStyle.Danger));
      return spec;
    }

    case 'pay': {
      const rows = Object.entries(db.staff).map(([id, s]) => ({ id, pay: payBreakdown(s) })).filter(x => x.pay.total > 0).sort((x, y) => y.pay.total - x.pay.total);
      const owed = rows.reduce((n, x) => n + x.pay.total, 0);
      spec.title = '💶 Staff Pay';
      spec.intro = `Total owed right now: **€${owed.toFixed(2)}**\n${rows.slice(0, 15).map(x => `• <@${x.id}> — **€${x.pay.total.toFixed(2)}**`).join('\n') || '_Nobody is owed anything._'}`;
      spec.intro = `Ticket payment: **$${Number(cfg.ticketPrice).toFixed(2)}** per ticket\n${spec.intro}`;
      spec.items.push(S('pnl:p:paym', '💶', 'Staff & payments', 'See what each staff member is owed and mark them as paid', 'Open'));
      spec.items.push(S('pnl:p:payc', '🏷️', 'Categories & rates', 'Create pay categories and set the rate per claim', 'Manage'));
      spec.items.push(S('pnl:p:payh', '📜', 'Payment history', 'The latest payments', 'View'));
      spec.items.push(S('pnl:tp:set', '💵', 'Ticket payment', 'Set the payment per ticket (default $5.00)', 'Change'));
      return spec;
    }

    case 'payc': {
      const key = a[0];
      const list = cfg.staffPay.categories;
      spec.title = '🏷️ Pay categories';
      spec.nav = [navBack('pay'), NAV_CLOSE];
      spec.intro = list.map(x => `**${x.name}** — €${Number(x.rate).toFixed(2)} per claim${x.isDefault ? ' _(default)_' : ''}\n↳ ${x.typeKeys.length ? x.typeKeys.map(k => `\`${k}\``).join(', ') : (x.isDefault ? '_all other ticket types_' : '_no ticket types yet_')}`).join('\n');
      spec.intro += `\n\nTicket type keys: ${cfg.ticketTypes.map(t => `\`${t.key}\``).join(', ') || '_none_'}`;
      if (list.length) {
        spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:pcsel').setPlaceholder(key ? 'Selected - pick another' : 'Select a category to edit')
          .addOptions(list.slice(0, 25).map(x => ({ label: clip(x.name, 100), value: x.id, description: `€${Number(x.rate).toFixed(2)} per claim`, default: x.id === key })))));
      }
      if (key && list.some(x => x.id === key)) {
        spec.rows.push(row(btn(`pnl:pcedit:${key}`, 'Edit', ButtonStyle.Primary, '✏️'), btn(`pnl:pcrm:${key}`, 'Remove', ButtonStyle.Danger, '🗑️')));
      }
      spec.items.push(S('pnl:pcadd', '➕', 'Add category', 'Create a pay category with its own rate', 'Add', ButtonStyle.Success));
      return spec;
    }

    case 'paym': {
      const uid = a[0];
      const confirm = a[1] === 'c';
      spec.title = '💶 Staff & payments';
      spec.nav = [navBack('pay'), NAV_CLOSE];
      const staffIds = Object.keys(db.staff);
      const labelOf = id => guild.members.cache.get(id)?.displayName || id;
      if (staffIds.length) {
        const opts = staffIds.map(id => ({ id, owed: payBreakdown(db.staff[id]).total })).sort((x, y) => y.owed - x.owed).slice(0, 25)
          .map(x => ({ label: clip(labelOf(x.id), 100), value: x.id, description: `€${x.owed.toFixed(2)} owed`, default: x.id === uid }));
        spec.rows.push(row(new StringSelectMenuBuilder().setCustomId('pnl:pmsel').setPlaceholder(uid ? 'Choose another staff member' : 'Choose a staff member').addOptions(opts)));
      }
      const s = uid ? db.staff[uid] : null;
      if (!s) {
        spec.intro = staffIds.length ? 'Choose a staff member to see what they are owed.' : 'No staff activity yet. Staff appear here after their first claim.';
        return spec;
      }
      const pay = payBreakdown(s);
      const last = s.payments[0];
      spec.intro = `<@${uid}>\n${pay.lines.map(l => `• ${l.name}: ${l.count} × €${l.rate.toFixed(2)} = **€${l.total.toFixed(2)}**`).join('\n') || '_No unpaid claims._'}\n**Owed: €${pay.total.toFixed(2)}**\nClaimed: ${s.claimed} · Closed: ${s.closed}${last ? `\nLast paid: <t:${Math.floor(Date.parse(last.at) / 1000)}:d> (€${Number(last.total).toFixed(2)})` : ''}`;
      if (confirm) {
        spec.notice = `Mark this staff member as paid? Their pay period resets to zero. History is kept.`;
        spec.rows.push(row(btn(`pnl:pmdo:${uid}`, 'Yes, mark as paid', ButtonStyle.Danger, '✅'), btn(`pnl:p:paym:${uid}`, 'Cancel')));
      } else if (pay.total > 0) {
        spec.rows.push(row(btn(`pnl:pmpay:${uid}`, 'Mark as Paid', ButtonStyle.Success, '✅')));
      }
      return spec;
    }

    case 'payh': {
      spec.title = '📜 Payment history';
      spec.nav = [navBack('pay'), NAV_CLOSE];
      const all = Object.entries(db.staff).flatMap(([id, s]) => (s.payments || []).map(p => ({ id, ...p }))).sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 12);
      spec.intro = all.map(p => `• <t:${Math.floor(Date.parse(p.at) / 1000)}:d> — <@${p.id}> — **€${Number(p.total).toFixed(2)}** (by <@${p.by}>)`).join('\n') || '_No payments recorded yet._';
      return spec;
    }

    default:
      return buildPage('main', [], c);
  }
}

// which ability a page / action needs
function pageAllowed(kind, a, member) {
  switch (kind) {
    case 'main': return true;
    case 'account': return can(member, 'botprofile');
    case 'channels': case 'roles': case 'toggles': return can(member, 'config');
    case 'tickets': case 'opts': case 'tpost': return can(member, 'panel');
    case 'img': return a[0] === 'ticket' ? can(member, 'panel') : can(member, 'botprofile');
    case 'lb': return can(member, 'leaderboard');
    case 'events': return can(member, 'polls') || can(member, 'giveaways');
    case 'polls': return can(member, 'polls');
    case 'gws': return can(member, 'giveaways');
    case 'hype': case 'hsel': case 'hpost': case 'hmem': return can(member, 'hype');
    case 'wipe': return can(member, 'wipe') || can(member, 'season');
    case 'eco': case 'mbpost': return can(member, 'dono');
    case 'tcat': return can(member, 'panel');
    case 'pay': case 'payc': case 'paym': case 'payh': return can(member, 'staffpay');
    default: return false;
  }
}
const ACTION_ABILITY = {
  ac: 'botprofile', nick: 'botprofile', uname: 'botprofile', bio: 'botprofile', status: 'botprofile',
  chkey: 'config', chset: 'config', rlkey: 'config', rlset: 'config', tg: 'config',
  tk: 'panel', opsel: 'panel', opadd: 'panel', opedit: 'panel', opup: 'panel', opdown: 'panel', oprm: 'panel', tpostch: 'panel', tpanel: 'panel', tpanel2: 'panel', welcome: 'panel',
  ld: 'leaderboard', lbsel: 'leaderboard', exact: 'leaderboard', reward: 'leaderboard', lbfield: 'leaderboard',
  pollsel: 'polls', pollnew: 'polls', pollemo: 'polls', gwsel: 'giveaways', gwact: 'giveaways', gwnew: 'giveaways',
  hy: 'hype', hkey: 'hype', hset: 'hype', hpostch: 'hype', hkick: 'hype', hsettings: 'hype', hlook: 'hype',
  wp: 'wipe', wset: 'wipe', wmsg: 'wipe',
  dn: 'dono', mbpostch: 'dono',
  arset: 'config', artg: 'config',
  tcsel: 'panel', tcset: 'panel', tcclear: 'panel', tcauto: 'panel',
  pcsel: 'staffpay', pcadd: 'staffpay', pcedit: 'staffpay', pcrm: 'staffpay', pmsel: 'staffpay', pmpay: 'staffpay', pmdo: 'staffpay', tp: 'staffpay', tprice: 'staffpay', mbrm: 'dono'
};

// ---------- actions shared by the dashboard ----------
async function createPoll(guild, chn, { title, options, dur, single, userId }) {
  const p = {
    channelId: chn.id, title: title.trim().toUpperCase(), options, emojis: db.config.pollEmojis.slice(0, options.length),
    single, endsAt: dur ? Date.now() + dur : null, ended: false, createdBy: userId
  };
  let msg;
  try {
    msg = await (guild.channels.cache.get(chn.id) || chn).send({ embeds: [pollEmbed(p)] });
    for (const e of p.emojis) await msg.react(e);
  } catch {
    return { error: `I could not post or react in <#${chn.id}>. Check my permissions (Send Messages, Add Reactions, Use External Emojis).` };
  }
  db.polls[msg.id] = p;
  saveDB();
  addAudit(guild.id, userId, 'poll_created', { messageId: msg.id, title: p.title });
  return { ok: true };
}

async function startGiveaway(guild, chn, { prize, dur, winners, credit, hypeOnly, userId }) {
  if (hypeOnly && !db.config.hype.roleId) return { error: 'Set the Hype Squad role first (Hype Squad → Role & channels).' };
  const g = { channelId: chn.id, prize, winners, hostId: userId, endsAt: Date.now() + dur, hypeOnly, credit, entries: [], ended: false, cancelled: false, winnersList: [] };
  let msg;
  try {
    msg = await (guild.channels.cache.get(chn.id) || chn).send({ embeds: [giveawayEmbed(g)], components: giveawayRows() });
  } catch {
    return { error: `I can't post in <#${chn.id}>. Check my permissions there.` };
  }
  db.giveaways[msg.id] = g;
  saveDB();
  addAudit(guild.id, userId, 'giveaway_started', { messageId: msg.id, prize });
  return { ok: true };
}

async function cancelGiveaway(guild, id) {
  const g = db.giveaways[id];
  if (!g || g.ended || g.cancelled) return false;
  g.cancelled = true;
  saveDB();
  const ch = guild.channels.cache.get(g.channelId);
  const msg = ch?.isTextBased() ? await ch.messages.fetch(id).catch(() => null) : null;
  if (msg) await msg.edit({ embeds: [giveawayEmbed({ ...g, ended: true })], components: giveawayRows(true) }).catch(() => {});
  return true;
}

function scheduleWipe(mo, day, timeStr, tz, givenYear) {
  const t = parseTime(timeStr);
  if (!t) return { error: 'I could not read that time. Try `9pm`, `9:30 PM` or `21:00`.' };
  if (!validTz(tz)) return { error: 'Unknown timezone. Use a name like `America/New_York` or `Europe/Amsterdam`.' };
  if (!Number.isInteger(mo) || mo < 1 || mo > 12 || !Number.isInteger(day) || day < 1 || day > 31) return { error: 'Month must be 1-12 and day 1-31.' };
  const now = Date.now();
  const cy = new Date().getUTCFullYear();
  const years = givenYear ? [givenYear] : [cy, cy + 1, cy + 2, cy + 3, cy + 4];
  for (const y of years) {
    const chk = new Date(Date.UTC(y, mo - 1, day));
    if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== day) continue;
    const v = zonedToUtcMs(y, mo, day, t.h, t.mi, tz);
    if (givenYear || v > now) return { ms: v };
  }
  return { error: 'That date does not exist.' };
}

async function readImage(att) {
  const type = String(att.contentType || '').split(';')[0].toLowerCase();
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type];
  if (!ext) return { error: 'That is not a PNG/JPG/GIF/WEBP image.' };
  try {
    const res = await fetch(att.url);
    if (!res.ok) return { error: 'Could not download that image.' };
    return { ext, buf: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return { error: 'Could not download that image.' };
  }
}

// a staff member pressed "Upload" and then sent a picture in the same channel
async function handleUpload(message, pu, att) {
  const guild = message.guild;
  pendingUploads.delete(`${guild.id}:${message.author.id}`);
  let notice;
  try {
    const uploader = message.member || pu.member;
    // permission is checked again when the picture arrives, not only when the button was pressed
    const allowed = pu.target === 'ticket' ? can(uploader, 'panel') : can(uploader, 'botprofile');
    if (!allowed) {
      notice = 'You do not have permission for that.';
    } else if (att.size > 8 * 1024 * 1024) {
      notice = 'That image is too big (maximum 8 MB).';
    } else {
      const r = await readImage(att);
      if (r.error) {
        notice = r.error;
      } else if (pu.target === 'avatar') {
        try {
          await client.user.setAvatar(r.buf);
          notice = 'Avatar updated.';
        } catch (e) {
          console.error('Avatar change failed:', e);
          notice = `Discord rejected that: ${clip(e.message, 150)} (Discord only allows a few avatar changes per hour.)`;
        }
        await guild.members.fetchMe().catch(() => {});
        await refreshPanel(guild).catch(() => {});
      } else {
        const cfg = pu.target === 'ticket' ? db.config.ticketPanel : db.config.dash;
        const name = `${guild.id}-${pu.target}.${r.ext}`;
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(path.join(DATA_DIR, name), r.buf);
        if (cfg.bannerFile && cfg.bannerFile !== name) { try { fs.unlinkSync(path.join(DATA_DIR, cfg.bannerFile)); } catch {} }
        cfg.bannerFile = name;
        cfg.bannerUrl = '';
        saveDB();
        if (pu.target === 'ticket') await refreshPanel(guild).catch(() => {});
        notice = 'Image saved.';
      }
    }
  } catch (e) {
    console.error('Image change failed:', e);
    notice = `Something went wrong: ${clip(e.message, 150)}`;
  }
  await message.delete().catch(() => {});
  try {
    const c = { member: pu.member, guild, user: pu.user, notice };
    const spec = pu.target === 'avatar' ? buildPage('account', [], c) : buildPage('img', [pu.target], c);
    await editPage(pu.interaction, spec);
  } catch (e) {
    console.error('Could not refresh the panel after the image change:', e.message);
  }
}


// ---------- the dashboard router (every button, menu and form that starts with pnl) ----------
async function handlePanel(interaction) {
  const guild = interaction.guild, member = interaction.member, user = interaction.user;
  const isModal = interaction.isModalSubmit();
  const parts = interaction.customId.split(':');
  const token = parts[1];
  const args = parts.slice(2);
  const mk = notice => ({ member, guild, user, notice });
  const show = (kind, a = [], notice) => showPage(interaction, buildPage(kind, a, mk(notice)));
  const deny = () => interaction.reply({ content: 'You do not have permission for that.', ephemeral: true });
  const val = k => (interaction.fields?.getTextInputValue(k) ?? '').trim();
  const yes = s => /^(y|yes|true|1|on)$/i.test(String(s).trim());
  const dev = guild.id === GUILD_ID || isControl(guild.id) || isBotOwner(user, guild);
  const cfg = db.config;
  const T = TextInputStyle;

  // ----- close, page navigation, embed creator -----
  if (!isModal && token === 'close') {
    return showPage(interaction, { title: 'Panel closed', intro: 'Run `/panel` to open it again.', banner: false, items: [], rows: [], nav: [] });
  }
  if (!isModal && token === 'p') {
    const kind = parts[2], a = parts.slice(3);
    if (!pageAllowed(kind, a, member)) return deny();
    return show(kind, a);
  }
  if (!isModal && token === 'emb') {
    if (!canUseEmbedCreator(member)) return deny();
    const d = newDraft();
    embedDrafts.set(user.id, d);
    return interaction.reply({ ...embedCreatorPanel(d), ephemeral: true });
  }

  // ----- permission for everything else -----
  let need = ACTION_ABILITY[token];
  if (token === 'im') need = args[1] === 'ticket' ? 'panel' : 'botprofile';
  if (token === 'imgurl') need = args[0] === 'ticket' ? 'panel' : 'botprofile';
  if (token === 'ev') need = args[0] === 'gwnew' ? 'giveaways' : 'polls';
  if (token === 'wp' && args[0] === 'season') need = 'season';
  if (!need || !can(member, need)) return deny();

  // ================= FORMS (modal submits) =================
  if (isModal) {
    switch (token) {
      case 'nick': {
        try { await guild.members.me.setNickname(val('value') || null); } catch (e) { return show('account', [], `Discord rejected that: ${clip(e.message, 120)}`); }
        await guild.members.fetchMe().catch(() => {});
        addAudit(guild.id, user.id, 'bot_nickname', { value: val('value') });
        const ok = await refreshPanel(guild);
        await refreshHypePost(guild);
        return show('account', [], `Nickname updated.${ok ? ' Ticket panel updated too.' : ''}`);
      }
      case 'uname': {
        if (!dev) return deny();
        try { await client.user.setUsername(val('value')); } catch (e) { return show('account', [], `Discord rejected that: ${clip(e.message, 120)}`); }
        await guild.members.fetchMe().catch(() => {});
        await refreshPanel(guild);
        return show('account', [], 'Username updated.');
      }
      case 'bio': {
        if (!dev) return deny();
        const bio = val('value').replace(/\\n/g, '\n');
        try { await client.application.edit({ description: bio }); } catch (e) { return show('account', [], `Discord rejected that: ${clip(e.message, 120)}`); }
        root.botBio = bio;
        saveDB();
        await refreshPanel(guild);
        return show('account', [], 'Bio updated.');
      }
      case 'status': {
        if (!dev) return deny();
        const type = ['Playing', 'Watching', 'Listening', 'Competing'].find(x => x.toLowerCase() === val('type').toLowerCase());
        if (!type || !val('text')) return show('account', [], 'Type must be Playing, Watching, Listening or Competing, and the text cannot be empty.');
        root.botStatus = { type, text: val('text').slice(0, 100) };
        saveDB();
        applyStatus();
        return show('account', [], 'Status updated.');
      }
      case 'tpanel': {
        const p = cfg.ticketPanel;
        if (!val('title')) return show('tickets', [], 'The title cannot be empty.');
        if (val('emoji') && !validEmoji(val('emoji'))) return show('tickets', [], 'That is not a valid emoji.');
        if (val('color') && !/^#?[0-9a-f]{6}$/i.test(val('color'))) return show('tickets', [], 'Color must be hex like #ff0000.');
        p.title = val('title').slice(0, 200);
        p.titleEmoji = val('emoji');
        p.description = val('description').slice(0, 1000);
        p.footer = val('footer').slice(0, 200);
        if (val('color')) p.color = val('color').startsWith('#') ? val('color') : `#${val('color')}`;
        saveDB();
        addAudit(guild.id, user.id, 'panel_look', {});
        const ok = await refreshPanel(guild);
        return show('tickets', [], `Saved.${ok ? ' The posted panel was updated.' : ''}`);
      }
      case 'tpanel2': {
        const p = cfg.ticketPanel;
        const th = val('thumbnail');
        if (th && th !== 'avatar' && th !== 'none' && !isUrl(th)) return show('tickets', [], 'Thumbnail must be `avatar`, `none` or an image link.');
        p.placeholder = (val('placeholder') || 'Choose a ticket type').slice(0, 150);
        p.thumbnail = th || 'avatar';
        saveDB();
        const ok = await refreshPanel(guild);
        return show('tickets', [], `Saved.${ok ? ' The posted panel was updated.' : ''}`);
      }
      case 'welcome': {
        if (!val('message')) return show('tickets', [], 'The message cannot be empty.');
        cfg.ticketWelcomeMessage = val('message').slice(0, 1500);
        saveDB();
        return show('tickets', [], 'Welcome message saved. ({bot} becomes the bot name.)');
      }
      case 'opadd': {
        const key = val('key').toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const name = val('name');
        const emoji = val('emoji');
        if (!key || !name) return show('opts', [], 'Name and key are required.');
        if (cfg.ticketTypes.some(t => t.key === key)) return show('opts', [], 'That key already exists.');
        if (cfg.ticketTypes.length >= 25) return show('opts', [], 'Maximum 25 options.');
        if (emoji && !validEmoji(emoji)) return show('opts', [], 'That is not a valid emoji.');
        cfg.ticketTypes.push({ key, name, emoji });
        saveDB();
        await refreshPanel(guild);
        return show('opts', [key], `Added **${name}**.`);
      }
      case 'opedit': {
        const t = cfg.ticketTypes.find(x => x.key === args[0]);
        if (!t) return show('opts', [], 'Option not found.');
        if (val('name')) t.name = val('name').slice(0, 80);
        if (val('emoji')) {
          if (val('emoji').toLowerCase() === 'none') t.emoji = '';
          else if (!validEmoji(val('emoji'))) return show('opts', [t.key], 'That is not a valid emoji.');
          else t.emoji = val('emoji');
        }
        saveDB();
        await refreshPanel(guild);
        return show('opts', [t.key], 'Option updated.');
      }
      case 'imgurl': {
        const t = args[0] === 'ticket' ? 'ticket' : 'dash';
        const url = val('url');
        if (!isUrl(url)) return show('img', [t], 'That is not a valid image link.');
        const c2 = t === 'ticket' ? cfg.ticketPanel : cfg.dash;
        if (c2.bannerFile) { try { fs.unlinkSync(path.join(DATA_DIR, c2.bannerFile)); } catch {} }
        c2.bannerFile = '';
        c2.bannerUrl = url;
        saveDB();
        if (t === 'ticket') await refreshPanel(guild);
        return show('img', [t], 'Image saved.');
      }
      case 'exact': {
        const tribe = tribeByName(val('tribe'));
        const points = parseInt(val('points'), 10);
        if (!tribe) return show('lb', [], `Tribe **${clip(val('tribe'), 40)}** was not found.`);
        if (!Number.isFinite(points) || points < 0) return show('lb', [], 'Points must be a number of 0 or more.');
        const before = tribe.points;
        tribe.points = points;
        tribe.updatedAt = stamp();
        saveDB();
        addPointHistory(user.id, 'set_exact_points', { tribeId: tribe.id, tribe: tribe.name, before, after: points });
        addAudit(guild.id, user.id, 'set_exact_points', { tribe: tribe.name, before, after: points });
        await sendBackup(guild, `Exact points set for ${tribe.name}`);
        await refreshLeaderboard(guild);
        await logPoints(guild, `📊 **set_exact_points**\nTribe: **${tribe.name}**\n${before} → **${points}**\nBy: ${user}`);
        return show('lb', [], `**${tribe.name}** is now at **${points}** points (was ${before}).`);
      }
      case 'reward': {
        const map = Object.keys(cfg.rewardValues).find(m => m.toLowerCase() === val('map').toLowerCase());
        const base = parseInt(val('base'), 10), raid = parseInt(val('raid'), 10);
        const fixed = val('fixed') === '' ? null : parseInt(val('fixed'), 10);
        if (!map) return show('lb', [], `Unknown map. Use one of: ${Object.keys(cfg.rewardValues).join(', ')}`.slice(0, 300));
        if (!val('cave') || !Number.isFinite(base) || !Number.isFinite(raid) || base < 0 || raid < 0) return show('lb', [], 'Cave name, base and raid are required (numbers of 0 or more).');
        cfg.rewardValues[map][val('cave')] = { base, raid, ...(fixed !== null && Number.isFinite(fixed) ? { fixed } : {}) };
        saveDB();
        addAudit(guild.id, user.id, 'reward_set', { map, cave: val('cave') });
        return show('lb', [], `**${map} / ${val('cave')}** saved.`);
      }
      case 'lbfield': {
        const field = args[0];
        if (!LB_FIELDS.includes(field)) return show('lb', [], 'Unknown field.');
        let v = val('value').replace(/\\n/g, '\n');
        if (!v) return show('lb', [], 'Give a value.');
        if (field === 'color' && !/^#?[0-9a-f]{6}$/i.test(v)) return show('lb', [], 'Color must be hex like #2ecc71.');
        if (field === 'max') { v = Number(v); if (!Number.isInteger(v) || v < 1 || v > 25) return show('lb', [], 'Max must be 1-25.'); }
        cfg.lb = { ...(cfg.lb || {}), [field]: v };
        saveDB();
        await refreshLeaderboard(guild);
        return show('lb', [], `Leaderboard **${field}** updated.`);
      }
      case 'pollnew': {
        const options = val('options').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5).map(s => s.slice(0, 100).toUpperCase());
        if (options.length < 2) return show('events', [], 'A poll needs at least 2 options (one per line).');
        const dur = val('duration') ? parseDuration(val('duration')) : null;
        if (val('duration') && !dur) return show('events', [], 'Duration must look like `30m`, `12h` or `2d`.');
        const chn = (/^\d{17,20}$/.test(val('channel')) && guild.channels.cache.get(val('channel'))) || interaction.channel;
        if (!chn?.isTextBased()) return show('events', [], 'Pick a text channel.');
        const r = await createPoll(guild, chn, { title: val('title'), options, dur, single: yes(val('single')), userId: user.id });
        return show('events', [], r.error || `Poll posted in <#${chn.id}>.`);
      }
      case 'pollemo': {
        const list = ['a', 'b', 'c', 'd', 'e'].map(k => val(k));
        if (list.some(e => !validEmoji(e))) return show('events', [], 'One of those is not a valid emoji. For a custom emoji, paste it like <:name:123456789>.');
        if (new Set(list).size !== 5) return show('events', [], 'Use 5 different emojis.');
        cfg.pollEmojis = list;
        saveDB();
        return show('events', [], `Poll emojis updated: ${list.join(' ')} (new polls only).`);
      }
      case 'gwnew': {
        const dur = parseDuration(val('duration'));
        if (!dur) return show('events', [], 'Duration must look like `30m`, `12h` or `2d`.');
        const winners = val('winners') ? parseInt(val('winners'), 10) : 1;
        const credit = val('credit') ? Number(val('credit')) : 0;
        if (!val('prize')) return show('events', [], 'The prize cannot be empty.');
        if (!Number.isInteger(winners) || winners < 1 || winners > 20) return show('events', [], 'Winners must be 1-20.');
        if (!Number.isFinite(credit) || credit < 0) return show('events', [], 'Credit must be a number of 0 or more.');
        const r = await startGiveaway(guild, interaction.channel, { prize: val('prize'), dur, winners, credit, hypeOnly: yes(val('hype')), userId: user.id });
        return show('events', [], r.error || `Giveaway started in <#${interaction.channelId}>.`);
      }
      case 'hsettings': {
        const h = cfg.hype;
        if (val('name')) { h.name = val('name').slice(0, 32); h.strictName = strictName(h.name); }
        if (val('limit')) {
          const n = parseInt(val('limit'), 10);
          if (!Number.isInteger(n) || n < 1 || n > 10000) return show('hype', [], 'Limit must be 1-10000.');
          h.limit = n;
        }
        if (val('title')) h.title = val('title').slice(0, 200);
        if (val('perks')) h.perks = val('perks').replace(/\\n/g, '\n').slice(0, 500);
        if (val('highlight')) h.highlight = val('highlight').toLowerCase() === 'none' ? '' : val('highlight').slice(0, 100);
        saveDB();
        const ok = await refreshHypePost(guild);
        return show('hype', [], `Saved.${ok ? ' The info message was updated.' : ''}${val('name') ? ' Members must copy-paste the name (it uses lookalike letters).' : ''}`);
      }
      case 'hlook': {
        const h = cfg.hype;
        const em = val('emoji'), col = val('color'), ban = val('banner');
        if (em && em.toLowerCase() !== 'none' && !validEmoji(em)) return show('hype', [], 'That is not a valid emoji.');
        if (col && !/^#?[0-9a-f]{6}$/i.test(col)) return show('hype', [], 'Color must be hex like #e67e22.');
        if (ban && ban.toLowerCase() !== 'none' && !isUrl(ban)) return show('hype', [], 'The banner must be an image link (or `none`).');
        if (em) h.emoji = em.toLowerCase() === 'none' ? '' : em;
        if (col) h.color = col.startsWith('#') ? col : `#${col}`;
        if (ban) h.bannerUrl = ban.toLowerCase() === 'none' ? '' : ban;
        saveDB();
        const ok = await refreshHypePost(guild);
        return show('hype', [], `Saved.${ok ? ' The info message was updated.' : ''}`);
      }
      case 'wset': {
        const r = scheduleWipe(parseInt(val('month'), 10), parseInt(val('day'), 10), val('time'), val('timezone') || 'UTC', val('year') ? parseInt(val('year'), 10) : null);
        if (r.error) return show('wipe', [], r.error);
        cfg.wipe.at = new Date(r.ms).toISOString();
        cfg.wipe.tz = val('timezone') || 'UTC';
        saveDB();
        addAudit(guild.id, user.id, 'wipe_set', { at: cfg.wipe.at });
        return show('wipe', [], `Wipe scheduled for <t:${Math.floor(r.ms / 1000)}:F>.`);
      }
      case 'tprice': {
        const price = Number(val('price').replace(',', '.').replace('$', ''));
        if (!Number.isFinite(price) || price < 0 || price > 1000000) return show('pay', [], 'The payment must be a number of 0 or more, like 5.00.');
        const was = cfg.ticketPrice;
        cfg.ticketPrice = Math.round(price * 100) / 100;
        saveDB();
        addAudit(guild.id, user.id, 'ticket_price_set', { was, now: cfg.ticketPrice });
        return show('pay', [], `Ticket payment is now **$${cfg.ticketPrice.toFixed(2)}** per ticket. New tickets use it automatically.`);
      }
      case 'pcadd': case 'pcedit': {
        const list = cfg.staffPay.categories;
        const editing = token === 'pcedit' ? list.find(x => x.id === args[0]) : null;
        if (token === 'pcedit' && !editing) return show('payc', [], 'Category not found.');
        const name = val('name').slice(0, 50);
        const rate = Number(val('rate').replace(',', '.'));
        if (!name) return show('payc', [], 'The name cannot be empty.');
        if (!Number.isFinite(rate) || rate < 0 || rate > 100000) return show('payc', [], 'The rate must be a number of 0 or more, like 2.00.');
        if (list.some(x => x !== editing && x.name.toLowerCase() === name.toLowerCase())) return show('payc', [], 'A category with that name already exists.');
        if (!editing && list.length >= 25) return show('payc', [], 'Maximum 25 categories.');
        const keys = [...new Set(val('types').split(',').map(x => x.trim().toLowerCase()).filter(x => x && x !== '*'))];
        const unknown = keys.filter(k => !cfg.ticketTypes.some(t => t.key === k));
        const pc = editing || { id: 'c_' + Math.random().toString(36).slice(2, 8), name, rate: 0, typeKeys: [], isDefault: false };
        pc.name = name;
        pc.rate = Math.round(rate * 100) / 100;
        pc.typeKeys = keys;
        if (!editing) list.push(pc);
        for (const o of list) if (o !== pc) o.typeKeys = o.typeKeys.filter(k => !keys.includes(k));
        if (yes(val('default')) || val('types').includes('*')) { for (const o of list) o.isDefault = false; pc.isDefault = true; }
        if (!list.some(o => o.isDefault)) list[0].isDefault = true;
        saveDB();
        addAudit(guild.id, user.id, editing ? 'pay_category_edited' : 'pay_category_added', { name: pc.name, rate: pc.rate });
        return show('payc', [pc.id], `Saved **${pc.name}** at €${pc.rate.toFixed(2)} per claim.${unknown.length ? ` ⚠️ Unknown ticket type keys: ${unknown.join(', ')}` : ''}`);
      }
      case 'wmsg': {
        cfg.wipe.message = val('message').replace(/\\n/g, '\n').slice(0, 1000);
        saveDB();
        return show('wipe', [], 'Wipe message saved.');
      }
      default:
        return deny();
    }
  }

  // ================= BUTTONS =================
  if (interaction.isButton()) {
    switch (token) {
      case 'ac': {
        const op = args[0];
        if (op === 'nick') return interaction.showModal(modal('pnlm:nick', 'Bot nickname', [modalText('value', 'Nickname (empty = reset)', botDisplayName(guild), T.Short, false, 32)]));
        if (!dev) return deny();
        if (op === 'uname') return interaction.showModal(modal('pnlm:uname', 'Bot username', [modalText('value', 'New username', client.user.username, T.Short, true, 32)]));
        if (op === 'bio') return interaction.showModal(modal('pnlm:bio', 'Bot bio', [modalText('value', 'About me (\\n = new line)', root.botBio || '', T.Paragraph, true, 400)]));
        if (op === 'status') return interaction.showModal(modal('pnlm:status', 'Bot status', [
          modalText('type', 'Playing / Watching / Listening / Competing', root.botStatus?.type || 'Playing', T.Short, true, 12),
          modalText('text', 'Status text', root.botStatus?.text || '', T.Short, true, 100)
        ]));
        if (op === 'avatar') {
          pendingUploads.set(`${guild.id}:${user.id}`, { target: 'avatar', interaction, channelId: interaction.channelId, expires: Date.now() + 120000, member, user });
          return show('account', [], 'Send the new avatar picture in this channel now (within 2 minutes). I will delete your message afterwards.');
        }
        return deny();
      }
      case 'tp':
        return interaction.showModal(modal('pnlm:tprice', 'Ticket payment', [modalText('price', 'Payment per ticket in $ (e.g. 5.00)', Number(cfg.ticketPrice).toFixed(2), T.Short, true, 10)]));
      case 'mbrm': {
        const m = cfg.mbMessage;
        if (!m) return show('mbpost', [], 'There is no tracked mystery box message to remove (only messages posted after this update can be removed here).');
        const okRm = await removePostedMessage(guild, m.channelId, m.messageId);
        if (!okRm) return show('mbpost', [], 'I could not delete it. Check my permissions in that channel.');
        cfg.mbMessage = null;
        saveDB();
        return show('mbpost', [], 'The mystery box message was removed.');
      }
      case 'artg': {
        if (!cfg.autorole.roleId || !guild.roles.cache.has(cfg.autorole.roleId)) {
          cfg.autorole.enabled = false;
          saveDB();
          return show('roles', ['auto:autorole'], 'Pick a role first, then turn the autorole on.');
        }
        cfg.autorole.enabled = !cfg.autorole.enabled;
        saveDB();
        addAudit(guild.id, user.id, 'autorole_toggle', { on: cfg.autorole.enabled });
        return show('roles', ['auto:autorole'], `Autorole is now ${cfg.autorole.enabled ? 'on' : 'off'}.`);
      }
      case 'tcauto': {
        cfg.ticketAutoRoute = !cfg.ticketAutoRoute;
        saveDB();
        return show('tcat', [], `Auto-match by name is now ${cfg.ticketAutoRoute ? 'on' : 'off'}.`);
      }
      case 'tcclear': {
        delete cfg.ticketCategoryMap[args[0]];
        saveDB();
        return show('tcat', [args[0]], 'Manual category removed for that ticket type.');
      }
      case 'pcadd':
        return interaction.showModal(modal('pnlm:pcadd', 'Add pay category', payCategoryFields(null)));
      case 'pcedit': {
        const pc = cfg.staffPay.categories.find(x => x.id === args[0]);
        if (!pc) return show('payc', [], 'Category not found.');
        return interaction.showModal(modal(`pnlm:pcedit:${pc.id}`, 'Edit pay category', payCategoryFields(pc)));
      }
      case 'pcrm': {
        const list = cfg.staffPay.categories;
        if (list.length <= 1) return show('payc', [args[0]], 'You need at least one pay category.');
        const i = list.findIndex(x => x.id === args[0]);
        if (i < 0) return show('payc', [], 'Category not found.');
        const [gone] = list.splice(i, 1);
        if (gone.isDefault) list[0].isDefault = true;
        saveDB();
        addAudit(guild.id, user.id, 'pay_category_removed', { name: gone.name });
        return show('payc', [], `Removed **${gone.name}**. Claims of its ticket types now count under the default category.`);
      }
      case 'pmpay':
        return show('paym', [args[0], 'c']);
      case 'pmdo': {
        const s = db.staff[args[0]];
        if (!s) return show('paym', [], 'Staff member not found.');
        const pay = payBreakdown(s);
        if (!pay.lines.length) return show('paym', [args[0]], 'Nothing to pay: there are no unpaid claims.');
        s.payments.unshift({ at: stamp(), by: user.id, total: pay.total, lines: pay.lines, since: s.period?.since || null });
        s.period = { byType: {}, since: stamp() };
        saveDB();
        addAudit(guild.id, user.id, 'staff_paid', { staffId: args[0], total: pay.total });
        await postStaffStats(guild, args[0]);
        return show('paym', [], `Marked <@${args[0]}> as paid (€${pay.total.toFixed(2)}). Their pay period was reset and the payment is in the history.`);
      }
      case 'tg': {
        const key = args[0];
        if (!TOGGLE_KEYS[key]) return deny();
        cfg[TOGGLE_KEYS[key]] = !cfg[TOGGLE_KEYS[key]];
        saveDB();
        addAudit(guild.id, user.id, 'toggle', { key, on: cfg[TOGGLE_KEYS[key]] });
        return show('toggles', [], `**${key}** is now ${cfg[TOGGLE_KEYS[key]] ? 'on' : 'off'}.`);
      }
      case 'tk': {
        const p = cfg.ticketPanel;
        if (args[0] === 'look') return interaction.showModal(modal('pnlm:tpanel', 'Ticket panel text & look', [
          modalText('title', 'Title ({bot} = bot name)', p.title, T.Short, true, 200),
          modalText('emoji', 'Title emoji (empty = none)', p.titleEmoji, T.Short, false, 60),
          modalText('description', 'Extra text under the options', p.description, T.Paragraph, false, 1000),
          modalText('footer', 'Footer', p.footer, T.Short, false, 200),
          modalText('color', 'Color hex, e.g. #ff0000', p.color, T.Short, false, 7)
        ]));
        if (args[0] === 'look2') return interaction.showModal(modal('pnlm:tpanel2', 'Dropdown & thumbnail', [
          modalText('placeholder', 'Dropdown placeholder text', p.placeholder, T.Short, false, 150),
          modalText('thumbnail', 'Thumbnail: avatar / none / link', p.thumbnail, T.Short, false, 500)
        ]));
        if (args[0] === 'welcome') return interaction.showModal(modal('pnlm:welcome', 'Ticket welcome message', [modalText('message', 'Message ({bot} = bot name)', cfg.ticketWelcomeMessage, T.Paragraph, true, 1500)]));
        if (args[0] === 'rmpanel') {
          if (!cfg.ticketPanelChannelId || !cfg.ticketPanelMessageId) return show('tpost', [], 'There is no posted panel to remove.');
          const okRm = await removePostedMessage(guild, cfg.ticketPanelChannelId, cfg.ticketPanelMessageId);
          if (!okRm) return show('tpost', [], 'I could not delete it. Check that I can see that channel and have Manage Messages.');
          cfg.ticketPanelChannelId = null;
          cfg.ticketPanelMessageId = null;
          saveDB();
          addAudit(guild.id, user.id, 'panel_removed', {});
          return show('tpost', [], 'The ticket panel was removed from its channel. Post it again below whenever you want.');
        }
        if (args[0] === 'refresh') {
          const ok = await refreshPanel(guild);
          return show('tpost', [], ok ? 'Panel message updated.' : 'There is no posted panel to update yet. Choose a channel below.');
        }
        return deny();
      }
      case 'opadd':
        return interaction.showModal(modal('pnlm:opadd', 'Add ticket option', [
          modalText('name', 'Display name', '', T.Short, true, 80),
          modalText('key', 'Short key (letters/numbers/hyphens)', '', T.Short, true, 40),
          modalText('emoji', 'Emoji (optional)', '', T.Short, false, 60)
        ]));
      case 'opedit': {
        const t = cfg.ticketTypes.find(x => x.key === args[0]);
        if (!t) return show('opts', [], 'Option not found.');
        return interaction.showModal(modal(`pnlm:opedit:${t.key}`, 'Edit ticket option', [
          modalText('name', 'Display name', t.name, T.Short, false, 80),
          modalText('emoji', 'Emoji (type none to remove)', t.emoji || '', T.Short, false, 60)
        ]));
      }
      case 'opup': case 'opdown': case 'oprm': {
        const i = cfg.ticketTypes.findIndex(t => t.key === args[0]);
        if (i < 0) return show('opts', [], 'Option not found.');
        if (token === 'oprm') cfg.ticketTypes.splice(i, 1);
        else {
          const j = token === 'opup' ? i - 1 : i + 1;
          if (j < 0 || j >= cfg.ticketTypes.length) return show('opts', [args[0]], 'It is already at the end.');
          [cfg.ticketTypes[i], cfg.ticketTypes[j]] = [cfg.ticketTypes[j], cfg.ticketTypes[i]];
        }
        saveDB();
        addAudit(guild.id, user.id, `ticket_option_${token}`, { key: args[0] });
        await refreshPanel(guild);
        return show('opts', token === 'oprm' ? [] : [args[0]], token === 'oprm' ? 'Option removed.' : 'Moved.');
      }
      case 'im': {
        const [op, t] = args;
        const target = t === 'ticket' ? 'ticket' : 'dash';
        const c2 = target === 'ticket' ? cfg.ticketPanel : cfg.dash;
        if (op === 'set') return interaction.showModal(modal(`pnlm:imgurl:${target}`, 'Image link', [modalText('url', 'Link to the image (https://...)', c2.bannerUrl, T.Short, true, 500)]));
        if (op === 'up') {
          pendingUploads.set(`${guild.id}:${user.id}`, { target, interaction, channelId: interaction.channelId, expires: Date.now() + 120000, member, user });
          return show('img', [target], 'Send the picture in this channel now (within 2 minutes). I will delete your message afterwards.');
        }
        if (op === 'rm') {
          if (c2.bannerFile) { try { fs.unlinkSync(path.join(DATA_DIR, c2.bannerFile)); } catch {} }
          c2.bannerFile = '';
          c2.bannerUrl = '';
          saveDB();
          if (target === 'ticket') await refreshPanel(guild);
          return show('img', [target], 'Image removed.');
        }
        return deny();
      }
      case 'ld': {
        const op = args[0];
        if (op === 'open') return interaction.reply({ embeds: [embed(`🏆 ${brandName()} — Leaderboard Dashboard`, 'Manage tribes, points, and the public board.')], components: leaderboardRows(), ephemeral: true });
        if (op === 'exact') return interaction.showModal(modal('pnlm:exact', 'Set exact points', [
          modalText('tribe', 'Tribe name', '', T.Short, true, 80),
          modalText('points', 'Exact total points', '0', T.Short, true, 9)
        ]));
        if (op === 'hist') {
          const lines = db.pointHistory.slice(0, 10).map(x => `• ${x.at} — **${x.action}** by ${x.actorId ? `<@${x.actorId}>` : 'system'}\n  ${clip(JSON.stringify(x.details), 180)}`).join('\n') || 'No point history yet.';
          return interaction.reply({ embeds: [embed('📜 Recent Point History', lines)], ephemeral: true });
        }
        if (op === 'reward') return interaction.showModal(modal('pnlm:reward', 'Cave rewards', [
          modalText('map', 'Map (e.g. The Island)', '', T.Short, true, 40),
          modalText('cave', 'Cave (existing or new)', '', T.Short, true, 80),
          modalText('base', 'Base points', '0', T.Short, true, 5),
          modalText('raid', 'Raid points', '0', T.Short, true, 5),
          modalText('fixed', 'Fixed points (optional)', '', T.Short, false, 5)
        ]));
        if (op === 'refresh') { await refreshLeaderboard(guild); return show('lb', [], 'Leaderboard refreshed.'); }
        if (op === 'reset') { cfg.lb = {}; saveDB(); await refreshLeaderboard(guild); return show('lb', [], 'Leaderboard look reset.'); }
        return deny();
      }
      case 'ev': {
        const op = args[0];
        if (op === 'pollnew') return interaction.showModal(modal('pnlm:pollnew', 'New poll', [
          modalText('title', 'Poll title', '', T.Short, true, 200),
          modalText('options', 'Options, one per line (2 to 5)', '', T.Paragraph, true, 500),
          modalText('duration', 'Closes after, e.g. 12h (optional)', '', T.Short, false, 10),
          modalText('single', 'One vote per person? (yes/no)', 'no', T.Short, false, 3),
          modalText('channel', 'Channel ID (empty = this channel)', '', T.Short, false, 25)
        ]));
        if (op === 'pollemo') return interaction.showModal(modal('pnlm:pollemo', 'Poll emojis', ['a', 'b', 'c', 'd', 'e'].map((k, i) => modalText(k, `Emoji for ${k.toUpperCase()}`, cfg.pollEmojis[i], T.Short, true, 60))));
        if (op === 'gwnew') return interaction.showModal(modal('pnlm:gwnew', 'New giveaway', [
          modalText('prize', 'Prize', '', T.Short, true, 200),
          modalText('duration', 'Duration, e.g. 30m, 12h, 2d', '24h', T.Short, true, 10),
          modalText('winners', 'Number of winners', '1', T.Short, false, 2),
          modalText('credit', 'Prize is this much € credit (optional)', '', T.Short, false, 8),
          modalText('hype', 'Hype Squad only? (yes/no)', 'no', T.Short, false, 3)
        ]));
        return deny();
      }
      case 'gwact': {
        const [act, gid] = args;
        const g = db.giveaways[gid];
        if (!g) return show('gws', [], 'Giveaway not found.');
        if (act === 'end') { if (g.ended || g.cancelled) return show('gws', [gid], 'Already finished.'); await endGiveaway(guild, gid); return show('gws', [gid], 'Giveaway ended and winners announced.'); }
        if (act === 'reroll') { const w = await endGiveaway(guild, gid, true); return show('gws', [gid], w?.length ? 'New winner(s) picked.' : 'There are no other entries to pick from.'); }
        if (act === 'cancel') { const ok = await cancelGiveaway(guild, gid); return show('gws', [gid], ok ? 'Giveaway cancelled.' : 'Already finished.'); }
        return deny();
      }
      case 'hy': {
        const h = cfg.hype;
        if (args[0] === 'rmpost') {
          if (!h.infoChannelId || !h.infoMessageId) return show('hpost', [], 'There is no posted info message to remove.');
          const okRm = await removePostedMessage(guild, h.infoChannelId, h.infoMessageId);
          if (!okRm) return show('hpost', [], 'I could not delete it. Check my permissions in that channel.');
          h.infoChannelId = null;
          h.infoMessageId = null;
          saveDB();
          return show('hpost', [], 'The Hype Squad info message was removed.');
        }
        if (args[0] === 'settings') return interaction.showModal(modal('pnlm:hsettings', 'Hype Squad settings', [
          modalText('name', 'Exact nickname (max 32)', h.name, T.Short, false, 32),
          modalText('limit', 'Member limit', String(h.limit), T.Short, false, 5),
          modalText('title', 'Title of the info message', h.title, T.Short, false, 200),
          modalText('perks', 'Perks line', h.perks, T.Short, false, 500),
          modalText('highlight', 'Big highlight line (none = remove)', h.highlight, T.Short, false, 100)
        ]));
        if (args[0] === 'look') return interaction.showModal(modal('pnlm:hlook', 'Hype Squad look', [
          modalText('emoji', 'Decoration emoji (none = remove)', h.emoji, T.Short, false, 60),
          modalText('color', 'Color hex, e.g. #e67e22', h.color, T.Short, false, 7),
          modalText('banner', 'Banner image link (none = remove)', h.bannerUrl, T.Short, false, 500)
        ]));
        if (args[0] === 'refresh') {
          const ok = await refreshHypePost(guild);
          return show('hpost', [], ok ? 'Info message updated.' : 'There is no posted info message yet. Choose a channel below.');
        }
        return deny();
      }
      case 'wp': {
        const op = args[0];
        const w = cfg.wipe;
        if (op === 'set') return interaction.showModal(modal('pnlm:wset', 'Set wipe date', [
          modalText('month', 'Month (1-12)', '', T.Short, true, 2),
          modalText('day', 'Day (1-31)', '', T.Short, true, 2),
          modalText('time', 'Time, e.g. 9pm or 21:00', '', T.Short, true, 10),
          modalText('timezone', 'Timezone, e.g. Europe/Amsterdam', w.tz || 'UTC', T.Short, false, 40),
          modalText('year', 'Year (optional)', '', T.Short, false, 4)
        ]));
        if (op === 'msg') return interaction.showModal(modal('pnlm:wmsg', 'Wipe message', [modalText('message', 'Text shown with !wipe', w.message, T.Paragraph, true, 1000)]));
        if (op === 'prev') return interaction.reply({ embeds: [wipeEmbed(guild)], ephemeral: true });
        if (op === 'clear') { w.at = null; saveDB(); return show('wipe', [], 'Scheduled wipe cleared.'); }
        if (op === 'season') {
          const n = Object.keys(db.tribes).length;
          return interaction.reply({
            content: `⚠️ **End the season?**\nThis will permanently delete the **entire leaderboard** (**${n}** tribe${n === 1 ? '' : 's'}). It cannot be undone.`,
            components: [row(btn('season:confirm', 'Yes, delete everything', ButtonStyle.Danger), btn('season:cancel', 'Cancel'))],
            ephemeral: true
          });
        }
        return deny();
      }
      case 'dn':
        return interaction.reply({ embeds: [embed(`🎁 ${brandName()} — Dono Dashboard`, 'Choose a Dono feature.')], components: donoRows(), ephemeral: true });
      default:
        return deny();
    }
  }

  // ================= MENUS =================
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];
    switch (token) {
      case 'chkey': return show('channels', [v]);
      case 'rlkey': return show('roles', [v]);
      case 'opsel': return show('opts', [v]);
      case 'tcsel': return show('tcat', [v]);
      case 'pcsel': return show('payc', [v]);
      case 'pmsel': return show('paym', [v]);
      case 'hkey': return show('hsel', [v]);
      case 'gwsel': return show('gws', [v]);
      case 'lbsel': {
        if (!LB_FIELDS.includes(v)) return deny();
        return interaction.showModal(modal(`pnlm:lbfield:${v}`, `Leaderboard: ${v}`.slice(0, 45), [modalText('value', 'New value (\\n = new line)', String(lb()[v]), v === 'note' ? T.Paragraph : T.Short, true, 300)]));
      }
      case 'pollsel': {
        const counts = await endPoll(guild, v);
        return show('polls', [], counts ? 'Poll closed and the result was posted on the poll message.' : 'That poll was already closed.');
      }
      default: return deny();
    }
  }

  if (interaction.isChannelSelectMenu()) {
    const chId = interaction.values[0];
    const chan = guild.channels.cache.get(chId);
    switch (token) {
      case 'chset': {
        const key = args[0];
        if (!CHANNEL_KEYS[key]) return deny();
        cfg[CHANNEL_KEYS[key]] = chId;
        if (key === 'leaderboard') { cfg.leaderboardMessageId = null; saveDB(); await refreshLeaderboard(guild); }
        saveDB();
        addAudit(guild.id, user.id, 'channel_set', { key, chId });
        return show('channels', [key], `**${key}** set to <#${chId}>.`);
      }
      case 'tcset': {
        const key = args[0];
        const t = cfg.ticketTypes.find(x => x.key === key);
        if (!t || chan?.type !== ChannelType.GuildCategory) return show('tcat', [], 'Pick a Discord category.');
        cfg.ticketCategoryMap[key] = chId;
        saveDB();
        addAudit(guild.id, user.id, 'ticket_category_set', { key, chId });
        return show('tcat', [key], `**${t.name}** tickets now go into **${chan.name}**.`);
      }
      case 'tpostch': {
        if (!chan?.isTextBased()) return show('tpost', [], 'Pick a text channel.');
        try { await postPanel(guild, chan); } catch { return show('tpost', [], `I can't post in <#${chId}>. Check my permissions there.`); }
        addAudit(guild.id, user.id, 'panel_post', { channelId: chId });
        return show('tpost', [], `Panel posted in <#${chId}>. From now on every change edits it.`);
      }
      case 'hset': {
        const key = args[0];
        if (key === 'verify') cfg.hype.verifyChannelId = chId;
        else if (key === 'gchan') cfg.hype.giveawayChannelId = chId;
        else return deny();
        saveDB();
        await refreshHypePost(guild);
        return show('hsel', [key], `Saved: <#${chId}>.`);
      }
      case 'hpostch': {
        const h = cfg.hype;
        if (!h.strictName || !h.roleId) return show('hpost', [], 'Set the name (Settings) and the role (Role & channels) first.');
        if (!chan?.isTextBased()) return show('hpost', [], 'Pick a text channel.');
        try {
          const msg = await chan.send({ embeds: [hypeEmbed()] });
          h.infoChannelId = chId;
          h.infoMessageId = msg.id;
          saveDB();
        } catch { return show('hpost', [], `I can't post in <#${chId}>. Check my permissions there.`); }
        return show('hpost', [], `Info message posted in <#${chId}>.`);
      }
      case 'mbpostch': {
        if (!chan?.isTextBased()) return show('mbpost', [], 'Pick a text channel.');
        try {
          cfg.mbMessage = await sendTracked(chan, {
            embeds: [embed(`🎁 Mystery Box`, 'Open a mystery box from your inventory, or check your credit balance.', 0x2ecc71)],
            components: [row(btn('mb:open', 'Open Mystery Box', ButtonStyle.Success, '🎁'), btn('mb:balance', 'Check Balance', ButtonStyle.Secondary, '💳'))]
          });
        } catch { return show('mbpost', [], `I can't post in <#${chId}>. Check my permissions there.`); }
        saveDB();
        return show('mbpost', [], `Posted in <#${chId}>.`);
      }
      default: return deny();
    }
  }

  if (interaction.isRoleSelectMenu()) {
    const ids = interaction.values;
    if (token === 'hset') {
      cfg.hype.roleId = ids[0];
      saveDB();
      return show('hsel', ['role'], `Hype Squad role set to <@&${ids[0]}>. Make sure my role is above it.`);
    }
    if (token === 'arset') {
      const role = guild.roles.cache.get(ids[0]);
      if (!role || role.managed || role.id === guild.id) return show('roles', ['auto:autorole'], 'That role cannot be used as an autorole.');
      cfg.autorole.roleId = role.id;
      saveDB();
      addAudit(guild.id, user.id, 'autorole_set', { roleId: role.id });
      const me = guild.members.me;
      const warn = me && role.comparePositionTo(me.roles.highest) >= 0 ? ' ⚠️ My role must be ABOVE that role, otherwise I cannot give it.' : '';
      return show('roles', ['auto:autorole'], `Autorole set to <@&${role.id}>.${warn}`);
    }
    if (token === 'rlset') {
      const [type, name] = args;
      if (type === 'list' && PNL_LISTS[name]) {
        if (name === 'owner' && !isOwner(member)) return deny();
        cfg[PNL_LISTS[name]] = ids;
      } else if (type === 'perm' && ABILITIES[name] && !OWNER_ONLY.has(name)) {
        if (!isOwner(member)) return interaction.reply({ content: 'Only owners can change abilities.', ephemeral: true });
        cfg.perms[name] = ids;
      } else return deny();
      saveDB();
      addAudit(guild.id, user.id, 'roles_set', { type, name, ids });
      return show('roles', [`${type}:${name}`], 'Saved.');
    }
    return deny();
  }

  if (interaction.isUserSelectMenu() && token === 'hkick') {
    const uid = interaction.values[0];
    const h = cfg.hype;
    const m = await guild.members.fetch(uid).catch(() => null);
    if (m && h.roleId) await m.roles.remove(h.roleId).catch(() => {});
    h.members = h.members.filter(x => x !== uid);
    saveDB();
    await refreshHypePost(guild);
    return show('hmem', [], `Removed <@${uid}> from the Hype Squad.`);
  }
  return deny();
}

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('panel').setDescription('Open the control panel'),
  new SlashCommandBuilder().setName('help').setDescription('Explains the panel and what everyone can do'),
  new SlashCommandBuilder().setName('open-mystery-box').setDescription('Open one mystery box from your inventory'),
  ...nitradoCommands
].map(c => c.toJSON());

// developer-only commands: registered ONLY in your home server
const homeCommands = [
  new SlashCommandBuilder().setName('authorize').setDescription('Authorize a server to use this bot (developer only)')
    .addStringOption(o => o.setName('server').setDescription('Server the bot is in').setRequired(true).setAutocomplete(true))
    .addIntegerOption(o => o.setName('days').setDescription('Authorize for this many days (empty = no expiry)').setMinValue(1).setMaxValue(3650))
    .addStringOption(o => o.setName('note').setDescription('Note, e.g. who paid').setMaxLength(200)),
  new SlashCommandBuilder().setName('deauthorize').setDescription('Remove a server\'s authorization (developer only)')
    .addStringOption(o => o.setName('server').setDescription('Authorized server').setRequired(true).setAutocomplete(true))
    .addBooleanOption(o => o.setName('leave').setDescription('Make the bot leave that server'))
    .addBooleanOption(o => o.setName('delete_data').setDescription('Also delete all of that server\'s data')),
  new SlashCommandBuilder().setName('authorized').setDescription('List all authorized servers (developer only)')


async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  // normal commands exist in every server; they are checked for authorization when used
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  // developer commands ONLY in the control server
  for (const cid of CONTROL_GUILD_IDS) {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, cid), { body: homeCommands });
    } catch (e) {
      console.error(`Could not register /authorize commands in server ${cid} (is the bot in it?):`, e.message);
    }
  }
  // clear the old per-server command list of the home server so nothing is left over there
  if (!isControl(GUILD_ID)) {
    try { await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] }); } catch {}
  }
}

loadRoot();

let started = false;
const onReady = async () => { try {
  if (started) return;
  started = true;
  console.log(`Logged in as ${client.user.tag}`);
  applyStatus();
  try {
    await registerCommands();
    console.log('Commands registered.');
  } catch (e) {
    console.error('Command registration failed:', e);
  }
  for (const guild of client.guilds.cache.values()) {
    if (!isAuthorized(guild.id)) continue;
    await runIn(guild, async () => {
      seedPerms(guild);
      await refreshLeaderboard(guild);
    }).catch(e => console.error('startup', e));
  }
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      if (isAuthorized(guild.id)) await runIn(guild, () => refreshLeaderboard(guild)).catch(() => {});
    }
  }, 180000);
  setInterval(() => sweepTimers().catch(e => console.error('sweep', e)), 30000);
  setTimeout(async () => {
    for (const g of client.guilds.cache.values()) {
      if (isAuthorized(g.id)) await g.members.fetch().catch(e => console.warn(`Could not load the members of ${g.name}: ${e.message}`));
    }
    hypeSweep().catch(e => console.error('hype sweep', e));
  }, 5000);
  setInterval(() => hypeSweep().catch(e => console.error('hype sweep', e)), 120000);
  console.log('Bot is ready.');
} catch (e) { console.error('Startup error:', e); } };
client.once('ready', onReady);
client.once('clientReady', onReady);

client.on('interactionCreate', async interaction => {
  const guild = interaction.guild;
  if (!guild) {
    if (interaction.isChatInputCommand()) interaction.reply({ content: 'Use this command inside the server.', ephemeral: true }).catch(() => {});
    return;
  }
  try {
    await runIn(guild, () => handleInteraction(interaction));
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.isRepliable?.() && (interaction.deferred || interaction.replied)) {
        await interaction.followUp({ content: 'Something went wrong. Check the bot logs.', ephemeral: true });
      } else if (interaction.isRepliable?.()) {
        await interaction.reply({ content: 'Something went wrong. Check the bot logs.', ephemeral: true });
      }
    } catch {}
  }
});

async function handleInteraction(interaction) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    // ---- authorization gate: servers that are not authorized only get the notice ----
    if (!isAuthorized(guild.id)) {
      if (interaction.isAutocomplete()) return interaction.respond([]);
      return interaction.reply({ embeds: [unauthorizedEmbed()] });
    }
    seedPerms(guild);


    // the control panel: every button, menu and form that starts with pnl
    if (interaction.customId && (interaction.customId.startsWith('pnl:') || interaction.customId.startsWith('pnlm:'))) return handlePanel(interaction);

    // AUTOCOMPLETE (developer commands only)
    if (interaction.isAutocomplete()) {
      const f = interaction.options.getFocused(true);
      const q = String(f.value).toLowerCase();
      if (interaction.commandName === 'authorize' || interaction.commandName === 'deauthorize') {
        if (!isControl(guild.id) || !isBotOwner(interaction.user, guild)) return interaction.respond([]);
        const pool = interaction.commandName === 'authorize'
          ? [...client.guilds.cache.values()].filter(g => g.id !== GUILD_ID && !isControl(g.id))
          : Object.keys(root.auth).map(id => client.guilds.cache.get(id) || { id, name: root.auth[id].name || id });
        return interaction.respond(pool.filter(g => g.name.toLowerCase().includes(q)).slice(0, 25).map(g => ({ name: clip(`${g.name} (${g.id})`, 100), value: g.id })));
      }
      return interaction.respond([]);
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'help') {
        return interaction.reply({ embeds: [helpEmbed(guild)], ephemeral: true });
      }

      if (interaction.commandName === 'panel') {
        return showPage(interaction, buildPage('main', [], { member, guild, user: interaction.user }));
      }

      if (interaction.commandName === 'open-mystery-box') return handleOpenMysteryBox(interaction);
if (await handleNitradoCommand(interaction, isOwner(member))) return;
      // /authorize, /deauthorize, /authorized — developer only, home server only
      if (['authorize', 'deauthorize', 'authorized'].includes(interaction.commandName)) {
        if (!isControl(guild.id) || !isBotOwner(interaction.user, guild)) {
          return interaction.reply({ content: 'This command is only for the bot developer, in the control server.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const resolveGuild = raw => {
          const v = String(raw || '').trim();
          return client.guilds.cache.get(v) || client.guilds.cache.find(g => g.name.toLowerCase() === v.toLowerCase()) || null;
        };

        if (interaction.commandName === 'authorize') {
          const target = resolveGuild(interaction.options.getString('server', true));
          if (!target) return interaction.editReply('The bot is not in that server. Invite the bot there first, then try again.');
          if (target.id === GUILD_ID || isControl(target.id)) return interaction.editReply('The home and control servers are always authorized.');
          const days = interaction.options.getInteger('days');
          const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
          root.auth[target.id] = { name: target.name, at: stamp(), expiresAt, note: interaction.options.getString('note') || '', by: interaction.user.id };
          guildData(target.id, true);
          saveDB();
          await runIn(target, async () => {
            seedPerms(target);
            await refreshLeaderboard(target);
          });
          return interaction.editReply(`✅ **${target.name}** is now authorized${expiresAt ? ` until <t:${Math.floor(Date.parse(expiresAt) / 1000)}:F>` : ' with no expiry'}.\nThe server owner can set up roles with \`/perms\`.`);
        }

        if (interaction.commandName === 'deauthorize') {
          const raw = interaction.options.getString('server', true);
          const target = resolveGuild(raw);
          const gid = target?.id || (/^\d{17,20}$/.test(raw.trim()) ? raw.trim() : null);
          if (!gid || !root.auth[gid]) return interaction.editReply('That server is not on the authorized list.');
          const name = root.auth[gid].name || target?.name || gid;
          delete root.auth[gid];
          if (interaction.options.getBoolean('delete_data')) delete root.guilds[gid];
          saveDB();
          let left = false;
          if (interaction.options.getBoolean('leave') && target) left = await target.leave().then(() => true).catch(() => false);
          return interaction.editReply(`⛔ **${name}** is no longer authorized.${left ? ' The bot left that server.' : ''}${interaction.options.getBoolean('delete_data') ? ' Its data was deleted.' : ' Its data was kept.'}`);
        }

        const entries = Object.entries(root.auth);
        const lines = entries.map(([gid, a]) => {
          const live = client.guilds.cache.get(gid);
          const exp = a.expiresAt ? (Date.parse(a.expiresAt) > Date.now() ? `expires <t:${Math.floor(Date.parse(a.expiresAt) / 1000)}:R>` : '**expired**') : 'no expiry';
          return `• **${live?.name || a.name || gid}** (\`${gid}\`) — ${exp}${a.note ? ` — ${clip(a.note, 80)}` : ''}${live ? '' : ' — _bot not in server_'}`;
        });
        return interaction.editReply({ embeds: [embed('🔑 Authorized servers', clip(lines.join('\n') || 'No servers authorized yet (the home server is always allowed).', 4000))] });
      }

    }

    // STRING SELECT
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket:create') {
        const type = db.config.ticketTypes.find(t => t.key === interaction.values[0]);
        if (!type) return interaction.reply({ content: 'That ticket type is unavailable.', ephemeral: true });
        return createTicket(interaction, type);
      }

      if (interaction.customId === 'td:removetype-select') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const key = interaction.values[0];
        const removed = db.config.ticketTypes.find(t => t.key === key);
        db.config.ticketTypes = db.config.ticketTypes.filter(t => t.key !== key);
        saveDB();
        addAudit(guild.id, interaction.user.id, 'ticket_type_removed', { key, name: removed?.name });
        await refreshPanel(guild);
        return interaction.update({ content: `Removed ticket option **${removed?.name || key}**.`, components: [] });
      }

      if (interaction.customId === 'dd:removeprize-select') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const name = interaction.values[0];
        db.config.donoPrizes = db.config.donoPrizes.filter(p => p.name !== name);
        delete db.config.donoDropChances[name];
        saveDB();
        addAudit(guild.id, interaction.user.id, 'mystery_prize_removed', { name });
        return interaction.update({ content: `Removed prize **${name}**.`, components: [] });
      }

      if (interaction.customId === 'ld:tribe-edit-select') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const tribe = db.tribes[interaction.values[0]];
        if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
        return interaction.update({
          content: `**${tribe.name}**\nCurrent points: **${tribe.points}**\nMap: **${tribe.map || '—'}**\nBase: **${tribe.base || '—'}**\nChoose what to change.`,
          embeds: [],
          components: [
            row(btn(`ld:addpoints:${tribe.id}`, 'Add Points', ButtonStyle.Success), btn(`ld:removepoints:${tribe.id}`, 'Remove Points', ButtonStyle.Danger)),
            row(btn(`ld:editdetails:${tribe.id}`, 'Edit Tribe Details'), btn('ld:back', 'Back'))
          ]
        });
      }

      if (interaction.customId === 'ld:tribe-remove-select') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const tribe = db.tribes[interaction.values[0]];
        if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
        return interaction.reply({
          content: `Confirm removal of **${tribe.name}** (${tribe.points} points)?`,
          components: [row(btn(`ld:remove-confirm:${tribe.id}`, 'Confirm Remove', ButtonStyle.Danger), btn('ld:back', 'Cancel'))],
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith('pcalc:map:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const tribeId = interaction.customId.slice('pcalc:map:'.length);
        const tribe = db.tribes[tribeId];
        const map = interaction.values[0];
        if (!tribe) return interaction.reply({ content: 'Tribe no longer exists.', ephemeral: true });
        const rewards = db.config.rewardValues?.[map] || {};
        const opts = Object.entries(rewards).slice(0, 25).map(([name, value]) => ({
          label: clip(name, 100),
          value: name,
          description: `Base ${value.base ?? 0} + raid ${value.raid ?? 0}`.slice(0, 100)
        }));
        if (!opts.length) return interaction.reply({ content: 'No caves configured for that map.', ephemeral: true });
        return interaction.update({
          content: `**Add Points — ${tribe.name}**\nCurrent points: **${tribe.points}**\nMap: **${map}**\nSelect a cave.`,
          embeds: [],
          components: [
            row(new StringSelectMenuBuilder().setCustomId(`pcalc:cave:${tribeId}:${encodeURIComponent(map)}`).setPlaceholder('Select cave').addOptions(opts)),
            row(btn(`ld:addpoints:${tribeId}`, 'Back'))
          ]
        });
      }

      if (interaction.customId.startsWith('pcalc:cave:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const bits = interaction.customId.split(':');
        const tribeId = bits[2];
        const map = decodeURIComponent(bits.slice(3).join(':'));
        const cave = interaction.values[0];
        const tribe = db.tribes[tribeId];
        const value = db.config.rewardValues?.[map]?.[cave];
        if (!tribe || !value) return interaction.reply({ content: 'Tribe or cave reward not found.', ephemeral: true });
        const token = Math.random().toString(36).slice(2, 10);
        pendingCalcs.set(token, {
          kind: 'add_points', tribeId, tribeName: tribe.name, map, cave,
          base: Number(value.base || 0), raidPoints: Number(value.raid || 0),
          fixed: value.fixed === undefined ? null : Number(value.fixed), cos: false
        });
        return interaction.update({
          content: `**${tribe.name}** — current points: **${tribe.points}**\nMap: **${map}**\nCave: **${cave}**\nBase: **${value.base || 0}** • Raid: **${value.raid || 0}**${value.fixed !== undefined ? ` • Fixed: **${value.fixed}**` : ''}\nChoose online or offline.`,
          embeds: [],
          components: [
            row(btn(`pcalc:raid:${token}:online`, 'Online Raid', ButtonStyle.Success), btn(`pcalc:raid:${token}:offline`, 'Offline Raid', ButtonStyle.Danger)),
            row(btn(`pcalc:cancel:${tribeId}`, 'Cancel'))
          ]
        });
      }
    }

    // USER SELECT (Add/Remove user)
    if (interaction.isUserSelectMenu()) {
      if (interaction.customId.startsWith('ticket:adduser-select:')) {
        if (!canManageTickets(member)) return interaction.reply({ content: 'You do not have permission to add users.', ephemeral: true });
        const ticketId = interaction.customId.slice('ticket:adduser-select:'.length);
        if (!canHandleTicket(member, db.tickets[ticketId])) return interaction.reply({ content: 'You do not have permission to add users.', ephemeral: true });
        const ticket = db.tickets[ticketId];
        if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'Ticket no longer open.', ephemeral: true });
        const userId = interaction.values[0];
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
        }).catch(() => {});
        addAudit(guild.id, interaction.user.id, 'ticket_user_added', { ticketId, userId });
        return interaction.update({ content: `Added <@${userId}> to the ticket.`, components: [] });
      }
      if (interaction.customId.startsWith('ticket:removeuser-select:')) {
        if (!canManageTickets(member)) return interaction.reply({ content: 'You do not have permission to remove users.', ephemeral: true });
        const ticketId = interaction.customId.slice('ticket:removeuser-select:'.length);
        if (!canHandleTicket(member, db.tickets[ticketId])) return interaction.reply({ content: 'You do not have permission to remove users.', ephemeral: true });
        const ticket = db.tickets[ticketId];
        if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'Ticket no longer open.', ephemeral: true });
        const userId = interaction.values[0];
        if (userId === ticket.ownerId) return interaction.reply({ content: 'Cannot remove the ticket owner.', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(userId, { ViewChannel: false }).catch(() => {});
        addAudit(guild.id, interaction.user.id, 'ticket_user_removed', { ticketId, userId });
        return interaction.update({ content: `Removed <@${userId}> from the ticket.`, components: [] });
      }
    }

    // BUTTONS
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'mb:open') return handleOpenMysteryBox(interaction);
      if (id === 'mb:balance') return interaction.reply({ content: `💳 Your credit balance: **€${Number(db.dono.balances[interaction.user.id] || 0).toFixed(2)}**`, ephemeral: true });

      // giveaway entry (everyone)
      if (id === 'gw:enter') {
        const g = db.giveaways[interaction.message.id];
        if (!g || g.ended || g.cancelled) return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
        const hype = db.config.hype;
        if (g.hypeOnly && !(hype.roleId && member.roles.cache.has(hype.roleId))) {
          return interaction.reply({ content: `🔥 This giveaway is for the Hype Squad only.${hype.infoChannelId ? ` See <#${hype.infoChannelId}> to join.` : ''}`, ephemeral: true });
        }
        const idx = g.entries.indexOf(interaction.user.id);
        if (idx >= 0) g.entries.splice(idx, 1); else g.entries.push(interaction.user.id);
        saveDB();
        await interaction.update({ embeds: [giveawayEmbed(g)] });
        return interaction.followUp({ content: idx >= 0 ? 'You left the giveaway.' : '🎉 You entered the giveaway! Press the button again to leave.', ephemeral: true });
      }

      // season end confirmation
      if (id.startsWith('season:')) {
        if (!can(member, 'season')) return interaction.reply({ content: 'No permission.', ephemeral: true });
        if (id === 'season:cancel') return interaction.update({ content: 'Cancelled. Nothing was deleted.', components: [] });
        const n = Object.keys(db.tribes).length;
        db.tribes = {};
        saveDB();
        addPointHistory(interaction.user.id, 'season_end', { tribesDeleted: n });
        addAudit(guild.id, interaction.user.id, 'season_end', { tribesDeleted: n });
        await refreshLeaderboard(guild);
        await logPoints(guild, `📊 **season_end**\nThe whole leaderboard was deleted (${n} tribes)\nBy: ${interaction.user}`);
        return interaction.update({ content: `Season ended. **${n}** tribe${n === 1 ? '' : 's'} deleted, the leaderboard is empty.`, components: [] });
      }

      if (id.startsWith('ticket:')) {
        const parts = id.split(':');
        const action = parts[1];
        const ticketId = parts[2];
        const ticket = db.tickets[ticketId];
        if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'This ticket is already closed or no longer exists.', ephemeral: true });

        if (action === 'rename') {
          if (!canRename(member)) return interaction.reply({ content: 'You do not have permission to rename tickets.', ephemeral: true });
          return interaction.showModal(modal(`ticket:renamemodal:${ticketId}`, 'Rename Ticket', [
            modalText('name', 'New channel name', interaction.channel?.name || '', TextInputStyle.Short, true, 90)
          ]));
        }

        if (!canHandleTicket(member, ticket)) {
          return interaction.reply({ content: 'You do not have permission to claim, close, add or remove users.', ephemeral: true });
        }

        if (action === 'claim') {
          if (!db.config.claimEnabled) return interaction.reply({ content: 'Ticket claiming is disabled.', ephemeral: true });
          if (ticket.claimantId === interaction.user.id) return interaction.reply({ content: 'You already claimed this ticket.', ephemeral: true });
          const previous = ticket.claimantId;
          if (previous) {
            const prev = staffRec(previous);
            prev.handling = Math.max(0, prev.handling - 1);
            await postStaffStats(guild, previous);
          }
          ticket.claimantId = interaction.user.id;
          ticket.claimHistory ||= [];
          ticket.claimHistory.push({ userId: interaction.user.id, at: stamp(), note: previous ? `reassigned from ${previous}` : 'claimed' });
          const s = staffRec(interaction.user.id);
          s.claimed++;
          s.handling++;
          s.byType[ticket.typeName] = (s.byType[ticket.typeName] || 0) + 1;
          s.period.byType[ticket.typeKey] = (s.period.byType[ticket.typeKey] || 0) + 1;
          saveDB();
          addAudit(guild.id, interaction.user.id, 'ticket_claimed', { ticketId, previousClaimant: previous, type: ticket.typeName });
          await postStaffStats(guild, interaction.user.id, `**Claimed ticket**\nType: ${ticket.typeName}\nTicket payment: $${Number(ticket.price ?? db.config.ticketPrice).toFixed(2)}\nOwner: <@${ticket.ownerId}>\nChannel: <#${ticket.channelId}>\nAt: ${stamp()}`);
          return interaction.reply({ content: `Ticket claimed by ${interaction.user}.`, allowedMentions: { users: [interaction.user.id] } });
        }

        if (action === 'adduser') {
          return interaction.reply({
            content: 'Select a user to add to this ticket:',
            components: [row(new UserSelectMenuBuilder().setCustomId(`ticket:adduser-select:${ticketId}`).setPlaceholder('Select user to add').setMinValues(1).setMaxValues(1))],
            ephemeral: true
          });
        }

        if (action === 'removeuser') {
          return interaction.reply({
            content: 'Select a user to remove from this ticket (cannot remove owner):',
            components: [row(new UserSelectMenuBuilder().setCustomId(`ticket:removeuser-select:${ticketId}`).setPlaceholder('Select user to remove').setMinValues(1).setMaxValues(1))],
            ephemeral: true
          });
        }

        if (action === 'close') {
          if (!db.config.closeEnabled) return interaction.reply({ content: 'Ticket closing is disabled.', ephemeral: true });
          return interaction.showModal(modal(`ticket:closemodal:${ticketId}`, 'Close Ticket — Reason Required', [
            modalText('reason', 'Close Reason', '', TextInputStyle.Paragraph, true, 500)
          ]));
        }
      }

      // Embed creator
      if (id.startsWith('ec:')) {
        if (!canUseEmbedCreator(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const d = embedDrafts.get(interaction.user.id);
        if (!d) return interaction.reply({ content: 'Draft expired. Run /embed-creator again.', ephemeral: true });

        if (id === 'ec:main') {
          return interaction.showModal(modal('ec:mainmodal', 'Embed Main', [
            modalText('title', 'Title', d.title, TextInputStyle.Short, false, 256),
            modalText('description', 'Description', d.description, TextInputStyle.Paragraph, false, 4000),
            modalText('color', 'Color hex (e.g. #2ecc71)', d.color, TextInputStyle.Short, false, 7)
          ]));
        }
        if (id === 'ec:extra') {
          return interaction.showModal(modal('ec:extramodal', 'Images / Footer / Author', [
            modalText('thumbnail', 'Thumbnail URL', d.thumbnail, TextInputStyle.Short, false, 500),
            modalText('image', 'Large image URL', d.image, TextInputStyle.Short, false, 500),
            modalText('footer', 'Footer text', d.footer, TextInputStyle.Short, false, 200),
            modalText('author', 'Author name', d.author, TextInputStyle.Short, false, 200)
          ]));
        }
        if (id === 'ec:addfield') {
          if (d.fields.length >= 25) return interaction.reply({ content: 'Max 25 fields.', ephemeral: true });
          return interaction.showModal(modal('ec:fieldmodal', 'Add Field', [
            modalText('name', 'Field name', '', TextInputStyle.Short, true, 256),
            modalText('value', 'Field value', '', TextInputStyle.Paragraph, true, 1000),
            modalText('inline', 'Inline? (yes/no)', 'no', TextInputStyle.Short, false, 3)
          ]));
        }
        if (id === 'ec:clearfields') {
          d.fields = [];
          return interaction.update(embedCreatorPanel(d));
        }
        if (id === 'ec:send') {
          return interaction.reply({
            content: 'Pick the channel to send this embed to:',
            components: [row(new ChannelSelectMenuBuilder().setCustomId('ec:channel').setPlaceholder('Choose a text channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))],
            ephemeral: true
          });
        }
        if (id === 'ec:cancel') {
          embedDrafts.delete(interaction.user.id);
          return interaction.update({ content: 'Embed Creator closed.', embeds: [], components: [] });
        }
      }

      // Ticket Dashboard
      if (id.startsWith('td:')) {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        if (id === 'td:close') return interaction.update({ content: 'Ticket Dashboard closed.', embeds: [], components: [] });
        if (id === 'td:panel') {
          return interaction.showModal(modal('td:panelmodal', 'Edit Ticket Panel', [
            modalText('title', 'Panel title ({bot} = bot name)', db.config.ticketPanel.title),
            modalText('description', 'Extra text under the options', db.config.ticketPanel.description, TextInputStyle.Paragraph, false, 900)
          ]));
        }
        if (id === 'td:welcome') {
          return interaction.showModal(modal('td:welcomemodal', 'Edit Ticket Welcome Message', [
            modalText('message', 'Welcome message (shown when ticket opens)', db.config.ticketWelcomeMessage, TextInputStyle.Paragraph, true, 1500)
          ]));
        }
        if (id === 'td:types') {
          return interaction.reply({
            embeds: [embed('Manage Ticket Options', db.config.ticketTypes.map(t => `• ${t.emoji ? `${t.emoji} ` : ''}**${t.name}** — \`${t.key}\``).join('\n') || 'None')],
            components: [
              row(btn('td:addtype', 'Add Ticket Option', ButtonStyle.Success), btn('td:removetype', 'Remove Ticket Option', ButtonStyle.Danger)),
              row(btn('td:settings', 'Back to Settings'), btn('td:place', 'Place Panel'))
            ],
            ephemeral: true
          });
        }
        if (id === 'td:addtype') {
          return interaction.showModal(modal('td:addtypemodal', 'Add Ticket Option', [
            modalText('name', 'Ticket option name'),
            modalText('key', 'Short key (letters/numbers/hyphens)')
          ]));
        }
        if (id === 'td:removetype') {
          const opts = db.config.ticketTypes.map(t => ({ label: clip(t.name, 100), value: t.key }));
          if (!opts.length) return interaction.reply({ content: 'No ticket options to remove.', ephemeral: true });
          return interaction.reply({
            content: 'Select the ticket option to remove.',
            components: [row(new StringSelectMenuBuilder().setCustomId('td:removetype-select').setPlaceholder('Choose ticket option').addOptions(opts))],
            ephemeral: true
          });
        }
        if (id === 'td:place') {
          return interaction.reply({
            content: 'Use the channel selector below to publish the ticket panel.',
            components: [row(new ChannelSelectMenuBuilder().setCustomId('td:panelchannel').setPlaceholder('Choose a text channel').setChannelTypes(ChannelType.GuildText))],
            ephemeral: true
          });
        }
        // Settings page 1/2 (channels). Discord allows max 5 rows, so roles are on page 2.
        if (id === 'td:settings' || id === 'td:admin') {
          return interaction.reply({
            content: `**Ticket settings (1/2 — Channels)**\nCategory: ${db.config.ticketCategoryId ? `<#${db.config.ticketCategoryId}>` : 'not set'}\nTranscript: ${db.config.ticketTranscriptChannelId ? `<#${db.config.ticketTranscriptChannelId}>` : 'not set'}\nStaff stats forum: ${db.config.staffStatsForumId ? `<#${db.config.staffStatsForumId}>` : 'not set'}`,
            components: [
              row(new ChannelSelectMenuBuilder().setCustomId('td:transcriptchannel').setPlaceholder('Set transcript channel').setChannelTypes(ChannelType.GuildText)),
              row(new ChannelSelectMenuBuilder().setCustomId('td:statsforum').setPlaceholder('Set staff stats forum').setChannelTypes(ChannelType.GuildForum)),
              row(new ChannelSelectMenuBuilder().setCustomId('td:category').setPlaceholder('Set ticket category').setChannelTypes(ChannelType.GuildCategory)),
              row(btn('td:roles', 'Next: Role Settings →', ButtonStyle.Primary))
            ],
            ephemeral: true
          });
        }
        // Settings page 2/2 (roles)
        if (id === 'td:roles') {
          return interaction.update({
            content: '**Ticket settings (2/2 — Roles)**\nTip: `/perms` lets you give any role any ability.',
            components: [
              row(new RoleSelectMenuBuilder().setCustomId('td:staffroles').setPlaceholder('Select ticket staff roles').setMinValues(0).setMaxValues(10)),
              row(new RoleSelectMenuBuilder().setCustomId('td:ownerroles').setPlaceholder('Select owner roles').setMinValues(0).setMaxValues(10)),
              row(new RoleSelectMenuBuilder().setCustomId('td:adminroles').setPlaceholder('Select admin roles').setMinValues(0).setMaxValues(10)),
              row(new RoleSelectMenuBuilder().setCustomId('td:renameroles').setPlaceholder('Select ticket rename roles').setMinValues(0).setMaxValues(10)),
              row(btn('td:settings', '← Back'))
            ]
          });
        }
      }

      // Leaderboard
      if (id.startsWith('ld:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        if (id === 'ld:close' || id === 'ld:back') {
          return interaction.update({
            embeds: [embed(`🏆 ${brandName()} — Leaderboard Dashboard`, 'Manage tribes, points, and the public board.')],
            components: leaderboardRows(),
            content: null
          });
        }
        if (id === 'ld:add') {
          return interaction.showModal(modal('ld:addmodal', 'Add Tribe', [
            modalText('name', 'Tribe name'),
            modalText('map', 'Map (optional)', '', TextInputStyle.Short, false),
            modalText('base', 'Main base (optional)', '', TextInputStyle.Short, false),
            modalText('points', 'Starting points', '0')
          ]));
        }
        if (id === 'ld:edit' || id === 'ld:points') {
          const opts = tribeChoices();
          if (!opts.length) return interaction.reply({ content: 'No tribes exist yet.', ephemeral: true });
          return interaction.reply({
            content: 'Select a tribe.',
            components: [row(new StringSelectMenuBuilder().setCustomId('ld:tribe-edit-select').setPlaceholder('Choose tribe').addOptions(opts))],
            ephemeral: true
          });
        }
        if (id === 'ld:remove') {
          const opts = tribeChoices();
          if (!opts.length) return interaction.reply({ content: 'No tribes exist yet.', ephemeral: true });
          return interaction.reply({
            content: 'Select a tribe to remove.',
            components: [row(new StringSelectMenuBuilder().setCustomId('ld:tribe-remove-select').setPlaceholder('Choose tribe').addOptions(opts))],
            ephemeral: true
          });
        }
        if (id === 'ld:refresh') {
          await refreshLeaderboard(guild);
          return interaction.reply({ content: 'Leaderboard force-refreshed.', ephemeral: true });
        }
        if (id === 'ld:settings') {
          return interaction.reply({
            content: `**Leaderboard settings**\nChannel: ${db.config.leaderboardChannelId ? `<#${db.config.leaderboardChannelId}>` : 'not set'}\nBackup: ${db.config.backupChannelId ? `<#${db.config.backupChannelId}>` : 'not set'}\nAudit: ${db.config.auditChannelId ? `<#${db.config.auditChannelId}>` : 'not set'}\nPoints Log: ${db.config.pointsLogChannelId ? `<#${db.config.pointsLogChannelId}>` : 'not set'}`,
            components: [
              row(new ChannelSelectMenuBuilder().setCustomId('ld:lbchannel').setPlaceholder('Set leaderboard channel').setChannelTypes(ChannelType.GuildText)),
              row(new ChannelSelectMenuBuilder().setCustomId('ld:backupchannel').setPlaceholder('Set backup channel').setChannelTypes(ChannelType.GuildText)),
              row(new ChannelSelectMenuBuilder().setCustomId('ld:auditchannel').setPlaceholder('Set audit channel').setChannelTypes(ChannelType.GuildText)),
              row(new ChannelSelectMenuBuilder().setCustomId('ld:pointslogchannel').setPlaceholder('Set points log channel').setChannelTypes(ChannelType.GuildText)),
              row(btn('ld:refresh', 'Force Refresh Leaderboard', ButtonStyle.Primary))
            ],
            ephemeral: true
          });
        }
        if (id.startsWith('ld:addpoints:')) {
          const tribeId = id.slice('ld:addpoints:'.length);
          const tribe = db.tribes[tribeId];
          if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
          return interaction.update({
            content: `**Add Points — ${tribe.name}**\nCurrent points: **${tribe.points}**\nSelect a map.`,
            embeds: [],
            components: [
              row(new StringSelectMenuBuilder().setCustomId(`pcalc:map:${tribeId}`).setPlaceholder('Select map').addOptions(mapChoices())),
              row(btn('ld:back', 'Back'))
            ]
          });
        }
        if (id.startsWith('ld:removepoints:')) {
          const tribeId = id.slice('ld:removepoints:'.length);
          const tribe = db.tribes[tribeId];
          if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
          return interaction.showModal(modal(`ld:removepointsmodal:${tribeId}`, `Remove Points — ${tribe.name}`.slice(0, 45), [
            modalText('amount', 'Points to remove', '0'),
            modalText('reason', 'Reason (optional)', '', TextInputStyle.Short, false)
          ]));
        }
        if (id.startsWith('ld:editdetails:')) {
          const tribeId = id.slice('ld:editdetails:'.length);
          const tribe = db.tribes[tribeId];
          if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
          return interaction.showModal(modal(`ld:editdetailsmodal:${tribeId}`, `Edit — ${tribe.name}`.slice(0, 45), [
            modalText('name', 'Tribe name', tribe.name),
            modalText('map', 'Map', tribe.map || '', TextInputStyle.Short, false),
            modalText('base', 'Main base', tribe.base || '', TextInputStyle.Short, false)
          ]));
        }
        if (id.startsWith('ld:remove-confirm:')) {
          const tribeId = id.slice('ld:remove-confirm:'.length);
          const tribe = db.tribes[tribeId];
          if (!tribe) return interaction.reply({ content: 'Tribe already removed.', ephemeral: true });
          const name = tribe.name;
          const points = tribe.points;
          delete db.tribes[tribeId];
          saveDB();
          addPointHistory(interaction.user.id, 'remove_tribe', { tribeId, name, points });
          addAudit(guild.id, interaction.user.id, 'remove_tribe', { name, points });
          await sendBackup(guild, `Removed tribe ${name}`);
          await refreshLeaderboard(guild);
          await logPoints(guild, `📊 **remove_tribe**\nTribe: **${name}** (${points} pts)\nBy: ${interaction.user}`);
          return interaction.update({ content: `Removed **${name}** (${points} points).`, components: [] });
        }
      }

      // Point calc
      if (id.startsWith('pcalc:raid:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const [, , token, raidType] = id.split(':');
        const p = pendingCalcs.get(token);
        if (!p) return interaction.reply({ content: 'This calculation expired.', ephemeral: true });
        let pointsToAdd = 0;
        if (p.fixed !== null && p.fixed !== undefined) pointsToAdd = p.fixed;
        else if (raidType === 'online') pointsToAdd = p.base + p.raidPoints;
        else pointsToAdd = p.raidPoints;
        p.raidType = raidType;
        p.pointsToAdd = pointsToAdd;
        pendingCalcs.set(token, p);
        return interaction.update({
          content: `**Confirm Add Points**\nTribe: **${p.tribeName}**\nMap: **${p.map}**\nCave: **${p.cave}**\nRaid: **${raidType}**\nPoints to add: **${pointsToAdd}**\n\nConfirm?`,
          embeds: [],
          components: [row(btn(`pcalc:confirm:${token}`, 'Confirm Add', ButtonStyle.Success), btn(`pcalc:cancel:${p.tribeId}`, 'Cancel', ButtonStyle.Secondary))]
        });
      }
      if (id.startsWith('pcalc:confirm:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const token = id.slice('pcalc:confirm:'.length);
        const p = pendingCalcs.get(token);
        if (!p) return interaction.reply({ content: 'This calculation expired.', ephemeral: true });
        const tribe = db.tribes[p.tribeId];
        if (!tribe) return interaction.reply({ content: 'Tribe no longer exists.', ephemeral: true });
        const before = tribe.points;
        tribe.points = Math.floor(Number(tribe.points) + p.pointsToAdd);
        tribe.updatedAt = stamp();
        saveDB();
        addPointHistory(interaction.user.id, 'add_cave_points', { tribeId: p.tribeId, tribe: p.tribeName, map: p.map, cave: p.cave, raid: p.raidType, added: p.pointsToAdd, before, after: tribe.points });
        addAudit(guild.id, interaction.user.id, 'add_cave_points', { tribe: p.tribeName, map: p.map, cave: p.cave, raid: p.raidType, added: p.pointsToAdd });
        await sendBackup(guild, `Added ${p.pointsToAdd} pts to ${p.tribeName}`);
        await refreshLeaderboard(guild);
        await logPoints(guild, `📊 **add_cave_points**\nTribe: **${p.tribeName}**\n+${p.pointsToAdd} (${p.map} / ${p.cave} / ${p.raidType})\n${before} → **${tribe.points}**\nBy: ${interaction.user}`);
        pendingCalcs.delete(token);
        return interaction.update({ content: `Added **${p.pointsToAdd}** points to **${p.tribeName}**.\nNew total: **${tribe.points}**`, components: [] });
      }
      if (id.startsWith('pcalc:cancel:')) return interaction.update({ content: 'Point calculation cancelled.', embeds: [], components: [] });

      // Dono
      if (id.startsWith('dd:')) {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'You do not have permission to use Dono features.', ephemeral: true });
        if (id === 'dd:boxes') {
          return interaction.reply({
            embeds: [embed('🎁 Mystery Box Management', `Current prizes:\n${db.config.donoPrizes.map(p => `• **${p.name}** (weight ${db.config.donoDropChances[p.name] ?? p.chance})`).join('\n') || 'None'}`)],
            components: [
              row(btn('dd:addprize', 'Add Prize', ButtonStyle.Success), btn('dd:removeprize', 'Remove Prize', ButtonStyle.Danger)),
              row(btn('dd:givebox', 'Give Boxes', ButtonStyle.Primary), btn('dd:viewboxes', 'View Player Boxes')),
              row(btn('dd:back', 'Back'))
            ],
            ephemeral: true
          });
        }
        if (id === 'dd:credit') {
          return interaction.reply({
            embeds: [embed('💳 Credit Management', 'Give or remove credit from players.')],
            components: [
              row(btn('dd:givecredit', 'Give Credit', ButtonStyle.Success), btn('dd:removecredit', 'Remove Credit', ButtonStyle.Danger)),
              row(btn('dd:viewcredit', 'View Balance')),
              row(btn('dd:back', 'Back'))
            ],
            ephemeral: true
          });
        }
        if (id === 'dd:settings') {
          return interaction.reply({
            content: `Dono / Points Log Channel: ${db.config.donoLogChannelId ? `<#${db.config.donoLogChannelId}>` : 'not set'}`,
            components: [row(new ChannelSelectMenuBuilder().setCustomId('dd:logchannel').setPlaceholder('Set log channel for credit / boxes / points').setChannelTypes(ChannelType.GuildText))],
            ephemeral: true
          });
        }
        if (id === 'dd:back') {
          return interaction.update({
            embeds: [embed(`🎁 ${brandName()} — Dono Dashboard`, 'Choose a Dono feature.')],
            components: donoRows(),
            content: null
          });
        }
        if (id === 'dd:addprize') {
          return interaction.showModal(modal('dd:addprizemodal', 'Add Mystery Prize', [
            modalText('name', 'Prize name'),
            modalText('value', 'Prize description / value'),
            modalText('chance', 'Weight (higher = more common)', '10')
          ]));
        }
        if (id === 'dd:removeprize') {
          const opts = db.config.donoPrizes.map(p => ({ label: clip(p.name, 100), value: p.name }));
          if (!opts.length) return interaction.reply({ content: 'No prizes configured.', ephemeral: true });
          return interaction.reply({
            content: 'Select prize to remove.',
            components: [row(new StringSelectMenuBuilder().setCustomId('dd:removeprize-select').setPlaceholder('Choose prize').addOptions(opts))],
            ephemeral: true
          });
        }
        if (id === 'dd:givebox') {
          return interaction.showModal(modal('dd:giveboxmodal', 'Give Mystery Boxes', [
            modalText('user', 'Discord User ID'),
            modalText('amount', 'Number of boxes', '1')
          ]));
        }
        if (id === 'dd:viewboxes') {
          return interaction.showModal(modal('dd:viewboxesmodal', 'View Player Boxes', [modalText('user', 'Discord User ID')]));
        }
        if (id === 'dd:givecredit') {
          return interaction.showModal(modal('dd:creditmodal:give', 'Give Credit', [
            modalText('user', 'Discord User ID'),
            modalText('amount', 'Amount (€)'),
            modalText('reason', 'Reason', '', TextInputStyle.Short, false)
          ]));
        }
        if (id === 'dd:removecredit') {
          return interaction.showModal(modal('dd:creditmodal:remove', 'Remove Credit', [
            modalText('user', 'Discord User ID'),
            modalText('amount', 'Amount (€)'),
            modalText('reason', 'Reason', '', TextInputStyle.Short, false)
          ]));
        }
        if (id === 'dd:viewcredit') {
          return interaction.showModal(modal('dd:viewbalancemodal', 'View Credit Balance', [modalText('user', 'Discord User ID')]));
        }
      }
    }

    // CHANNEL SELECT
    if (interaction.isChannelSelectMenu()) {
      if (!guild) return;

      if (interaction.customId === 'ec:channel') {
        if (!canUseEmbedCreator(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const d = embedDrafts.get(interaction.user.id);
        if (!d) return interaction.reply({ content: 'Draft expired. Run /embed-creator again.', ephemeral: true });
        const ch = guild.channels.cache.get(interaction.values[0]);
        if (!ch?.isTextBased()) return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
        try {
          await ch.send({ embeds: [buildDraftEmbed(d)] });
        } catch {
          return interaction.update({ content: `I can't send in <#${ch.id}>. Check my permissions there.`, components: [] });
        }
        addAudit(guild.id, interaction.user.id, 'embed_sent', { channelId: ch.id, title: d.title });
        return interaction.update({ content: `Embed sent to <#${ch.id}>.`, components: [] });
      }

      if (interaction.customId === 'td:panelchannel') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const channelId = interaction.values[0];
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
        try {
          await postPanel(guild, channel);
        } catch {
          return interaction.update({ content: `I can't post in <#${channelId}>. Check my permissions there.`, components: [] });
        }
        addAudit(guild.id, interaction.user.id, 'ticket_panel_placed', { channelId });
        return interaction.update({ content: `Ticket panel published in <#${channelId}>. Future changes edit this message automatically.`, components: [] });
      }
      if (interaction.customId === 'td:transcriptchannel') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.ticketTranscriptChannelId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Transcript channel set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'td:statsforum') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.staffStatsForumId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Staff stats forum set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'td:category') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.ticketCategoryId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Ticket category set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'ld:lbchannel') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.leaderboardChannelId = interaction.values[0];
        db.config.leaderboardMessageId = null;
        saveDB();
        await refreshLeaderboard(guild);
        return interaction.update({ content: `Leaderboard channel set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'ld:backupchannel') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.backupChannelId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Backup channel set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'ld:auditchannel') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.auditChannelId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Audit channel set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'ld:pointslogchannel') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.pointsLogChannelId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Points log channel set to <#${interaction.values[0]}>.`, components: [] });
      }
      if (interaction.customId === 'dd:logchannel') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.donoLogChannelId = interaction.values[0];
        saveDB();
        return interaction.update({ content: `Dono / activity log channel set to <#${interaction.values[0]}>.`, components: [] });
      }
    }

    // ROLE SELECT
    if (interaction.isRoleSelectMenu()) {
      if (!guild) return;
      if (interaction.customId === 'td:staffroles') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.ticketStaffRoleIds = interaction.values;
        saveDB();
        return interaction.update({ content: `Ticket staff roles updated.`, components: [] });
      }
      if (interaction.customId === 'td:ownerroles') {
        if (!isOwner(member)) return interaction.reply({ content: 'Only owners can change owner roles.', ephemeral: true });
        db.config.ownerRoleIds = interaction.values;
        saveDB();
        return interaction.update({ content: `Owner roles updated.`, components: [] });
      }
      if (interaction.customId === 'td:adminroles') {
        if (!can(member, 'config')) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.adminRoleIds = interaction.values;
        saveDB();
        return interaction.update({ content: `Admin roles updated.`, components: [] });
      }
      if (interaction.customId === 'td:renameroles') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.authorizedRenameRoleIds = interaction.values;
        saveDB();
        return interaction.update({ content: `Rename roles updated.`, components: [] });
      }
    }

    // MODALS
    if (interaction.isModalSubmit()) {
      // Embed creator modals
      if (interaction.customId.startsWith('ec:')) {
        if (!canUseEmbedCreator(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const d = embedDrafts.get(interaction.user.id);
        if (!d) return interaction.reply({ content: 'Draft expired. Run /embed-creator again.', ephemeral: true });
        const f = k => interaction.fields.getTextInputValue(k)?.trim() || '';

        if (interaction.customId === 'ec:mainmodal') {
          d.title = f('title'); d.description = f('description'); d.color = f('color') || '#2ecc71';
        } else if (interaction.customId === 'ec:extramodal') {
          d.thumbnail = f('thumbnail'); d.image = f('image'); d.footer = f('footer'); d.author = f('author');
        } else if (interaction.customId === 'ec:fieldmodal') {
          d.fields.push({ name: clip(f('name'), 256), value: clip(f('value'), 1024), inline: /^(y|yes|true)$/i.test(f('inline')) });
        }
        return interaction.update(embedCreatorPanel(d));
      }

      if (interaction.customId.startsWith('ticket:renamemodal:')) {
        if (!canRename(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const rid = interaction.customId.slice('ticket:renamemodal:'.length);
        const rt = db.tickets[rid];
        if (!rt || rt.status !== 'open') return interaction.reply({ content: 'Ticket no longer open.', ephemeral: true });
        const newName = safeName(interaction.fields.getTextInputValue('name'));
        await interaction.channel.setName(newName, `Ticket renamed by ${interaction.user.tag}`).catch(() => {});
        addAudit(guild.id, interaction.user.id, 'ticket_renamed', { channelId: interaction.channelId, name: newName });
        return interaction.reply({ content: `Ticket channel renamed to **${newName}**.`, ephemeral: true });
      }

      if (interaction.customId.startsWith('ticket:closemodal:')) {
        if (!canManageTickets(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const ticketId = interaction.customId.slice('ticket:closemodal:'.length);
        if (!canHandleTicket(member, db.tickets[ticketId])) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const ticket = db.tickets[ticketId];
        if (!ticket || ticket.status !== 'open') return interaction.reply({ content: 'Ticket already closed.', ephemeral: true });
        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!reason) return interaction.reply({ content: 'Close reason is required.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        ticket.status = 'closed';
        ticket.closedAt = stamp();
        ticket.closedBy = interaction.user.id;
        ticket.closeReason = reason;
        if (ticket.claimantId) {
          const s = staffRec(ticket.claimantId);
          s.handling = Math.max(0, s.handling - 1);
          await postStaffStats(guild, ticket.claimantId);
        }
        const closer = staffRec(interaction.user.id);
        closer.closed++;
        saveDB();
        addAudit(guild.id, interaction.user.id, 'ticket_closed', { ticketId, claimantId: ticket.claimantId, closerId: interaction.user.id, type: ticket.typeName, reason });
        await saveTranscript(guild, ticket, interaction.user.id, reason);
        await postStaffStats(guild, interaction.user.id);
        await interaction.editReply('Ticket closed. Transcript saved.');
        await interaction.channel.permissionOverwrites.edit(ticket.ownerId, { ViewChannel: false }).catch(() => {});
        await interaction.channel.send({ content: `Ticket closed by ${interaction.user}.\n**Reason:** ${reason}\nThis channel will be deleted in 10 seconds.` }).catch(() => {});
        setTimeout(() => interaction.channel.delete('Ticket closed').catch(() => {}), 10000);
        return;
      }

      if (interaction.customId === 'td:panelmodal') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.ticketPanel.title = interaction.fields.getTextInputValue('title').slice(0, 256);
        db.config.ticketPanel.description = (interaction.fields.getTextInputValue('description') || '').slice(0, 2000);
        saveDB();
        addAudit(guild.id, interaction.user.id, 'ticket_panel_edited', {});
        const updated = await refreshPanel(guild);
        return interaction.reply({ content: updated ? 'Ticket panel updated.' : 'Ticket panel saved. Place the panel to see it.', ephemeral: true });
      }
      if (interaction.customId === 'td:welcomemodal') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        db.config.ticketWelcomeMessage = interaction.fields.getTextInputValue('message').slice(0, 1500);
        saveDB();
        addAudit(guild.id, interaction.user.id, 'ticket_welcome_edited', {});
        return interaction.reply({ content: 'Ticket welcome message updated. Future tickets will use the new message. ({bot} becomes the bot name.)', ephemeral: true });
      }
      if (interaction.customId === 'td:addtypemodal') {
        if (!isTicketStaff(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('name').trim();
        const key = interaction.fields.getTextInputValue('key').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (!name || !key) return interaction.reply({ content: 'Name and key are required.', ephemeral: true });
        if (db.config.ticketTypes.some(t => t.key === key)) return interaction.reply({ content: 'That key already exists.', ephemeral: true });
        if (db.config.ticketTypes.length >= 25) return interaction.reply({ content: 'Maximum 25 ticket types.', ephemeral: true });
        db.config.ticketTypes.push({ key, name, emoji: '' });
        saveDB();
        addAudit(guild.id, interaction.user.id, 'ticket_type_added', { key, name });
        await refreshPanel(guild);
        return interaction.reply({ content: `Added ticket option **${name}** (\`${key}\`). Use \`/panel option-edit\` to give it an emoji.`, ephemeral: true });
      }
      if (interaction.customId === 'ld:addmodal') {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('name').trim();
        const map = interaction.fields.getTextInputValue('map')?.trim() || '';
        const base = interaction.fields.getTextInputValue('base')?.trim() || '';
        const points = Math.max(0, parseInt(interaction.fields.getTextInputValue('points') || '0', 10) || 0);
        if (!name) return interaction.reply({ content: 'Tribe name is required.', ephemeral: true });
        if (tribeByName(name)) return interaction.reply({ content: 'A tribe with that name already exists.', ephemeral: true });
        const id = createTribeId();
        db.tribes[id] = { id, name, map, base, points, createdAt: stamp(), updatedAt: stamp() };
        saveDB();
        addPointHistory(interaction.user.id, 'add_tribe', { tribeId: id, name, points });
        addAudit(guild.id, interaction.user.id, 'add_tribe', { name, points });
        await sendBackup(guild, `Added tribe ${name}`);
        await refreshLeaderboard(guild);
        await logPoints(guild, `📊 **add_tribe**\nTribe: **${name}** (${points} pts)\nBy: ${interaction.user}`);
        return interaction.reply({ content: `Added tribe **${name}** with **${points}** points.`, ephemeral: true });
      }
      if (interaction.customId.startsWith('ld:editdetailsmodal:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const tribeId = interaction.customId.slice('ld:editdetailsmodal:'.length);
        const tribe = db.tribes[tribeId];
        if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
        const newName = interaction.fields.getTextInputValue('name').trim();
        const newMap = interaction.fields.getTextInputValue('map')?.trim() || '';
        const newBase = interaction.fields.getTextInputValue('base')?.trim() || '';
        if (!newName) return interaction.reply({ content: 'Name is required.', ephemeral: true });
        const oldName = tribe.name;
        tribe.name = newName;
        tribe.map = newMap;
        tribe.base = newBase;
        tribe.updatedAt = stamp();
        saveDB();
        addAudit(guild.id, interaction.user.id, 'edit_tribe', { tribeId, oldName, newName });
        await refreshLeaderboard(guild);
        return interaction.reply({ content: `Updated tribe **${oldName}** → **${newName}**.`, ephemeral: true });
      }
      if (interaction.customId.startsWith('ld:removepointsmodal:')) {
        if (!canEditLeaderboard(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const tribeId = interaction.customId.slice('ld:removepointsmodal:'.length);
        const tribe = db.tribes[tribeId];
        if (!tribe) return interaction.reply({ content: 'Tribe not found.', ephemeral: true });
        const amount = Math.max(0, parseInt(interaction.fields.getTextInputValue('amount') || '0', 10) || 0);
        const reason = interaction.fields.getTextInputValue('reason')?.trim() || '';
        if (amount <= 0) return interaction.reply({ content: 'Enter a positive number of points to remove.', ephemeral: true });
        const before = tribe.points;
        tribe.points = Math.max(0, tribe.points - amount);
        tribe.updatedAt = stamp();
        saveDB();
        addPointHistory(interaction.user.id, 'remove_points', { tribeId, tribe: tribe.name, amount, before, after: tribe.points, reason });
        addAudit(guild.id, interaction.user.id, 'remove_points', { tribe: tribe.name, amount, reason });
        await sendBackup(guild, `Removed ${amount} pts from ${tribe.name}`);
        await refreshLeaderboard(guild);
        await logPoints(guild, `📊 **remove_points**\nTribe: **${tribe.name}**\n-${amount}\n${before} → **${tribe.points}**\nReason: ${reason || '—'}\nBy: ${interaction.user}`);
        return interaction.reply({ content: `Removed **${amount}** points from **${tribe.name}**.\n${before} → **${tribe.points}**`, ephemeral: true });
      }
      if (interaction.customId === 'dd:addprizemodal') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const name = interaction.fields.getTextInputValue('name').trim();
        const value = interaction.fields.getTextInputValue('value').trim();
        const chance = Number(interaction.fields.getTextInputValue('chance'));
        if (!name || !value || !Number.isFinite(chance) || chance < 0 || chance > 100000 || db.config.donoPrizes.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          return interaction.reply({ content: 'Enter a unique prize name, description, and a chance weight from 0 to 100000.', ephemeral: true });
        }
        if (db.config.donoPrizes.length >= 25) return interaction.reply({ content: 'The prize list is limited to 25 options.', ephemeral: true });
        db.config.donoPrizes.push({ name: name.slice(0, 100), value: value.slice(0, 500), chance });
        db.config.donoDropChances[name] = chance;
        saveDB();
        addAudit(guild.id, interaction.user.id, 'mystery_prize_added', { name, chance });
        return interaction.reply({ content: `Added prize **${name}** with weight **${chance}**.`, ephemeral: true });
      }
      if (interaction.customId === 'dd:giveboxmodal') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const userId = interaction.fields.getTextInputValue('user').trim();
        const amount = Number(interaction.fields.getTextInputValue('amount'));
        if (!/^\d{17,20}$/.test(userId) || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
          return interaction.reply({ content: 'Enter a valid Discord user ID and a whole number from 1 to 1000.', ephemeral: true });
        }
        db.dono.boxes[userId] = (db.dono.boxes[userId] || 0) + amount;
        db.dono.transactions.push({ at: stamp(), kind: 'give_boxes', userId, amount, adminId: interaction.user.id });
        saveDB();
        addAudit(guild.id, interaction.user.id, 'give_mystery_boxes', { userId, amount });
        await logAction(guild, `🎁 **give_boxes**\nPlayer: <@${userId}>\nAmount: **${amount}**\nAdmin: ${interaction.user}`);
        return interaction.reply({ content: `Gave **${amount}** mystery box(es) to <@${userId}>.`, ephemeral: true });
      }
      if (interaction.customId === 'dd:viewboxesmodal') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const userId = interaction.fields.getTextInputValue('user').trim();
        const count = Number(db.dono.boxes[userId] || 0);
        return interaction.reply({ content: `<@${userId}> has **${count}** mystery box(es).`, ephemeral: true });
      }
      if (interaction.customId === 'dd:viewbalancemodal') {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const userId = interaction.fields.getTextInputValue('user').trim();
        const balance = Number(db.dono.balances[userId] || 0);
        return interaction.reply({ content: `Player <@${userId}> balance: **€${balance.toFixed(2)}**`, ephemeral: true });
      }
      if (interaction.customId.startsWith('dd:creditmodal:')) {
        if (!isDonoOwner(member)) return interaction.reply({ content: 'No permission.', ephemeral: true });
        const kind = interaction.customId.endsWith(':give') ? 'give_credit' : 'remove_credit';
        const userId = interaction.fields.getTextInputValue('user').trim();
        const amount = Number(interaction.fields.getTextInputValue('amount'));
        const reason = interaction.fields.getTextInputValue('reason') || '';
        if (!/^\d{17,20}$/.test(userId) || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
          return interaction.reply({ content: 'Enter a valid Discord user ID and a positive amount.', ephemeral: true });
        }
        const old = Number(db.dono.balances[userId] || 0);
        const next = kind === 'give_credit' ? old + amount : old - amount;
        if (next < 0) return interaction.reply({ content: 'That player does not have enough credit.', ephemeral: true });
        db.dono.balances[userId] = Math.round(next * 100) / 100;
        const tx = { at: stamp(), kind, userId, amount: Math.round(amount * 100) / 100, before: old, after: db.dono.balances[userId], adminId: interaction.user.id, reason };
        db.dono.transactions.unshift(tx);
        saveDB();
        addAudit(guild.id, interaction.user.id, kind, tx);
        await logCredit(guild, kind, userId, amount, old, db.dono.balances[userId], interaction.user.id, reason);
        return interaction.reply({ content: `Updated <@${userId}>: €${old.toFixed(2)} → €${db.dono.balances[userId].toFixed(2)}.`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong. Check the bot logs.', ephemeral: true }).catch(() => {});
    } else if (interaction.isRepliable && interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply('Something went wrong. Check the bot logs.').catch(() => {});
    }
  }
}

async function handleOpenMysteryBox(interaction) {
  const userId = interaction.user.id;
  const inventory = Math.max(0, Number(db.dono.boxes[userId] || 0));
  if (inventory < 1) return interaction.reply({ content: '🎁 You do not have any mystery boxes.', ephemeral: true });
  const prizes = (db.config.donoPrizes || []).filter(p => {
    const chance = Number(db.config.donoDropChances?.[p.name] ?? p.chance ?? 0);
    return p && p.name && Number.isFinite(chance) && chance > 0;
  });
  if (!prizes.length) return interaction.reply({ content: 'Mystery boxes are temporarily unavailable.', ephemeral: true });
  const weighted = prizes.map(p => ({ prize: p, weight: Math.max(0, Number(db.config.donoDropChances?.[p.name] ?? p.chance ?? 0)) }));
  const totalWeight = weighted.reduce((sum, x) => sum + x.weight, 0);
  if (totalWeight <= 0) return interaction.reply({ content: 'Drop chances not configured correctly.', ephemeral: true });
  let roll = Math.random() * totalWeight;
  let chosen = weighted[weighted.length - 1].prize;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) { chosen = item.prize; break; }
  }
  const at = stamp();
  db.dono.boxes[userId] = inventory - 1;
  const opening = { at, userId, prize: chosen.name, value: chosen.value ?? chosen.name, chanceWeight: Number(db.config.donoDropChances?.[chosen.name] ?? chosen.chance ?? 0) };
  db.dono.openings.unshift(opening);
  db.dono.openings = db.dono.openings.slice(0, 5000);
  db.dono.transactions.unshift({ at, kind: 'open_box', userId, amount: 1, prize: chosen.name });
  saveDB();
  addAudit(interaction.guild?.id, userId, 'mystery_box_opened', opening);
  if (interaction.guild) await logAction(interaction.guild, `🎁 **Mystery Box Opened**\nPlayer: <@${userId}>\nPrize: **${chosen.name}**\nBoxes remaining: ${db.dono.boxes[userId]}`);
  return interaction.reply({
    embeds: [embed('🎁 Mystery Box Opened!', `**You won:** ${clip(chosen.name, 200)}\n**Prize details:** ${clip(chosen.value ?? chosen.name, 700)}\n**Boxes remaining:** ${db.dono.boxes[userId]}`, 0xf1c40f)],
    ephemeral: false
  });
}

// ---------- MESSAGES: !wipe, hype squad verification, ticket activity ----------
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  return runIn(message.guild, async () => {
    try {
      const isWipe = /^!wipe\b/i.test(message.content.trim());
      if (!isAuthorized(message.guild.id)) {
        if (isWipe) await wipeReply(message, true);
        return;
      }
      if (isWipe) { await wipeReply(message, false); return; }
      const upKey = `${message.guild.id}:${message.author.id}`;
      const pu = pendingUploads.get(upKey);
      if (pu) {
        if (Date.now() > pu.expires) pendingUploads.delete(upKey);
        else if (message.channelId === pu.channelId) {
          const att = message.attachments.find(a => /^image\//i.test(a.contentType || ''));
          if (att) { await handleUpload(message, pu, att); return; }
        }
      }
      await handleHype(message);
      const ticket = db.tickets[message.channelId];
      if (ticket && ticket.status === 'open') {
        ticket.messageCount = (ticket.messageCount || 0) + 1;
        ticket.lastMessageAt = stamp();
        saveDB();
      }
    } catch (e) {
      console.error('messageCreate error:', e);
    }
  });
});

// ---------- POLL REACTIONS (one vote per person, if the poll has that option) ----------
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!message?.guild || !isAuthorized(message.guild.id)) return;
    await runIn(message.guild, async () => {
      const p = db.polls[message.id];
      if (!p || p.ended) return;
      const key = reaction.emoji.toString();
      if (!p.emojis.includes(key)) {
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }
      if (p.single) {
        for (const r of message.reactions.cache.values()) {
          if (r.emoji.toString() !== key) await r.users.remove(user.id).catch(() => {});
        }
      }
    });
  } catch (e) {
    console.error('reaction handler error:', e);
  }
});

// ---------- HYPE SQUAD: react the moment a nickname changes ----------
client.on('guildMemberUpdate', async (_oldMember, newMember) => {
  try {
    if (!isAuthorized(newMember.guild.id)) return;
    await runIn(newMember.guild, () => syncHypeMember(newMember));
  } catch (e) {
    console.error('guildMemberUpdate error:', e);
  }
});
client.on('guildMemberAdd', async member => {
  try {
    if (!isAuthorized(member.guild.id)) return;
    await runIn(member.guild, () => syncHypeMember(member));
  } catch (e) {
    console.error('hype join error:', e);
  }
});


// ---------- AUTOROLE (needs the "Server Members Intent" enabled in the Developer Portal) ----------
client.on('guildMemberAdd', async member => {
  try {
    const guild = member.guild;
    if (!isAuthorized(guild.id)) return;
    await runIn(guild, async () => {
      const ar = db.config.autorole;
      if (!ar?.enabled || !ar.roleId) return;
      const role = guild.roles.cache.get(ar.roleId);
      if (!role) { console.warn(`Autorole in ${guild.name}: the configured role no longer exists.`); return; }
      if (role.managed || role.id === guild.id) return;
      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || me.roles.highest.comparePositionTo(role) <= 0) {
        console.warn(`Autorole in ${guild.name}: I cannot give ${role.name} (Manage Roles missing or my role is not above it).`);
        return;
      }
      await member.roles.add(role, 'Autorole').catch(e => console.error('Autorole failed:', e.message));
    });
  } catch (e) {
    console.error('Autorole error:', e);
  }
});


client.login(TOKEN).catch(err => {
  console.error('Login failed. Verify TOKEN.', err);
  process.exit(1);
});p