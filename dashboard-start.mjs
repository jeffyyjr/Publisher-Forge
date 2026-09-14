import "./start.mjs";
import { app, createFixedWindowLimiter } from "./server.js";
import { registerAccountPersistence } from "./account-persistence.mjs";
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
      path: launchField(req.body?.path || "/launch", 120)
    };

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
