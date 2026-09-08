import "./start.mjs";
import { app } from "./server.js";
import path from "path";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get(["/money-agents", "/money-agents.html"], (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "money-agents.html"));
});

app.get("/money-agents.js", (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Content-Type": "text/javascript; charset=utf-8"
  });
  res.sendFile(path.join(__dirname, "money-agents.js"));
});

app.listen(PORT, () => {
  console.log("Publisher Forge dashboard running on port " + PORT);
});
