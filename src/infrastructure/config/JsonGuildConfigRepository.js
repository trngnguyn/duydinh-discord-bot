const path = require("node:path");
const { AtomicJsonFile } = require("../persistence/AtomicJsonFile");

class JsonGuildConfigRepository {
  constructor(filePath = path.join(__dirname, "..", "..", "..", "data", "configs.json")) {
    this.file = new AtomicJsonFile(filePath);
  }

  get(guildId) {
    const configs = this.readAll();
    return configs[String(guildId)] || null;
  }

  save(guildId, data) {
    if (!guildId) throw new Error("guildId is required.");
    const configs = this.readAll();
    const previous = configs[String(guildId)] || {};
    const config = {
      channelId: data.channelId ?? previous.channelId ?? "",
      roleId: data.roleId ?? previous.roleId ?? "",
      adminRoleId: data.adminRoleId ?? previous.adminRoleId ?? ""
    };
    configs[String(guildId)] = config;
    this.file.writeObject(configs);
    return config;
  }

  readAll() {
    return this.file.readObject();
  }
}

module.exports = { JsonGuildConfigRepository };
