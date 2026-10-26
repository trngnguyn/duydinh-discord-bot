class JsonGuildClassRosterRepository {
  constructor({ store }) {
    this.store = store;
  }

  async replace(guildId, members) {
    this.store.replace(guildId, "classRoster", members);
  }
}

module.exports = { JsonGuildClassRosterRepository };
