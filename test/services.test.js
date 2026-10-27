const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ClassRegistry } = require("../src/domain/constants/classes");
const { ATTENDANCE_STATUS } = require("../src/domain/constants/attendanceStatus");
const { validateCharacterName, validateClassName } = require("../src/domain/validation/memberValidation");
const { ApplicationError } = require("../src/domain/errors/ApplicationError");
const { PermissionService } = require("../src/application/services/PermissionService");
const { RegistrationService } = require("../src/application/services/RegistrationService");
const { EventService } = require("../src/application/services/EventService");
const { AttendanceService } = require("../src/application/services/AttendanceService");
const { WriteQueue } = require("../src/application/services/WriteQueue");
const { JsonGuildDataStore } = require("../src/infrastructure/persistence/JsonGuildDataStore");
const { JsonGuildTableRepository } = require("../src/infrastructure/persistence/JsonGuildTableRepository");
const { JsonGuildClassRosterRepository } = require("../src/infrastructure/persistence/JsonGuildClassRosterRepository");
const { JsonGuildConfigRepository } = require("../src/infrastructure/config/JsonGuildConfigRepository");
const { AttendanceEmbedBuilder } = require("../src/presentation/builders/AttendanceEmbedBuilder");
const { DiscordInteractionAdapter } = require("../src/presentation/DiscordInteractionAdapter");
const { DiscordMessageService } = require("../src/infrastructure/discord/DiscordMessageService");

function createHarness() {
  const state = { members: [], events: [], attendance: [] };
  const memberRepository = {
    async list() { return structuredClone(state.members); },
    async saveAll(_guildId, records) { state.members = structuredClone(records); }
  };
  const classRosterRepository = {
    async replace(_guildId, members) { state.roster = structuredClone(members); }
  };
  const eventRepository = {
    async list() { return structuredClone(state.events); },
    async saveAll(_guildId, records) { state.events = structuredClone(records); }
  };
  const attendanceRepository = {
    async list() { return structuredClone(state.attendance); },
    async saveAll(_guildId, records) { state.attendance = structuredClone(records); }
  };
  const permissionService = new PermissionService();
  const writeQueue = new WriteQueue();
  const classRegistry = new ClassRegistry();
  const member = {
    id: "user-1",
    user: { username: "player", tag: "player#0001" },
    roles: { cache: { has: roleId => roleId === "players" } },
    permissions: { has: () => false }
  };
  const admin = {
    ...member,
    id: "admin-1",
    roles: { cache: { has: roleId => roleId === "admins" } }
  };
  const registrationService = new RegistrationService({
    memberRepository, classRosterRepository, classRegistry, permissionService, writeQueue
  });

  const eventService = new EventService({
    eventRepository, attendanceRepository, permissionService, writeQueue
  });
  const attendanceService = new AttendanceService({
    attendanceRepository, eventRepository, memberRepository, permissionService, writeQueue
  });
  return {
    state, member, admin, permissionService, classRegistry,
    memberRepository, eventRepository, attendanceRepository, classRosterRepository,
    registrationService, eventService, attendanceService
  };
}

test("validates character names and configured classes", () => {
  const registry = new ClassRegistry();
  assert.equal(validateCharacterName("  Nguyệt  "), "Nguyệt");
  assert.throws(() => validateCharacterName("  "), ApplicationError);
  assert.throws(() => validateCharacterName("x".repeat(33)), ApplicationError);
  assert.equal(validateClassName("Toái Mộng", registry), "Toái Mộng");
  assert.throws(() => validateClassName("Không tồn tại", registry), ApplicationError);
  assert.equal(registry.find("Long Ngâm").emoji, "<:thiet_y:1564176942683525150>");
});

test("registers once per Discord user and updates name/class on re-registration", async () => {
  const h = createHarness();
  const first = await h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    characterName: "Nhân vật A", className: "Thiết Y"
  });
  const updated = await h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    characterName: "Nhân vật B", className: "Toái Mộng"
  });
  assert.equal(first.userId, updated.userId);
  assert.equal(updated.characterName, "Nhân vật B");
  assert.equal(h.state.members.length, 1);
  assert.equal((await h.registrationService.getProfile("guild", h.member.id)).className, "Toái Mộng");
  assert.equal(updated.affiliation, "guild");
  const guest = await h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    characterName: "Nhân vật B", className: "Toái Mộng", affiliation: "guest"
  });
  assert.equal(guest.affiliation, "guest");
});

