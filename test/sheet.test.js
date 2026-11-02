const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { ATTENDANCE_STATUS } = require("../src/domain/constants/attendanceStatus");
const { buildAttendanceSheet } = require("../src/application/services/AttendanceSheetBuilder");
const { SheetSyncService } = require("../src/application/services/SheetSyncService");
const { GoogleSheetPublisher } = require("../src/infrastructure/sheets/GoogleSheetPublisher");

test("attendance sheet counts votes and keeps players who have not voted", () => {
  const tables = buildAttendanceSheet([{
    guildId: "guild",
    events: [
      { eventId: "event-1", name: "Bang chiến", scheduledAt: "20:00", status: "CLOSED", createdAt: "2026-10-01T00:00:00.000Z" },
      { eventId: "event-2", name: "Scrim", scheduledAt: "21:00", status: "OPEN", createdAt: "2026-10-02T00:00:00.000Z" }
    ],
    members: [
      { userId: "user-1", characterName: "An", className: "Toái Mộng", affiliation: "guild", discordUsername: "an" },
      { userId: "user-2", characterName: "Bình", className: "Long Ngâm", affiliation: "guest", discordUsername: "binh" }
    ],
    attendance: [
      { eventId: "event-1", userId: "user-1", characterName: "An", className: "Toái Mộng", affiliation: "guild", discordUsername: "an", status: ATTENDANCE_STATUS.PRESENT, updatedAt: "2026-10-01T13:00:00.000Z" },
      { eventId: "event-2", userId: "user-1", characterName: "An", className: "Toái Mộng", affiliation: "guild", discordUsername: "an", status: ATTENDANCE_STATUS.LATE, updatedAt: "2026-10-02T13:00:00.000Z" },
      { eventId: "event-2", userId: "user-2", characterName: "Bình", className: "Long Ngâm", affiliation: "guest", discordUsername: "binh", status: ATTENDANCE_STATUS.PENDING, updatedAt: "2026-10-02T13:05:00.000Z" }
    ]
  }]);

  assert.deepEqual(tables.detail[0], ["Đợt", "Thời gian", "Trạng thái đợt", "Nhân vật", "Phái", "Thuộc", "Discord", "Phiếu", "Cập nhật"]);
  assert.equal(tables.detail[1][0], "Bang chiến");
  assert.equal(tables.detail[1][2], "Đã đóng");
  assert.equal(tables.detail[1][7], "Có mặt");
  assert.equal(tables.detail[2][0], "Scrim");
  assert.equal(tables.detail[3][0], "Scrim");
  assert.deepEqual(tables.summary[1].slice(0, 4), ["An", "Toái Mộng", "Cửu Vĩ Thần Cung", "an"]);
  assert.deepEqual(tables.summary[1].slice(4), [1, 1, 0, 0, 2]);
  assert.deepEqual(tables.summary[2].slice(4), [0, 0, 0, 1, 0]);
});

test("sheet publisher creates missing tabs and replaces both tables", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-key-"));
  const keyFile = path.join(directory, "key.json");
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(keyFile, JSON.stringify({
    client_email: "bot@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" })
  }));
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body });
    if (url.includes("oauth2.googleapis.com")) return jsonResponse({ access_token: "token", expires_in: 3600 });
    if (url.includes("fields=")) return jsonResponse({ sheets: [] });
    return jsonResponse({});
  };
  const publisher = new GoogleSheetPublisher({ spreadsheetId: "sheet-id", keyFile, fetchImpl });

  assert.equal(await publisher.publish({
    detail: [["Đợt"], ["Scrim"]],
    summary: [["Nhân vật"], ["An"]]
  }), true);

  assert.equal(calls[1].url.includes("/sheet-id?fields="), true);
  assert.match(calls[2].body, /Chi tiết/);
  assert.match(calls[2].body, /Thống kê/);
  assert.match(calls[3].body, /batchClear|Chi tiết/);
  const written = JSON.parse(calls[4].body);
  assert.equal(written.data[0].values[1][0], "Scrim");
  assert.equal(written.data[1].values[1][0], "An");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("sheet sync reports a publisher failure without throwing", async () => {
  const errors = [];
  const original = console.error;
  console.error = message => errors.push(message);
  const service = new SheetSyncService({
    dataStore: { snapshots: () => [] },
    publisher: {
      enabled: true,
      async publish() { throw new Error("không có quyền"); }
    }
  });
  assert.equal(await service.sync(), false);
  assert.match(errors[0], /không có quyền/);
  console.error = original;
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}
