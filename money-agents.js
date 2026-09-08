const STORAGE_KEY = "publisherForge.moneyAgentSettings.v1";
const OPPORTUNITIES_KEY = "publisherForge.moneyAgentOpportunities.v1";

const defaults = {
  orchestrator: {
    goal: "Increase reliable income and profit while protecting time.",
    hours: 2,
    budget: 0,
    mode: "balanced",
    context: ""
  },
  opportunity: {
    profile: "Manufacturing operations leader with hands-on troubleshooting, quality control, training, production coordination, warehouse experience, customer service, and practical AI/software project experience.",
    query: "manufacturing supervisor, operations supervisor, technical operations, remote AI training, side gigs",
    location: "Levittown, PA",
    remote: true,
    minimumPay: "",
    availability: ""
  },
  pinterest: {
    title: "",
    description: "",
    keywords: "",
    audience: "",
    platform: "Shopify",
    destinationUrl: ""
  },
  shopify: {
    productType: "digital",
    seo: "balanced"
  }
};

const byId = (id) => document.getElementById(id);

function cloneDefaults() {
  return JSON.parse(JSON.stringify(defaults));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      orchestrator: { ...defaults.orchestrator, ...(saved?.orchestrator || {}) },
      opportunity: { ...defaults.opportunity, ...(saved?.opportunity || {}) },
      pinterest: { ...defaults.pinterest, ...(saved?.pinterest || {}) },
      shopify: { ...defaults.shopify, ...(saved?.shopify || {}) }
    };
  } catch (error) {
    return cloneDefaults();
  }
}

function loadOpportunities() {
  try {
    const value = JSON.parse(localStorage.getItem(OPPORTUNITIES_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 20) : [];
  } catch (error) {
    return [];
  }
}

let settings = loadSettings();
let lastOpportunities = loadOpportunities();

function populate() {
  byId("orchGoal").value = settings.orchestrator.goal;
  byId("orchHours").value = settings.orchestrator.hours;
  byId("orchBudget").value = settings.orchestrator.budget;
  byId("orchMode").value = settings.orchestrator.mode;
  byId("orchContext").value = settings.orchestrator.context;

  byId("jobProfile").value = settings.opportunity.profile;
  byId("jobQuery").value = settings.opportunity.query;
  byId("jobLocation").value = settings.opportunity.location;
  byId("jobRemote").checked = Boolean(settings.opportunity.remote);
  byId("jobMinPay").value = settings.opportunity.minimumPay;
  byId("jobAvailability").value = settings.opportunity.availability;

  byId("pinTitle").value = settings.pinterest.title;
  byId("pinDescription").value = settings.pinterest.description;
  byId("pinKeywords").value = settings.pinterest.keywords;
  byId("pinAudience").value = settings.pinterest.audience;
  byId("pinPlatform").value = settings.pinterest.platform;
  byId("pinUrl").value = settings.pinterest.destinationUrl;

  byId("shopifyProductType").value = settings.shopify.productType;
  byId("shopifySeo").value = settings.shopify.seo;
}

function readSettingsFromForm() {
  return {
    orchestrator: {
      goal: byId("orchGoal").value.trim(),
      hours: Number(byId("orchHours").value) || 0,
      budget: Number(byId("orchBudget").value) || 0,
      mode: byId("orchMode").value,
      context: byId("orchContext").value.trim()
    },
    opportunity: {
      profile: byId("jobProfile").value.trim(),
      query: byId("jobQuery").value.trim(),
      location: byId("jobLocation").value.trim(),
      remote: byId("jobRemote").checked,
      minimumPay: byId("jobMinPay").value.trim(),
      availability: byId("jobAvailability").value.trim()
    },
    pinterest: {
      title: byId("pinTitle").value.trim(),
      description: byId("pinDescription").value.trim(),
      keywords: byId("pinKeywords").value.trim(),
      audience: byId("pinAudience").value.trim(),
      platform: byId("pinPlatform").value,
      destinationUrl: byId("pinUrl").value.trim()
    },
    shopify: {
      productType: byId("shopifyProductType").value,
      seo: byId("shopifySeo").value
    }
  };
}

function saveSettings(message = "Settings saved on this device.") {
  settings = readSettingsFromForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  byId("saveState").textContent = message;
  setTimeout(() => {
    if (byId("saveState").textContent === message) byId("saveState").textContent = "";
  }, 2500);
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

async function jsonRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Publisher Forge could not finish the request.");
  }
  return data;
}

