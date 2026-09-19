import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeHistory } from "./trend-evidence.mjs";

const SESSION_COOKIE = "pf_session";
const VISITOR_COOKIE = "pf_visit";
const SESSION_DAYS = 30;
const MAX_STATE_BYTES = 1_500_000;
const QUOTA_TIMEZONE = String(process.env.PF_QUOTA_TIMEZONE || "America/New_York").trim() || "America/New_York";
const DAILY_QUOTAS = Object.freeze({
  trendRadar: { label: "Trend Radar scans", limit: 3 },
  analysis: { label: "AI analysis + review calls", limit: 6 },
  productBuild: { label: "Full product builds", limit: 1 },
  artGeneration: { label: "AI artwork batches", limit: 4 },
  viralScout: { label: "Viral Remix scans", limit: 2 },
  viralRender: { label: "Viral Remix renders", limit: 1 }
});

function unescapeMountPath(value) {
  return String(value || "")
    .replace(/\\040/g, " ")
    .replace(/\\011/g, "\t")
    .replace(/\\012/g, "\n")
    .replace(/\\134/g, "\\");
}

function dedicatedMountFor(targetPath) {
  if (process.platform !== "linux") return null;
  try {
    const target = path.resolve(targetPath);
    const lines = fs.readFileSync("/proc/self/mountinfo", "utf8").split("\n");
    let best = null;
    for (const line of lines) {
      if (!line) continue;
      const fields = line.split(" ");
      if (fields.length < 6) continue;
      const mountPoint = path.resolve(unescapeMountPath(fields[4]));
      const inside = target === mountPoint || target.startsWith(mountPoint + path.sep);
      if (!inside || mountPoint === path.parse(mountPoint).root) continue;
      if (!best || mountPoint.length > best.length) best = mountPoint;
    }
    return best;
  } catch (error) {
    return null;
  }
}

function persistentPathAvailable(targetPath) {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.PF_ASSUME_PERSISTENT_STORAGE === "1") return true;
  return Boolean(dedicatedMountFor(targetPath));
}

function ephemeralConfig(mode = "ephemeral-file") {
  const fallbackDir = path.join(os.tmpdir(), "publisher-forge-data");
  fs.mkdirSync(fallbackDir, { recursive: true });
  return {
    path: path.join(fallbackDir, "publisher-forge.sqlite"),
    persistent: false,
    mode
  };
}

function databaseConfig() {
  if (process.env.NODE_ENV === "test") {
    return { path: ":memory:", persistent: false, mode: "test-memory" };
  }
  const explicitPath = String(process.env.PF_DB_PATH || "").trim();
  if (explicitPath) {
    const directory = path.dirname(explicitPath);
    if (!persistentPathAvailable(directory)) {
      return ephemeralConfig("configured-path-not-mounted");
    }
    fs.mkdirSync(directory, { recursive: true });
    return { path: explicitPath, persistent: true, mode: "persistent-file" };
  }
  const dataDir = String(process.env.PF_DATA_DIR || "").trim();
  if (dataDir) {
    if (!persistentPathAvailable(dataDir)) {
      return ephemeralConfig("configured-directory-not-mounted");
    }
    fs.mkdirSync(dataDir, { recursive: true });
    return {
      path: path.join(dataDir, "publisher-forge.sqlite"),
      persistent: true,
      mode: "persistent-directory"
    };
  }
  return ephemeralConfig();
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
    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_date TEXT NOT NULL,
      feature TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, usage_date, feature)
    );
    CREATE INDEX IF NOT EXISTS daily_usage_user_date_idx
      ON daily_usage(user_id, usage_date);
    CREATE TABLE IF NOT EXISTS guest_usage (
      visitor_key TEXT NOT NULL,
      feature TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (visitor_key, feature)
    );
    CREATE TABLE IF NOT EXISTS growth_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      event TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'direct',
      campaign TEXT NOT NULL DEFAULT 'public-beta',
      content TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      feature TEXT NOT NULL DEFAULT '',
      visitor_key TEXT NOT NULL DEFAULT '',
      user_key TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS growth_events_time_idx ON growth_events(occurred_at);
    CREATE INDEX IF NOT EXISTS growth_events_source_idx ON growth_events(source,campaign,content);
    CREATE INDEX IF NOT EXISTS growth_events_visitor_idx ON growth_events(visitor_key);
    CREATE INDEX IF NOT EXISTS growth_events_user_idx ON growth_events(user_key);
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

