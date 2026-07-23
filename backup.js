const fs = require("fs");

module.exports = {
  name: "backup",

  async execute(message, args) {
    if (args[0] !== "create") return;

    const guild = message.guild;

    const backup = {
      serverName: guild.name,
      serverId: guild.id,
      created: new Date(),

      roles: guild.roles.cache.map(role => ({
        name: role.name,
        permissions: role.permissions.toArray()
      })),

      channels: guild.channels.cache.map(channel => ({
        name: channel.name,
        type: channel.type
      }))
    };

    let backups = {};

    if (fs.existsSync("./backups.json")) {
      backups = JSON.parse(fs.readFileSync("./backups.json"));
    }

    backups[guild.id] = backup;

    fs.writeFileSync(
      "./backups.json",
      JSON.stringify(backups, null, 2)
    );

    message.reply("✅ Backup created!");
  }
};