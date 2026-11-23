import { AppError } from "./app-error.js";
import { sendResponse } from "./response.js";

// The only place that formats errors (RFC 9457).
export function handleError(error, req, res) {
  req.error = error; // the logger reads this on finish

  // Headers already sent: nothing valid can follow, drop the connection.
  if (res.headersSent) return res.destroy();

  const known = error instanceof AppError;
  const status = known ? error.status : 500;

  const problem = {
    type: "about:blank",
    title: known ? error.title : "Internal Server Error",
    status,
    detail: known ? error.detail : "Something went wrong",
    instance: req.url.split("?")[0],
    requestId: req.id,
  };
  if (known && error.errors) problem.errors = error.errors;

  sendResponse(res, status, problem, {
    "content-type": "application/problem+json; charset=utf-8",
  });
}
