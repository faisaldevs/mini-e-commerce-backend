import { env } from "../config/env.js";
import { AppError } from "./app-error.js";

export async function readJsonBody(req, limit = env.BODY_LIMIT_BYTES) {
  const mime = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (mime.toLowerCase() !== "application/json") {
    throw new AppError(
      415,
      "Unsupported Media Type",
      "Content-Type must be application/json",
    );
  }

  // Cheap early reject: trust the header only to refuse, never to accept.
  if (Number(req.headers["content-length"]) > limit) {
    throw new AppError(413, "Payload Too Large", "Request body too large");
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new AppError(413, "Payload Too Large", "Request body too large");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Bad Request", "Request body is not valid JSON");
  }
}
