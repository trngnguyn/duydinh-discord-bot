require("dotenv").config();

function loadEnv() {
  const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình môi trường: ${missing.join(", ")}.`);

  return Object.freeze({
    discordToken: process.env.DISCORD_TOKEN,
    discordClientId: process.env.DISCORD_CLIENT_ID
  });
}

module.exports = { loadEnv };