test("denies registration when member lacks the configured role", async () => {
  const h = createHarness();
  const unauthorized = { ...h.member, roles: { cache: { has: () => false } } };
  await assert.rejects(h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: unauthorized,
    characterName: "Nhân vật", className: "Thiết Y"
  }), error => error.code === "FORBIDDEN");
  assert.equal(h.state.members.length, 0);
});

test("recognizes Discord Manage Guild and Administrator permission bitfields", () => {
  const permissions = new PermissionService();
  assert.equal(permissions.isAdmin({ permissions: "32" }), true);
  assert.equal(permissions.isAdmin({ permissions: "8" }), true);
  assert.equal(permissions.isAdmin({ permissions: "0" }), false);
  const roleAdmin = { roles: { cache: { has: roleId => roleId === "guild-a-admins" } } };
  assert.equal(permissions.isAdmin(roleAdmin, { adminRoleId: "guild-a-admins" }), true);
  assert.equal(permissions.isAdmin(roleAdmin, { adminRoleId: "guild-b-admins" }), false);
});

test("creates several open events and edits, closes, or deletes by exact name", async () => {
  const h = createHarness();
  const guildConfig = { adminRoleId: "admins" };
  const event = await h.eventService.create({
    guildId: "guild", guildConfig, member: h.admin,
    name: "Raid", scheduledAt: "20:00 2026-10-20", dkp: "10", channelId: "channel"
  });
  const second = await h.eventService.create({
    guildId: "guild", guildConfig, member: h.admin,
    name: "Scrim", scheduledAt: "21:00", dkp: "", channelId: "channel"
  });
  assert.equal(second.status, "OPEN");
  assert.equal((await h.eventService.listOpen("guild")).length, 2);
  await assert.rejects(h.eventService.create({
    guildId: "guild", guildConfig, member: h.admin,
    name: "Raid", scheduledAt: "22:00", dkp: "", channelId: "channel"
  }), error => error.code === "DUPLICATE_EVENT_NAME");
  const edited = await h.eventService.edit({
    guildId: "guild", guildConfig, member: h.admin, name: "Raid", changes: { dkp: "20" }
  });
  assert.equal(edited.dkp, "20");
  await assert.rejects(h.eventService.close({
    guildId: "guild", guildConfig, member: h.admin, name: "Sai tên"
  }), error => error.code === "EVENT_NOT_FOUND");
  const closed = await h.eventService.close({
    guildId: "guild", guildConfig, member: h.admin, name: "Raid"
  });
  assert.equal(closed.status, "CLOSED");
  h.state.attendance.push({ eventId: event.eventId, userId: "user-1", status: "Có mặt" });
  h.state.attendance.push({ eventId: second.eventId, userId: "user-1", status: "Có mặt" });
  const removed = await h.eventService.remove({
    guildId: "guild", guildConfig, member: h.admin, name: "Scrim"
  });
  assert.equal(removed.eventId, second.eventId);
  assert.equal(h.state.events.length, 1);
  assert.deepEqual(h.state.attendance.map(record => record.eventId), [event.eventId]);
});

test("records and updates one attendance status per event and user", async () => {
  const h = createHarness();
  await h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    characterName: "Nhân vật A", className: "Thiết Y"
  });
  const event = await h.eventService.create({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin,
    name: "Raid", scheduledAt: "Tối nay", dkp: "", channelId: "channel"
  });
  const signup = await h.attendanceService.registerForEvent({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member, eventId: event.eventId
  });
  assert.equal(signup.record.status, ATTENDANCE_STATUS.PENDING);
  assert.equal(signup.alreadyRegistered, false);
  const repeatedSignup = await h.attendanceService.registerForEvent({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member, eventId: event.eventId
  });
  assert.equal(repeatedSignup.alreadyRegistered, true);
  assert.equal(h.state.attendance.length, 1);
  const first = await h.attendanceService.mark({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    eventId: event.eventId, status: ATTENDANCE_STATUS.PRESENT
  });
  const updated = await h.attendanceService.mark({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    eventId: event.eventId, status: ATTENDANCE_STATUS.LATE
  });
  assert.equal(first.record.status, ATTENDANCE_STATUS.PRESENT);
  assert.equal(updated.record.status, ATTENDANCE_STATUS.LATE);
  assert.equal(h.state.attendance.length, 1);
  await h.eventService.close({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin, name: "Raid"
  });
  assert.equal((await h.attendanceService.listForEvent("guild", event.eventId))[0].status, ATTENDANCE_STATUS.LATE);
  const nextEvent = await h.eventService.create({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin,
    name: "Raid mới", scheduledAt: "Tối mai", dkp: "", channelId: "channel"
  });
  assert.deepEqual(await h.attendanceService.listForEvent("guild", nextEvent.eventId), []);
});

