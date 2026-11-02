const { buildAttendanceSheet } = require("./AttendanceSheetBuilder");

class SheetSyncService {
  /** Rebuilds the shared spreadsheet from the JSON snapshot. */
  constructor({ dataStore, publisher }) {
    this.dataStore = dataStore;
    this.publisher = publisher;
  }

  get enabled() {
    return Boolean(this.publisher?.enabled);
  }

  /** Publishes every stored guild. A sheet failure does not undo the Discord action. */
  async sync() {
    if (!this.enabled) return false;
    try {
      await this.publisher.publish(buildAttendanceSheet(this.dataStore.snapshots()));
      return true;
    } catch (error) {
      console.error(`Không thể ghi Google Sheet: ${error.message}`);
      return false;
    }
  }
}

module.exports = { SheetSyncService };
