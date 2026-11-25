const { ApplicationError } = require("../../domain/errors/ApplicationError");
const {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_VALUES
} = require("../../domain/constants/attendanceStatus");
const { AttendanceRecord } = require("../../domain/entities/AttendanceRecord");
const { affiliationOf } = require("../../domain/constants/affiliation");

class AttendanceService {
  /** Injects event/member/attendance storage, authorization, queue and clock. */
  constructor({ attendanceRepository, eventRepository, memberRepository, permissionService, writeQueue, clock = () => new Date() }) {
    this.attendanceRepository = attendanceRepository;
    this.eventRepository = eventRepository;
    this.memberRepository = memberRepository;
    this.permissionService = permissionService;
    this.writeQueue = writeQueue;
    this.clock = clock;
  }

  /** Registers the caller for one open event without reusing prior event records. */
  async registerForEvent({ guildId, guildConfig, member, eventId }) {
    this.permissionService.assertParticipant(member, guildConfig);
    return this.writeQueue.run(guildId, async () => {
      const [events, members, records] = await Promise.all([
        this.eventRepository.list(guildId),
        this.memberRepository.list(guildId),
        this.attendanceRepository.list(guildId)
      ]);
      const event = events.find(item => item.eventId === eventId);
      if (!event) throw new ApplicationError("Không tìm thấy sự kiện.", "EVENT_NOT_FOUND");
      if (event.guildId !== guildId) {
        throw new ApplicationError("Sự kiện không thuộc máy chủ hiện tại.", "GUILD_MISMATCH");
      }
      if (event.status !== "OPEN") throw new ApplicationError("Sự kiện đã đóng, không thể điểm danh.", "EVENT_CLOSED");
      const profile = members.find(item => item.userId === member.id);
      if (!profile) {
        throw new ApplicationError("Bạn cần tạo hồ sơ nhân vật bằng /register trước khi đăng ký sự kiện.", "MEMBER_NOT_REGISTERED");
      }

      const existing = records.find(item => item.eventId === eventId && item.userId === member.id);
      if (existing) return { record: existing, event, alreadyRegistered: true };

      const record = new AttendanceRecord({
        eventId,
        userId: member.id,
        discordUsername: member.user?.tag || member.user?.username || member.id,
        characterName: profile.characterName,
        className: profile.className,
        affiliation: affiliationOf(profile),
        status: ATTENDANCE_STATUS.PENDING,
        updatedAt: this.clock().toISOString()
      });
      await this.attendanceRepository.saveAll(guildId, [...records, record]);
      return { record, event, alreadyRegistered: false };
    });
  }

  /** Upserts the caller's vote. A missing signup is created with the chosen status. */
  async mark({ guildId, guildConfig, member, eventId, status }) {
    this.permissionService.assertParticipant(member, guildConfig);
    if (!ATTENDANCE_STATUS_VALUES.includes(status)) {
      throw new ApplicationError("Trạng thái điểm danh không hợp lệ.", "INVALID_ATTENDANCE_STATUS");
    }
    return this.writeQueue.run(guildId, async () => {
      const [events, members, records] = await Promise.all([
        this.eventRepository.list(guildId),
        this.memberRepository.list(guildId),
        this.attendanceRepository.list(guildId)
      ]);
      const event = events.find(item => item.eventId === eventId);
      if (!event) throw new ApplicationError("Không tìm thấy sự kiện.", "EVENT_NOT_FOUND");
      if (event.guildId !== guildId) {
        throw new ApplicationError("Sự kiện không thuộc máy chủ hiện tại.", "GUILD_MISMATCH");
      }
      if (event.status !== "OPEN") throw new ApplicationError("Sự kiện đã đóng, không thể điểm danh.", "EVENT_CLOSED");
      const profile = members.find(item => item.userId === member.id);
      if (!profile) throw new ApplicationError("Bạn cần đăng ký nhân vật trước khi điểm danh bằng /register.", "MEMBER_NOT_REGISTERED");
      const record = new AttendanceRecord({
        eventId,
        userId: member.id,
        discordUsername: member.user?.tag || member.user?.username || member.id,
        characterName: profile.characterName,
        className: profile.className,
        affiliation: affiliationOf(profile),
        status,
        updatedAt: this.clock().toISOString()
      });
      const unique = new Map();
      for (const item of records) {
        if (item.eventId && item.userId) unique.set(`${item.eventId}:${item.userId}`, item);
      }
      unique.set(`${eventId}:${member.id}`, record);
      await this.attendanceRepository.saveAll(guildId, [...unique.values()]);
      return { record, event };
    });
  }

  /** Returns status records belonging to one event. */
  async listForEvent(guildId, eventId) {
    return (await this.attendanceRepository.list(guildId)).filter(record => record.eventId === eventId);
  }

  /** Returns the saved votes for one closed event, found by its exact name. */
  async listClosedByName(guildId, name) {
    const events = await this.eventRepository.list(guildId);
    const event = events[this.indexByName(events, name)];
    if (event.status !== "CLOSED") {
      throw new ApplicationError("Chỉ xem được phiếu của sự kiện đã đóng.", "EVENT_NOT_CLOSED");
    }
    const records = await this.listForEvent(guildId, event.eventId);
    return { event, records };
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
}

module.exports = { AttendanceService };