test("marks attendance without a separate event signup, and rejects closed events", async () => {
  const h = createHarness();
  await h.registrationService.register({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    characterName: "Nhân vật A", className: "Thiết Y"
  });
  const event = await h.eventService.create({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin,
    name: "Raid", scheduledAt: "Tối nay", dkp: "", channelId: "channel"
  });
  const marked = await h.attendanceService.mark({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    eventId: event.eventId, status: ATTENDANCE_STATUS.ABSENT
  });
  assert.equal(marked.record.status, ATTENDANCE_STATUS.ABSENT);
  assert.equal(h.state.attendance.length, 1);
  await h.eventService.close({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin, name: "Raid"
  });
  await assert.rejects(h.attendanceService.mark({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member,
    eventId: event.eventId, status: ATTENDANCE_STATUS.PRESENT
  }), error => error.code === "EVENT_CLOSED");
});

test("requires a character profile before registering for an event", async () => {
  const h = createHarness();
  const event = await h.eventService.create({
    guildId: "guild", guildConfig: { adminRoleId: "admins" }, member: h.admin,
    name: "Raid", scheduledAt: "Tối nay", dkp: "", channelId: "channel"
  });
  await assert.rejects(h.attendanceService.registerForEvent({
    guildId: "guild", guildConfig: { roleId: "players" }, member: h.member, eventId: event.eventId
  }), error => error.code === "MEMBER_NOT_REGISTERED");
  assert.equal(h.state.attendance.length, 0);
});

test("serializes writes and continues after a failed operation", async () => {
  const queue = new WriteQueue();
  const order = [];
  const failure = queue.run("guild", async () => {
    order.push("first");
    throw new Error("expected failure");
  });
  const following = queue.run("guild", async () => order.push("second"));
  await assert.rejects(failure, /expected failure/);
  await following;
  assert.deepEqual(order, ["first", "second"]);
});

test("JSON repositories persist records and isolate data by guild", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-attendance-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "guild-data.json");
  const store = new JsonGuildDataStore(filePath);
  const members = new JsonGuildTableRepository({ store, collection: "members" });
  const events = new JsonGuildTableRepository({ store, collection: "events" });
  const roster = new JsonGuildClassRosterRepository({ store });

  await members.saveAll("guild-a", [{ userId: "user-a", characterName: "A" }]);
  await events.saveAll("guild-b", [{ eventId: "event-b", guildId: "guild-b" }]);
  await roster.replace("guild-a", [{ userId: "user-a", className: "Thiết Y" }]);

  const restartedStore = new JsonGuildDataStore(filePath);
  assert.deepEqual(await new JsonGuildTableRepository({
    store: restartedStore, collection: "members"
  }).list("guild-a"), [{ userId: "user-a", characterName: "A" }]);
  assert.deepEqual(await new JsonGuildTableRepository({
    store: restartedStore, collection: "members"
  }).list("guild-b"), []);
  assert.deepEqual(await new JsonGuildTableRepository({
    store: restartedStore, collection: "events"
  }).list("guild-b"), [{ eventId: "event-b", guildId: "guild-b" }]);
  assert.deepEqual(await restartedStore.list("guild-a", "classRoster"), [
    { userId: "user-a", className: "Thiết Y" }
  ]);
});

