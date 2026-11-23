import { env } from "../config/env.js";

const allowed = new Set(env.CORS_ORIGINS);

export async function cors(req, res, next) {
  // The response depends on Origin, so caches must key on it.
  res.setHeader("Vary", "Origin");

  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);

    const isPreflight =
      req.method === "OPTIONS" && req.headers["access-control-request-method"];
    if (isPreflight) {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204);
      return res.end();
    }
  }

  await next();
}
