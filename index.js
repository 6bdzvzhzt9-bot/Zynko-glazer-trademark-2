const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType
} = require("discord.js");

const express = require("express");
const fs = require("fs");


// =====================
// KEEP ALIVE (RENDER)
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
  claims: "./claims.json",
  earnings: "./earnings.json",
  activity: "./activity.json",
  tickets: "./tickets.json",
  messages: "./messages.json",
  backups: "./backups.json"

};


// =====================
// CREATE DATABASE FILES
// =====================

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
    fs.readFileSync(file, "utf8")
  );

}


function save(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );

}


// =====================
// ALLOWED TICKET CATEGORIES
// =====================

const TICKET_CATEGORIES = [

  "➖➖➖Mesh Support➖➖➖",
  "➖➖➖News➖➖➖",
  "➖➖➖Mesh➖➖➖",
  "➖➖➖Support➖➖➖"

];


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


client.on(
  "error",
  console.error
);
// =====================
// SLASH COMMANDS
// =====================

const commands = [

  new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim current ticket"),


  new SlashCommandBuilder()
  .setName("unclaim")
  .setDescription("Remove ticket claim"),


  new SlashCommandBuilder()
  .setName("close")
  .setDescription("Close ticket"),


  new SlashCommandBuilder()
.setName("setup")
.setDescription("Setup bot channels"),

  new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Backup server"),


  new SlashCommandBuilder()
  .setName("info")
  .setDescription("Bot information")

].map(command => command.toJSON());


// =====================
// LOAD COMMANDS
// =====================