test("guild configuration persists roles and channels independently", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "discord-config-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "configs.json");
  const configRepository = new JsonGuildConfigRepository(filePath);
  configRepository.save("guild-a", {
    roleId: "players-a", adminRoleId: "admins-a", channelId: "channel-a"
  });
  configRepository.save("guild-b", {
    roleId: "players-b", adminRoleId: "admins-b", channelId: "channel-b"
  });

  const restartedRepository = new JsonGuildConfigRepository(filePath);
  assert.deepEqual(restartedRepository.get("guild-a"), {
    roleId: "players-a", adminRoleId: "admins-a", channelId: "channel-a"
  });
  assert.deepEqual(restartedRepository.get("guild-b"), {
    roleId: "players-b", adminRoleId: "admins-b", channelId: "channel-b"
  });
});

test("event name autocomplete suggests events that contain the typed text", async () => {
  const adapter = new DiscordInteractionAdapter({
    client: { on() {} },
    configRepository: {},
    classRegistry: new ClassRegistry(),
    permissionService: {},
    registrationService: {},
    eventService: {
      async list() {
        return [
          { name: "Scrim 29/10", status: "OPEN" },
          { name: "Bang chiến 3/10", status: "CLOSED" },
          { name: "Raid", status: "OPEN" }
        ];
      }
    },
    attendanceService: {},
    discordMessageService: {}
  });
  let choices = null;
  await adapter.handle({
    inGuild: () => true,
    isAutocomplete: () => true,
    guildId: "guild",
    options: { getFocused: () => ({ name: "name", value: "scr" }) },
    async respond(payload) { choices = payload; }
  });
  assert.deepEqual(choices, [{ name: "Scrim 29/10 · Đang mở", value: "Scrim 29/10" }]);
});

test("registration modal asks for name and class together", () => {
  const adapter = new DiscordInteractionAdapter({
    client: { on() {} },
    configRepository: {},
    classRegistry: new ClassRegistry(),
    permissionService: {},
    registrationService: {},
    eventService: {},
    attendanceService: {},
    discordMessageService: {}
  });
  const created = adapter.createRegistrationModal(null).toJSON();
  assert.equal(created.title, "Đăng ký nhân vật");
  assert.equal(created.custom_id, "registration:profile");
  const nameLabel = created.components.find(component => component.label === "Tên nhân vật");
  const classLabel = created.components.find(component => component.label === "Phái");
  const groupLabel = created.components.find(component => component.label === "Bạn là");
  assert.equal(nameLabel.component.custom_id, "character_name");
  assert.equal(nameLabel.component.placeholder, "Ví dụ: xThamLy");
  assert.equal(nameLabel.component.value, undefined);
  assert.equal(classLabel.component.required, true);
  assert.equal(classLabel.component.options.length, 7);
  assert.equal(classLabel.component.options.some(option => option.default), false);
  assert.deepEqual(groupLabel.component.options.map(option => option.value), ["guild", "guest"]);
  assert.equal(groupLabel.component.options.some(option => option.default), false);

  const updated = adapter.createRegistrationModal(
    { characterName: "xThamLy", className: "Cửu Linh" },
    "registration:mark:4bc8f8ba-a027-4e8f-b169-97ccad6b3fc8:present"
  ).toJSON();
  assert.equal(updated.title, "Cập nhật nhân vật");
  assert.equal(updated.custom_id, "registration:mark:4bc8f8ba-a027-4e8f-b169-97ccad6b3fc8:present");
  const filledName = updated.components.find(component => component.label === "Tên nhân vật");
  const filledClass = updated.components.find(component => component.label === "Phái");
  const filledGroup = updated.components.find(component => component.label === "Bạn là");
  assert.equal(filledName.component.value, "xThamLy");
  assert.equal(filledClass.component.options.find(option => option.default).label, "Cửu Linh");
  assert.equal(filledGroup.component.options.find(option => option.default).value, "guild");
  assert.equal(adapter.parseRegistrationCustomId(updated.custom_id).code, "present");
});

