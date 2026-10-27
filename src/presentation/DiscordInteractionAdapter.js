const {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  Events
} = require("discord.js");
const { BUTTON_STATUSES } = require("./builders/AttendanceEmbedBuilder");
const { AFFILIATIONS, affiliationName, affiliationOf } = require("../domain/constants/affiliation");
const { ApplicationError } = require("../domain/errors/ApplicationError");

class DiscordInteractionAdapter {
  /** Injects use cases and Discord adapters. */
  constructor({
    client,
    configRepository,
    classRegistry,
    permissionService,
    registrationService,
    eventService,
    attendanceService,
    discordMessageService
  }) {
    Object.assign(this, {
      client, configRepository,
      classRegistry, permissionService, registrationService, eventService,
      attendanceService, discordMessageService
    });
  }

  /** Registers the single Discord interaction event listener. */
  attach() {
    this.client.on(Events.InteractionCreate, interaction => {
      this.handle(interaction).catch(error => this.respondWithError(interaction, error));
    });
  }

  /** Dispatches supported guild interactions to their presentation handlers. */
  async handle(interaction) {
    if (interaction.isAutocomplete()) return this.autocompleteEventName(interaction);
    if (!interaction.inGuild()) {
      if (interaction.isRepliable()) {
        return interaction.reply({
          content: "Bot chỉ hoạt động trong máy chủ Discord.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }
    if (interaction.isChatInputCommand()) return this.handleCommand(interaction);
    if (interaction.isModalSubmit()) return this.handleModal(interaction);
    if (interaction.isStringSelectMenu()) return this.handleSelect(interaction);
    if (interaction.isButton()) return this.handleButton(interaction);
  }

  /** Suggests stored event names while the admin types in the name option. */
  async autocompleteEventName(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "name" || !interaction.guildId) return interaction.respond([]);
    const query = String(focused.value || "").trim().toLocaleLowerCase("vi");
    const events = await this.eventService.list(interaction.guildId);
    const seen = new Set();
    const choices = [];
    const ordered = [...events.filter(event => event.status === "OPEN"), ...events.filter(event => event.status !== "OPEN")];
    for (const event of ordered) {
      const name = String(event.name || "").trim();
      if (!name || seen.has(name)) continue;
      if (query && !name.toLocaleLowerCase("vi").includes(query)) continue;
      seen.add(name);
      const status = event.status === "OPEN" ? "Đang mở" : "Đã đóng";
      choices.push({ name: `${name} · ${status}`.slice(0, 100), value: name.slice(0, 100) });
      if (choices.length === 25) break;
    }
    return interaction.respond(choices);
  }

  async handleCommand(interaction) {
    const { guildId, member } = interaction;
    const guildConfig = this.configRepository.get(guildId);
    switch (interaction.commandName) {
      case "help":
        return interaction.reply({
          content: [
            "**Hướng dẫn:**",
            "`/register` mở một form để đăng ký hoặc cập nhật tên, phái, và Cửu Vĩ Thần Cung hoặc Khách Scrim.",
            "`/event-create` tạo sự kiện. Có thể mở nhiều sự kiện cùng lúc (quản trị viên).",
            "`/event-edit`, `/event-close` và `/event-delete` cần nhập đúng tên sự kiện.",
            "Hồ sơ chỉ cần tạo một lần. Trên bảng sự kiện, chọn Có mặt, Đến muộn hoặc Vắng mặt để điểm danh. Nút **Đăng ký tham gia** dùng khi chưa muốn chọn trạng thái.",
            "`/member-info` xem hồ sơ của bạn; quản trị viên có thể xem thành viên khác.",
            "`/setup` cấu hình role/kênh riêng của server và `/refresh` khôi phục bảng (quản trị viên)."
          ].join("\n"),
          flags: MessageFlags.Ephemeral
        });
      case "register":
        return this.showRegistrationModal(interaction);
      case "setup":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.setup(interaction);
      case "event-create":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.createEvent(interaction, guildConfig);
      case "event-edit":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.editEvent(interaction);
      case "event-close":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.closeEvent(interaction);
      case "event-delete":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.deleteEvent(interaction);
      case "refresh":
        this.permissionService.assertAdmin(member, guildConfig);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.refresh(interaction);
      case "member-info":
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return this.memberInfo(interaction);
      default:
        return interaction.reply({ content: "Lệnh không được hỗ trợ.", flags: MessageFlags.Ephemeral });
    }
  }

  async showRegistrationModal(interaction, customId = "registration:profile") {
    this.permissionService.assertParticipant(
      interaction.member,
      this.configRepository.get(interaction.guildId)
    );
    const profile = await this.registrationService.getProfile(interaction.guildId, interaction.user.id);
    return interaction.showModal(this.createRegistrationModal(profile, customId));
  }

  createRegistrationModal(profile, customId = "registration:profile") {
    const characterName = new TextInputBuilder()
      .setCustomId("character_name")
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(32)
      .setRequired(true)
      .setPlaceholder("Ví dụ: xThamLy");
    if (profile?.characterName) characterName.setValue(String(profile.characterName).slice(0, 32));

    const classSelect = new StringSelectMenuBuilder()
      .setCustomId("class_name")
      .setPlaceholder("Chọn một phái")
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true)
      .addOptions(this.classRegistry.list().map(({ name, emoji }) => ({
        label: name,
        value: name,
        emoji,
        default: profile?.className === name
      })));
    const savedAffiliation = profile ? affiliationOf(profile) : null;
    const affiliationSelect = new StringSelectMenuBuilder()
      .setCustomId("affiliation")
      .setPlaceholder("Chọn bang hoặc khách")
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true)
      .addOptions(AFFILIATIONS.map(item => ({
        label: item.name,
        value: item.code,
        description: item.code === "guild" ? "Người trong bang" : "Khách tham gia scrim",
        default: savedAffiliation === item.code
      })));

    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle(profile ? "Cập nhật nhân vật" : "Đăng ký nhân vật")
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Điền tên, chọn phái, rồi chọn bạn thuộc bang hay là khách scrim.")
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("Tên nhân vật")
          .setDescription("Tên hiện trên bảng điểm danh, tối đa 32 ký tự.")
          .setTextInputComponent(characterName),
        new LabelBuilder()
          .setLabel("Phái")
          .setDescription("Chọn đúng một phái.")
          .setStringSelectMenuComponent(classSelect),
        new LabelBuilder()
          .setLabel("Bạn là")
          .setDescription("Người trong bang hoặc khách scrim.")
          .setStringSelectMenuComponent(affiliationSelect)
      );
  }

