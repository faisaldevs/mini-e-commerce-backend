// TODO (testing phase): .env.test banao, test script update koro:
//   "test": "node --env-file=.env.test --test"
// Ekhon `npm test` JWT_SECRET missing error dibe — expected.

// ─────────────────────────────────────────────────────────────
// env.js — Environment configuration (validate only)
//
// .env loading is handled by package.json scripts (Node built-in):
//   dev   → --env-file=.env            (file missing = crash)
//   start → --env-file-if-exists=.env  (production: host injects vars)
//
// This file: read process.env → parse types → validate → freeze
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// 1. Core reader — all missing/fallback logic lives here
//    Returns { raw } if the variable is set, { value } if the fallback is used
// ─────────────────────────────────────────────
function read(key, fallback) {
  const raw = process.env[key]?.trim();
  if (raw) return { raw };
  if (fallback !== undefined) return { value: fallback };
  throw new Error(`Missing required environment variable: ${key}`);
}

// ─────────────────────────────────────────────
// 2. Typed parsers
//    - No `this`, so destructuring a parser is safe
//    - Secret values are never printed in error messages
// ─────────────────────────────────────────────

const parsers = {
  string(key, { fallback, minLength = 0 }) {
    const { raw, value } = read(key, fallback);
    if (raw === undefined) return value;
    if (raw.length < minLength) {
      throw new Error(`${key} must be at least ${minLength} characters`);
    }
    return raw;
  },

  int() {},

  bool() {},
  enum(key, allowed, { fallback } = {}) {
    // const val = parsers.string(key, { fallback });
  },
};

// ─────────────────────────────────────────────
// 3. Build + validate config at startup
//    Collect all errors first, then exit once (fail fast)
// ─────────────────────────────────────────────

// TODO (testing phase): create .env.test and update the test script:
//   "test": "node --env-file=.env.test --test"
// Until then `npm test` fails with a missing JWT_SECRET error — expected.

function loadConfig() {
  const errors = [];

  const check = (fn) => {
    try {
      return fn();
    } catch (err) {
      errors.push(`  • ${err.message}`);
      return undefined;
    }
  };

  const NODE_ENV = check(() => {
    parsers.enum;
  });
}
