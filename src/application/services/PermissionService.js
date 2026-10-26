const { ApplicationError } = require("../../domain/errors/ApplicationError");

class PermissionService {
  isAdministrator(member) {
    const permissions = member?.permissions || member?.memberPermissions;
    if (permissions?.has) {
      return permissions.has("Administrator") || permissions.has("ManageGuild");
    }
    const bitfield = permissions?.bitfield ?? permissions;
    if (!/^\d+$/u.test(String(bitfield ?? ""))) return false;
    return (BigInt(bitfield) & 40n) !== 0n;
  }

  /** Allows Discord managers/administrators or this guild's configured admin role. */
  isAdmin(member, guildConfig) {
    return this.isAdministrator(member) || this.hasRole(member, guildConfig?.adminRoleId);
  }

  /** Rejects a non-admin with a user-facing domain error. */
  assertAdmin(member, guildConfig) {
    if (!this.isAdmin(member, guildConfig)) {
      throw new ApplicationError("Bạn cần quyền quản lý hoặc role quản trị để thực hiện thao tác này.", "FORBIDDEN");
    }
  }

  /** Allows admins or participants with the guild's configured participant role. */
  assertParticipant(member, guildConfig) {
    if (this.isAdmin(member, guildConfig)) return;
    const roleId = guildConfig?.roleId;
    if (!roleId || !this.hasRole(member, roleId)) {
      throw new ApplicationError("Bạn chưa có role được phép đăng ký và điểm danh.", "FORBIDDEN");
    }
  }

  hasRole(member, roleId) {
    if (!roleId) return false;
    if (member?.roles?.cache?.has) return member.roles.cache.has(roleId);
    if (Array.isArray(member?.roles)) return member.roles.includes(roleId);
    return false;
  }
}

module.exports = { PermissionService };
