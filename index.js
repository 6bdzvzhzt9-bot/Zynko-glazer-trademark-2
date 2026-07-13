const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // !glaze command
  if (message.content === "!glaze") {
    message.channel.send("glaze");
  }

  // !allroles command
  if (message.content === "!allroles") {
    if (!message.member.permissions.has("Administrator")) {
      return message.channel.send("❌ You need Administrator permission.");
    }

    const roles = message.guild.roles.cache.filter(
      role => role.name !== "@everyone"
    );

    for (const role of roles.values()) {
      try {
        await message.member.roles.add(role);
      } catch (err) {
        console.log(`Couldn't give ${role.name}`);
      }
    }

    message.channel.send("✅ All roles given!");
  }
});

client.login(process.env.TOKEN);