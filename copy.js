const fs = require("fs");
const {
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const TEMPLATE_FILE = "./templates.json";

function loadTemplates() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    fs.writeFileSync(TEMPLATE_FILE, "{}");
  }

  return JSON.parse(
    fs.readFileSync(TEMPLATE_FILE, "utf8")
  );
}

function saveTemplates(data) {
  fs.writeFileSync(
    TEMPLATE_FILE,
    JSON.stringify(data, null, 2)
  );
}


async function copyServer(interaction) {

  const guild = interaction.guild;

  let template = {
    serverName: guild.name,
    created: Date.now(),

    roles: [],

    categories: [],

    channels: []
  };


  // COPY ROLES

  guild.roles.cache
  .filter(role => role.name !== "@everyone")
  .sort((a,b)=>a.position-b.position)
  .forEach(role => {

    template.roles.push({

      name: role.name,

      color: role.color,

      permissions:
      role.permissions.toArray(),

      position:
      role.position

    });

  });



  // COPY CHANNELS + CATEGORIES

  guild.channels.cache
  .sort((a,b)=>a.rawPosition-b.rawPosition)
  .forEach(channel=>{


    if(channel.type === ChannelType.GuildCategory){

      template.categories.push({

        name: channel.name,

        position: channel.position

      });

      return;

    }



    template.channels.push({

      name: channel.name,

      type: channel.type,

      parent:
      channel.parent?.name || null,


      permissionOverwrites:

      channel.permissionOverwrites.cache.map(overwrite=>({

        id:
        overwrite.id,

        allow:
        overwrite.allow.toArray(),

        deny:
        overwrite.deny.toArray()

      }))


    });


  });



  let templates = loadTemplates();


  templates[guild.id] = template;


  saveTemplates(templates);



  return template;

}


module.exports = {
  copyServer
};