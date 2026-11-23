const NO_STORE_PREFIXES = ["/api/v1/auth", "/api/v1/users"];

export async function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  const path = req.url.split("?")[0];
  if (NO_STORE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    res.setHeader("Cache-Control", "no-store");
  }

  // HSTS only over HTTPS. A spoofed x-forwarded-proto only affects the
  // spoofer's own response, so trusting it here is harmless.
  if (req.socket.encrypted || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }

  await next();
}
