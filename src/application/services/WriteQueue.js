class WriteQueue {
  /** Serializes compound reads and writes for each guild in this process. */
  constructor() {
    this.tails = new Map();
  }

  /** Runs an operation after earlier operations for its key have settled. */
  run(key, operation) {
    const previous = this.tails.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.tails.set(key, current);
    return current.finally(() => {
      if (this.tails.get(key) === current) this.tails.delete(key);
    });
  }
}

module.exports = { WriteQueue };
