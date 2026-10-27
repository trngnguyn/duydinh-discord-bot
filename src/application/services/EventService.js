const { randomUUID } = require("node:crypto");
const { ApplicationError } = require("../../domain/errors/ApplicationError");
const { validateEventInput } = require("../../domain/validation/eventValidation");
const { GuildEvent } = require("../../domain/entities/GuildEvent");

class EventService {
  /** Injects event storage, related records, authorization, per-guild write queue and clock. */
  constructor({
    eventRepository,
    attendanceRepository = null,
    lineupRepository = null,
    permissionService,
    writeQueue,
    clock = () => new Date()
  }) {
    this.eventRepository = eventRepository;
    this.attendanceRepository = attendanceRepository;
    this.lineupRepository = lineupRepository;
    this.permissionService = permissionService;
    this.writeQueue = writeQueue;
    this.clock = clock;
  }

  /** Creates an event. The name must be unique in the guild so later actions can target it. */
  async create({ guildId, guildConfig, member, name, scheduledAt, dkp, channelId }) {
    this.permissionService.assertAdmin(member, guildConfig);
    const valid = validateEventInput({ name, scheduledAt, dkp });
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      if (events.some(event => event.name === valid.name)) {
        throw new ApplicationError("Đã có sự kiện cùng tên. Hãy đặt tên khác.", "DUPLICATE_EVENT_NAME");
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

  /** Applies provided event fields while the named event remains open. */
  async edit({ guildId, guildConfig, member, name, changes }) {
    this.permissionService.assertAdmin(member, guildConfig);
    const hasChange = ["name", "scheduledAt", "dkp"].some(key => changes[key] !== undefined);
    if (!hasChange) throw new ApplicationError("Cần cung cấp ít nhất một thông tin cần sửa.", "EMPTY_EVENT_UPDATE");
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = this.indexByName(events, name);
      if (events[index].status !== "OPEN") throw new ApplicationError("Không thể sửa sự kiện đã đóng.", "EVENT_CLOSED");
      const updated = new GuildEvent({
        ...events[index],
        ...validateEventInput({ ...events[index], ...changes })
      });
      if (events.some(event => event.eventId !== updated.eventId && event.name === updated.name)) {
        throw new ApplicationError("Đã có sự kiện cùng tên. Hãy đặt tên khác.", "DUPLICATE_EVENT_NAME");
      }
      events[index] = updated;
      await this.eventRepository.saveAll(guildId, events);
      return updated;
    });
  }

  /** Closes the named event without removing event or attendance history. */
  async close({ guildId, guildConfig, member, name }) {
    this.permissionService.assertAdmin(member, guildConfig);
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = this.indexByName(events, name);
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

  /** Deletes the named event together with its attendance and lineup. */
  async remove({ guildId, guildConfig, member, name }) {
    this.permissionService.assertAdmin(member, guildConfig);
    return this.writeQueue.run(guildId, async () => {
      const events = await this.eventRepository.list(guildId);
      const index = this.indexByName(events, name);
      const event = events[index];
      events.splice(index, 1);
      await this.eventRepository.saveAll(guildId, events);
      if (this.attendanceRepository) {
        const records = await this.attendanceRepository.list(guildId);
        await this.attendanceRepository.saveAll(
          guildId,
          records.filter(record => record.eventId !== event.eventId)
        );
      }
      if (this.lineupRepository) {
        const lineups = await this.lineupRepository.list(guildId);
        await this.lineupRepository.saveAll(
          guildId,
          lineups.filter(lineup => lineup.eventId !== event.eventId)
        );
      }
      return event;
    });
  }

  /** Finds exactly one event with this name. */
  indexByName(events, name) {
    const target = String(name || "").trim();
    if (!target) throw new ApplicationError("Cần nhập đúng tên sự kiện.", "INVALID_EVENT_NAME");
    const indexes = events.flatMap((event, index) => event.name === target ? [index] : []);
    if (indexes.length === 0) throw new ApplicationError("Không tìm thấy sự kiện có tên này.", "EVENT_NOT_FOUND");
    if (indexes.length > 1) {
      throw new ApplicationError("Có nhiều sự kiện cùng tên này. Hãy đặt tên khác nhau trước.", "AMBIGUOUS_EVENT_NAME");
    }
    return indexes[0];
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

  /** Returns the currently open events. */
  async listOpen(guildId) {
    return (await this.eventRepository.list(guildId)).filter(event => event.status === "OPEN");
  }

  /** Returns the first open event, if one exists. */
  async getOpen(guildId) {
    return (await this.listOpen(guildId))[0] || null;
  }
}

module.exports = { EventService };
