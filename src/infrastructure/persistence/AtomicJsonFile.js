const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class AtomicJsonFile {
  constructor(filePath) {
    this.filePath = filePath;
  }

  readObject() {
    if (!fs.existsSync(this.filePath)) return {};
    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) return {};

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Không thể phân tích dữ liệu ${this.filePath}: ${error.message}`, { cause: error });
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Dữ liệu ${this.filePath} phải là một object JSON.`);
    }
    return value;
  }

  writeObject(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { AtomicJsonFile };
