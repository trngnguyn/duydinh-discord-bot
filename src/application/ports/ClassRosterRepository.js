/**
 * Derived roster contract: replace(guildId, members).
 * One column is maintained for each class in the canonical ClassRegistry.
 */
class ClassRosterRepository {
  async replace() {
    throw new Error("ClassRosterRepository.replace must be implemented.");
  }
}

module.exports = { ClassRosterRepository };
