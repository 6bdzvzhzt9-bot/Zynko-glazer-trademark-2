const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const express = require("express");
const fs = require("fs");


// =====================
// KEEP ALIVE
// =====================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);


// =====================
// DATABASE FILES
// =====================

const FILES = {

  setup: "./setup.json",
  tickets: "./tickets.json",
  claims: "./claims.json",
  earnings: "./earnings.json",
  activity: "./activity.json",
  backups: "./backups.json"

};


for (const file of Object.values(FILES)) {

  if (!fs.existsSync(file)) {

    fs.writeFileSync(
      file,
      "{}"
    );

  }

}


// =====================
// DATABASE FUNCTIONS
// =====================

function load(file) {

  return JSON.parse(
    fs.readFileSync(file)
  );

}


function save(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );

}


// =====================
// DISCORD CLIENT
// =====================

const client = new Client({

  intents: [

    GatewayIntentBits.Guilds,

    GatewayIntentBits.GuildMessages,

    GatewayIntentBits.MessageContent,

    GatewayIntentBits.GuildMembers

  ]

});


client.on("error", console.error);


// =====================
// SLASH COMMANDS
// =====================

const commands = [

  new SlashCommandBuilder()
  .setName("info")
  .setDescription("Show bot commands"),


  new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Setup bot features"),


  new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open a ticket"),


  new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim a ticket"),


  new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Backup server")

  .addSubcommand(sub =>
    sub
    .setName("create")
    .setDescription("Create backup")
  )

  .addSubcommand(sub =>
    sub
    .setName("restore")
    .setDescription("Restore backup")
  )

].map(command => command.toJSON());


// =====================
// BOT READY
// =====================

client.once("ready", async () => {

  console.log(
    `${client.user.tag} is online`
  );


  const rest = new REST({
    version: "10"
  }).setToken(process.env.TOKEN);


  await rest.put(

    Routes.applicationCommands(
      client.user.id
    ),

    {
      body: commands
    }

  );


  console.log(
    "Commands loaded"
  );

});
// =====================
// SETUP DASHBOARD
// =====================

client.on("interactionCreate", async(interaction)=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "setup")
return;



if(!interaction.member.permissions.has(
PermissionsBitField.Flags.ManageGuild
)){

return interaction.reply({

content:
"❌ You need Manage Server permission.",

ephemeral:true

});

}



const row1 = new ActionRowBuilder()
.addComponents(

new ButtonBuilder()
.setCustomId("setup_ticket")
.setLabel("🎫 Tickets")
.setStyle(ButtonStyle.Primary),


new ButtonBuilder()
.setCustomId("setup_transcript")
.setLabel("📜 Transcript Channel")
.setStyle(ButtonStyle.Primary),


new ButtonBuilder()
.setCustomId("setup_claims")
.setLabel("🏆 Claim Leaderboard")
.setStyle(ButtonStyle.Success)

);



const row2 = new ActionRowBuilder()
.addComponents(

new ButtonBuilder()
.setCustomId("setup_earnings")
.setLabel("💵 Earnings Tracker")
.setStyle(ButtonStyle.Success),


new ButtonBuilder()
.setCustomId("setup_activity")
.setLabel("👮 Admin Activity")
.setStyle(ButtonStyle.Secondary)

);



await interaction.reply({

content:
`
⚙️ **Setup Dashboard**

Choose what you want to setup:

🎫 Ticket System
📜 Transcript Channel
🏆 Claim Leaderboard
💵 Earnings Tracker
👮 Admin Activity
`,

components:[
row1,
row2
],

ephemeral:true

});


});



// =====================
// SETUP BUTTONS
// =====================

client.on("interactionCreate", async(interaction)=>{


if(!interaction.isButton())
return;


if(!interaction.customId.startsWith("setup_"))
return;



let setup =
load(FILES.setup);



if(!setup[interaction.guild.id]){

setup[interaction.guild.id]={};

}



const serverSetup =
setup[interaction.guild.id];



switch(interaction.customId){


case "setup_ticket":

serverSetup.ticketSystem = true;


await interaction.reply({

content:
"✅ Ticket system enabled.",

ephemeral:true

});

break;



case "setup_transcript":

serverSetup.transcriptChannel =
interaction.channel.id;


await interaction.reply({

content:
"✅ Transcript channel saved.",

ephemeral:true

});

break;



case "setup_claims":

serverSetup.claimLeaderboard =
interaction.channel.id;


await interaction.reply({

content:
"✅ Claim leaderboard channel saved.",

ephemeral:true

});

break;



case "setup_earnings":

serverSetup.earningsChannel =
interaction.channel.id;


await interaction.reply({

content:
"✅ Earnings tracker channel saved.",

ephemeral:true

});

break;



case "setup_activity":

serverSetup.activityChannel =
interaction.channel.id;


await interaction.reply({

content:
"✅ Activity tracker channel saved.",

ephemeral:true

});

break;


}



setup[interaction.guild.id] =
serverSetup;


save(
FILES.setup,
setup
);


});
// =====================
// TICKET COMMAND
// =====================

