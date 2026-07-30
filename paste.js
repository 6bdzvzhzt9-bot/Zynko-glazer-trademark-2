const fs = require("fs");
const {
  ChannelType,
  PermissionsBitField
} = require("discord.js");


const TEMPLATE_FILE = "./templates.json";


function loadTemplates(){

  if(!fs.existsSync(TEMPLATE_FILE)){
    return {};
  }

  return JSON.parse(
    fs.readFileSync(TEMPLATE_FILE,"utf8")
  );

}



async function pasteServer(interaction, templateGuildId){


const guild = interaction.guild;


let templates = loadTemplates();


const template =
templates[templateGuildId];


if(!template){

return interaction.reply({

content:
"❌ No template found.",

ephemeral:true

});

}



await interaction.reply({

content:
"⚙️ Restoring server layout...",

ephemeral:true

});



// =====================
// CREATE ROLES
// =====================


let roleMap = {};


for(const role of template.roles){


let newRole =
await guild.roles.create({

name:
role.name,

color:
role.color,

permissions:
role.permissions

});


roleMap[role.name] =
newRole.id;


}



// =====================
// CREATE CATEGORIES
// =====================


let categoryMap = {};


for(const category of template.categories){


let newCategory =
await guild.channels.create({

name:
category.name,

type:
ChannelType.GuildCategory

});


categoryMap[category.name] =
newCategory.id;


}



// =====================
// CREATE CHANNELS
// =====================


for(const channel of template.channels){


let parent =
categoryMap[channel.parent];


let newChannel;


if(channel.type === ChannelType.GuildText){


newChannel =
await guild.channels.create({

name:
channel.name,

type:
ChannelType.GuildText,

parent

});


}


else if(channel.type === ChannelType.GuildVoice){


newChannel =
await guild.channels.create({

name:
channel.name,

type:
ChannelType.GuildVoice,

parent

});


}



// =====================
// APPLY PERMISSIONS
// =====================


if(newChannel){


for(const overwrite of channel.permissionOverwrites){


await newChannel.permissionOverwrites.create(

overwrite.id,

{

allow:
overwrite.allow,

deny:
overwrite.deny

}

);


}


}


}



await interaction.followUp({

content:
"✅ Server template pasted."

});


}



module.exports = {
pasteServer
};