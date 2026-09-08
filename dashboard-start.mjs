import "./start.mjs";
import { app } from "./server.js";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function registerMoneyDashboard(application = app) {
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
