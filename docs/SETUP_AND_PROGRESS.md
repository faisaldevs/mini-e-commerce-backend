# Setup & Progress Notes

Handoff notes so work can resume on any machine. Rules live in `CLAUDE.md`,
the plan and API spec in `docs/PROJECT_PLAN.md`, a deep explanation of the
framework-replaceable code in `docs/FRAMEWORK_REPLACEABLE_CODE.md`. This file
records state, decisions and open issues.

Last updated: 2026-11-23

---

## 1. Resume on a new machine

```bash
node -v                      # must be >= 24.7 (crypto.argon2, --env-file-if-exists)
git clone https://github.com/faisaldevs/mini-e-commerce-backend.git
cd mini-e-commerce-backend
cp .env.example .env         # then edit, see below
npm run dev                  # node --watch --env-file=.env src/server.js
```

Minimum `.env` today (everything else has a fallback):

```
NODE_ENV=development
PORT=8000
```

Optional, with defaults:

```
BODY_LIMIT_BYTES=1048576        # max request body, 1 MiB
CORS_ORIGINS=http://localhost:3000   # comma-separated allowlist, empty = none
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

`JWT_SECRET` is **not** required yet. Its parser in `env.js` is commented out
until M7.

Never commit `.env`. It is gitignored; `.env.example` is kept.

Editor setup for `.js` import endings (already in the repo): `jsconfig.json`
(`module: nodenext`) and `.vscode/settings.json`
(`js/ts.preferences.importModuleSpecifierEnding: "js"`). After changing them run
"TypeScript: Restart TS Server".

---

## 2. Working agreement (from CLAUDE.md + chat)

- Learning project: the developer types the code. The assistant explains and
  shows code. Files are edited only after "apply it" / "write it" / "create the file".
- Ask before any change (files, git, installs). Read-only is fine.
- Module by module. Syllabus first, wait for "go".
- Developer commits (Conventional Commits). Exception: on 2026-11-22 the
  developer explicitly asked the assistant to commit and push.
- **Communication language: English** (changed from Bengali on 2026-11-22).
- No frameworks or helper libraries. Only dependency allowed: `mongodb`, from M12.
- **Exception recorded 2026-11-23:** the developer asked the assistant to
  *implement and then explain* the code a framework (Express) would replace.
  The assistant wrote exactly that set (section 3). Everything else
  (validator, data layer, auth, feature modules, tests, shutdown) stays
  developer-typed.

---

## 3. Progress

Legend: **Dev** = typed and confirmed by the developer. **Assistant** = written
by the assistant on request, verified with scratch scripts (not in the repo),
developer review and a real-server run still pending.

| Module | Status |
|---|---|
| M0 Setup & tooling | Done (Dev). Ticked in CLAUDE.md. Some env cleanup left (section 5). |
| M1 HTTP + response helpers | Done (Dev, confirmed 2026-11-23): `server.js`, `app.js`, `core/response.js`. **Not ticked in CLAUDE.md yet.** |
| M2 Router | Written (Dev): `core/router.js`, `routes.js`, `modules/health/health.route.js`. Fixed and checked 2026-11-23 (200/404/405+Allow/params/400). Not explicitly confirmed, not ticked. A TEMP echo block is still in `routes.js`. |
| M3 Body parser | Assistant: `core/body-parser.js` (`readJsonBody`). 400/413/415 verified. No route calls it yet. |
| M4 Middleware pipeline | Assistant: `core/compose.js`, `middlewares/request-id.js`, `middlewares/logger.js`. Wired in `app.js`. |
| M5 Errors & validation | **Half done.** Assistant: `core/app-error.js`, `core/error-handler.js` (problem+json, no stack leak, verified). **Pending (Dev): `core/validator.js`.** |
| M6 JSON-file store | Not started (Dev) |
| M7 to M10 Features | Not started (Dev) |
| M11 Security & ops | **Mostly done.** Assistant: `security-headers.js`, `cors.js`, `rate-limit.js` (429+Retry-After and preflight verified). **Pending (Dev): graceful shutdown in `server.js`.** |
| M12 MongoDB | Not started |
| M13 Testing | Not started |

### Files in the repo now

```
src/server.js
src/app.js                       middleware chain + route() + central catch
src/routes.js                    mounts routers under /api/v1 (+ TEMP echo)
src/config/env.js
src/core/response.js  router.js  compose.js  body-parser.js
src/core/app-error.js error-handler.js
src/middlewares/request-id.js logger.js security-headers.js cors.js rate-limit.js
src/modules/health/health.route.js
docs/PROJECT_PLAN.md  docs/SETUP_AND_PROGRESS.md  docs/FRAMEWORK_REPLACEABLE_CODE.md
jsconfig.json  .vscode/settings.json  playground/server.mjs
```

### Request flow today

```
server.js → app.handleResponse
  → compose: requestId → logger → securityHeaders → cors → rateLimit
  → route(): URL.parse → rootRouter.match → handler
  → any throw → handleError → application/problem+json
