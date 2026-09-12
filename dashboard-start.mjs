import "./start.mjs";
import { app, createFixedWindowLimiter } from "./server.js";
import { registerAccountPersistence } from "./account-persistence.mjs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

registerAccountPersistence(app, {
  authLimiter: accountAuthLimiter,
  syncLimiter: accountSyncLimiter
});

function registerMoneyDashboard(application = app) {
  for (const filename of ["trend-history.js", "trend-evidence.mjs"]) {
    application.get("/" + filename, (req, res) => {
      res.set({ "Cache-Control": "no-store", "Content-Type": "text/javascript; charset=utf-8" });
      res.sendFile(path.join(__dirname, filename));
    });
  }
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
