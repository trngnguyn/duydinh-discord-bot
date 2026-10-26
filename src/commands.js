const {
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Cấu hình role và kênh điểm danh cho server")
    .addRoleOption(option => option.setName("role").setDescription("Role được đăng ký và điểm danh").setRequired(true))
    .addChannelOption(option => option.setName("channel").setDescription("Kênh đăng bảng").addChannelTypes(ChannelType.GuildText))
    .addRoleOption(option => option.setName("admin_role").setDescription("Role quản trị bot (không bắt buộc)")),
  new SlashCommandBuilder()
    .setName("event-create")
    .setDescription("Tạo sự kiện điểm danh")
    .addStringOption(option => option.setName("name").setDescription("Tên sự kiện").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("time").setDescription("Ngày giờ, ví dụ: 2:24 AM 22/10/2026").setRequired(true).setMaxLength(100))
    .addStringOption(option => option.setName("dkp").setDescription("DKP hoặc ghi chú").setMaxLength(100)),
  new SlashCommandBuilder()
    .setName("event-edit")
    .setDescription("Chỉnh sửa sự kiện đang mở")
    .addStringOption(option => option.setName("event_id").setDescription("EventID").setRequired(true))
    .addStringOption(option => option.setName("name").setDescription("Tên mới").setMaxLength(100))
    .addStringOption(option => option.setName("time").setDescription("Ngày giờ, ví dụ: 2:24 AM 22/10/2026").setMaxLength(100))
    .addStringOption(option => option.setName("dkp").setDescription("DKP/ghi chú mới").setMaxLength(100)),
  new SlashCommandBuilder()
    .setName("event-close")
    .setDescription("Đóng sự kiện, giữ nguyên lịch sử")
    .addStringOption(option => option.setName("event_id").setDescription("EventID").setRequired(true)),
  new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Khôi phục/cập nhật bảng điểm danh"),
  new SlashCommandBuilder().setName("register").setDescription("Đăng ký hoặc cập nhật nhân vật"),
  new SlashCommandBuilder()
    .setName("member-info")
    .setDescription("Xem hồ sơ đăng ký của một thành viên")
    .addUserOption(option => option.setName("member").setDescription("Thành viên (mặc định: bạn)")),
  new SlashCommandBuilder().setName("help").setDescription("Hướng dẫn sử dụng bot")
].map(command => command.toJSON());

module.exports = { commands };
