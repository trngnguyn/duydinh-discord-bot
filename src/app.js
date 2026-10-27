const { Client, GatewayIntentBits } = require("discord.js");
const { loadEnv } = require("./config/env");
const { ClassRegistry } = require("./domain/constants/classes");
const { WriteQueue } = require("./application/services/WriteQueue");
const { PermissionService } = require("./application/services/PermissionService");
const { RegistrationService } = require("./application/services/RegistrationService");
const { EventService } = require("./application/services/EventService");
const { AttendanceService } = require("./application/services/AttendanceService");
const { JsonGuildConfigRepository } = require("./infrastructure/config/JsonGuildConfigRepository");
const { JsonGuildDataStore } = require("./infrastructure/persistence/JsonGuildDataStore");
const { JsonGuildTableRepository } = require("./infrastructure/persistence/JsonGuildTableRepository");
const { JsonGuildClassRosterRepository } = require("./infrastructure/persistence/JsonGuildClassRosterRepository");
const { AttendanceEmbedBuilder } = require("./presentation/builders/AttendanceEmbedBuilder");
const { DiscordMessageService } = require("./infrastructure/discord/DiscordMessageService");
const { DiscordInteractionAdapter } = require("./presentation/DiscordInteractionAdapter");

function assertRepositoryContracts(repositories) {
  const requirements = {
    memberRepository: ["list", "saveAll"],
    eventRepository: ["list", "saveAll"],
    attendanceRepository: ["list", "saveAll"],
    classRosterRepository: ["replace"]
  };
  for (const [name, methods] of Object.entries(requirements)) {
    for (const method of methods) {
      if (typeof repositories[name][method] !== "function") {
        throw new TypeError(`${name} must implement ${method}().`);
      }
    }
  }
}

function createApplication() {
  const env = loadEnv();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const configRepository = new JsonGuildConfigRepository();
  const dataStore = new JsonGuildDataStore();
  const classRegistry = new ClassRegistry();
  const memberRepository = new JsonGuildTableRepository({ store: dataStore, collection: "members" });
  const eventRepository = new JsonGuildTableRepository({ store: dataStore, collection: "events" });
  const attendanceRepository = new JsonGuildTableRepository({ store: dataStore, collection: "attendance" });
  const lineupRepository = new JsonGuildTableRepository({ store: dataStore, collection: "lineups" });
  const classRosterRepository = new JsonGuildClassRosterRepository({ store: dataStore });
  assertRepositoryContracts({ memberRepository, eventRepository, attendanceRepository, classRosterRepository });

  const writeQueue = new WriteQueue();
  const permissionService = new PermissionService();
  const registrationService = new RegistrationService({
    memberRepository, classRosterRepository, classRegistry, permissionService, writeQueue
  });
  const eventService = new EventService({
    eventRepository, attendanceRepository, lineupRepository, permissionService, writeQueue
  });
  const attendanceService = new AttendanceService({
    attendanceRepository, eventRepository, memberRepository, permissionService, writeQueue
  });
  const embedBuilder = new AttendanceEmbedBuilder({ classRegistry });
  const discordMessageService = new DiscordMessageService({
    client,
    eventService,
    eventRepository,
    attendanceService,
    memberRepository,
    embedBuilder
  });
  const interactionAdapter = new DiscordInteractionAdapter({
    client,
    configRepository,
    classRegistry,
    permissionService,
    registrationService,
    eventService,
    attendanceService,
    discordMessageService
  });
  interactionAdapter.attach();

  return {
    client,
    env,
    configRepository,
    dataStore,
    eventService,
    discordMessageService
  };
}

module.exports = { createApplication };