  parseRegistrationCustomId(customId) {
    if (customId === "registration:profile") return { action: "profile" };
    const joinMatch = /^registration:join:([0-9a-f-]{36})$/iu.exec(customId);
    if (joinMatch) return { action: "join", eventId: joinMatch[1] };
    const markMatch = /^registration:mark:([0-9a-f-]{36}):(present|late|absent)$/iu.exec(customId);
    if (markMatch) return { action: "mark", eventId: markMatch[1], code: markMatch[2] };
    return null;
  }

  async handleModal(interaction) {
    const request = this.parseRegistrationCustomId(interaction.customId);
    if (!request) {
      return interaction.reply({
        content: "Biểu mẫu đã hết hạn. Hãy bấm **Nhân vật** trên bảng hoặc chạy /register.",
        flags: MessageFlags.Ephemeral
      });
    }
    this.permissionService.assertParticipant(interaction.member, this.configRepository.get(interaction.guildId));
    const characterName = interaction.fields.getTextInputValue("character_name").trim();
    const [className] = interaction.fields.getStringSelectValues("class_name");
    const [affiliation] = interaction.fields.getStringSelectValues("affiliation");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildConfig = this.configRepository.get(interaction.guildId);
    const profile = await this.registrationService.register({
      guildId: interaction.guildId,
      guildConfig,
      member: interaction.member,
      characterName,
      className,
      affiliation
    });
    const saved = `Đã lưu nhân vật **${profile.characterName}** — ${profile.className} — ${affiliationName(profile.affiliation)}.`;

    if (request.action === "join") {
      const result = await this.attendanceService.registerForEvent({
        guildId: interaction.guildId,
        guildConfig,
        member: interaction.member,
        eventId: request.eventId
      });
      const synced = await this.syncBoard(interaction.guildId, result.event.eventId);
      const suffix = synced ? "" : " Bảng chưa cập nhật; quản trị viên có thể dùng /refresh.";
      const joined = result.alreadyRegistered
        ? `Bạn đã có tên trong sự kiện **${result.event.name}**.`
        : `Đã thêm vào sự kiện **${result.event.name}**.`;
      return interaction.editReply({ content: `${saved} ${joined}${suffix}`, allowedMentions: { parse: [] } });
    }

    if (request.action === "mark") {
      const status = BUTTON_STATUSES.find(item => item.code === request.code)?.status;
      const result = await this.attendanceService.mark({
        guildId: interaction.guildId,
        guildConfig,
        member: interaction.member,
        eventId: request.eventId,
        status
      });
      const synced = await this.syncBoard(interaction.guildId, result.event.eventId);
      const suffix = synced ? "" : " Bảng chưa cập nhật; quản trị viên có thể dùng /refresh.";
      return interaction.editReply({
        content: `${saved} Trạng thái **${status}** đã được ghi cho sự kiện **${result.event.name}**.${suffix}`,
        allowedMentions: { parse: [] }
      });
    }

    if (!await this.syncOpenBoards(interaction.guildId)) {
      return interaction.editReply({
        content: `${saved} Bảng chưa cập nhật; quản trị viên có thể dùng /refresh.`,
        allowedMentions: { parse: [] }
      });
    }
    return interaction.editReply({ content: saved, allowedMentions: { parse: [] } });
  }