function anonymousKey(value) {
  return value
    ? crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32)
    : "";
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

function visitorKey(req, res) {
  const cookies = cookieMap(req.headers.cookie);
  let token = String(cookies[VISITOR_COOKIE] || "").trim();
  if (!token) {
    token = crypto.randomBytes(18).toString("base64url");
    const secure = requestIsSecure(req) || process.env.NODE_ENV === "production";
    const cookie = VISITOR_COOKIE + "=" + encodeURIComponent(token) +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (90 * 24 * 60 * 60) +
      (secure ? "; Secure" : "");
    const existing = res.getHeader("Set-Cookie");
    res.setHeader(
      "Set-Cookie",
      existing ? (Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]) : cookie
    );
  }
  return anonymousKey(token);
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
  const usage = safeObject(state.usageStats);
  const count = (value) => Math.max(0, Math.min(1000000000, Math.round(Number(value) || 0)));
  return {
    projectVault: Array.isArray(state.projectVault) ? state.projectVault.slice(0, 250) : [],
    revenueTests: Array.isArray(state.revenueTests) ? state.revenueTests.slice(0, 1000) : [],
    trendHistory: normalizeHistory(state.trendHistory),
    opportunities: Array.isArray(state.opportunities) ? state.opportunities.slice(0, 150) : [],
    usageStats: {
      viralScans: count(usage.viralScans),
      viralRenders: count(usage.viralRenders),
      viralShares: count(usage.viralShares),
      updatedAt: String(usage.updatedAt || "").slice(0, 100)
    },
    moneyAgentSettings: safeObject(state.moneyAgentSettings),
    commandCenterPlan: state.commandCenterPlan && typeof state.commandCenterPlan === "object"
      ? state.commandCenterPlan
      : null
  };
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

