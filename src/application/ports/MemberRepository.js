/**
 * Repository contract: list(guildId), saveAll(guildId, members).
 * Implementations persist unique Discord user records for one guild.
 */
class MemberRepository {
  async list() {
    throw new Error("MemberRepository.list must be implemented.");
  }

  async saveAll() {
    throw new Error("MemberRepository.saveAll must be implemented.");
  }
}

module.exports = { MemberRepository };