  async handleSelect(interaction) {
    return interaction.reply({
      content: "Menu chọn phái cũ đã được thay bằng form đăng ký. Hãy chạy /register.",
      flags: MessageFlags.Ephemeral
    });
  }

  async handleButton(interaction) {
    if (interaction.customId === "registration:start") {
      return this.showRegistrationModal(interaction);
    }
    const joinMatch = /^event:join:([0-9a-f-]{36})$/iu.exec(interaction.customId);
    if (joinMatch) {
      const profile = await this.registrationService.getProfile(interaction.guildId, interaction.user.id);
      if (!profile) return this.showRegistrationModal(interaction, `registration:join:${joinMatch[1]}`);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await this.attendanceService.registerForEvent({
        guildId: interaction.guildId,
        guildConfig: this.configRepository.get(interaction.guildId),
        member: interaction.member,
        eventId: joinMatch[1]
      });
      const synced = await this.syncBoard(interaction.guildId, result.event.eventId);
      const suffix = synced ? "" : " Bảng chưa cập nhật; quản trị viên có thể dùng /refresh.";
      const message = result.alreadyRegistered
        ? `Bạn đã đăng ký sự kiện **${result.event.name}** rồi.${suffix}`
        : `Đã đăng ký tham gia **${result.event.name}**. Có thể chọn Có mặt, Đến muộn hoặc Vắng mặt khi sẵn sàng.${suffix}`;
      return interaction.editReply({ content: message, allowedMentions: { parse: [] } });
    }
    const match = /^attendance:([0-9a-f-]{36}):(present|late|absent)$/iu.exec(interaction.customId);
    if (!match) {
      return interaction.reply({
        content: "Nút này thuộc bảng cũ hoặc không còn được hỗ trợ. Hãy dùng /register hoặc /refresh.",
        flags: MessageFlags.Ephemeral
      });
    }
    const profile = await this.registrationService.getProfile(interaction.guildId, interaction.user.id);
    if (!profile) return this.showRegistrationModal(interaction, `registration:mark:${match[1]}:${match[2]}`);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const status = BUTTON_STATUSES.find(item => item.code === match[2])?.status;
    const result = await this.attendanceService.mark({
      guildId: interaction.guildId,
      guildConfig: this.configRepository.get(interaction.guildId),
      member: interaction.member,
      eventId: match[1],
      status
    });
    const synced = await this.syncBoard(interaction.guildId, result.event.eventId);
    const suffix = synced ? "" : " Bảng chưa cập nhật; quản trị viên có thể dùng /refresh.";
    return interaction.editReply(
      {
        content: `Đã ghi nhận trạng thái **${status}** cho nhân vật **${result.record.characterName}**.${suffix}`,
        allowedMentions: { parse: [] }
      }
    );
  }

  async setup(interaction) {
    const role = interaction.options.getRole("role", true);
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const adminRole = interaction.options.getRole("admin_role");
    this.configRepository.save(interaction.guildId, {
      roleId: role.id,
      channelId: channel.id,
      adminRoleId: adminRole?.id
    });
    await this.registrationService.refreshClassRoster(interaction.guildId);
    const synced = await this.syncOpenBoards(interaction.guildId);
    const suffix = synced ? "" : " Bảng điểm danh chưa cập nhật; dùng /refresh để thử lại.";
    const adminRoleMessage = adminRole ? ` Role quản trị: <@&${adminRole.id}>.` : "";
    return interaction.editReply(`Đã lưu cấu hình riêng cho server. Role thành viên: <@&${role.id}>. Kênh bảng: <#${channel.id}>.${adminRoleMessage}${suffix}`);
  }

  async createEvent(interaction, guildConfig) {
    await this.registrationService.refreshClassRoster(interaction.guildId);
    const event = await this.eventService.create({
      guildId: interaction.guildId,
      guildConfig,
      member: interaction.member,
      name: interaction.options.getString("name", true),
      scheduledAt: interaction.options.getString("time", true),
      dkp: interaction.options.getString("dkp") || "",
      channelId: guildConfig?.channelId || interaction.channelId
    });
    const synced = await this.syncBoard(interaction.guildId, event.eventId);
    const suffix = synced ? "" : "\nKhông thể cập nhật bảng Discord; dùng /refresh để thử lại.";
    return interaction.editReply(`Đã tạo sự kiện **${event.name}**.${suffix}\nEventID: \`${event.eventId}\``);
  }

