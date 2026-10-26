const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { ATTENDANCE_STATUS, ATTENDANCE_STATUS_ICONS } = require("../../domain/constants/attendanceStatus");
const { affiliationOf } = require("../../domain/constants/affiliation");

const BUTTON_STATUSES = Object.freeze([
  { code: "present", label: "Có mặt", emoji: "✅", style: ButtonStyle.Success, status: ATTENDANCE_STATUS.PRESENT },
  { code: "late", label: "Đến muộn", emoji: "⏰", style: ButtonStyle.Primary, status: ATTENDANCE_STATUS.LATE },
  { code: "absent", label: "Vắng mặt", emoji: "❌", style: ButtonStyle.Danger, status: ATTENDANCE_STATUS.ABSENT }
]);

const DISCORD_FIELD_VALUE_LIMIT = 1024;

/** Splits roster lines so each Discord field stays within the value limit. */
function chunkLines(lines, limit = DISCORD_FIELD_VALUE_LIMIT) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    const nextLength = length + (current.length ? 1 : 0) + line.length;
    if (current.length && nextLength > limit) {
      chunks.push(current.join("\n"));
      current = [line];
      length = line.length;
      continue;
    }
    current.push(line);
    length = nextLength;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

class AttendanceEmbedBuilder {
  /** Injects class display policy. */
  constructor({ classRegistry }) {
    this.classRegistry = classRegistry;
  }

  /** Builds Discord payload from prepared domain data without I/O. */
  build({ event, members, attendanceRecords }) {
    const validStatuses = new Set([
      ATTENDANCE_STATUS.PENDING,
      ...BUTTON_STATUSES.map(item => item.status)
    ]);
    const currentRecords = attendanceRecords.filter(record => validStatuses.has(record.status));
    const records = new Map(currentRecords.map(record => [record.userId, record]));
    const registeredMembers = members.filter(member => records.has(member.userId));
    const unregisteredCount = Math.max(0, members.length - registeredMembers.length);
    const embed = new EmbedBuilder()
      .setColor(event.status === "OPEN" ? 0x5865F2 : 0x747F8D)
      .setTitle(this.safeText(event.name, 256))
      .setDescription([
        `**Thời gian:** ${this.safeText(event.scheduledAt, 100)}`,
        `**DKP / Ghi chú:** ${this.safeText(event.dkp || "—", 100)}`,
        `**Đăng ký sự kiện:** ${registeredMembers.length} / ${members.length} người`,
        `**Cửu Vĩ Thần Cung:** ${registeredMembers.filter(member => this.affiliationCode(member, records) === "guild").length} · **Khách Scrim:** ${registeredMembers.filter(member => this.affiliationCode(member, records) === "guest").length}`,
        `**Chưa đăng ký sự kiện:** ${unregisteredCount} người`,
        `**Trạng thái sự kiện:** ${event.status === "OPEN" ? "ĐANG MỞ" : "ĐÃ ĐÓNG"}`
      ].join("\n"))
      .setTimestamp(new Date());

    for (const classInfo of this.classRegistry.list()) {
      const roster = registeredMembers
        .filter(member => member.className === classInfo.name)
        .sort((a, b) => a.characterName.localeCompare(b.characterName, "vi"));
      const lines = roster.map(member => {
        const status = records.get(member.userId)?.status || ATTENDANCE_STATUS.PENDING;
        const guest = this.affiliationCode(member, records) === "guest" ? " · Khách" : "";
        return `${ATTENDANCE_STATUS_ICONS[status] || ATTENDANCE_STATUS_ICONS[ATTENDANCE_STATUS.PENDING]} ${this.safeText(member.characterName, 80)}${guest}`;
      });
      const chunks = chunkLines(lines);
      if (!chunks.length) {
        embed.addFields({
          name: `${classInfo.emoji} ${classInfo.name} · ${roster.length}`,
          value: "—",
          inline: true
        });
        continue;
      }
      chunks.forEach((value, index) => {
        const part = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
        embed.addFields({
          name: `${classInfo.emoji} ${classInfo.name} · ${roster.length}${part}`,
          value,
          inline: true
        });
      });
    }

    const totals = Object.values(ATTENDANCE_STATUS).map(status => {
      const count = registeredMembers.filter(member => records.get(member.userId)?.status === status).length;
      return `${ATTENDANCE_STATUS_ICONS[status]} ${status}: ${count}`;
    });
    embed.setFooter({ text: `${totals.join(" · ")} · EventID ${event.eventId}`.slice(0, 2048) });

    const counts = Object.fromEntries(BUTTON_STATUSES.map(({ status }) => [
      status,
      registeredMembers.filter(member => records.get(member.userId)?.status === status).length
    ]));
    const summary = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setDescription(`${BUTTON_STATUSES.map(({ status, label }) => `${ATTENDANCE_STATUS_ICONS[status]} ${label}: ${counts[status]}`).join(" · ")} · ${ATTENDANCE_STATUS_ICONS[ATTENDANCE_STATUS.PENDING]} Chưa xác nhận: ${registeredMembers.filter(member => records.get(member.userId)?.status === ATTENDANCE_STATUS.PENDING).length} · Chưa đăng ký: ${unregisteredCount}`);

    return {
      embeds: [embed, summary],
      components: [
        new ActionRowBuilder().addComponents(
          ...BUTTON_STATUSES.map(({ code, label, emoji, style }) =>
            new ButtonBuilder()
              .setCustomId(`attendance:${event.eventId}:${code}`)
              .setLabel(label)
              .setEmoji(emoji)
              .setStyle(style)
              .setDisabled(event.status !== "OPEN")
          )
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event:join:${event.eventId}`)
            .setLabel("Đăng ký tham gia")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Success)
            .setDisabled(event.status !== "OPEN"),
          new ButtonBuilder()
            .setCustomId("registration:start")
            .setLabel("Nhân vật")
            .setEmoji("📝")
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  /** Uses the vote snapshot, then the profile. Missing values stay in the guild. */
  affiliationCode(member, records) {
    const record = records.get(member.userId);
    return affiliationOf(record?.affiliation ? record : member);
  }

  safeText(value, maxLength) {
    const text = String(value || "—").replace(/[\r\n<>]/gu, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }
}

module.exports = { AttendanceEmbedBuilder, BUTTON_STATUSES };
