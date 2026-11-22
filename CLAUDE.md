# CLAUDE.md — pure-node-shop

Mini e-commerce REST API built with **pure Node.js, no framework**. The goal is
**learning backend foundations by building**, not shipping fast. Read this file
fully before doing anything in this repo.

Full plan, API spec, data models and module syllabus: @docs/PROJECT_PLAN.md

---

## 1. Working mode (most important)

This is a **learning project**. The developer types the code himself.

- **Do NOT create, edit or overwrite source files** unless the developer explicitly
  says "write it", "create the file" or "apply it". Default = explain + show code.
- Work **module by module** in the order of `docs/PROJECT_PLAN.md` (M0 → M13).
  Never jump ahead or pre-build future modules.
- Before coding a module, give its **syllabus first**: what will be learned, which
  files, how functions relate, and how data flows through them. Wait for "go".
- When showing code, show **complete files** (not fragments), then explain
  **why** each important part exists, not just what it does.
- After a module, list the **"Done when" checks** so the developer can test it
  (Postman / Thunder Client / curl). Move on only after he confirms.
- When reviewing his code: point out bugs and deviations from these rules
  directly. Don't redesign things that already work; fix logic only.
- Language: explanations in **Bengali** (conversational) with **English technical
  terms**. Code, comments and identifiers in English. Use real-world analogies
  for abstract concepts. Keep answers short and precise — no filler.
- **Never change anything (files, moves, git init, installs) without asking first**,
  unless the developer explicitly permits that specific action. Read-only is fine.
- Developer commits himself. After each module, suggest a Conventional Commits
  message (e.g. `feat(m2): add router with 404/405`).
- For reviews the developer names the module/file; read the repo yourself.
- Product/behavior decisions live in `docs/PROJECT_PLAN.md` §8 — follow them.
- If unsure whether an API/flag exists or is stable in the current Node version,
  **say so and check the official docs** instead of guessing.

## 2. Hard constraints

- **No frameworks or helper libraries**: no Express, Koa, Fastify, Mongoose,
  dotenv, nodemon, jsonwebtoken, bcrypt, joi/zod, cors, helmet, etc.
- Only allowed runtime dependency: `mongodb` (official driver, **v7.9+**), and
  **only from Phase 4 (M12)**. Zero dependencies before that.
- Runtime: **Node.js 24 LTS or 26 LTS** (≥ 24.7 for `crypto.argon2`).
- **ES Modules only** (`"type": "module"`). Always import core modules with the
  `node:` prefix (`import http from 'node:http'`).
- `async/await` everywhere; no callback-style APIs when a promise API exists
  (`node:fs/promises`, `node:stream/promises`, `util.promisify` when needed).

## 3. Architecture rules

```
server.js → app.js (middleware chain) → router → route → controller → service → model → db adapter
```

| Layer | Knows about | Must NOT |
|---|---|---|
| `server.js` | http server, listen, DB connect, graceful shutdown | contain routes or business logic |
| `app.js` | middleware order, router mounting, error handler | contain business logic |
| `*.route.js` | path + method → middlewares + controller | contain logic |
| `*.controller.js` | `req`/`res`, reading params/body/query, calling service, sending response | contain business rules or DB calls |
| `*.service.js` | business rules, orchestration, throwing `AppError` | touch `req`/`res` |
| `*.model.js` | data access through `src/db/*` adapter | contain business rules |
| `*.validation.js` | input schemas for `core/validator.js` | — |

- Every feature module lives in `src/modules/<name>/` with exactly:
  `<name>.model.js`, `<name>.service.js`, `<name>.controller.js`,
  `<name>.route.js`, `<name>.validation.js`.
- Switching JSON-file → MongoDB (M12) must change **only `*.model.js` and `src/db/`**.
- Errors: **throw `AppError`**, never send error responses from services.
  The central `core/error-handler.js` is the only place that formats errors.
- Config: read `process.env` **only** in `src/config/env.js`; everything else
  imports from there. Missing required env → fail fast at startup.

## 4. Conventions

- File names: `kebab-case.js`. Variables/functions: `camelCase`. Classes:
  `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Named exports preferred; one responsibility per file.
- API prefix: **`/api/v1`**. Resources plural (`/products`, `/orders`).
- IDs: `crypto.randomUUID()` (JSON phase), `ObjectId` string (Mongo phase).
  Always expose as `id` in responses (never `_id`).
- Dates: ISO 8601 strings in UTC (`new Date().toISOString()`).
- **Money: integer in the smallest unit (paisa)**. Never floats.
- Never return `passwordHash` or other secrets in any response.

### Success response
```json
{ "data": { } }
{ "data": [ ], "meta": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }
```

### Error response — RFC 9457, `Content-Type: application/problem+json`
```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 422,
  "detail": "Request body has invalid fields",
  "instance": "/api/v1/products",
  "requestId": "b1f0…",
  "errors": [{ "pointer": "#/price", "detail": "must be a positive integer" }]
}
```
Unknown errors → 500 with a generic message. **Never leak stack traces.**

### Status codes used
200 OK · 201 Created · 204 No Content · 400 bad JSON · 401 no/invalid token ·
403 wrong role / not owner · 404 not found · 405 method not allowed (+ `Allow`) ·
409 conflict (duplicate email, insufficient stock) · 413 body too large ·
415 wrong `Content-Type` · 422 validation failed / invalid state change ·
429 rate limited (+ `Retry-After`) · 500 unexpected.

## 5. Security rules

- Password policy: min 15, max 128 chars, no composition rules, Unicode allowed.
- Passwords: **Argon2id** via `crypto.argon2` (OWASP minimum: m=19 MiB, t=2, p=1).
  Fallback: `crypto.scrypt` N=2^17, r=8, p=1 (raise `maxmem`). Check the
  stability status of `crypto.argon2` in the current Node docs before M7.
- Custom JWT (learning only): HS256 fixed — **ignore/verify the header `alg`,
  reject `none`**, compare signatures with `crypto.timingSafeEqual`, always check
  `exp`, short expiry. Note in code that production should use `jose`.
- Authorization: check **role** (`authorize('admin')`) **and ownership**
  (users only access their own cart/orders — prevent BOLA/IDOR).
- Validate every input (body, params, query). Cap `limit` in pagination.
- Body size limit; reject non-JSON `Content-Type` on body routes (415).
- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `Cache-Control: no-store` on auth/user responses, HSTS only behind HTTPS.
- CORS: explicit allowlist from env, handle `OPTIONS` preflight, `Vary: Origin`.
- Stock decrement must be atomic (JSON: write queue; Mongo: conditional `$inc`).
- `.env` is never committed; keep `.env.example` up to date.

## 6. Commands

```bash
npm run dev     # node --watch --env-file=.env src/server.js
npm start       # node --env-file-if-exists=.env src/server.js
npm test        # node --test
npm run seed:admin   # M7: idempotent admin from ADMIN_EMAIL / ADMIN_PASSWORD
```

## 7. Progress

Update this list as modules are confirmed complete.

- [ ] M0 Setup & tooling
- [ ] M1 HTTP deep dive + response helpers
- [ ] M2 Router
- [ ] M3 Body parser
- [ ] M4 Middleware pipeline
- [ ] M5 Errors & validation
- [ ] M6 JSON-file store
- [ ] M7 User + auth
- [ ] M8 Product
- [ ] M9 Cart
- [ ] M10 Order
- [ ] M11 Security & ops
- [ ] M12 MongoDB migration
- [ ] M13 Testing