function clearOutput(id) {
  const node = byId(id);
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function textLine(parent, text, className = "") {
  const div = document.createElement("div");
  if (className) div.className = className;
  div.textContent = text;
  parent.appendChild(div);
  return div;
}

function linkLine(parent, url, label = "Open listing") {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  parent.appendChild(link);
}

function modeInstruction(mode) {
  if (mode === "stable") return "Prioritize dependable recurring or salary income over speculative upside.";
  if (mode === "growth") return "Prioritize high-upside opportunities when the evidence is strong, but do not invent returns.";
  if (mode === "time") return "Prioritize money per hour and automation leverage; avoid manual busywork.";
  return "Balance reliable income, upside, time efficiency, and current blockers.";
}

async function checkStatus() {
  const status = byId("agentStatus");
  try {
    const response = await fetch("/api/money-agents/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.status !== "READY") throw new Error();
    status.textContent = data.openAIConfigured ? "Agents ready" : "Agents loaded — AI key missing";
    status.classList.add(data.openAIConfigured ? "status-ok" : "status-bad");
  } catch (error) {
    status.textContent = "Money agents unavailable";
    status.classList.add("status-bad");
  }
}

async function runOpportunity() {
  saveSettings("Settings saved before scan.");
  const button = byId("runOpportunity");
  const output = clearOutput("opportunityOutput");
  setBusy(button, true, "Searching…");
  textLine(output, "Opportunity Agent is searching current public listings…", "muted");

  try {
    const s = settings.opportunity;
    const data = await jsonRequest("/api/opportunity-scan", {
      profile: s.profile,
      query: s.query,
      location: s.location,
      remote: s.remote,
      minimumPay: s.minimumPay,
      availability: s.availability
    });
    lastOpportunities = data.opportunities || [];
    localStorage.setItem(OPPORTUNITIES_KEY, JSON.stringify(lastOpportunities.slice(0, 20)));
    clearOutput("opportunityOutput");
    textLine(output, data.summary || "Opportunity scan complete.");

    lastOpportunities.forEach((item) => {
      const row = document.createElement("div");
      row.className = "result";
      textLine(row, `#${item.rank} ${item.title} — ${item.company}`, "score");
      textLine(row, `Money Score ${item.moneyScore}/100 · ${item.category} · ${item.pay} · ${item.location}`);
      textLine(row, item.fitReason || "", "muted");
      if (item.gap) textLine(row, `Watch: ${item.gap}`, "muted");
      linkLine(row, item.sourceUrl);
      output.appendChild(row);
    });
  } catch (error) {
    clearOutput("opportunityOutput");
    textLine(output, error.message, "status-bad");
  } finally {
    setBusy(button, false, "");
  }
}

async function runOrchestrator() {
  saveSettings("Settings saved before planning.");
  const button = byId("runOrchestrator");
  const output = clearOutput("orchestratorOutput");
  setBusy(button, true, "Planning…");
  textLine(output, "Orchestrator is comparing the current money lanes…", "muted");

  try {
    const s = settings.orchestrator;
    const data = await jsonRequest("/api/orchestrator/next-action", {
      goal: s.goal,
      timeAvailableHours: s.hours,
      cashBudget: s.budget,
      opportunities: lastOpportunities,
      state: {
        agentDashboard: true,
        priorityMode: s.mode,
        shopifyDefaults: settings.shopify,
        opportunityCount: lastOpportunities.length
      },
      context: [modeInstruction(s.mode), s.context].filter(Boolean).join(" ")
    });
    clearOutput("orchestratorOutput");
    textLine(output, `${data.primaryChannel}: ${data.primaryAction}`, "score");
    textLine(output, `Priority ${data.priorityScore}/100 — ${data.reason}`);
    if (data.expectedOutcome) textLine(output, `Expected result: ${data.expectedOutcome}`, "muted");
    (data.queue || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "result";
      textLine(row, `${item.rank}. ${item.channel} — ${item.action}`);
      textLine(row, item.reason, "muted");
      output.appendChild(row);
    });
  } catch (error) {
    clearOutput("orchestratorOutput");
    textLine(output, error.message, "status-bad");
  } finally {
    setBusy(button, false, "");
  }
}

async function runPinterest() {
  saveSettings("Settings saved before campaign build.");
  const button = byId("runPinterest");
  const output = clearOutput("pinterestOutput");
  setBusy(button, true, "Building…");
  textLine(output, "Pinterest Agent is building seven distinct pin angles…", "muted");

  try {
    const s = settings.pinterest;
    const data = await jsonRequest("/api/pinterest-plan", {
      title: s.title,
      description: s.description,
      keywords: s.keywords.split(",").map((item) => item.trim()).filter(Boolean),
      audience: s.audience,
      platform: s.platform,
      destinationUrl: s.destinationUrl
    });
    clearOutput("pinterestOutput");
    textLine(output, data.summary || data.campaignGoal || "Pinterest draft campaign ready.");
    (data.pins || []).forEach((pin) => {
      const row = document.createElement("div");
      row.className = "result";
      textLine(row, `${pin.pinNumber}. ${pin.title}`, "score");
      textLine(row, `${pin.board} — ${pin.testingAngle}`, "muted");
      textLine(row, pin.description);
      textLine(row, `Creative: ${pin.creativeBrief}`, "muted");
      output.appendChild(row);
    });
  } catch (error) {
    clearOutput("pinterestOutput");
    textLine(output, error.message, "status-bad");
  } finally {
    setBusy(button, false, "");
  }
}

document.querySelectorAll(".settingsToggle").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = byId(button.dataset.target);
    panel.hidden = !panel.hidden;
    button.textContent = panel.hidden ? "Settings" : "Hide Settings";
  });
});

byId("saveSettings").addEventListener("click", () => saveSettings());
byId("resetSettings").addEventListener("click", () => {
  settings = cloneDefaults();
  localStorage.removeItem(STORAGE_KEY);
  populate();
  byId("saveState").textContent = "Defaults restored.";
});
byId("runOpportunity").addEventListener("click", runOpportunity);
byId("runOrchestrator").addEventListener("click", runOrchestrator);
byId("runPinterest").addEventListener("click", runPinterest);

populate();
checkStatus();