function adminEmails() {
  return new Set(
    String(process.env.PF_ADMIN_EMAILS || process.env.PF_ADMIN_EMAIL || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function isAdminUser(user) {
  return Boolean(user?.email && adminEmails().has(normalizeEmail(user.email)));
}

function quotaDate(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: QUOTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function nextQuotaReset(timestamp = Date.now()) {
  const day = quotaDate(timestamp);
  let low = timestamp;
  let high = timestamp + 36 * 60 * 60 * 1000;
  while (quotaDate(high) === day) high += 12 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const mid = Math.floor((low + high) / 2);
    if (quotaDate(mid) === day) low = mid;
    else high = mid;
  }
  return new Date(high).toISOString();
}

function accountStats(state) {
  const normalized = normalizeState(state);
  const revenueTests = normalized.revenueTests;
  const projects = normalized.projectVault;
  const trendHistory = normalized.trendHistory;
  const opportunities = normalized.opportunities;
  const totals = revenueTests.reduce((sum, item) => {
    const metrics = safeObject(item?.metrics);
    sum.grossRevenue += Number(metrics.grossRevenue) || 0;
    sum.netProfit += Number(metrics.netProfit) || 0;
    sum.orders += Number(metrics.orders) || 0;
    sum.views += Number(metrics.views) || 0;
    return sum;
  }, { grossRevenue: 0, netProfit: 0, orders: 0, views: 0 });

  return {
    projects: projects.length,
    revenueTests: revenueTests.length,
    trendScans: trendHistory.length,
    opportunities: opportunities.length,
    grossRevenue: Math.round(totals.grossRevenue * 100) / 100,
    netProfit: Math.round(totals.netProfit * 100) / 100,
    orders: Math.round(totals.orders),
    views: Math.round(totals.views),
    viralScans: normalized.usageStats.viralScans,
    viralRenders: normalized.usageStats.viralRenders,
    viralShares: normalized.usageStats.viralShares
  };
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
  const findDailyUsage = db.prepare("SELECT feature, count FROM daily_usage WHERE user_id = ? AND usage_date = ?");
  const findFeatureUsage = db.prepare("SELECT count FROM daily_usage WHERE user_id = ? AND usage_date = ? AND feature = ?");
  const incrementFeatureUsage = db.prepare(`
    INSERT INTO daily_usage (user_id,usage_date,feature,count,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,usage_date,feature)
    DO UPDATE SET count = daily_usage.count + 1, updated_at = excluded.updated_at
  `);
  const findGuestUsage = db.prepare(
    "SELECT count FROM guest_usage WHERE visitor_key = ? AND feature = ?"
  );
  const incrementGuestUsage = db.prepare(`
    INSERT INTO guest_usage (visitor_key,feature,count,updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(visitor_key,feature)
    DO UPDATE SET count = guest_usage.count + 1, updated_at = excluded.updated_at
  `);
  const insertGrowthEvent = db.prepare(`
    INSERT INTO growth_events
      (occurred_at,event,source,campaign,content,path,feature,visitor_key,user_key)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const latestVisitorAttribution = db.prepare(`
    SELECT source,campaign,content,path
    FROM growth_events
    WHERE visitor_key = ? AND event = 'page_view'
    ORDER BY id DESC LIMIT 1
  `);
  const growthTotals = db.prepare(`
    SELECT
      SUM(CASE WHEN event='page_view' THEN 1 ELSE 0 END) AS page_views,
      COUNT(DISTINCT CASE WHEN event='page_view' THEN visitor_key END) AS visitors,
      SUM(CASE WHEN event='open_app' THEN 1 ELSE 0 END) AS app_opens,
      SUM(CASE WHEN event='account_created' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event='guest_demo_started' THEN 1 ELSE 0 END) AS demo_starts,
      SUM(CASE WHEN event='guest_demo_completed' THEN 1 ELSE 0 END) AS demo_completions,
      SUM(CASE WHEN event='quota_consumed' THEN 1 ELSE 0 END) AS feature_uses,
      SUM(CASE WHEN event='quota_consumed' AND feature='productBuild' THEN 1 ELSE 0 END) AS project_starts,
      SUM(CASE WHEN event='feature_completed' AND feature='productBuild' THEN 1 ELSE 0 END) AS artifact_completions,
      SUM(CASE WHEN event='feature_failed' THEN 1 ELSE 0 END) AS feature_failures
    FROM growth_events
    WHERE occurred_at >= ?
  `);
  const growthBySource = db.prepare(`
    SELECT source,campaign,content,
      SUM(CASE WHEN event='page_view' THEN 1 ELSE 0 END) AS page_views,
      COUNT(DISTINCT CASE WHEN event='page_view' THEN visitor_key END) AS visitors,
      SUM(CASE WHEN event='open_app' THEN 1 ELSE 0 END) AS app_opens,
      SUM(CASE WHEN event='account_created' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event='guest_demo_started' THEN 1 ELSE 0 END) AS demo_starts,
      SUM(CASE WHEN event='guest_demo_completed' THEN 1 ELSE 0 END) AS demo_completions,
      SUM(CASE WHEN event='quota_consumed' THEN 1 ELSE 0 END) AS feature_uses
    FROM growth_events
    WHERE occurred_at >= ?
    GROUP BY source,campaign,content
    ORDER BY signups DESC, feature_uses DESC, visitors DESC
    LIMIT 30
  `);
  const growthByFeature = db.prepare(`
    SELECT feature, COUNT(*) AS uses, COUNT(DISTINCT user_key) AS users
    FROM growth_events
    WHERE occurred_at >= ? AND event='quota_consumed' AND feature <> ''
    GROUP BY feature ORDER BY uses DESC
  `);
  const returningUsers = db.prepare(`
    SELECT COUNT(*) AS returning_users FROM (
      SELECT user_id FROM daily_usage
      WHERE usage_date >= ?
      GROUP BY user_id
      HAVING COUNT(DISTINCT usage_date) >= 2
    )
  `);
  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS active_users
    FROM daily_usage WHERE usage_date >= ?
  `);

  function recordGrowth(req, res, event, fields = {}) {
    const occurredAt = new Date().toISOString();
    const visitKey = fields.visitorKey || visitorKey(req, res);
    const userKey = fields.userId ? anonymousKey(fields.userId) : "";
    const clean = (value, max = 120) =>
      String(value || "").replace(/[\r\n\t]/g, " ").trim().slice(0, max);
    insertGrowthEvent.run(
      occurredAt,
      clean(event, 50),
      clean(fields.source || "direct", 80),
      clean(fields.campaign || "public-beta", 80),
      clean(fields.content || "", 100),
      clean(fields.path || "", 160),
      clean(fields.feature || "", 80),
      visitKey,
      userKey
    );
    return { occurredAt, visitorKey: visitKey, userKey };
  }

  function growthSummary(days = 30) {
    const boundedDays = Math.max(1, Math.min(180, Math.round(Number(days) || 30)));
    const sinceMs = Date.now() - boundedDays * 24 * 60 * 60 * 1000;
    const since = new Date(sinceMs).toISOString();
    const sinceDay = quotaDate(sinceMs);
    const totals = growthTotals.get(since) || {};
    const visitors = Number(totals.visitors) || 0;
    const signups = Number(totals.signups) || 0;
    const active = Number(activeUsers.get(sinceDay)?.active_users) || 0;
    const returning = Number(returningUsers.get(sinceDay)?.returning_users) || 0;
    return {
      days: boundedDays,
      since,
      totals: {
        pageViews: Number(totals.page_views) || 0,
        visitors,
        appOpens: Number(totals.app_opens) || 0,
        signups,
        demoStarts: Number(totals.demo_starts) || 0,
        demoCompletions: Number(totals.demo_completions) || 0,
        demoCompletionRate: Number(totals.demo_starts)
          ? Math.round((Number(totals.demo_completions) / Number(totals.demo_starts)) * 1000) / 10
          : 0,
        featureUses: Number(totals.feature_uses) || 0,
        projectStarts: Number(totals.project_starts) || 0,
        artifactCompletions: Number(totals.artifact_completions) || 0,
        featureFailures: Number(totals.feature_failures) || 0,
        signupConversion: visitors ? Math.round((signups / visitors) * 1000) / 10 : 0,
        activeUsers: active,
        returningUsers: returning,
        returningRate: active ? Math.round((returning / active) * 1000) / 10 : 0
      },
      sources: growthBySource.all(since).map((row) => ({
        source: row.source || "direct",
        campaign: row.campaign || "public-beta",
        content: row.content || "",
        pageViews: Number(row.page_views) || 0,
        visitors: Number(row.visitors) || 0,
        appOpens: Number(row.app_opens) || 0,
        signups: Number(row.signups) || 0,
        demoStarts: Number(row.demo_starts) || 0,
        demoCompletions: Number(row.demo_completions) || 0,
        demoCompletionRate: Number(row.demo_starts)
          ? Math.round((Number(row.demo_completions) / Number(row.demo_starts)) * 1000) / 10
          : 0,
        featureUses: Number(row.feature_uses) || 0,
        signupConversion: Number(row.visitors)
          ? Math.round((Number(row.signups) / Number(row.visitors)) * 1000) / 10
          : 0
      })),
      features: growthByFeature.all(since).map((row) => ({
        feature: row.feature,
        uses: Number(row.uses) || 0,
        users: Number(row.users) || 0
      }))
    };
  }

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

  function quotaPayload(user) {
    const admin = isAdminUser(user);
    const day = quotaDate();
    const usageRows = admin ? [] : findDailyUsage.all(user.id, day);
    const usage = Object.fromEntries(usageRows.map((row) => [row.feature, Number(row.count) || 0]));
    const limits = Object.fromEntries(
      Object.entries(DAILY_QUOTAS).map(([feature, config]) => {
        const used = admin ? 0 : (usage[feature] || 0);
        return [feature, {
          label: config.label,
          limit: admin ? null : config.limit,
          used,
          remaining: admin ? null : Math.max(0, config.limit - used)
        }];
      })
    );
    return {
      admin,
      date: day,
      timezone: QUOTA_TIMEZONE,
      resetAt: nextQuotaReset(),
      limits
    };
  }

  function consumeQuota(req, res, feature) {
    const config = DAILY_QUOTAS[feature];
    if (!config) {
      res.status(500).json({ error: "Unknown beta limit" });
      return false;
    }

    const auth = authenticated(req);
    if (!auth) {
      if (feature !== "trendRadar") {
        res.status(401).json({ error: "Sign in required" });
        return false;
      }

      const visitKey = visitorKey(req, res);
      const current = Number(findGuestUsage.get(visitKey, feature)?.count) || 0;
      if (current >= 1) {
        res.status(401).json({
          error: "Free demo complete",
          code: "GUEST_DEMO_USED",
          feature,
          message: "You used the free Trend Radar scan. Create a free account to save this research and keep building."
        });
        return false;
      }

      const usageTimestamp = new Date().toISOString();
      incrementGuestUsage.run(visitKey, feature, 1, usageTimestamp);
      const attribution = latestVisitorAttribution.get(visitKey) || {};
      recordGrowth(req, res, "guest_demo_started", {
        ...attribution,
        feature,
        visitorKey: visitKey
      });

      res.once("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          recordGrowth(req, res, "guest_demo_completed", {
            ...attribution,
            feature,
            visitorKey: visitKey
          });
        }
      });

      console.log(JSON.stringify({
        type: "publisher_forge_guest",
        timestamp: usageTimestamp,
        event: "guest_demo_started",
        feature
      }));
      req.publisherForgeGuest = true;
      return true;
    }

    if (isAdminUser(auth.user)) {
      req.publisherForgeUser = publicUser(auth.user);
      req.publisherForgeAdmin = true;
      return true;
    }

    const day = quotaDate();
    const current = Number(findFeatureUsage.get(auth.user.id, day, feature)?.count) || 0;
    if (current >= config.limit) {
      const resetAt = nextQuotaReset();
      const seconds = Math.max(1, Math.ceil((Date.parse(resetAt) - Date.now()) / 1000));
      res.set("Retry-After", String(seconds));
      res.status(429).json({
        error: "Daily beta limit reached",
        code: "DAILY_LIMIT",
        feature,
        message: config.label + " limit reached for today. It resets at midnight " + QUOTA_TIMEZONE + ".",
        resetAt,
        quota: quotaPayload(auth.user)
      });
      return false;
    }

    const usageTimestamp = new Date().toISOString();
    incrementFeatureUsage.run(auth.user.id, day, feature, 1, usageTimestamp);
    const visitKey = visitorKey(req, res);
    const attribution = latestVisitorAttribution.get(visitKey) || {};
    recordGrowth(req, res, "quota_consumed", {
      ...attribution,
      feature,
      userId: auth.user.id,
      visitorKey: visitKey
    });
    console.log(JSON.stringify({
      type: "publisher_forge_usage",
      timestamp: usageTimestamp,
      event: "quota_consumed",
      feature
    }));
    req.publisherForgeUser = publicUser(auth.user);
    req.publisherForgeAdmin = false;
    return true;
  }

  application.locals.publisherForgeQuota = {
    consume: consumeQuota,
    snapshot(req) {
      const auth = authenticated(req);
      return auth ? quotaPayload(auth.user) : null;
    }
  };
  application.locals.publisherForgeGrowth = {
    recordLaunch(req, res, fields) {
      return recordGrowth(req, res, fields.event, fields);
    },
    summary(req, res, days) {
      const auth = requireAuth(req, res);
      if (!auth) return null;
      if (!isAdminUser(auth.user)) {
        res.status(403).json({ error: "Admin access required" });
        return null;
      }
      return growthSummary(days);
    },
    isAdmin(req) {
      const auth = authenticated(req);
      return Boolean(auth && isAdminUser(auth.user));
    }
  };

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
      admin: Boolean(auth && isAdminUser(auth.user)),
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
      const visitKey = visitorKey(req, res);
      const attribution = latestVisitorAttribution.get(visitKey) || {};
      recordGrowth(req, res, "account_created", {
        ...attribution,
        userId: id,
        visitorKey: visitKey
      });
      console.log(JSON.stringify({
        type: "publisher_forge_account",
        timestamp: now,
        event: "account_created"
      }));
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

  application.get("/api/account/stats", syncLimiter, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const payload = statePayload(auth.user.id);
    res.json({
      revision: payload.revision,
      updatedAt: payload.updatedAt,
      stats: accountStats(payload.state)
    });
  });

  application.get("/api/account/limits", syncLimiter, (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    res.json(quotaPayload(auth.user));
  });

  application.get("/api/admin/growth", syncLimiter, (req, res) => {
    const summary = application.locals.publisherForgeGrowth.summary(req, res, req.query?.days);
    if (summary) res.json(summary);
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
  dedicatedMountFor,
  normalizeState,
  accountStats,
  quotaDate,
  nextQuotaReset,
  registerAccountPersistence
};
