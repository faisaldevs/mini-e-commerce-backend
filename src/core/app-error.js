// Thrown anywhere (middleware, controller, service). Only error-handler.js
// turns it into a response.
export class AppError extends Error {
  constructor(status, title, detail, errors) {
    super(detail ?? title);
    this.name = "AppError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.errors = errors; // optional [{ pointer, detail }]
  }
}
