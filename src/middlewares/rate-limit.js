import { env } from "../config/env.js";
import { AppError } from "../core/app-error.js";

// shortcut: in-memory fixed window keyed by socket IP. Resets on restart, is
// per-process, and sees the proxy's IP behind a reverse proxy. Upgrade to a
// shared store when running more than one instance.
const hits = new Map(); // ip -> { count, resetAt }

// Drop expired windows so the map cannot grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
}, env.RATE_LIMIT_WINDOW_MS).unref();

export async function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.socket.remoteAddress;

  let entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + env.RATE_LIMIT_WINDOW_MS };
    hits.set(ip, entry);
  }
  entry.count++;

  if (entry.count > env.RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
    throw new AppError(429, "Too Many Requests", "Rate limit exceeded");
  }

  await next();
}