test("attendance board includes each class, attendance controls and registration button", () => {
  const builder = new AttendanceEmbedBuilder({ classRegistry: new ClassRegistry() });
  const payload = builder.build({
    event: {
      eventId: "4bc8f8ba-a027-4e8f-b169-97ccad6b3fc8",
      name: "Raid",
      scheduledAt: "20:00",
      dkp: "10",
      status: "OPEN"
    },
    members: [
      { userId: "u1", characterName: "Nhân vật", className: "Thiết Y" },
      { userId: "u2", characterName: "Chưa tham gia", className: "Thiết Y", affiliation: "guest" }
    ],
    attendanceRecords: [
      { userId: "u1", status: ATTENDANCE_STATUS.PENDING }
    ]
  });
  assert.equal(payload.embeds[0].data.fields.length, 7);
  assert.match(payload.embeds[0].data.description, /Đăng ký sự kiện:\*\* 1 \/ 2/u);
  assert.match(payload.embeds[0].data.description, /Cửu Vĩ Thần Cung:\*\* 1 · \*\*Khách Scrim:\*\* 0/u);
  assert.match(payload.embeds[0].data.description, /Chưa đăng ký sự kiện:\*\* 1/u);
  const classField = payload.embeds[0].data.fields.find(field => String(field.name).includes("Thiết Y"));
  assert.match(classField.value, /Nhân vật/u);
  assert.doesNotMatch(classField.value, /Khách/u);
  assert.match(payload.embeds[1].data.description, /Chưa xác nhận: 1/u);
  assert.match(payload.embeds[1].data.description, /Chưa đăng ký: 1/u);
  assert.equal(payload.components.length, 2);
  assert.equal(payload.components[0].components.length, 3);
  assert.equal(payload.components[1].components[0].data.custom_id, `event:join:${payload.embeds[0].data.footer.text.split("EventID ")[1]}`);
  assert.equal(payload.components[1].components[1].data.custom_id, "registration:start");
});

test("attendance board lists every registered member in a class", () => {
  const builder = new AttendanceEmbedBuilder({ classRegistry: new ClassRegistry() });
  const members = Array.from({ length: 14 }, (_, index) => ({
    userId: `u${index}`,
    characterName: `Nhân vật ${index + 1}`,
    className: "Tố Vấn"
  }));
  const payload = builder.build({
    event: {
      eventId: "4bc8f8ba-a027-4e8f-b169-97ccad6b3fc8",
      name: "Raid",
      scheduledAt: "20:00",
      dkp: "10",
      status: "OPEN"
    },
    members,
    attendanceRecords: members.map(member => ({ userId: member.userId, status: ATTENDANCE_STATUS.PRESENT }))
  });
  const classFields = payload.embeds[0].data.fields.filter(field => String(field.name).includes("Tố Vấn"));
  const listed = classFields.map(field => field.value).join("\n");
  assert.equal(classFields.length, 1);
  assert.match(classFields[0].name, /Tố Vấn · 14/u);
  for (const member of members) assert.match(listed, new RegExp(member.characterName, "u"));
  assert.doesNotMatch(listed, /người nữa/u);
});

test("Discord message service recovers a persisted event board without sending a duplicate", async () => {
  const eventId = "4bc8f8ba-a027-4e8f-b169-97ccad6b3fc8";
  let edited = false;
  let sent = false;
  let savedMessageId = "";
  const priorMessage = {
    id: "existing-message",
    author: { id: "bot-user" },
    embeds: [{ footer: { text: `EventID ${eventId}` } }],
    async edit() { edited = true; }
  };
  const channel = {
    guildId: "guild",
    isTextBased: () => true,
    messages: { async fetch() { return [priorMessage]; } },
    async send() { sent = true; return priorMessage; }
  };
  const event = {
    eventId, name: "Raid", scheduledAt: "20:00", dkp: "10",
    status: "OPEN", guildId: "guild", channelId: "channel", messageId: ""
  };
  const service = new DiscordMessageService({
    client: { user: { id: "bot-user" }, channels: { async fetch() { return channel; } } },
    eventService: { async setMessageId(_guildId, _eventId, messageId) { savedMessageId = messageId; } },
    eventRepository: { async list() { return [event]; } },
    attendanceService: { async listForEvent() { return []; } },
    memberRepository: { async list() { return []; } },
    embedBuilder: new AttendanceEmbedBuilder({ classRegistry: new ClassRegistry() })
  });
  await service.syncEvent("guild", eventId);
  assert.equal(edited, true);
  assert.equal(sent, false);
  assert.equal(savedMessageId, "existing-message");
  await assert.rejects(service.syncEvent("another-guild", eventId), error => error.code === "GUILD_MISMATCH");
});
