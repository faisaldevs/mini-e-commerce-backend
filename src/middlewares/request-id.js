import { randomUUID } from "node:crypto";

// Always generated server-side: a client-supplied ID could forge log entries.
export async function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  await next();
}