client.on("interactionCreate", async(interaction)=>{

if(!interaction.isChatInputCommand())
return;

if(interaction.commandName !== "ticket")
return;


const row = new ActionRowBuilder()
.addComponents(

new ButtonBuilder()
.setCustomId("ticket_support")
.setLabel("🛠️ Support")
.setStyle(ButtonStyle.Primary),


new ButtonBuilder()
.setCustomId("ticket_news")
.setLabel("📰 News")
.setStyle(ButtonStyle.Secondary),


new ButtonBuilder()
.setCustomId("ticket_dono")
.setLabel("💰 Dono")
.setStyle(ButtonStyle.Success)

);


await interaction.reply({

content:
"Choose ticket type:",

components:[row],

ephemeral:true

});


});


// =====================
// CREATE TICKET
// =====================

client.on("interactionCreate", async(interaction)=>{

if(!interaction.isButton())
return;

if(!interaction.customId.startsWith("ticket_"))
return;


const type =
interaction.customId.replace("ticket_","");


const channel =
await interaction.guild.channels.create({

name:
`${type}-ticket-${interaction.user.username}`,

type:
ChannelType.GuildText,


permissionOverwrites:[

{
id: interaction.guild.id,

deny:[
PermissionsBitField.Flags.ViewChannel
]

},

{
id: interaction.user.id,

allow:[

PermissionsBitField.Flags.ViewChannel,

PermissionsBitField.Flags.SendMessages

]

}

]

});


let tickets =
load(FILES.tickets);


tickets[channel.id]={

owner:
interaction.user.id,

type:type,

claimed:false

};


save(
FILES.tickets,
tickets
);



await channel.send({

content:
`<@${interaction.user.id}> Your ${type} ticket has been created.`

});


await interaction.reply({

content:
`✅ Ticket created: ${channel}`,

ephemeral:true

});


});



// =====================
// TICKET VALUE
// =====================

function ticketValue(type){

if(type === "support")
return 0.30;


if(type === "news")
return 0.50;


if(type === "dono")
return 0;


return 0;

}



// =====================
// CLAIM SYSTEM (FIXED)
// =====================

client.on("interactionCreate", async(interaction)=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "claim")
return;



if(!interaction.member.permissions.has(

PermissionsBitField.Flags.Administrator

)){

return interaction.reply({

content:
"❌ Administrator permission required.",

ephemeral:true

});

}



let tickets =
load(FILES.tickets);


let ticket =
tickets[interaction.channel.id];


if(!ticket){

return interaction.reply({

content:
"❌ This is not a ticket.",

ephemeral:true

});

}



if(ticket.claimed){

return interaction.reply({

content:
`❌ Already claimed by <@${ticket.claimedBy}>`,

ephemeral:true

});

}



ticket.claimed = true;

ticket.claimedBy =
interaction.user.id;


tickets[interaction.channel.id]=ticket;


save(
FILES.tickets,
tickets
);



// CLAIM COUNT

let claims =
load(FILES.claims);


if(!claims[interaction.user.id]){

claims[interaction.user.id]={

name:
interaction.user.username,

claims:0

};

}


claims[interaction.user.id].claims++;


save(
FILES.claims,
claims
);



// TRANSCRIPT

const messages =
await interaction.channel.messages.fetch({

limit:100

});


const transcript =
messages
.sort((a,b)=>
a.createdTimestamp-b.createdTimestamp
)
.map(msg =>
`[${msg.author.username}] ${msg.content}`
)
.join("\n");


const fileName =
`${interaction.channel.name}-transcript.txt`;


fs.writeFileSync(
fileName,
transcript
);
await sendTranscript(
interaction.channel,
fileName,
interaction
);


// EARNINGS

let earnings =
load(FILES.earnings);


if(!earnings[interaction.user.id]){

earnings[interaction.user.id]={

name:
interaction.user.username,

money:0

};

}


earnings[interaction.user.id].money +=
ticketValue(ticket.type);


save(
FILES.earnings,
earnings
);



interaction.reply({

content:
"✅ Ticket claimed, transcript saved, earnings updated."

});


});
// =====================
// SEND TRANSCRIPT TO CHANNEL
// =====================

