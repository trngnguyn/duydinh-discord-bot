const { ApplicationError } = require("../errors/ApplicationError");

/** Normalizes and validates the user-editable event fields. */
function validateEventInput(input) {
  const name = String(input.name || "").trim();
  const scheduledAt = String(input.scheduledAt || "").trim();
  const dkp = String(input.dkp || "").trim();

  if (!name || name.length > 100) {
    throw new ApplicationError("Tên sự kiện phải từ 1 đến 100 ký tự.", "INVALID_EVENT_NAME");
  }
  if (!scheduledAt || scheduledAt.length > 100) {
    throw new ApplicationError("Thời gian sự kiện không hợp lệ (tối đa 100 ký tự).", "INVALID_EVENT_TIME");
  }
  if (dkp.length > 100) {
    throw new ApplicationError("DKP/ghi chú không được dài quá 100 ký tự.", "INVALID_EVENT_DKP");
  }
  return { name, scheduledAt, dkp };
}

module.exports = { validateEventInput };
