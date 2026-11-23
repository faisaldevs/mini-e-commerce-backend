import { AppError } from "./core/app-error.js";
import { compose } from "./core/compose.js";
import { handleError } from "./core/error-handler.js";
import { cors } from "./middlewares/cors.js";
import { logger } from "./middlewares/logger.js";
import { rateLimit } from "./middlewares/rate-limit.js";
import { requestId } from "./middlewares/request-id.js";
import { securityHeaders } from "./middlewares/security-headers.js";
import { rootRouter } from "./routes.js";

const URL_BASE = "http://localhost";

// Order matters: request ID first (everything after can log/report it), logger
// second (measures everything below), rate limit before any real work.
const runMiddlewares = compose([
  requestId,
  logger,
  securityHeaders,
  cors,
  rateLimit,
]);

async function route(req, res) {
  // String concat (not new URL(req.url, base)) so "//x" stays a path, not a host.
  // URL.parse returns null instead of throwing on invalid input.
  const url = URL.parse(`${URL_BASE}${req.url}`);
  if (url === null) {
    throw new AppError(400, "Bad Request", "Malformed request URL");
  }

  const result = rootRouter.match(req.method, url.pathname);

  switch (result.status) {
    case "found":
      // Attach parsed pieces so controllers read req.params / req.query.
      req.params = result.params;
      req.query = Object.fromEntries(url.searchParams);
      return result.handler(req, res);

    case "bad-request":
      throw new AppError(400, "Bad Request", result.detail);

    case "method-not-allowed":
      res.setHeader("Allow", result.allowed.join(", "));
      throw new AppError(
        405,
        "Method Not Allowed",
        `${req.method} is not allowed on ${url.pathname}`,
      );

    default:
      throw new AppError(404, "Not Found", `No route for ${url.pathname}`);
  }
}

export async function handleResponse(req, res) {
  try {
    await runMiddlewares(req, res, route);
  } catch (error) {
    handleError(error, req, res);
  }
}
