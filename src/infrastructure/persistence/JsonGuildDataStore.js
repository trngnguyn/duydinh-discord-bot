const path = require("node:path");
const { AtomicJsonFile } = require("./AtomicJsonFile");

class JsonGuildDataStore {
  constructor(filePath = path.join(__dirname, "..", "..", "..", "data", "guild-data.json")) {
    this.file = new AtomicJsonFile(filePath);
  }

  list(guildId, collection) {
    const data = this.readGuildCollection(guildId, collection);
    return data;
  }

  replace(guildId, collection, records) {
    if (!guildId) throw new Error("guildId is required.");
    if (!Array.isArray(records)) throw new TypeError(`${collection} records must be an array.`);

    const database = this.file.readObject();
    const guildData = this.readGuild(database, guildId);
    guildData[collection] = records;
    database[String(guildId)] = guildData;
    this.file.writeObject(database);
  }

  readGuildCollection(guildId, collection) {
    if (!guildId) throw new Error("guildId is required.");
    const guildData = this.readGuild(this.file.readObject(), guildId);
    const records = guildData[collection] ?? [];
    if (!Array.isArray(records)) {
      throw new Error(`Dữ liệu ${collection} của guild ${guildId} phải là một danh sách.`);
    }
    return records;
  }

  readGuild(database, guildId) {
    const guildData = database[String(guildId)] ?? {};
    if (!guildData || typeof guildData !== "object" || Array.isArray(guildData)) {
      throw new Error(`Dữ liệu guild ${guildId} phải là một object JSON.`);
    }
    return guildData;
  }
}

module.exports = { JsonGuildDataStore };
