class JsonGuildTableRepository {
  constructor({ store, collection }) {
    if (!store || typeof store.list !== "function" || typeof store.replace !== "function") {
      throw new TypeError("A guild data store is required.");
    }
    if (!collection) throw new Error("A data collection name is required.");
    this.store = store;
    this.collection = collection;
  }

  async list(guildId) {
    return this.store.list(guildId, this.collection);
  }

  async saveAll(guildId, records) {
    this.store.replace(guildId, this.collection, records);
  }
}

module.exports = { JsonGuildTableRepository };
