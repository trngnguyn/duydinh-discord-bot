class ApplicationError extends Error {
  constructor(message, code = "APPLICATION_ERROR", options = {}) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
  }
}

module.exports = { ApplicationError };
