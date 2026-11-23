# Framework-Replaceable Code: What We Built and Why

Everything in this file is code a framework (mostly Express) gives you for free.
We wrote it by hand to learn what is underneath. None of it is business logic.
Your app (users, products, cart, orders) sits on top of it.

Companion docs: rules in `CLAUDE.md`, plan in `docs/PROJECT_PLAN.md`.

---

## 1. Map: our file vs. the framework

| Our file | What it does | Express equivalent |
|---|---|---|
| `src/core/body-parser.js` | Reads and parses the JSON body, enforces size and type | `express.json({ limit })` |
| `src/core/compose.js` | Runs middlewares in order with `next()` | built in: `app.use(fn)` |
| `src/core/app-error.js` | An error class that carries an HTTP status | none (you write your own; `http-errors` is a package) |
| `src/core/error-handler.js` | Turns any thrown error into a response | error middleware `(err, req, res, next)` |
| `src/middlewares/request-id.js` | Gives every request a unique ID | `express-request-id` or 3 lines |
| `src/middlewares/logger.js` | One JSON log line per request | `morgan` or `pino-http` |
| `src/middlewares/security-headers.js` | Safe default response headers | `helmet` |
| `src/middlewares/cors.js` | Cross-origin browser access rules | `cors` |
| `src/middlewares/rate-limit.js` | Limits requests per client | `express-rate-limit` |
| `src/app.js` (`route()`) | Glue: parse URL, match router, call handler | `app.get(...)` and friends |

What a framework does **not** give you, so it is not in this file: the data
layer, auth, validation rules, and all feature modules.

---

## 2. The big picture: one request's journey

```
client
  │
  ▼
server.js            http.createServer(handleResponse)
  │
  ▼
app.js  handleResponse(req, res)
  │   try {
  ▼
compose chain  ── requestId ──▶ logger ──▶ securityHeaders ──▶ cors ──▶ rateLimit
  │                                                                      │
  │                                                                      ▼
  │                                                             route(req, res)
  │                                                               URL parse
  │                                                               router.match
  │                                                                      │
  │                                                                      ▼
  │                                                          handler (controller)
  │                                                          └─ may call readJsonBody
  │   } catch (error) {
  ▼
handleError(error, req, res)  ── the ONLY place that formats errors
```

Two ideas hold the design together:

1. **Middleware chain.** Cross-cutting jobs live in small functions that run in
   a fixed order. Each calls `next()` to continue, or stops the chain by not
   calling it.
2. **Throw, don't respond.** Anything that goes wrong throws an `AppError`.
   One catch at the top turns it into a response. No layer writes its own error
   response.

---

## 3. `compose.js`: the middleware chain

### What it is

A function that takes a list of middlewares and returns one function that runs
them in order.

### Express equivalent

```js
app.use(requestId);
app.use(logger);
app.use(cors);
```

Express does the same thing inside `app.use`.

### Our code

```js
export function compose(middlewares) {
  for (const fn of middlewares) {
    if (typeof fn !== "function") {
      throw new TypeError("Middleware must be a function");
    }
  }

  return function run(req, res, done) {
    let last = -1;

    async function dispatch(i) {
      if (i <= last) throw new Error("next() called multiple times");
      last = i;

      const fn = i === middlewares.length ? done : middlewares[i];
      if (fn) await fn(req, res, () => dispatch(i + 1));
    }

    return dispatch(0);
  };
}
```

### How it works

`dispatch(i)` runs middleware number `i`. The `next` it hands that middleware
is simply `() => dispatch(i + 1)`. That is the whole trick: **`next` means
"run the next function in the list"**.

```
dispatch(0) → A(req,res,next) → next() = dispatch(1) → B → next() = dispatch(2) → done
```

After the last middleware, `done` runs. For us `done` is `route`, which does
the routing.

### The "onion" order

Because each middleware does `await next()`, code **before** `next()` runs on
the way in and code **after** it runs on the way out:

```js
async function A(req, res, next) {
  console.log("A in");
  await next();
  console.log("A out");
}
// order: A in → B in → handler → B out → A out
```

