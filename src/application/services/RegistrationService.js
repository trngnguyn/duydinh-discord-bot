const { ApplicationError } = require("../../domain/errors/ApplicationError");
const { validateCharacterName, validateClassName, validateAffiliation } = require("../../domain/validation/memberValidation");
const { DEFAULT_AFFILIATION } = require("../../domain/constants/affiliation");
const { Member } = require("../../domain/entities/Member");

class RegistrationService {
  /** Injects persistence, class policy, authorization, serialization and clock. */
  constructor({ memberRepository, classRosterRepository, classRegistry, permissionService, writeQueue, clock = () => new Date() }) {
    this.memberRepository = memberRepository;
    this.classRosterRepository = classRosterRepository;
    this.classRegistry = classRegistry;
    this.permissionService = permissionService;
    this.writeQueue = writeQueue;
    this.clock = clock;
  }

  /** Creates or updates the caller's single profile for this guild. */
  async register({ guildId, guildConfig, member, characterName, className, affiliation }) {
    this.permissionService.assertParticipant(member, guildConfig);
    const name = validateCharacterName(characterName);
    const validClass = validateClassName(className, this.classRegistry);
    const group = validateAffiliation(affiliation ?? DEFAULT_AFFILIATION);
    return this.writeQueue.run(guildId, async () => {
      const members = this.deduplicate(await this.memberRepository.list(guildId));
      const profile = new Member({
        userId: member.id,
        discordUsername: member.user?.tag || member.user?.username || member.id,
        characterName: name,
        className: validClass,
        affiliation: group,
        registeredAt: members.find(item => item.userId === member.id)?.registeredAt || this.clock().toISOString(),
        updatedAt: this.clock().toISOString()
      });
      const next = members.filter(item => item.userId !== member.id);
      next.push(profile);
      await this.memberRepository.saveAll(guildId, next);
      await this.replaceClassRoster(guildId, next);
      return profile;
    });
  }

  /** Returns one saved profile, or null if the Discord user has not registered. */
  async getProfile(guildId, userId) {
    const members = this.deduplicate(await this.memberRepository.list(guildId));
    return members.find(item => item.userId === userId) || null;
  }

  /** Rebuilds the derived class tabs from persisted member profiles. */
  async refreshClassRoster(guildId) {
    return this.writeQueue.run(guildId, async () => {
      const members = this.deduplicate(await this.memberRepository.list(guildId));
      await this.replaceClassRoster(guildId, members);
      return members.length;
    });
  }

  async replaceClassRoster(guildId, members) {
    try {
      await this.classRosterRepository.replace(guildId, members);
    } catch (error) {
      console.error(`Could not update class roster for guild ${guildId}: ${error.message}`);
      throw new ApplicationError(
        "Hồ sơ đã lưu nhưng tab DanhSachPhai chưa cập nhật. Quản trị viên hãy dùng /refresh.",
        "CLASS_ROSTER_SYNC_FAILED",
        { cause: error }
      );
    }
  }

  /** Collapses duplicate spreadsheet user IDs, retaining the last stored row. */
  deduplicate(members) {
    const byUserId = new Map();
    for (const member of members) {
      if (member.userId) byUserId.set(String(member.userId), member);
    }
    return [...byUserId.values()];
  }
}

module.exports = { RegistrationService };