client.once("ready", async()=>{

console.log(
`${client.user.tag} is online`
);


const rest = new REST({
version:"10"
}).setToken(
process.env.TOKEN
);


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

client.on(
"interactionCreate",
async interaction=>{


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



await interaction.reply({

content:
"⚙️ **Setup Dashboard**\n\nChoose a system to configure:",


components:[

{

type:1,

components:[

{

type:2,

label:"📜 Transcript Channel",

style:1,

custom_id:"setup_transcript"

},

{

type:2,

label:"🏆 Claim Leaderboard",

style:3,

custom_id:"setup_claims"

}

]

},


{

type:1,

components:[

{

type:2,

label:"💵 Earnings Board",

style:3,

custom_id:"setup_earnings"

},

{

type:2,

label:"👮 Activity Board",

style:2,

custom_id:"setup_activity"

}

]

}

],


ephemeral:true

});


});


// =====================
// SETUP BUTTONS
// =====================

client.on(
"interactionCreate",
async interaction=>{


if(!interaction.isButton())
return;


if(!interaction.customId.startsWith("setup_"))
return;



let setup = load(
FILES.setup
);


if(!setup[interaction.guild.id]){

setup[interaction.guild.id]={};

}



const serverSetup =
setup[interaction.guild.id];



switch(interaction.customId){


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

serverSetup.claimChannel =
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
"✅ Earnings channel saved.",

ephemeral:true

});

break;



case "setup_activity":

serverSetup.activityChannel =
interaction.channel.id;

await interaction.reply({

content:
"✅ Activity channel saved.",

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
// CLAIM SYSTEM
// =====================

client.on(
"interactionCreate",
async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "claim")
return;



// Permission check

if(!interaction.member.permissions.has(
PermissionsBitField.Flags.Administrator
)){

return interaction.reply({

content:
"❌ Administrator permission required.",

ephemeral:true

});

}



// Category check

const category =
interaction.channel.parent?.name;



if(!TICKET_CATEGORIES.includes(category)){

return interaction.reply({

content:
"❌ This channel is not a supported ticket.",

ephemeral:true

});

}



// Load claims

let claims =
load(FILES.claims);



let ticketData =
load(FILES.tickets);



const ticketId =
interaction.channel.id;



// Already claimed

if(ticketData[ticketId]?.claimed){

return interaction.reply({

content:
`❌ Ticket already claimed by <@${ticketData[ticketId].claimer}>`,

ephemeral:true

});

}



// Save ticket claim

ticketData[ticketId] = {

claimed:true,

claimer:interaction.user.id,

claimerName:interaction.user.username,

claimedAt:Date.now(),

category:category

};


save(
FILES.tickets,
ticketData
);



// Update leaderboard

if(!claims[interaction.user.id]){

claims[interaction.user.id]={

name:interaction.user.username,

claims:0

};

}


claims[interaction.user.id].claims++;


save(
FILES.claims,
claims
);



// Activity log

logActivity(

interaction.user,

`Claimed ${interaction.channel.name}`

);



await interaction.reply({

content:

`✅ Ticket claimed by ${interaction.user}`

});


});



// =====================
// ACTIVITY LOGGER
// =====================

async function logActivity(user, action){


let activity =
load(FILES.activity);



if(!activity[user.id]){

activity[user.id]={

name:user.username,

actions:[]

};

}



activity[user.id].actions.push({

action:action,

time:Date.now()

});



save(
FILES.activity,
activity
);


}
// =====================
// TICKET VALUES
// =====================

function ticketValue(category){

if(category.includes("Dono"))
return 0.50;


if(category.includes("Support"))
return 0.30;


return 0;

}


// =====================
// CLOSE TICKET
// =====================

client.on(
"interactionCreate",
async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "close")
return;



const category =
interaction.channel.parent?.name;



if(!TICKET_CATEGORIES.includes(category)){

return interaction.reply({

content:
"❌ This is not a supported ticket.",

ephemeral:true

});

}



let tickets =
load(FILES.tickets);


let ticket =
tickets[interaction.channel.id];



const claimer =
ticket?.claimer;



if(!claimer){

return interaction.reply({

content:
"❌ This ticket has not been claimed.",

ephemeral:true

});

}



// CREATE TRANSCRIPT

const messages =
await interaction.channel.messages.fetch({
limit:100
});



const transcript =
messages

.sort(
(a,b)=>
a.createdTimestamp-b.createdTimestamp
)

.map(msg=>
`[${msg.author.username}] ${msg.content}`
)

.join("\n");



const fileName =
`${interaction.channel.name}-transcript.txt`;



fs.writeFileSync(
fileName,
transcript
);



// SEND TRANSCRIPT

await sendTranscript(
interaction.channel,
fileName,
interaction
);



// UPDATE EARNINGS

let earnings =
load(FILES.earnings);



if(!earnings[claimer]){

earnings[claimer]={

name:
interaction.guild.members.cache.get(claimer)?.user.username || "Unknown",

money:0

};

}



earnings[claimer].money +=
ticketValue(category);



save(
FILES.earnings,
earnings
);



// ACTIVITY

logActivity(

interaction.user,

`Closed ${interaction.channel.name}`

);



await interaction.reply({

content:
"✅ Ticket closed. Transcript saved."

});


});


// =====================
// SEND TRANSCRIPT
// =====================

async function sendTranscript(
channel,
fileName,
interaction
){


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

Closed by: ${interaction.user}`,

files:[

new AttachmentBuilder(fileName)

]

});


}
// =====================
// REFRESH BOARD MESSAGE
// =====================

async function refreshMessage(channel, idName, content){

let messages =
load(FILES.messages);



if(!messages[idName]){

const msg =
await channel.send(content);


messages[idName] =
msg.id;


save(
FILES.messages,
messages
);


return;

}



try{

const old =
await channel.messages.fetch(
messages[idName]
);


await old.edit(content);


}

catch{

const msg =
await channel.send(content);


messages[idName] =
msg.id;


save(
FILES.messages,
messages
);

}

}


// =====================
// CLAIM BOARD
// =====================

async function updateClaims(){


const setup =
load(FILES.setup);



for(const guildId in setup){


const channelId =
setup[guildId].claimChannel;


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


await refreshMessage(
channel,
`claims_${guildId}`,
text
);


}

}



setInterval(
updateClaims,
120000
);


// =====================
// EARNINGS BOARD
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
"💵 **Earnings Board**\n\n";



Object.values(earnings)

.sort((a,b)=>
b.money-a.money
)

.forEach((user,index)=>{

text +=
`${index+1}. ${user.name} — $${user.money.toFixed(2)}\n`;

});



await refreshMessage(
channel,
`earnings_${guildId}`,
text
);


}

}



setInterval(
updateEarnings,
120000
);


// =====================
// ACTIVITY BOARD
// =====================

async function updateActivity(){


const setup =
load(FILES.setup);



for(const guildId in setup){


const channelId =
setup[guildId].activityChannel;


if(!channelId)
continue;



const channel =
client.channels.cache.get(channelId);


if(!channel)
continue;



const activity =
load(FILES.activity);



let text =
"👮 **Admin Activity**\n\n";



Object.values(activity)

.forEach(user=>{


text +=
`**${user.name}**\n`;


user.actions
.slice(-5)
.forEach(action=>{


text +=
`• ${action.action}\n`;

});


text += "\n";


});



await refreshMessage(
channel,
`activity_${guildId}`,
text
);


}

}



setInterval(
updateActivity,
120000
);


// =====================
// INFO COMMAND
// =====================

client.on(
"interactionCreate",
async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "info")
return;



await interaction.reply({

embeds:[

new EmbedBuilder()

.setTitle("🤖 Bot Information")

.setDescription(`

🎫 Ticket Claim System

Commands:

/claim
/close
/setup
/backup
/info

Features:

📜 Transcripts
🏆 Claim Leaderboard
💵 Earnings Tracker
👮 Activity Tracker
💾 Backup System

`)

]

});


});


// =====================
// BACKUP SYSTEM
// =====================

client.on(
"interactionCreate",
async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "backup")
return;



if(!interaction.member.permissions.has(
PermissionsBitField.Flags.ManageGuild
)){

return interaction.reply({

content:
"❌ Manage Server permission required.",

ephemeral:true

});

}



let backups =
load(FILES.backups);



backups[interaction.guild.id]={

roles:
interaction.guild.roles.cache.map(r=>({

name:r.name,

permissions:r.permissions.toArray()

})),


channels:
interaction.guild.channels.cache.map(c=>({

name:c.name,

type:c.type

}))

};



save(
FILES.backUPS || FILES.backups,
backups
);



await interaction.reply({

content:
"✅ Backup created.",

ephemeral:true

});


});

// =====================
// UNCLAIM SYSTEM
// =====================

client.on(
"interactionCreate",
async interaction => {

if(!interaction.isChatInputCommand())
return;

if(interaction.commandName !== "unclaim")
return;


if(!interaction.member.permissions.has(
PermissionsBitField.Flags.Administrator
)){

return interaction.reply({
content:"❌ Administrator permission required.",
ephemeral:true
});

}


let tickets = load(FILES.tickets);


let ticket =
tickets[interaction.channel.id];


if(!ticket?.claimed){

return interaction.reply({
content:"❌ This ticket is not claimed.",
ephemeral:true
});

}


delete ticket.claimer;
delete ticket.claimerName;
delete ticket.claimedAt;

ticket.claimed = false;


tickets[interaction.channel.id] = ticket;


save(
FILES.tickets,
tickets
);


logActivity(
interaction.user,
`Unclaimed ${interaction.channel.name}`
);


await interaction.reply({

content:
"✅ Ticket claim removed."

});


});
// =====================
// FINAL LOGIN
// =====================

client.login(
process.env.TOKEN
);