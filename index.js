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

client.on("if (message.content === "!allroles") {
  const roles = message.guild.roles.cache.filter(role => role.name !== "@everyone");

  for (const role of roles.values()) {
    await message.member.roles.add(role);
  }

  message.channel.send("✅ All roles given!");
}", message => {
  if (message.content === "!glaze") {
    message.channel.send("glaze");
  }
});

client.login(process.env.TOKEN);