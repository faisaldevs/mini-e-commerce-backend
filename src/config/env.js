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

  int(key, { fallback, min = -Infinity, max = Infinity }) {
    const { raw, value } = read(key, fallback);
    if (raw === undefined) return value;
    const num = Number(raw);

    if (!Number.isInteger(num)) {
      throw new Error(`${key} must be an integer (got "${raw}")`);
    }
    if (num < min || num > max) {
      throw new Error(`${key} must be between ${min} and ${max} (got ${num})`);
    }
    return num;
  },

  bool(key, { fallback } = {}) {
    const { raw, value } = read(key, fallback);
    if (raw === undefined) return value;

    const normalized = raw.toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
    throw new Error(`${key} must be a boolean (got "${raw}")`);
  },
  enum(key, allowed, { fallback } = {}) {
    const val = parsers.string(key, { fallback });

    if (!allowed.includes(val)) {
      throw new Error(
        `${key} must be one of [${allowed.join(", ")}] (got "${val}")`,
      );
    }
    return val;
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

  const NODE_ENV = check(() =>
    parsers.enum("NODE_ENV", ["development", "production", "test"], {
      fallback: "development",
    }),
  );

  const isProd = NODE_ENV === "production";

  const config = {
    NODE_ENV,
    isProd,
    isDev: NODE_ENV === "development",
    isTest: NODE_ENV === "test",
    PORT: check(() =>
      parsers.int("PORT", { fallback: 8000, min: 1, max: 65535 }),
    ),
    // Production e weak secret allow na
    // JWT_SECRET: check(() =>
    //   parsers.string("JWT_SECRET", { minLength: isProd ? 32 : 0 }),
    // ),

    // MongoDB phase e uncomment korbe
    // DATABASE_URL: check(() => parsers.mongoUri('DATABASE_URL')),
  };

  if (errors.length > 0) {
    console.error(
      "\n❌ Invalid environment configuration:\n" + errors.join("\n") + "\n",
    );
    process.exit(1);
  }

  return Object.freeze(config);
}

export const env = loadConfig();
