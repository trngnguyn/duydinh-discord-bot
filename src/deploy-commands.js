const { REST, Routes } = require("discord.js");
const { loadEnv } = require("./config/env");
const { commands } = require("./commands");

async function main() {
  const env = loadEnv();
  const rest = new REST({ version: "10" }).setToken(env.discordToken);
  await rest.put(Routes.applicationCommands(env.discordClientId), { body: commands });
  console.log("Đã đăng ký slash commands toàn cục. Discord có thể mất vài phút để cập nhật.");
}

main().catch(error => {
  console.error(`Không thể đăng ký slash commands: ${error.message}`);
  process.exitCode = 1;
});