  async editEvent(interaction) {
    const event = await this.eventService.edit({
      guildId: interaction.guildId,
      guildConfig: this.configRepository.get(interaction.guildId),
      member: interaction.member,
      name: interaction.options.getString("name", true),
      changes: {
        name: interaction.options.getString("new_name") ?? undefined,
        scheduledAt: interaction.options.getString("time") ?? undefined,
        dkp: interaction.options.getString("dkp") ?? undefined
      }
    });
    const synced = await this.syncBoard(interaction.guildId, event.eventId);
    const suffix = synced ? "" : " Bảng chưa cập nhật; dùng /refresh để thử lại.";
    return interaction.editReply(`Đã lưu thay đổi sự kiện **${event.name}**.${suffix}`);
  }

  async closeEvent(interaction) {
    const event = await this.eventService.close({
      guildId: interaction.guildId,
      guildConfig: this.configRepository.get(interaction.guildId),
      member: interaction.member,
      name: interaction.options.getString("name", true)
    });
    const synced = await this.syncBoard(interaction.guildId, event.eventId);
    const suffix = synced ? "" : " Bảng chưa cập nhật; dùng /refresh để thử lại.";
    return interaction.editReply(`Đã đóng sự kiện **${event.name}**. Lịch sử điểm danh được giữ nguyên.${suffix}`);
  }

  async deleteEvent(interaction) {
    const event = await this.eventService.remove({
      guildId: interaction.guildId,
      guildConfig: this.configRepository.get(interaction.guildId),
      member: interaction.member,
      name: interaction.options.getString("name", true)
    });
    let messageRemoved = true;
    try {
      await this.discordMessageService.deleteBoard(interaction.guildId, event);
    } catch (error) {
      messageRemoved = false;
      console.error(`Đã xóa sự kiện ${event.eventId} nhưng chưa xóa bảng Discord: ${error.message}`);
    }
    const suffix = messageRemoved ? "" : " Bảng Discord chưa xóa được.";
    return interaction.editReply(`Đã xóa sự kiện **${event.name}** cùng phiếu của sự kiện đó.${suffix}`);
  }

  async refresh(interaction) {
    const memberCount = await this.registrationService.refreshClassRoster(interaction.guildId);
    const events = await this.eventService.listOpen(interaction.guildId);
    if (!events.length) {
      return interaction.editReply(`Đã cập nhật danh sách phái (${memberCount} hồ sơ); hiện không có sự kiện đang mở.`);
    }
    const lines = [];
    for (const event of events) {
      try {
        const message = await this.discordMessageService.syncEvent(interaction.guildId, event.eventId);
        lines.push(`**${event.name}**: https://discord.com/channels/${interaction.guildId}/${event.channelId}/${message.id}`);
      } catch (error) {
        console.error(`Không thể đồng bộ bảng ${event.eventId}: ${error.message}`);
        lines.push(`**${event.name}**: chưa cập nhật được bảng.`);
      }
    }
    return interaction.editReply(`Đã đồng bộ ${events.length} sự kiện đang mở.\n${lines.join("\n")}`);
  }

  async syncOpenBoards(guildId) {
    const events = await this.eventService.listOpen(guildId);
    let synced = true;
    for (const event of events) {
      if (!await this.syncBoard(guildId, event.eventId)) synced = false;
    }
    return synced;
  }

  async syncBoard(guildId, eventId) {
    try {
      await this.discordMessageService.syncEvent(guildId, eventId);
      return true;
    } catch (error) {
      console.error(`Data saved but Discord board sync failed for event ${eventId}: ${error.message}`);
      return false;
    }
  }

  async memberInfo(interaction) {
    const requestedUser = interaction.options.getUser("member") || interaction.user;
    if (requestedUser.id !== interaction.user.id) {
      this.permissionService.assertAdmin(interaction.member, this.configRepository.get(interaction.guildId));
    }
    const profile = await this.registrationService.getProfile(interaction.guildId, requestedUser.id);
    if (!profile) return interaction.editReply("Chưa tìm thấy hồ sơ đăng ký của thành viên.");
    return interaction.editReply({
      content: `**${profile.characterName}** — ${profile.className}\n${affiliationName(affiliationOf(profile))}\nDiscord: <@${profile.userId}>\nĐăng ký: ${profile.registeredAt || "Không rõ"}`,
      allowedMentions: { parse: ["users"] }
    });
  }

  async respondWithError(interaction, error) {
    const expected = error instanceof ApplicationError;
    if (!expected) console.error(`Discord interaction failed: ${error.message}`);
    const content = expected
      ? error.message
      : "Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại hoặc báo quản trị viên.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, components: [] });
      } else if (interaction.isRepliable()) {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      console.error(`Could not send interaction error response: ${replyError.message}`);
    }
  }
}

module.exports = { DiscordInteractionAdapter };
