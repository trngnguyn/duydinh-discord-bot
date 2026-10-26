class AttendanceRecord {
  /** Creates the current status value for one event and Discord user. */
  constructor({ eventId, userId, discordUsername, characterName, className, affiliation, status, updatedAt }) {
    this.eventId = eventId;
    this.userId = userId;
    this.discordUsername = discordUsername;
    this.characterName = characterName;
    this.className = className;
    this.affiliation = affiliation;
    this.status = status;
    this.updatedAt = updatedAt;
  }
}

module.exports = { AttendanceRecord };