```

### "Done when" status for the assistant-written pieces

| Plan check | Result |
|---|---|
| M3: bad JSON 400, wrong type 415, too large 413 | passed (scratch test) |
| M4: every response has `X-Request-Id`, one JSON log line with duration | passed (scratch test) |
| M5: all errors are `problem+json`, unknown error 500 without stack | passed (scratch test) |
| M11: over limit 429 + `Retry-After`, `OPTIONS` preflight answered | passed (scratch test) |
| M11: Ctrl+C finishes in-flight requests | **not built** |

The scratch tests used a separate port and temporary routes. Re-check against
`npm run dev` after the TEMP block is removed.

---

## 4. `src/config/env.js` design

Flow: read `process.env` -> parse type -> validate -> collect all errors -> exit once -> freeze.

- **`read(key, fallback)`**: single gate for missing/empty/fallback logic.
  Trims the value. Returns `{ raw }` if set, `{ value }` if the fallback was
  used, throws if neither.
- **`parsers.string / int / bool / enum`**: `int` uses `Number(raw)` (so
  `"3000abc"` is rejected) and takes `min`/`max`. Error messages never print
  the value (secrets).
- **`loadConfig()`**: `check(fn)` wraps each parser and pushes errors into an
  array; if any, print all together and `process.exit(1)`.
- **Config keys now:** `NODE_ENV`, `isProd`, `isDev`, `isTest`, `PORT` (fallback
  8000), `BODY_LIMIT_BYTES` (fallback 1048576, max 10485760), `CORS_ORIGINS`
  (string split into an array, fallback empty), `RATE_LIMIT_WINDOW_MS`
  (fallback 60000), `RATE_LIMIT_MAX` (fallback 100).
- Only this file reads `process.env` (architecture rule).

---

## 5. Open issues

Status of the old M0 list, plus new items.

| # | Issue | Status |
|---|---|---|
| 1 | Two Banglish comments left in `env.js` ("Production e weak secret allow na", "MongoDB phase e uncomment korbe"). Rule: English only. | open |
| 2 | `.env.example` has no `JWT_SECRET` | moot until M7, add then |
| 3 | `JWT_SECRET` prod min length should be 64 (it is 32 in the commented parser) | fix when uncommenting at M7 |
| 4 | PORT fallback 3000 vs 8000 | **fixed** (8000) |
| 5 | Commented Mongo line uses `DATABASE_URL`; plan names are `MONGODB_URI` / `MONGODB_DB`. There is also no `mongoUri` parser yet. | open, M12 |
| 6 | `int` accepts `"1e3"` and `"0x10"` (via `Number`) | optional |
| 7 | `isDev`, `isTest`, `bool` unused (YAGNI) | optional |
| 8 | Tests: `.env.test` + `"test": "node --env-file=.env.test --test"`. The TODO comment in `env.js` still mentions a JWT_SECRET failure that no longer happens. | open, M13 |
| 9 | `start` script hardcodes `NODE_ENV=production` inline (macOS/Linux only) | optional |
| 10 | `--env-file` does not override variables already set in the shell | note |
| 11 | TEMP echo block in `routes.js` ("delete after the checks pass") | open |
| 12 | `app.js` still exports `handleResponse`; it handles requests. Optional rename to `handleRequest` (also in `server.js`). | optional |
| 13 | `.env.example` uses `KEY = value` with spaces; `.env` uses `KEY=value`. Prefer no spaces. | optional |
| 14 | Rate limiter keys on socket IP, in memory, per process (marked `shortcut:` in the file) | known limit, revisit behind a proxy |
| 15 | `readJsonBody` is not used by any route yet, so the 413/415/400 path is only tested by scratch scripts | open, resolves at M7 |

---

## 6. Git state

- Branch `main`, remote `origin` = `https://github.com/faisaldevs/mini-e-commerce-backend.git`.
- Commits: `317b2a3` feat(m0), `72e4d25` fix(m0), `69efda9` chore(m1) scaffold.
- **Uncommitted:** everything from M1 completion onward: `src/app.js`,
  `src/server.js`, `src/routes.js`, `src/core/*`, `src/middlewares/*`,
  `src/modules/*`, `src/config/env.js`, `.env.example`, `jsconfig.json`,
  `.vscode/settings.json`, and the three docs.
