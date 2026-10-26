class GuildEvent {
  /** Creates a guild event value; lifecycle rules belong to EventService. */
  constructor({
    eventId, name, scheduledAt, dkp, status, guildId, channelId, messageId,
    createdBy, createdAt, closedAt
  }) {
    this.eventId = eventId;
    this.name = name;
    this.scheduledAt = scheduledAt;
    this.dkp = dkp;
    this.status = status;
    this.guildId = guildId;
    this.channelId = channelId;
    this.messageId = messageId;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
    this.closedAt = closedAt;
  }
}

module.exports = { GuildEvent };
