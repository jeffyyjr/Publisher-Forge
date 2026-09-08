const STORAGE_KEY = "publisherForge.moneyAgentSettings.v2";
const OPPORTUNITIES_KEY = "publisherForge.moneyAgentOpportunities.v1";

const defaults = {
  orchestrator: {
    goal: "Maximize reliable after-cost income per hour while compounding scalable assets and protecting downside.",
    hours: 2,
    budget: 0,
    mode: "balanced",
    horizon: "30",
    context: "Favor measurable payoff and completed loops over adding features. If a reliability blocker can invalidate revenue work, fix the blocker first."
  },
  opportunity: {
    profile: "Manufacturing operations leader with hands-on troubleshooting, quality control, training, production coordination, warehouse experience, customer service, team leadership, and practical AI/software project experience.",
    query: "production supervisor, manufacturing supervisor, operations supervisor, production manager, manufacturing manager, technical operations, remote AI trainer, AI evaluator, data annotation, part-time remote contract",
    location: "Levittown, PA",
    remote: true,
    minimumPay: "$65,000+/yr main jobs; $20+/hr side gigs",
    availability: "Prefer predictable schedules, remote side gigs, and nearby roles with a practical commute. Favor clear advertised compensation and work that can improve income without creating a worse time tradeoff.",
    scoringProfile: "income-fit-stability"
  },
  pinterest: {
    title: "",
    description: "",
    keywords: "",
    audience: "",
    platform: "Shopify",
    destinationUrl: "",
    strategy: "buyer-intent",
    boardCount: 3,
    creativeFormat: "2:3 vertical — 1000 × 1500",
    titleRule: "Put the main search phrase or benefit in the first 40 characters.",
    descriptionRule: "Use natural relevant keywords and a clear benefit; keep the working draft at 500 characters or less."
  },
  shopify: {
    productType: "digital",
    seo: "balanced",
    pricing: "cost-value-market",
    titleMax: 60,
    metaMax: 160,
    descriptionMinWords: 250,
    priceReview: "quarterly"
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
  byId("orchHorizon").value = settings.orchestrator.horizon;
  byId("orchContext").value = settings.orchestrator.context;

  byId("jobProfile").value = settings.opportunity.profile;
  byId("jobQuery").value = settings.opportunity.query;
  byId("jobLocation").value = settings.opportunity.location;
  byId("jobRemote").checked = Boolean(settings.opportunity.remote);
  byId("jobMinPay").value = settings.opportunity.minimumPay;
  byId("jobAvailability").value = settings.opportunity.availability;
  byId("jobScoringProfile").value = settings.opportunity.scoringProfile;

  byId("pinTitle").value = settings.pinterest.title;
  byId("pinDescription").value = settings.pinterest.description;
  byId("pinKeywords").value = settings.pinterest.keywords;
  byId("pinAudience").value = settings.pinterest.audience;
  byId("pinPlatform").value = settings.pinterest.platform;
  byId("pinUrl").value = settings.pinterest.destinationUrl;
  byId("pinStrategy").value = settings.pinterest.strategy;
  byId("pinBoardCount").value = settings.pinterest.boardCount;
  byId("pinCreativeFormat").value = settings.pinterest.creativeFormat;
  byId("pinTitleRule").value = settings.pinterest.titleRule;
  byId("pinDescriptionRule").value = settings.pinterest.descriptionRule;

  byId("shopifyProductType").value = settings.shopify.productType;
  byId("shopifySeo").value = settings.shopify.seo;
  byId("shopifyPricing").value = settings.shopify.pricing;
  byId("shopifyTitleMax").value = settings.shopify.titleMax;
  byId("shopifyMetaMax").value = settings.shopify.metaMax;
  byId("shopifyDescriptionMinWords").value = settings.shopify.descriptionMinWords;
  byId("shopifyPriceReview").value = settings.shopify.priceReview;
}

function readSettingsFromForm() {
  return {
    orchestrator: {
      goal: byId("orchGoal").value.trim(),
      hours: Number(byId("orchHours").value) || 0,
      budget: Number(byId("orchBudget").value) || 0,
      mode: byId("orchMode").value,
      horizon: byId("orchHorizon").value,
      context: byId("orchContext").value.trim()
    },
    opportunity: {
      profile: byId("jobProfile").value.trim(),
      query: byId("jobQuery").value.trim(),
      location: byId("jobLocation").value.trim(),
      remote: byId("jobRemote").checked,
      minimumPay: byId("jobMinPay").value.trim(),
      availability: byId("jobAvailability").value.trim(),
      scoringProfile: byId("jobScoringProfile").value
    },
    pinterest: {
      title: byId("pinTitle").value.trim(),
      description: byId("pinDescription").value.trim(),
      keywords: byId("pinKeywords").value.trim(),
      audience: byId("pinAudience").value.trim(),
      platform: byId("pinPlatform").value,
      destinationUrl: byId("pinUrl").value.trim(),
      strategy: byId("pinStrategy").value,
      boardCount: Math.max(2, Math.min(4, Number(byId("pinBoardCount").value) || 3)),
      creativeFormat: byId("pinCreativeFormat").value.trim(),
      titleRule: byId("pinTitleRule").value.trim(),
      descriptionRule: byId("pinDescriptionRule").value.trim()
    },
    shopify: {
      productType: byId("shopifyProductType").value,
      seo: byId("shopifySeo").value,
      pricing: byId("shopifyPricing").value,
      titleMax: Math.max(40, Math.min(70, Number(byId("shopifyTitleMax").value) || 60)),
      metaMax: Math.max(120, Math.min(200, Number(byId("shopifyMetaMax").value) || 160)),
      descriptionMinWords: Math.max(100, Math.min(600, Number(byId("shopifyDescriptionMinWords").value) || 250)),
      priceReview: byId("shopifyPriceReview").value
    }
  };
}

function saveSettings(message = "Recommended settings saved on this device.") {
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
  if (mode === "stable") return "Weight recurring salary or dependable recurring income highest; require strong evidence before trading stability for upside.";
  if (mode === "growth") return "Weight scalable upside and learning velocity higher, but require measurable validation before spending meaningful cash or time.";
  if (mode === "time") return "Weight expected income per hour and automation leverage highest; strongly penalize manual busywork and recurring operator effort.";
  return "Balance reliable income, expected after-cost upside, time efficiency, confidence, reversibility, and removal of blockers.";
}

function horizonInstruction(horizon) {
  if (horizon === "7") return "Optimize primarily for cash or validated progress within the next 7 days.";
  if (horizon === "90") return "Optimize for the next 90 days without sacrificing near-term cash needs.";
  if (horizon === "365") return "Optimize for one-year compounding while keeping near-term income resilient.";
  return "Optimize for measurable payoff or validated progress within the next 30 days, while preserving scalable upside.";
}

function opportunityInstruction(profile) {
  if (profile === "fast-cash") {
    return "For the fit score, heavily consider time-to-income, application friction, schedule fit, and realistic chance of acceptance. Do not let vague high advertised pay outrank a verified opportunity that can pay sooner.";
  }
  if (profile === "career-growth") {
    return "For the fit score, heavily consider compensation upside, leadership scope, stability, transferable advancement, schedule practicality, and realistic qualification match.";
  }
  return "For the fit score, consider advertised compensation, qualification match, stability, schedule fit, commute or remote practicality, time-to-income, and application burden. Penalize unclear pay, weak evidence, bad schedule fit, or impractical travel instead of letting headline pay dominate.";
}

function pinterestInstruction(s) {
  const angle = s.strategy === "search"
    ? "Prioritize specific search intent and clear keyword relevance."
    : s.strategy === "conversion"
      ? "Prioritize buyer intent, product usefulness, and a clear non-pushy CTA."
      : "Balance search relevance, buyer intent, and distinct creative angles.";
  return [
    angle,
    `Use ${s.boardCount} tightly related boards rather than broad unrelated boards.`,
    `Creative target: ${s.creativeFormat}.`,
    s.titleRule,
    s.descriptionRule,
    "Keep titles at 100 characters or less, make the product or outcome visually obvious, and keep important text away from the extreme edges."
  ].filter(Boolean).join(" ");
}

function shopifyInstruction(s) {
  const pricing = s.pricing === "value"
    ? "Use value-based pricing but still verify every direct, platform, delivery, and acquisition cost before calling a price profitable."
    : s.pricing === "cost"
      ? "Use cost-plus as the floor, then confirm the result still makes sense against market expectations."
      : "Triangulate total cost, customer value, and comparable market pricing; do not rely on markup alone.";
  return [
    pricing,
    `SEO title target: ${s.titleMax} characters or fewer with the primary keyword near the beginning.`,
    `Meta description target: ${s.metaMax} characters or fewer, natural and unique.`,
    `Product-description depth target: at least ${s.descriptionMinWords} useful words when the product needs enough context for search and conversion.`,
    `Pricing review cadence: ${s.priceReview}.`,
    "Keep new products in Draft until files, claims, price, delivery, and checkout behavior are verified."
  ].join(" ");
}

async function checkStatus() {
  const status = byId("agentStatus");
  try {
    const response = await fetch("/api/money-agents/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.status !== "READY") throw new Error();
    status.textContent = data.openAIConfigured ? "Agents ready · optimized preset" : "Agents loaded — AI key missing";
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
      profile: [s.profile, opportunityInstruction(s.scoringProfile)].filter(Boolean).join("\n"),
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
        decisionHorizonDays: Number(s.horizon) || 30,
        shopifyDefaults: settings.shopify,
        shopifyOperatingRules: shopifyInstruction(settings.shopify),
        pinterestDefaults: {
          strategy: settings.pinterest.strategy,
          boardCount: settings.pinterest.boardCount,
          creativeFormat: settings.pinterest.creativeFormat
        },
        opportunityCount: lastOpportunities.length
      },
      context: [
        modeInstruction(s.mode),
        horizonInstruction(s.horizon),
        shopifyInstruction(settings.shopify),
        s.context
      ].filter(Boolean).join(" ")
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
      audience: [s.audience, pinterestInstruction(s)].filter(Boolean).join(" "),
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
  byId("saveState").textContent = "2026 recommended defaults restored.";
});
byId("runOpportunity").addEventListener("click", runOpportunity);
byId("runOrchestrator").addEventListener("click", runOrchestrator);
byId("runPinterest").addEventListener("click", runPinterest);

populate();
checkStatus();
