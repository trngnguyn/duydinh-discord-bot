const { affiliationName } = require("../../domain/constants/affiliation");
const { ATTENDANCE_STATUS } = require("../../domain/constants/attendanceStatus");

const DETAIL_HEADERS = Object.freeze([
  "Đợt", "Thời gian", "Trạng thái đợt", "Nhân vật", "Phái", "Thuộc", "Discord", "Phiếu", "Cập nhật"
]);
const SUMMARY_HEADERS = Object.freeze([
  "Nhân vật", "Phái", "Thuộc", "Discord", "Có mặt", "Đến muộn", "Vắng mặt", "Chưa xác nhận", "Đã vote"
]);

/** Builds the detail and summary tables written to the shared spreadsheet. */
function buildAttendanceSheet(snapshots) {
  const guilds = Array.isArray(snapshots) ? snapshots : [];
  const multiple = guilds.length > 1;
  const detail = [multiple ? ["Server", ...DETAIL_HEADERS] : [...DETAIL_HEADERS]];
  const summary = [multiple ? ["Server", ...SUMMARY_HEADERS] : [...SUMMARY_HEADERS]];

  for (const guild of guilds) {
    const events = [...(guild.events || [])].sort(compareEvents);
    const attendance = guild.attendance || [];
    const knownEvents = new Set(events.map(event => event.eventId));

    for (const event of events) {
      const records = attendance
        .filter(record => record.eventId === event.eventId)
        .sort((left, right) => compareText(left.characterName, right.characterName));
      for (const record of records) {
        detail.push(withServer(multiple, guild.guildId, [
          event.name || "",
          event.scheduledAt || "",
          event.status === "OPEN" ? "Đang mở" : "Đã đóng",
          record.characterName || "",
          record.className || "",
          affiliationName(record.affiliation),
          record.discordUsername || "",
          record.status || "",
          formatTime(record.updatedAt)
        ]));
      }
    }

    const people = new Map();
    for (const member of guild.members || []) {
      people.set(member.userId, blankPerson(member));
    }
    for (const record of attendance) {
      if (!knownEvents.has(record.eventId)) continue;
      const person = people.get(record.userId) || blankPerson(record);
      person.characterName = record.characterName || person.characterName;
      person.className = record.className || person.className;
      person.affiliation = record.affiliation || person.affiliation;
      person.discordUsername = record.discordUsername || person.discordUsername;
      if (record.status === ATTENDANCE_STATUS.PRESENT) person.present += 1;
      else if (record.status === ATTENDANCE_STATUS.LATE) person.late += 1;
      else if (record.status === ATTENDANCE_STATUS.ABSENT) person.absent += 1;
      else if (record.status === ATTENDANCE_STATUS.PENDING) person.pending += 1;
      people.set(record.userId, person);
    }

    for (const person of [...people.values()].sort((left, right) => compareText(left.characterName, right.characterName))) {
      summary.push(withServer(multiple, guild.guildId, [
        person.characterName,
        person.className,
        affiliationName(person.affiliation),
        person.discordUsername,
        person.present,
        person.late,
        person.absent,
        person.pending,
        person.present + person.late + person.absent
      ]));
    }
  }

  return { detail, summary };
}

function blankPerson(record) {
  return {
    characterName: record.characterName || "",
    className: record.className || "",
    affiliation: record.affiliation,
    discordUsername: record.discordUsername || "",
    present: 0,
    late: 0,
    absent: 0,
    pending: 0
  };
}

function withServer(multiple, guildId, row) {
  return multiple ? [guildId || "", ...row] : row;
}

function compareEvents(left, right) {
  const byTime = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  return byTime || compareText(left.name, right.name);
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "vi");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

module.exports = { buildAttendanceSheet, DETAIL_HEADERS, SUMMARY_HEADERS };
