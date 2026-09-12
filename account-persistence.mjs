import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeHistory } from "./trend-evidence.mjs";

const SESSION_COOKIE = "pf_session";
const SESSION_DAYS = 30;
const MAX_STATE_BYTES = 1_500_000;

function databaseConfig() {
  if (process.env.NODE_ENV === "test") {
    return { path: ":memory:", persistent: false, mode: "test-memory" };
  }
  const explicitPath = String(process.env.PF_DB_PATH || "").trim();
  if (explicitPath) {
    fs.mkdirSync(path.dirname(explicitPath), { recursive: true });
    return { path: explicitPath, persistent: true, mode: "persistent-file" };
  }
  const dataDir = String(process.env.PF_DATA_DIR || "").trim();
  if (dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    return {
      path: path.join(dataDir, "publisher-forge.sqlite"),
      persistent: true,
      mode: "persistent-directory"
    };
  }
  const fallbackDir = path.join(os.tmpdir(), "publisher-forge-data");
  fs.mkdirSync(fallbackDir, { recursive: true });
  return {
    path: path.join(fallbackDir, "publisher-forge.sqlite"),
    persistent: false,
    mode: "ephemeral-file"
  };
}

function createStore(config = databaseConfig()) {
  const db = new DatabaseSync(config.path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  return { db, config };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password, saltHex) {
  return crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  }).toString("hex");
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}

