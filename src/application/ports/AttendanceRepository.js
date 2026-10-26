/**
 * Repository contract: list(guildId), saveAll(guildId, attendanceRecords).
 */
class AttendanceRepository {
  async list() {
    throw new Error("AttendanceRepository.list must be implemented.");
  }

  async saveAll() {
    throw new Error("AttendanceRepository.saveAll must be implemented.");
  }
}

module.exports = { AttendanceRepository };
