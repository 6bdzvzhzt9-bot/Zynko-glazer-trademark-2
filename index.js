const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  AttachmentBuilder,
  ActivityType,
  ChannelType
} = require("discord.js");

const express = require("express");
const fs = require("fs");


// =====================
// KEEP ALIVE
// =====================

const app = express();

app.get("/", (req,res)=>{
  res.send("Bot is online!");
});

app.listen(process.env.PORT || 3000);


// =====================
// DATABASE
// =====================

const FILES = {

  setup:"./setup.json",
  tickets:"./tickets.json",
  claims:"./claims.json",
  earnings:"./earnings.json",
  activity:"./activity.json",
  messages:"./messages.json",
  backups:"./backups.json",
  clones:"./clones.json"

};


for(const file of Object.values(FILES)){

  if(!fs.existsSync(file)){

    fs.writeFileSync(file,"{}");

  }

}


function load(file){

  try{

    return JSON.parse(
      fs.readFileSync(file,"utf8")
    );

  }catch{

    return {};

  }

}


function save(file,data){

  fs.writeFileSync(
    file,
    JSON.stringify(data,null,2)
  );

}



// =====================
// CLIENT
// =====================

const client = new Client({

  intents:[

    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers

  ]

});



// =====================
// COMMANDS
// =====================

const commands = [

new SlashCommandBuilder()
.setName("setup")
.setDescription("Setup bot systems"),


new SlashCommandBuilder()
.setName("claim")
.setDescription("Claim ticket"),


new SlashCommandBuilder()
.setName("unclaim")
.setDescription("Remove ticket claim"),


new SlashCommandBuilder()
.setName("close")
.setDescription("Close ticket"),


new SlashCommandBuilder()
.setName("info")
.setDescription("Bot information"),


new SlashCommandBuilder()
.setName("backup")
.setDescription("Backup server"),


new SlashCommandBuilder()
.setName("clone")
.setDescription("Clone server layout"),

new SlashCommandBuilder()
.setName("paste")
.setDescription("Restore cloned server layout")

].map(x=>x.toJSON());



// =====================
// READY
// =====================

client.once("ready", async()=>{


console.log(
`${client.user.tag} online`
);


client.user.setActivity(
"Ticket Systems",
{
type:ActivityType.Watching
}
);



const rest = new REST({
version:"10"
}).setToken(process.env.TOKEN);



await rest.put(

Routes.applicationCommands(
client.user.id
),

{
body:commands
}

);


console.log(
"Commands loaded"
);


});


// =====================
// ERRORS
// =====================

client.on(
"error",
console.error
);


process.on(
"unhandledRejection",
console.error
);
// =====================
// SETUP DASHBOARD
// =====================

client.on("interactionCreate", async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "setup")
return;



if(!interaction.member.permissions.has(
PermissionsBitField.Flags.ManageGuild
)){

return interaction.reply({

content:"❌ You need Manage Server permission.",
ephemeral:true

});

}