The logger uses this: it starts a timer on the way in and prints the log line
after everything finished.

### Three behaviors worth knowing

| Behavior | How | Why it matters |
|---|---|---|
| Short-circuit | A middleware that does not call `next()` stops the chain | Auth later: no valid token, send 401, the route never runs |
| `last` guard | `next()` called twice throws | Prevents running the rest of the chain, and sending the response, twice |
| Error flow | `dispatch` is `async`, so a throw downstream becomes a rejected promise that the upstream `await next()` receives | One `try/catch` at the top catches everything |

### Not that important (skim)

- The build-time `typeof fn !== "function"` check only makes a typo in the
  middleware list fail at startup instead of on the first request.
- `done` is optional. `if (fn)` simply skips it when absent.

---

## 4. `app-error.js` and `error-handler.js`: errors in one place

### The problem they solve

Without a central handler, every controller writes its own error response in its
own format, and unexpected crashes leak stack traces. We want one format and
zero leaks.

### Express equivalent

```js
// Express error middleware: four arguments tell Express it is an error handler
app.use((err, req, res, next) => {
  res.status(err.status ?? 500).json({ message: err.message });
});
```

Express gives the hook, but its default format is not RFC 9457, so you still
write the formatting. `AppError` has no Express equivalent. You write your own
class like ours.

### `AppError`

```js
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
```

Usage anywhere in the app:

```js
throw new AppError(404, "Not Found", "Product not found");
throw new AppError(409, "Conflict", "Email already registered");
```

An `AppError` means "expected failure, safe to tell the client". Any other
error means "bug, tell the client nothing".

### `handleError`

```js
export function handleError(error, req, res) {
  req.error = error; // the logger reads this on finish

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
```

### How it works, line by line

- `req.error = error`: leaves the error where the logger can find it later.
- `res.headersSent`: if a response was already partly sent, we cannot send a
  clean error anymore. Cutting the connection is the only honest option.
- `known ? ... : ...`: the safety switch. Unknown errors get the generic text.
  The real message and stack go to the logs only.
- The shape follows **RFC 9457** (problem details): `type`, `title`, `status`,
  `detail`, `instance`, plus our `requestId`.
- `application/problem+json` is the registered content type for that shape.
  Clients can detect it.
- The last argument to `sendResponse` overrides the default
  `application/json` header because the headers object is spread last.

