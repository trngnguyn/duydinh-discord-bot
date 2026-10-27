const { ApplicationError } = require("../../domain/errors/ApplicationError");

class DiscordMessageService {
  /** Injects Discord transport, repositories and pure Embed builder. */
  constructor({ client, eventService, eventRepository, attendanceService, memberRepository, embedBuilder }) {
    this.client = client;
    this.eventService = eventService;
    this.eventRepository = eventRepository;
    this.attendanceService = attendanceService;
    this.memberRepository = memberRepository;
    this.embedBuilder = embedBuilder;
  }

  /** Edits the persisted board, recovers a prior send, or creates the board. */
  async syncEvent(guildId, eventId) {
    const [events, members] = await Promise.all([
      this.eventRepository.list(guildId),
      this.memberRepository.list(guildId)
    ]);
    const event = events.find(item => item.eventId === eventId);
    if (!event) throw new ApplicationError("Không tìm thấy sự kiện để đồng bộ.", "EVENT_NOT_FOUND");
    if (event.guildId !== guildId) {
      throw new ApplicationError("Sự kiện không thuộc máy chủ hiện tại.", "GUILD_MISMATCH");
    }
    const channel = await this.client.channels.fetch(event.channelId);
    if (channel?.guildId !== guildId || !channel?.isTextBased() || !channel.messages) {
      throw new ApplicationError("Kênh sự kiện không còn tồn tại hoặc bot không có quyền truy cập.", "CHANNEL_UNAVAILABLE");
    }
    const attendanceRecords = await this.attendanceService.listForEvent(guildId, eventId);
    const payload = {
      ...this.embedBuilder.build({ event, members, attendanceRecords }),
      allowedMentions: { parse: [] }
    };
    let message = null;

    if (event.messageId) {
      try {
        message = await channel.messages.fetch(event.messageId);
      } catch (error) {
        if (error.code !== 10008 && error.code !== 10003) throw error;
      }
    }

    if (!message) {
      const recent = await channel.messages.fetch({ limit: 50 });
      message = recent.find(candidate =>
        candidate.author.id === this.client.user.id &&
        candidate.embeds.some(embed => embed.footer?.text?.includes(`EventID ${eventId}`))
      ) || null;
    }

    if (message) {
      await message.edit(payload);
      if (event.messageId !== message.id) {
        await this.eventService.setMessageId(guildId, eventId, message.id);
      }
      return message;
    }

    message = await channel.send(payload);
    await this.eventService.setMessageId(guildId, eventId, message.id);
    return message;
  }

  /** Removes the saved board message. A missing message is ignored. */
  async deleteBoard(guildId, event) {
    if (!event?.messageId) return;
    const channel = await this.client.channels.fetch(event.channelId);
    if (channel?.guildId !== guildId || !channel?.isTextBased() || !channel.messages) return;
    try {
      const message = await channel.messages.fetch(event.messageId);
      await message.delete();
    } catch (error) {
      if (error.code !== 10008 && error.code !== 10003) throw error;
    }
  }
}

module.exports = { DiscordMessageService };
