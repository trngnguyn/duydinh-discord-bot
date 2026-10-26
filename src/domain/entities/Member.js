class Member {
  /** Creates a validated-by-use-case member profile value. */
  constructor({ userId, discordUsername, characterName, className, registeredAt, updatedAt }) {
    this.userId = userId;
    this.discordUsername = discordUsername;
    this.characterName = characterName;
    this.className = className;
    this.registeredAt = registeredAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = { Member };