- `src/server.js` shows `MM`: the merge conflict was resolved and staged, then
  edited again.
- `stash@{0}: On main: wip before pul` is still there. Its content was only the
  server.js log-line conflict. Check with `git stash show -p`, then drop it.

Suggested commits (developer commits), in order:

1. `feat(m1): add http server, app handler and sendResponse`
2. `feat(m2): add router with 404/405 and health route`
3. `feat(m3): add json body parser with size and type limits`
4. `feat(m4): add compose, request id and logger middlewares`
5. `feat(m5): add AppError and problem+json error handler`
6. `feat(m11): add security headers, cors and rate limit middlewares`
7. `docs: add setup notes and framework-replaceable code guide`

They can also be squashed into fewer commits. The files are not split by module
in the working tree, so splitting needs `git add -p`.

---

## 7. Next steps (revised order)

The plan order was M0 to M13 one by one. On 2026-11-23 the framework-replaceable
parts of M3, M4, M5 and M11 were pulled forward. The rest of those modules is
still ahead. New order:

**A. Housekeeping (before new code)**
1. Delete the TEMP echo block in `routes.js` (and its `sendResponse` import).
2. Run `npm run dev` and re-check with curl (commands in
   `docs/FRAMEWORK_REPLACEABLE_CODE.md`, section 13).
3. Read `docs/FRAMEWORK_REPLACEABLE_CODE.md` once; confirm or question each piece.
4. Tick M1 (and M2 once confirmed) in the CLAUDE.md progress list. M3, M4, M5
   and M11 stay unticked until their remaining parts exist.
5. Commit, drop the stash, fix env issue 1.

**B. Finish the half-done modules (developer types)**
6. **M5 rest:** `core/validator.js`. Schema-based checks for body, params and
   query, throwing `AppError(422, ..., errors[{ pointer, detail }])`. Fastify
   would ship this; Express would not.
7. **M6:** `db/json-store.js` (`findAll`, `findById`, `findOne`, `insert`,
   `update`, `remove`), atomic write via temp file + rename, a write queue.
   Done when 10 concurrent writes never corrupt the file.

**C. Features (developer types)**
8. **M7** user + auth: `utils/password.js`, `utils/jwt.js`,
   `middlewares/auth.js`, user module, `scripts/seed-admin.js`. First real use
   of `readJsonBody`, the validator and `AppError`. Uncomment `JWT_SECRET` in
   `env.js` (min length 64 in prod) and add it to `.env.example`.
9. **M8** product (also `authorize(...roles)`, `utils/pagination.js`).
10. **M9** cart.
11. **M10** order.

**D. Production-ready**
12. **M11 rest:** graceful shutdown in `server.js` (finish in-flight requests on
    Ctrl+C / SIGTERM).
13. **M12** MongoDB migration (only `*.model.js` and `src/db/`).
14. **M13** tests (`node:test` + `fetch`, `listen(0)`, temp `DATA_DIR`).

**Rule for what the assistant writes:** only code a framework would replace, and
only on request. Validator, data layer, auth, features, tests and shutdown are
developer-typed with the usual syllabus first, then "go".