function verifyPassword(password, salt, expectedHex) {
  try {
    const actual = Buffer.from(hashPassword(password, salt), "hex");
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieMap(header) {
  return String(header || "").split(";").reduce((result, pair) => {
    const index = pair.indexOf("=");
    if (index < 1) return result;
    result[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    return result;
  }, {});
}

function requestIsSecure(req) {
  return Boolean(req.secure) || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function setSessionCookie(req, res, token) {
  const secure = requestIsSecure(req) || process.env.NODE_ENV === "production";
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
  );
}

function clearSessionCookie(req, res) {
  const secure = requestIsSecure(req) || process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
  );
}

function sameOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || (req.secure ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  try {
    return new URL(origin).origin === `${proto}://${host}`;
  } catch (error) {
    return false;
  }
}

function requireSameOrigin(req, res) {
  if (sameOrigin(req)) return true;
  res.status(403).json({ error: "Cross-site request blocked" });
  return false;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeState(value) {
  const state = safeObject(value);
  return {
    projectVault: Array.isArray(state.projectVault) ? state.projectVault.slice(0, 250) : [],
    revenueTests: Array.isArray(state.revenueTests) ? state.revenueTests.slice(0, 1000) : [],
    trendHistory: normalizeHistory(state.trendHistory),
    opportunities: Array.isArray(state.opportunities) ? state.opportunities.slice(0, 150) : [],
    moneyAgentSettings: safeObject(state.moneyAgentSettings),
    commandCenterPlan: state.commandCenterPlan && typeof state.commandCenterPlan === "object"
      ? state.commandCenterPlan
      : null
  };
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

function registerAccountPersistence(application, options = {}) {
  const store = options.store || createStore();
  const { db, config } = store;
  const authLimiter = options.authLimiter || ((req, res, next) => next());
  const syncLimiter = options.syncLimiter || ((req, res, next) => next());

  const findUserByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const findUserById = db.prepare("SELECT id, email, created_at FROM users WHERE id = ?");
  const insertUser = db.prepare("INSERT INTO users (id,email,password_salt,password_hash,created_at,last_login_at) VALUES (?,?,?,?,?,?)");
  const touchLogin = db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?");
  const insertSession = db.prepare("INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)");
  const findSession = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?");
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const deleteExpired = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  const findState = db.prepare("SELECT state_json, revision, updated_at FROM user_state WHERE user_id = ?");
  const insertState = db.prepare("INSERT INTO user_state (user_id,state_json,revision,updated_at) VALUES (?,?,1,?)");
  const updateState = db.prepare("UPDATE user_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE user_id = ?");

  function authenticated(req) {
    const token = cookieMap(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const hash = tokenHash(token);
    const session = findSession.get(hash);
    if (!session) return null;
    if (Date.parse(session.expires_at) <= Date.now()) {
      deleteSession.run(hash);
      return null;
    }
    const user = findUserById.get(session.user_id);
    return user ? { user, tokenHash: hash } : null;
  }

  function requireAuth(req, res) {
    const auth = authenticated(req);
    if (!auth) {
      res.status(401).json({ error: "Sign in required" });
      return null;
    }
    return auth;
  }

  function issueSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    deleteExpired.run(now.toISOString());
    insertSession.run(tokenHash(token), userId, now.toISOString(), expires.toISOString());
    setSessionCookie(req, res, token);
  }

  function statePayload(userId) {
    const row = findState.get(userId);
    if (!row) {
      return { revision: 0, updatedAt: null, state: normalizeState({}) };
    }
    let parsed = {};
    try { parsed = JSON.parse(row.state_json); } catch (error) { parsed = {}; }
    return {
      revision: Number(row.revision) || 0,
      updatedAt: row.updated_at,
      state: normalizeState(parsed)
    };
  }

  application.get("/api/account/status", (req, res) => {
    const auth = authenticated(req);
    res.json({
      status: "READY",
      signedIn: Boolean(auth),
      user: auth ? publicUser(auth.user) : null,
      storagePersistent: Boolean(config.persistent),
      storageMode: config.mode
    });
  });

  application.post("/api/account/register", authLimiter, (req, res) => {
    if (!requireSameOrigin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
    if (password.length < 10 || password.length > 200) {
      return res.status(400).json({ error: "Password must be at least 10 characters" });
    }
    if (findUserByEmail.get(email)) {
      return res.status(409).json({ error: "An account already exists for that email" });
    }
    const id = crypto.randomUUID();
    const record = passwordRecord(password);
    const now = new Date().toISOString();
    try {
      insertUser.run(id, email, record.salt, record.hash, now, now);
      issueSession(req, res, id);
      res.status(201).json({ user: { id, email, createdAt: now } });
    } catch (error) {
      res.status(500).json({ error: "Account could not be created" });
    }
  });

  application.post("/api/account/login", authLimiter, (req, res) => {
    if (!requireSameOrigin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const row = findUserByEmail.get(email);
    if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
      return res.status(401).json({ error: "Email or password is incorrect" });
    }
    const now = new Date().toISOString();
    touchLogin.run(now, row.id);
    issueSession(req, res, row.id);
    res.json({ user: publicUser(row) });
  });

  application.post("/api/account/logout", (req, res) => {
    if (!requireSameOrigin(req, res)) return;
    const token = cookieMap(req.headers.cookie)[SESSION_COOKIE];
    if (token) deleteSession.run(tokenHash(token));
    clearSessionCookie(req, res);
    res.json({ signedIn: false });
  });

  application.get("/api/account/state", syncLimiter, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(statePayload(auth.user.id));
  });

  application.put("/api/account/state", syncLimiter, (req, res) => {
    if (!requireSameOrigin(req, res)) return;
    const auth = requireAuth(req, res);
    if (!auth) return;
    const normalized = normalizeState(req.body?.state);
    const serialized = JSON.stringify(normalized);
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) {
      return res.status(413).json({ error: "Account data is too large to sync" });
    }
    const current = statePayload(auth.user.id);
    const baseRevision = Number(req.body?.baseRevision);
    const force = req.body?.force === true;
    if (!force && baseRevision !== current.revision) {
      return res.status(409).json({
        error: "Account data changed on another device",
        conflict: true,
        revision: current.revision,
        updatedAt: current.updatedAt
      });
    }
    const now = new Date().toISOString();
    if (current.revision === 0) {
      insertState.run(auth.user.id, serialized, now);
    } else {
      updateState.run(serialized, now, auth.user.id);
    }
    res.json(statePayload(auth.user.id));
  });

  return { application, store };
}

export {
  createStore,
  databaseConfig,
  normalizeState,
  registerAccountPersistence
};
