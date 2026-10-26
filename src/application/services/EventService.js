const { randomUUID } = require("node:crypto");
const { ApplicationError } = require("../../domain/errors/ApplicationError");
const { validateEventInput } = require("../../domain/validation/eventValidation");
const { GuildEvent } = require("../../domain/entities/GuildEvent");

class EventService {
  /** Injects event storage, authorization, per-guild write queue and clock. */
  constructor({ eventRepository, permissionService, writeQueue, clock = () => new Date() }) {
    this.eventRepository = eventRepository;
    this.permissionService = permissionService;
    this.writeQueue = writeQueue;
    this.clock = clock;
  }

  /** Creates an event only when this guild has no other open event. */
  async create({ guildId, guildConfig, member, name, scheduledAt, dkp, channelId }) {
    this.permissionService.assertAdmin(member, guildConfig);
    const valid = validateEventInput({ name, scheduledAt, dkp });
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      if (events.some(event => event.status === "OPEN")) {
        throw new ApplicationError("Đã có sự kiện đang mở. Hãy đóng sự kiện đó trước.", "OPEN_EVENT_EXISTS");
      }
      const event = new GuildEvent({
        eventId: randomUUID(),
        name: valid.name,
        scheduledAt: valid.scheduledAt,
        dkp: valid.dkp,
        status: "OPEN",
        guildId,
        channelId,
        messageId: "",
        createdBy: member.id,
        createdAt: this.clock().toISOString(),
        closedAt: ""
      });
      await this.eventRepository.saveAll(guildId, [...events, event]);
      return event;
    });
  }

  /** Applies provided event fields while the event remains open. */
  async edit({ guildId, guildConfig, member, eventId, changes }) {
    this.permissionService.assertAdmin(member, guildConfig);
    const hasChange = ["name", "scheduledAt", "dkp"].some(key => changes[key] !== undefined);
    if (!hasChange) throw new ApplicationError("Cần cung cấp ít nhất một thông tin cần sửa.", "EMPTY_EVENT_UPDATE");
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = events.findIndex(item => item.eventId === eventId);
      if (index < 0) throw new ApplicationError("Không tìm thấy sự kiện.", "EVENT_NOT_FOUND");
      if (events[index].status !== "OPEN") throw new ApplicationError("Không thể sửa sự kiện đã đóng.", "EVENT_CLOSED");
      const updated = new GuildEvent({
        ...events[index],
        ...validateEventInput({ ...events[index], ...changes })
      });
      events[index] = updated;
      await this.eventRepository.saveAll(guildId, events);
      return updated;
    });
  }

  /** Closes an event without removing event or attendance history. */
  async close({ guildId, guildConfig, member, eventId }) {
    this.permissionService.assertAdmin(member, guildConfig);
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = events.findIndex(item => item.eventId === eventId);
      if (index < 0) throw new ApplicationError("Không tìm thấy sự kiện.", "EVENT_NOT_FOUND");
      if (events[index].status === "CLOSED") return events[index];
      events[index] = new GuildEvent({
        ...events[index],
        status: "CLOSED",
        closedAt: this.clock().toISOString()
      });
      await this.eventRepository.saveAll(guildId, events);
      return events[index];
    });
  }

  /** Persists the Discord board message ID after send/recovery. */
  async setMessageId(guildId, eventId, messageId) {
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = events.findIndex(item => item.eventId === eventId);
      if (index < 0) throw new ApplicationError("Không tìm thấy sự kiện.", "EVENT_NOT_FOUND");
      events[index] = new GuildEvent({ ...events[index], messageId });
      await this.eventRepository.saveAll(guildId, events);
      return events[index];
    });
  }

  /** Lists saved events for one guild. */
  async list(guildId) {
    return this.eventRepository.list(guildId);
  }

  /** Returns the currently open event, if one exists. */
  async getOpen(guildId) {
    return (await this.eventRepository.list(guildId)).find(event => event.status === "OPEN") || null;
  }
}

module.exports = { EventService };