### Example response

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "No route for /nope",
  "instance": "/nope",
  "requestId": "7713bff7-781a-4f51-a991-0b9c29103275"
}
```

### Not that important (skim)

- `type: "about:blank"` is the RFC's default meaning "no extra documentation
  page for this error type". You can ignore it for now.
- `instance` is the path where it happened, without the query string, so
  secrets in the query never end up in responses.

---

## 5. `body-parser.js`: reading the request body

### The problem

Node never gives you `req.body`. The body arrives as a **stream of Buffer
chunks**, and someone has to collect and parse it. It also has to be safe:
without a size limit, one client can send gigabytes and crash your server.

### Express equivalent

```js
app.use(express.json({ limit: "1mb" }));
// then in handlers: req.body
```

### Our code

```js
export async function readJsonBody(req, limit = env.BODY_LIMIT_BYTES) {
  const mime = (req.headers["content-type"] ?? "").split(";")[0].trim();
  if (mime.toLowerCase() !== "application/json") {
    throw new AppError(415, "Unsupported Media Type",
      "Content-Type must be application/json");
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
```

### How it works, step by step

```
req (stream of chunks) → check type → check size → collect chunks → join → JSON.parse → object
```

1. **Content-Type check.** `application/json; charset=utf-8` becomes
   `application/json` after `split(";")[0]`. Anything else is **415**.
2. **Early size reject.** If the `Content-Length` header already exceeds the
   limit, refuse before reading any byte (**413**).
3. **`for await (const chunk of req)`.** `req` is a readable stream. This loop
   pulls each chunk as it arrives.
4. **Running size count.** The header can lie or be missing (chunked uploads),
   so we count real bytes and stop at the limit.
5. **`Buffer.concat(...).toString("utf8")`.** Join first, then decode. Decoding
   per chunk could cut a multi-byte character (Bengali, emoji) in half.
6. **`JSON.parse` in `try/catch`.** Bad or empty JSON is **400**, not a crash.

### Status codes it produces

| Code | When |
|---|---|
| 400 | body is not valid JSON (including empty) |
| 413 | body bigger than `BODY_LIMIT_BYTES` |
| 415 | `Content-Type` is not `application/json` |

### How a handler uses it

```js
async function createProduct(req, res) {
  const body = await readJsonBody(req); // throws AppError on bad input
  // ...
}
```

Only routes that need a body call it. GET routes never pay the cost.

### Not that important (skim)

- If a chunked request goes over the limit mid-stream, Node may reset the
  connection instead of delivering the 413. Early rejection via
  `Content-Length` covers normal clients.
- `limit` is a parameter with an env default so tests can pass a tiny limit.

---

## 6. `request-id.js`: a ticket number per request

### The problem

When a user says "I got an error", you need to find the exact log line. A unique
ID on each request, echoed in the response and in the logs, links them.

### Express equivalent

`express-request-id`, or by hand:

```js
app.use((req, res, next) => { req.id = crypto.randomUUID(); next(); });
```

### Our code

```js
import { randomUUID } from "node:crypto";

export async function requestId(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  await next();
}
```

### How it works

- `randomUUID()` makes a random unique ID.
- `req.id` lets every later layer (logger, error handler) read it.
- The `X-Request-Id` header returns it to the client, so the client can quote
  it in a bug report.
- It always generates its own ID and ignores any ID the client sent. A
  client-sent ID could forge or confuse log entries.
- It runs **first** in the chain so everything after it can use the ID.

---

## 7. `logger.js`: one log line per request

### Express equivalent

`morgan("combined")`, or `pino-http` for JSON logs.

### Our code

```js
export async function logger(req, res, next) {
  const start = performance.now();

  res.on("close", () => {
    const status = res.statusCode;
    const line = {
      time: new Date().toISOString(),
      level: status >= 500 ? "error" : "info",
      requestId: req.id,
      method: req.method,
      path: req.url.split("?")[0], // query may carry secrets
      status,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    };
    if (status >= 500 && req.error) {
      line.message = req.error.message;
      line.stack = req.error.stack; // logs only, never in a response
    }
    console.log(JSON.stringify(line));
  });

  await next();
}
```

### How it works

- It starts a timer, then registers a listener on the response's `close` event.
- `close` fires when the response is done, including error responses and
  responses sent by short-circuiting middleware. That is why logging happens
  there and not after `await next()`.
- The status is read at the end, so the line always shows the **final** status.
- Output is **JSON on one line**, so tools can parse it.
- The query string is dropped from `path` because tokens sometimes sit in query
  strings.
- Stack traces appear only for 5xx and only in the log. They never reach the
  client.

### Example log lines

```json
{"time":"2026-11-23T11:33:33.342Z","level":"info","requestId":"ecbd610b-...","method":"GET","path":"/api/v1/health","status":200,"durationMs":1.43}
{"time":"...","level":"error","requestId":"b19a9071-...","method":"GET","path":"/api/v1/_boom","status":500,"durationMs":0.1,"message":"secret internals","stack":"Error: ..."}
```

### Not that important (skim)

- `performance.now()` is a high-resolution clock, better than `Date.now()` for
  durations. The rounding just keeps the number readable.
- Logging goes to stdout with `console.log`. Collecting and shipping logs is an
  ops concern outside this project.

---

## 8. `security-headers.js`: safe response headers

### Express equivalent

`helmet()` (it sets many more headers than we do).

### Our code

```js
const NO_STORE_PREFIXES = ["/api/v1/auth", "/api/v1/users"];

export async function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  const path = req.url.split("?")[0];
  if (NO_STORE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    res.setHeader("Cache-Control", "no-store");
  }

  if (req.socket.encrypted || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }

  await next();
}
```

### What each header does

| Header | Meaning |
|---|---|
| `X-Content-Type-Options: nosniff` | Browser must trust our `Content-Type`, no guessing. Blocks a class of attacks where JSON is "sniffed" as HTML or script. |
| `Cache-Control: no-store` | Browsers and proxies must not keep the response. We use it only on auth and user routes (personal data). Products can still be cached. |
| `Strict-Transport-Security` | Tells browsers to use HTTPS only for this site. Sent only when the request came over HTTPS, since sending it over plain HTTP is meaningless. |

### Not that important (skim)

- Trusting `x-forwarded-proto` is safe here: a spoofed value only changes the
  header on the spoofer's own response.
- `helmet` also sets headers like `X-Frame-Options` and CSP, which matter for
  HTML pages. We serve only JSON, so we skip them.

---

## 9. `cors.js`: cross-origin rules

### The problem

A browser page on `http://localhost:3000` calling an API on `http://localhost:8000`
is a **cross-origin** request. Browsers block it unless the API says it is
allowed. This is a **browser** rule: curl and Postman ignore it.

### Express equivalent

```js
app.use(cors({ origin: ["http://localhost:3000"] }));
```

### Our code

```js
const allowed = new Set(env.CORS_ORIGINS);

export async function cors(req, res, next) {
  res.setHeader("Vary", "Origin");

  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);

    const isPreflight =
      req.method === "OPTIONS" && req.headers["access-control-request-method"];
    if (isPreflight) {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204);
      return res.end();
    }
  }

  await next();
}
```

### How it works

**Normal request.** The browser sends `Origin: http://localhost:3000`. If that
exact origin is in our allowlist, we echo it back in
`Access-Control-Allow-Origin`. The browser then lets the page read the response.
If it is not in the list, we add nothing and the browser blocks it.

**Preflight.** Before a "non-simple" request (for example `POST` with JSON, or
any request with an `Authorization` header), the browser first sends an
`OPTIONS` request asking permission. We answer it directly with `204` and the
allowed methods and headers, then **stop the chain** (we `return` and never call
`next()`), so the router never sees it.

**`Vary: Origin`.** Our response depends on who asked. This header tells caches
to store separate copies per origin, so one site's CORS answer is never served
to another.

### The allowlist

Set in `.env`:

```
CORS_ORIGINS = http://localhost:3000,https://myshop.com
```

Empty means no browser from another origin may call us. There is **no
wildcard**: we only allow exact origins we listed.

### Not that important (skim)

- `Access-Control-Max-Age: 600` lets the browser cache the preflight answer for
  10 minutes so it does not repeat it for every call.
- CORS is not security against attackers. It only controls what **browsers**
  let pages do. Your API still needs auth.

---

## 10. `rate-limit.js`: slow down abusive clients

### Express equivalent

```js
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
```

### Our code

```js
const hits = new Map(); // ip -> { count, resetAt }

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
```

### How it works: fixed window

Each IP gets a counter that resets every window:

```
window = 60s, max = 100

 0s ────────────── 60s ────────────── 120s
 [count 1..100 OK, 101+ → 429] [fresh count starts]
```

1. Look up the IP. If it has no entry or the window ended, start a new window.
2. Add 1 to the counter.
3. Over the max: set `Retry-After` (seconds until the window resets) and throw
   `429`. The central error handler formats the response.
4. Otherwise continue.

It sits **before** the expensive work, so abusive traffic is turned away cheaply.

### Cleanup timer

Without the `setInterval` sweep, the map would keep one entry for every IP that
ever connected. The sweep removes expired entries. `.unref()` lets Node exit
even though the timer is still scheduled.

### Known limits (also marked with a `shortcut:` comment in the file)

| Limit | Impact | Upgrade when |
|---|---|---|
| In memory | Resets on restart | you need persistence |
| Per process | Two server instances each count separately | you run more than one instance (use a shared store like Redis) |
| Keyed by socket IP | Behind a reverse proxy every client looks like the proxy | you deploy behind a proxy (read the forwarded IP safely) |
| Fixed window | A client can send 100 at second 59 and 100 more at second 61 | you need smoother limiting (sliding window) |

---

## 11. `app.js`: wiring it together

### Our code (trimmed)

```js
const runMiddlewares = compose([
  requestId,
  logger,
  securityHeaders,
  cors,
  rateLimit,
]);

async function route(req, res) {
  const url = URL.parse(`${URL_BASE}${req.url}`);
  if (url === null) throw new AppError(400, "Bad Request", "Malformed request URL");

  const result = rootRouter.match(req.method, url.pathname);

  switch (result.status) {
    case "found":
      req.params = result.params;
      req.query = Object.fromEntries(url.searchParams);
      return result.handler(req, res);
    case "bad-request":
      throw new AppError(400, "Bad Request", result.detail);
    case "method-not-allowed":
      res.setHeader("Allow", result.allowed.join(", "));
      throw new AppError(405, "Method Not Allowed",
        `${req.method} is not allowed on ${url.pathname}`);
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
```

### Why the order is what it is

| Position | Middleware | Reason |
|---|---|---|
| 1 | `requestId` | everything after it can log or report the ID |
| 2 | `logger` | measures the whole rest of the chain, errors included |
| 3 | `securityHeaders` | headers set early reach every response, even errors |
| 4 | `cors` | answers preflights before any real work |
| 5 | `rateLimit` | rejects abuse before routing and body parsing cost anything |
| done | `route` | finds the handler and runs it |

### Why headers set early still appear on error responses

`setHeader` stores a header on the response object. When `sendResponse` later
calls `writeHead`, Node merges those stored headers into the real response. That
is why the 405 carries `Allow` and every error carries `X-Request-Id` and the
security headers.

### Not that important (skim)

- The URL is built with string concatenation, not `new URL(req.url, base)`, so a
  path starting with `//` stays a path and is not treated as a host.
- `URL.parse` returns `null` on bad input instead of throwing, so we turn that
  into a clean 400.

---

## 12. Environment variables added

| Variable | Default | Used by |
|---|---|---|
| `BODY_LIMIT_BYTES` | `1048576` (1 MiB), max 10 MiB | `body-parser.js` |
| `CORS_ORIGINS` | empty (no cross-origin) | `cors.js` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | `rate-limit.js` |
| `RATE_LIMIT_MAX` | `100` | `rate-limit.js` |

All are parsed and validated in `src/config/env.js`. No other file reads
`process.env`.

---

## 13. Quick test commands

Start the server with `npm run dev`, then:

```bash
# 404 as problem+json, with requestId
curl -i localhost:8000/nope

# 405 with Allow header
curl -i -X POST localhost:8000/api/v1/health

# every response has X-Request-Id and nosniff
curl -i localhost:8000/api/v1/health

# CORS: allowed origin is echoed, others get nothing
curl -i -H "Origin: http://localhost:3000" localhost:8000/api/v1/health
curl -i -H "Origin: http://evil.example" localhost:8000/api/v1/health

# preflight answered with 204
curl -i -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  localhost:8000/api/v1/health

# rate limit (set RATE_LIMIT_MAX=5 in .env first)
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/api/v1/health; done
```

Each request prints one JSON log line in the terminal where the server runs.

---

## 14. Summary: what to remember

- **Middleware** = small function `(req, res, next)`. `await next()` is the
  line that splits "before" from "after".
- **Throw `AppError`, never write error responses** in services, controllers or
  middlewares. One handler formats everything.
- **Streams**: a request body is chunks. Count bytes, join, then decode.
- **Order of the chain matters**: ID, logger, headers, CORS, rate limit, then
  routing.
- Express hides all of this behind `app.use()` and a few packages. Knowing the
  inside tells you what each package is doing for you, and what to check when
  one misbehaves.

## 15. Still to build (not framework-replaceable)

- `core/validator.js` (M5)
- `db/json-store.js` (M6)
- Auth, users, products, cart, orders (M7 to M10)
- Graceful shutdown in `server.js` (M11)
