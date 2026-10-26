const { ApplicationError } = require("../errors/ApplicationError");

const CHARACTER_NAME_MAX_LENGTH = 32;

function validateCharacterName(value) {
  if (typeof value !== "string") {
    throw new ApplicationError("Tên nhân vật phải là văn bản.", "INVALID_CHARACTER_NAME");
  }

  const name = value.trim();
  if (!name || name.length > CHARACTER_NAME_MAX_LENGTH || /[\r\n<>]/u.test(name)) {
    throw new ApplicationError(
      `Tên nhân vật phải từ 1 đến ${CHARACTER_NAME_MAX_LENGTH} ký tự và không chứa xuống dòng.`,
      "INVALID_CHARACTER_NAME"
    );
  }
  return name;
}

/** Confirms a class name exists in the canonical registry. */
function validateClassName(value, classRegistry) {
  if (!classRegistry.has(value)) {
    throw new ApplicationError("Phái không hợp lệ. Vui lòng chọn lại từ danh sách.", "INVALID_CLASS");
  }
  return value;
}

module.exports = { validateCharacterName, validateClassName };