await interaction.reply({

content:
"⚙️ **Setup Dashboard**\nChoose a system:",


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

client.on("interactionCreate", async interaction=>{


if(!interaction.isButton())
return;


if(!interaction.customId.startsWith("setup_"))
return;



let setup = load(FILES.setup);



if(!setup[interaction.guild.id]){

setup[interaction.guild.id] = {};

}



const data =
setup[interaction.guild.id];



switch(interaction.customId){


case "setup_transcript":

data.transcript =
interaction.channel.id;

break;



case "setup_claims":

data.claims =
interaction.channel.id;

break;



case "setup_earnings":

data.earnings =
interaction.channel.id;

break;



case "setup_activity":

data.activity =
interaction.channel.id;

break;


}



setup[interaction.guild.id] = data;


save(
FILES.setup,
setup
);



await interaction.reply({

content:"✅ Setup saved.",

ephemeral:true

});


});
// =====================
// ACTIVITY LOGGER
// =====================

async function logActivity(user, action){

let activity = load(FILES.activity);


if(!activity[user.id]){

activity[user.id] = {

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
// CLAIM SYSTEM
// =====================

client.on("interactionCreate", async interaction=>{


if(!interaction.isChatInputCommand())
return;


if(interaction.commandName !== "claim")
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

let claims = load(FILES.claims);



const id = interaction.channel.id;



if(tickets[id]?.claimed){

return interaction.reply({

content:
`❌ Already claimed by <@${tickets[id].claimer}>`,
ephemeral:true

});

}



tickets[id] = {

claimed:true,

claimer:interaction.user.id,

name:interaction.user.username,

time:Date.now()

};



save(
FILES.tickets,
tickets
);



if(!claims[interaction.user.id]){

claims[interaction.user.id] = {

name:interaction.user.username,

claims:0

};

}



claims[interaction.user.id].claims++;



save(
FILES.claims,
claims
);



await logActivity(

interaction.user,

`Claimed ${interaction.channel.name}`

);



await interaction.reply({

content:
`✅ Ticket claimed by ${interaction.user}`

});


});




// =====================
// UNCLAIM SYSTEM
// =====================

client.on("interactionCreate", async interaction=>{


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



const ticket =
tickets[interaction.channel.id];



if(!ticket?.claimed){

return interaction.reply({

content:"❌ This ticket is not claimed.",
ephemeral:true

});

}



delete tickets[interaction.channel.id];



save(
FILES.tickets,
tickets
);



await logActivity(

interaction.user,

`Unclaimed ${interaction.channel.name}`

);



await interaction.reply({

content:
"✅ Ticket unclaimed."

});


});
// =====================
// TICKET VALUE
// =====================

function ticketValue(name){

  if(name.toLowerCase().includes("dono"))
    return 0.50;

  return 0.30;

}


// =====================
// CLOSE SYSTEM
// =====================

client.on("interactionCreate", async interaction => {

  if(!interaction.isChatInputCommand())
    return;

  if(interaction.commandName !== "close")
    return;


  let tickets = load(FILES.tickets);

  const ticket = tickets[interaction.channel.id];


  if(!ticket?.claimed){

    return interaction.reply({

      content:"❌ This ticket is not claimed.",
      ephemeral:true

    });

  }



  const messages =
  await interaction.channel.messages.fetch({
    limit:100
  });



  const transcript =
  messages
  .sort((a,b)=>a.createdTimestamp-b.createdTimestamp)
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



  const setup =
  load(FILES.setup);



  const transcriptChannel =
  interaction.guild.channels.cache.get(
    setup[interaction.guild.id]?.transcript
  );



  if(transcriptChannel){

    await transcriptChannel.send({

      content:
      `📜 Transcript\n🎫 ${interaction.channel.name}\n👤 Closed by ${interaction.user}`,

      files:[
        new AttachmentBuilder(fileName)
      ]

    });

  }



  let earnings =
  load(FILES.earnings);



  if(!earnings[ticket.claimer]){

    earnings[ticket.claimer] = {

      name:ticket.name,

      money:0

    };

  }



  earnings[ticket.claimer].money +=
  ticketValue(interaction.channel.name);



  save(
    FILES.earnings,
    earnings
  );



  await logActivity(
    interaction.user,
    `Closed ${interaction.channel.name}`
  );



  await interaction.reply({

    content:
    "✅ Ticket closed. Transcript saved."

  });



  setTimeout(()=>{

    interaction.channel.delete()
    .catch(()=>{});

  },3000);


});




// =====================
// MESSAGE REFRESH
// =====================

async function refreshMessage(channel,key,text){

  let messages =
  load(FILES.messages);



  if(!messages[key]){

    const msg =
    await channel.send(text);


    messages[key]=msg.id;


    save(
      FILES.messages,
      messages
    );


    return;

  }



  try{

    const old =
    await channel.messages.fetch(
      messages[key]
    );


    await old.edit(text);


  }catch{


    const msg =
    await channel.send(text);


    messages[key]=msg.id;


    save(
      FILES.messages,
      messages
    );


  }

}



// =====================
// CLAIM LEADERBOARD
// =====================

async function updateClaims(){

  const setup =
  load(FILES.setup);


  const claims =
  load(FILES.claims);



  for(const guildId in setup){

    const channel =
    client.channels.cache.get(
      setup[guildId].claims
    );


    if(!channel)
      continue;



    let text =
    "🏆 **Claim Leaderboard**\n\n";



    Object.values(claims)
    .sort((a,b)=>b.claims-a.claims)
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


  const earnings =
  load(FILES.earnings);



  for(const guildId in setup){

    const channel =
    client.channels.cache.get(
      setup[guildId].earnings
    );


    if(!channel)
      continue;



    let text =
    "💵 **Earnings Board**\n\n";



    Object.values(earnings)
    .sort((a,b)=>b.money-a.money)
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
// CLONE SYSTEM
// =====================

client.on("interactionCreate", async interaction => {

  if(!interaction.isChatInputCommand())
    return;

  if(interaction.commandName !== "clone")
    return;


  if(!interaction.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  )){

    return interaction.reply({

      content:"❌ Administrator permission required.",
      ephemeral:true

    });

  }



  const guild = interaction.guild;


  const cloneData = {

    name:guild.name,

    roles:guild.roles.cache
    .filter(role => role.name !== "@everyone")
    .map(role => ({

      name:role.name,

      color:role.color,

      permissions:
      role.permissions.bitfield.toString()

    })),



 channels:guild.channels.cache
.sort((a,b)=>a.rawPosition-b.rawPosition)
.map(channel => ({

  name:channel.name,

  type:channel.type,

  parent:
  channel.parent?.name || null,

  position:
  channel.rawPosition,

  permissionOverwrites:
channel.permissionOverwrites.cache.map(overwrite => ({

  id: overwrite.id,

  name:
  overwrite.type === 0
  ? guild.roles.cache.get(overwrite.id)?.name
  : null,

  type: overwrite.type,

  allow:
  overwrite.allow.bitfield.toString(),

  deny:
  overwrite.deny.bitfield.toString()

}))
})),


    created:
    Date.now()

  };



  let clones =
  load(FILES.clones);



  const cloneID = Date.now().toString();

clones[cloneID] = cloneData;



  save(
    FILES.clones,
    clones
  );



  await interaction.reply({

    content:
    "✅ Server layout cloned and saved."

  });


});
// =====================
// PASTE CLONE SYSTEM
// =====================

client.on("interactionCreate", async interaction => {

  if(!interaction.isChatInputCommand())
    return;

  if(interaction.commandName !== "paste")
    return;


  if(!interaction.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  )){

    return interaction.reply({

      content:"❌ Administrator permission required.",
      ephemeral:true

    });

  }



  let clones = load(FILES.clones);


  const clone =
Object.values(clones).sort((a,b)=>b.created-a.created)[0];


  if(!clone){

    return interaction.reply({

      content:
      "❌ No clone data found for this server.",

      ephemeral:true

    });

  }



  await interaction.reply({

    content:
    "🔨 Restoring server layout..."

  });


// CREATE ROLES

for(const role of clone.roles){

  await interaction.guild.roles.create({

    name: role.name,

    color: role.color,

    permissions: BigInt(role.permissions || 0)

  }).catch(console.error);

}




  // CREATE CATEGORIES

  const categories = {};



  for(const channel of clone.channels){


    if(channel.type === ChannelType.GuildCategory){


      const created =
      await interaction.guild.channels.create({

        name:channel.name,

        type:ChannelType.GuildCategory

      }).catch(()=>null);



      if(created){

        categories[channel.name] =
        created.id;

      }

    }

  }



  // CREATE CHANNELS

for(const channel of clone.channels){

  if(channel.type !== ChannelType.GuildCategory){

    await interaction.guild.channels.create({

      name: channel.name,

      type: channel.type,

      parent: categories[channel.parent] || null,

  permissionOverwrites:
channel.permissionOverwrites?.map(overwrite => {

let id = overwrite.id;


if(overwrite.type === 0 && overwrite.name){

const role =
interaction.guild.roles.cache.find(
r => r.name === overwrite.name
);


if(role){

id = role.id;

}else{

return null;

}

}


return {

id:id,

allow:BigInt(overwrite.allow),

deny:BigInt(overwrite.deny)

};


}).filter(Boolean) || []
    }).catch(console.error);

  }

}


  await interaction.followUp({

    content:
    "✅ Server clone restored."

  });


});
client.login(process.env.TOKEN);