async function sendTranscript(channel, fileName, interaction){

const setup =
load(FILES.setup);


const serverSetup =
setup[interaction.guild.id];


if(!serverSetup?.transcriptChannel)
return;


const transcriptChannel =
interaction.guild.channels.cache.get(
serverSetup.transcriptChannel
);


if(!transcriptChannel)
return;


await transcriptChannel.send({

content:
`📜 **Ticket Transcript**

Ticket: ${channel.name}

Claimed by: ${interaction.user}`,

files:[
new AttachmentBuilder(fileName)
]

});

}



// =====================
// CLAIM LEADERBOARD
// =====================

async function updateClaimLeaderboard(){


const setup =
load(FILES.setup);



for(const guildId in setup){


const channelId =
setup[guildId].claimLeaderboard;


if(!channelId)
continue;


const channel =
client.channels.cache.get(channelId);


if(!channel)
continue;



const claims =
load(FILES.claims);



let text =
"🏆 **Claim Leaderboard**\n\n";


Object.values(claims)

.sort((a,b)=>
b.claims-a.claims
)

.forEach((user,index)=>{


text +=
`${index+1}. ${user.name} — ${user.claims} claims\n`;

});


const messages =
await channel.messages.fetch({
limit:10
});


const oldMessage =
messages.find(
msg=>msg.author.id===client.user.id
);



if(oldMessage){

oldMessage.edit(text);

}else{

channel.send(text);

}


}


}



setInterval(

updateClaimLeaderboard,

120000

);




// =====================
// EARNINGS TRACKER
// =====================

async function updateEarnings(){


const setup =
load(FILES.setup);



for(const guildId in setup){


const channelId =
setup[guildId].earningsChannel;


if(!channelId)
continue;


const channel =
client.channels.cache.get(channelId);


if(!channel)
continue;



const earnings =
load(FILES.earnings);



let text =
"💵 **Earnings Tracker**\n\n";



Object.values(earnings)

.sort((a,b)=>
b.money-a.money
)

.forEach((user,index)=>{


text +=
`${index+1}. ${user.name} — $${user.money.toFixed(2)}\n`;

});



const messages =
await channel.messages.fetch({
limit:10
});



const oldMessage =
messages.find(
msg=>msg.author.id===client.user.id
);



if(oldMessage){

oldMessage.edit(text);

}else{

channel.send(text);

}


}


}



setInterval(

updateEarnings,

120000

);
// =====================
// ADMIN ACTIVITY TRACKER
// =====================

async function logActivity(user, action){

let activity =
load(FILES.activity);


activity[user.id] = {

name:
user.username,

action:action,

time:Date.now()

};


save(
FILES.activity,
activity
);

}



// Log commands used

client.on("interactionCreate", async(interaction)=>{


if(!interaction.user)
return;


if(interaction.isChatInputCommand()){

await logActivity(

interaction.user,

`Used /${interaction.commandName}`

);

}


});




// =====================
// BACKUP SYSTEM
// =====================

client.on("interactionCreate", async(interaction)=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "backup")
return;



if(!interaction.member.permissions.has(

PermissionsBitField.Flags.ManageGuild

)){

return interaction.reply({

content:
"❌ You need Manage Server permission.",

ephemeral:true

});

}



const type =
interaction.options.getSubcommand();



let backups =
load(FILES.backups);



if(type === "create"){



backups[interaction.guild.id] = {


roles:

interaction.guild.roles.cache.map(role=>({

name:
role.name,

permissions:
role.permissions.toArray()

})),


channels:

interaction.guild.channels.cache.map(channel=>({

name:
channel.name,

type:
channel.type

}))


};



save(
FILES.backups,
backups
);



return interaction.reply({

content:
"✅ Backup created.",

ephemeral:true

});


}



if(type === "restore"){


if(!backups[interaction.guild.id]){


return interaction.reply({

content:
"❌ No backup found.",

ephemeral:true

});


}



return interaction.reply({

content:
"✅ Backup found. Restore system ready.",

ephemeral:true

});


}


});



// =====================
// INFO COMMAND
// =====================

client.on("interactionCreate", async(interaction)=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "info")
return;



await interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("🤖 Bot Commands")

.setDescription(`

🎫 /ticket
⚙️ /setup
👑 /claim
💾 /backup

Features:

📜 Transcript System
🏆 Claim Leaderboard
💵 Earnings Tracker
👮 Admin Activity
💾 Backup Manager

`)

]

});


});



// =====================
// FINAL LOGIN
// =====================

client.login(process.env.TOKEN);