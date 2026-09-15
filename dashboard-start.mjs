import "./start.mjs";
import { app, createFixedWindowLimiter } from "./server.js";
import { registerAccountPersistence } from "./account-persistence.mjs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LAUNCH_EVENTS = new Set([
  "page_view",
  "open_app",
  "open_viral",
  "create_account",
  "view_demo",
  "guest_demo_started",
  "guest_demo_completed",
  "view_repo",
  "feedback",
  "viral_scan_complete",
  "viral_render_complete",
  "viral_share",
  "cta_click"
]);

const accountAuthLimiter = createFixedWindowLimiter({
  max: 12,
  windowMs: 15 * 60 * 1000,
  error: "Too many account attempts",
  message: "Wait a few minutes and try again."
});
const accountSyncLimiter = createFixedWindowLimiter({
  max: 120,
  windowMs: 15 * 60 * 1000,
  error: "Too many account sync requests",
  message: "Wait a moment and try again."
});
const launchEventLimiter = createFixedWindowLimiter({
  max: 120,
  windowMs: 15 * 60 * 1000,
  error: "Too many launch events",
  message: "Wait a moment and try again."
});

registerAccountPersistence(app, {
  authLimiter: accountAuthLimiter,
  syncLimiter: accountSyncLimiter
});

// Conversion demo: signed-out visitors get one real Trend Radar scan before signup.
// Signed-in users continue through the normal account quota system.
const accountQuota = app.locals.publisherForgeQuota;
const guestTrendUses = new Map();
const GUEST_TREND_WINDOW_MS = 24 * 60 * 60 * 1000;

function cookieValue(req, name) {
  const pairs = String(req.headers.cookie || "").split(";");
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 1) continue;
    if (pair.slice(0, index).trim() === name) {
      try { return decodeURIComponent(pair.slice(index + 1).trim()); }
      catch (error) { return pair.slice(index + 1).trim(); }
    }
  }
  return "";
}

function guestKey(req) {
  const visitor = cookieValue(req, "pf_visit");
  const fallback = String(req.ip || "unknown") + "|" + String(req.headers["user-agent"] || "").slice(0, 160);
  return crypto.createHash("sha256").update(visitor || fallback).digest("hex").slice(0, 32);
}

if (accountQuota?.consume) {
  const consumeAccountQuota = accountQuota.consume.bind(accountQuota);
  accountQuota.consume = function consumeWithGuestDemo(req, res, feature) {
    // A session cookie means this is an account user; preserve normal limits and auth checks.
    if (cookieValue(req, "pf_session") || feature !== "trendRadar") {
      return consumeAccountQuota(req, res, feature);
    }

    const key = guestKey(req);
    const now = Date.now();
    const lastUse = guestTrendUses.get(key) || 0;
    if (lastUse && now - lastUse < GUEST_TREND_WINDOW_MS) {
      res.status(401).json({
        error: "Free demo already used",
        code: "GUEST_DEMO_USED",
        message: "You used your free Trend Radar scan. Create a free account to save your research, run more scans, and continue building."
      });
      return false;
    }

    // Keep the map bounded on long-running instances.
    if (guestTrendUses.size > 5000) {
      for (const [storedKey, usedAt] of guestTrendUses) {
        if (now - usedAt >= GUEST_TREND_WINDOW_MS) guestTrendUses.delete(storedKey);
      }
    }

    guestTrendUses.set(key, now);
    req.publisherForgeGuestDemo = true;
    app.locals.publisherForgeGrowth?.recordLaunch(req, res, {
      event: "guest_demo_started",
      source: "guest-demo",
      campaign: "conversion-demo",
      content: "trend-radar",
      path: req.path,
      feature: "trendRadar"
    });
    return true;
  };
}

function launchField(value, max = 80) {
  return String(value || "")
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, max);
}

function registerMoneyDashboard(application = app) {
  for (const filename of ["trend-history.js", "trend-evidence.mjs"]) {
    application.get("/" + filename, (req, res) => {
      res.set({ "Cache-Control": "no-store", "Content-Type": "text/javascript; charset=utf-8" });
      res.sendFile(path.join(__dirname, filename));
    });
  }

  application.get(["/launch", "/launch.html"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "launch.html"));
  });

  application.get("/launch.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "launch.js"));
  });

  application.post("/api/launch-event", launchEventLimiter, (req, res) => {
    const event = launchField(req.body?.event, 50);
    if (!LAUNCH_EVENTS.has(event)) {
      return res.status(400).json({ error: "Unknown launch event" });
    }

    const record = {
      type: "publisher_forge_launch",
      timestamp: new Date().toISOString(),
      event,
      source: launchField(req.body?.source || "direct"),
      campaign: launchField(req.body?.campaign || "public-beta"),
      content: launchField(req.body?.content || "", 100),
      path: launchField(req.body?.path || "/launch", 120)
    };

    application.locals.publisherForgeGrowth?.recordLaunch(req, res, record);
    console.log(JSON.stringify(record));
    res.status(204).end();
  });

  application.get(["/money-agents", "/money-agents.html"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "money-agents.html"));
  });

  application.get("/money-agents.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "money-agents.js"));
  });

  application.get(["/command-center", "/command-center.html"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "command-center.html"));
  });

  application.get("/command-center.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "command-center.js"));
  });

  application.get(["/account", "/account.html"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "account.html"));
  });

  application.get("/account.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "account.js"));
  });

  application.get("/account-sync.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "account-sync.js"));
  });

  application.get("/account-badge.js", (req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "account-badge.js"));
  });

  application.get(["/admin/growth", "/growth-dashboard.html"], (req, res) => {
    if (!application.locals.publisherForgeGrowth?.isAdmin(req)) {
      return res.redirect(302, "/account");
    }
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "growth-dashboard.html"));
  });

  application.get("/growth-dashboard.js", (req, res) => {
    if (!application.locals.publisherForgeGrowth?.isAdmin(req)) {
      return res.status(403).end();
    }
    res.set({
      "Cache-Control": "no-store",
      "Content-Type": "text/javascript; charset=utf-8"
    });
    res.sendFile(path.join(__dirname, "growth-dashboard.js"));
  });

  return application;
}

registerMoneyDashboard(app);

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (process.env.NODE_ENV !== "test" && isEntrypoint) {
  app.listen(PORT, () => {
    console.log("Publisher Forge dashboard running on port " + PORT);
  });
}

export { registerMoneyDashboard };