const fs = require("node:fs");
require("dotenv").config();

function loadEnv() {
  const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Thiếu cấu hình môi trường: ${missing.join(", ")}.`);

  const googleSheetId = process.env.GOOGLE_SHEET_ID?.trim() || "";
  const googleServiceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim() || "";
  if (Boolean(googleSheetId) !== Boolean(googleServiceAccountFile)) {
    throw new Error("Cần cả GOOGLE_SHEET_ID và GOOGLE_SERVICE_ACCOUNT_FILE, hoặc bỏ cả hai.");
  }
  if (googleServiceAccountFile && !fs.existsSync(googleServiceAccountFile)) {
    throw new Error(`Không thấy file khóa Google: ${googleServiceAccountFile}.`);
  }

  return Object.freeze({
    discordToken: process.env.DISCORD_TOKEN,
    discordClientId: process.env.DISCORD_CLIENT_ID,
    googleSheetId,
    googleServiceAccountFile
  });
}

module.exports = { loadEnv };
