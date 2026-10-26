/**
 * Repository contract: list(guildId), saveAll(guildId, events).
 */
class EventRepository {
  async list() {
    throw new Error("EventRepository.list must be implemented.");
  }

  async saveAll() {
    throw new Error("EventRepository.saveAll must be implemented.");
  }
}

module.exports = { EventRepository };
