class Member {
  /** Creates a validated-by-use-case member profile value. */
  constructor({ userId, discordUsername, characterName, className, affiliation, registeredAt, updatedAt }) {
    this.userId = userId;
    this.discordUsername = discordUsername;
    this.characterName = characterName;
    this.className = className;
    this.affiliation = affiliation;
    this.registeredAt = registeredAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = { Member };
