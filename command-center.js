const KEYS = Object.freeze({
  projects: "pfProjectVault",
  revenue: "pfRevenueTests",
  opportunities: "publisherForge.moneyAgentOpportunities.v1",
  settings: "publisherForge.moneyAgentSettings.v2",
  plan: "publisherForge.commandCenterPlan.v1"
});

const byId = (id) => document.getElementById(id);

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number)
    : "$0.00";
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function line(parent, text, className = "") {
  const div = document.createElement("div");
  if (className) div.className = className;
  div.textContent = text;
  parent.appendChild(div);
  return div;
}

function empty(parent, text) {
  line(parent, text, "empty");
}

function projectStatus(project) {
  if (project?.releaseQa?.verdict === "READY") return "Release ready";
  if (project?.qualityReview?.verdict === "PASS" && project?.package?.approvedAt) return "Approved";
  if (project?.qualityReview?.verdict === "PASS") return "QC passed";
  if (project?.qualityReview?.verdict) return "QC " + project.qualityReview.verdict;
  if (project?.package?.approvedAt) return "Approved";
  return safeText(project?.status, "In progress");
}

function projectSummary(project) {
  return {
    title: safeText(project?.title || project?.package?.packageTitle, "Untitled project"),
    platform: safeText(project?.platform || project?.package?.platform, "Forge"),
    status: projectStatus(project),
    savedAt: safeText(project?.savedAt || project?.updatedAt || project?.createdAt)
  };
}

function revenueTotal(tests) {
  return tests.reduce((sum, test) => {
    const value = Number(test?.metrics?.netProfit);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function renderProjects(projects) {
  byId("projectCount").textContent = String(projects.length);
  const list = clear(byId("projectList"));
  if (!projects.length) return empty(list, "No saved projects yet.");

  projects.slice(0, 6).forEach((project) => {
    const item = document.createElement("div");
    item.className = "item";
    const summary = projectSummary(project);
    line(item, summary.title, "item-title");
    line(item, summary.platform + " · " + summary.status, "muted");
    list.appendChild(item);
  });
}

function renderOpportunities(opportunities) {
  byId("opportunityCount").textContent = String(opportunities.length);
  const list = clear(byId("opportunityList"));
  if (!opportunities.length) return empty(list, "Run Opportunity Agent to load jobs and gigs.");

  [...opportunities]
    .sort((a, b) => Number(b?.moneyScore || 0) - Number(a?.moneyScore || 0))
    .slice(0, 6)
    .forEach((opportunity) => {
      const item = document.createElement("div");
      item.className = "item";
      line(item, safeText(opportunity?.title, "Opportunity"), "item-title");
      line(
        item,
        safeText(opportunity?.company, "Unknown company") + " · Money Score " +
          Math.round(Number(opportunity?.moneyScore || 0)) + "/100",
        "muted"
      );
      if (opportunity?.pay) line(item, safeText(opportunity.pay), "tag");
      list.appendChild(item);
    });
}

function renderRevenue(tests) {
  byId("netProfit").textContent = money(revenueTotal(tests));
  const list = clear(byId("revenueList"));
  if (!tests.length) return empty(list, "No measured Revenue Agent tests yet.");

  tests.slice(0, 6).forEach((test) => {
    const item = document.createElement("div");
    item.className = "item";
    line(item, safeText(test?.title, "Measured test"), "item-title");
    const verdict = safeText(test?.verdict, "MEASURED");
    const className = verdict === "SCALE" ? "good" : verdict === "STOP" ? "bad" : "warn";
    line(
      item,
      safeText(test?.platform, "Forge") + " · " + verdict + " · " + money(test?.metrics?.netProfit) + " net",
      className
    );
    list.appendChild(item);
  });
}

function renderAgents(data) {
  const ready = data?.status === "READY";
  byId("agentState").textContent = ready ? "READY" : "CHECK";
  byId("agentState").className = "metric " + (ready ? "good" : "warn");
  byId("agentStateDetail").textContent = data?.openAIConfigured
    ? "AI configured · approval protected"
    : "AI key missing";

  const list = clear(byId("agentList"));
  const agents = asArray(data?.agents);
  if (!agents.length) return empty(list, "Agent status unavailable.");
  agents.forEach((agent) => {
    const item = document.createElement("div");
    item.className = "item";
    line(item, safeText(agent?.name, "Agent"), "item-title");
    line(item, safeText(agent?.purpose, ""), "muted");
    list.appendChild(item);
  });
}

function renderPlan(plan) {
  if (!plan || typeof plan !== "object") return;
  byId("nextAction").textContent = safeText(
    [plan.primaryChannel, plan.primaryAction].filter(Boolean).join(": "),
    "Company plan ready"
  );
  byId("nextReason").textContent = safeText(plan.reason || plan.summary, "Plan created.");
  const queue = clear(byId("companyQueue"));
  const items = asArray(plan.queue);
  if (!items.length) return empty(queue, "No queue returned.");
  items.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "item lane";
    const copy = document.createElement("div");
    line(copy, String(entry.rank || "") + ". " + safeText(entry.channel, "Forge") + " — " + safeText(entry.action), "item-title");
    line(copy, safeText(entry.reason), "muted");
    item.appendChild(copy);
    line(item, "Confidence " + Math.round(Number(entry.confidence || 0)) + "/100", "tag");
    queue.appendChild(item);
  });
}

async function fetchStatus() {
  try {
    const response = await fetch("/api/money-agents/status", { cache: "no-store" });
    const data = await response.json();
    renderAgents(response.ok ? data : {});
  } catch (error) {
    renderAgents({ status: "UNAVAILABLE", agents: [] });
  }
}

function currentState() {
  const projects = asArray(readJson(KEYS.projects, []));
  const revenue = asArray(readJson(KEYS.revenue, []));
  const opportunities = asArray(readJson(KEYS.opportunities, []));
  const settings = readJson(KEYS.settings, {});
  return { projects, revenue, opportunities, settings };
}

function refresh() {
  const state = currentState();
  renderProjects(state.projects);
  renderOpportunities(state.opportunities);
  renderRevenue(state.revenue);
  renderPlan(readJson(KEYS.plan, null));
  fetchStatus();
  return state;
}

async function runCompanyPlan() {
  const button = byId("runCompanyPlan");
  button.disabled = true;
  button.textContent = "Planning…";
  const state = currentState();
  const orchestrator = state.settings?.orchestrator || {};
  const projectSnapshot = state.projects.slice(0, 12).map(projectSummary);
  const revenueSnapshot = state.revenue.slice(0, 12).map((test) => ({
    title: safeText(test?.title),
    platform: safeText(test?.platform),
    verdict: safeText(test?.verdict),
    netProfit: Number(test?.metrics?.netProfit || 0)
  }));

  try {
    const response = await fetch("/api/orchestrator/next-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: safeText(orchestrator.goal, "Maximize reliable after-cost income per hour while compounding scalable assets and protecting downside."),
        timeAvailableHours: Number(orchestrator.hours || 2),
        cashBudget: Number(orchestrator.budget || 0),
        opportunities: state.opportunities.slice(0, 20),
        state: {
          commandCenter: true,
          decisionHorizonDays: safeText(orchestrator.horizon, "30"),
          priorityMode: safeText(orchestrator.mode, "balanced"),
          projectCount: state.projects.length,
          projects: projectSnapshot,
          measuredRevenueTests: revenueSnapshot,
          recordedNetProfit: revenueTotal(state.revenue)
        },
        context: safeText(orchestrator.context)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || "Orchestrator could not finish the plan.");
    localStorage.setItem(KEYS.plan, JSON.stringify(data));
    renderPlan(data);
  } catch (error) {
    byId("nextAction").textContent = "Company plan could not run.";
    byId("nextReason").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Run Company Plan";
  }
}

byId("refreshCenter").addEventListener("click", refresh);
byId("runCompanyPlan").addEventListener("click", runCompanyPlan);
window.addEventListener("storage", refresh);

refresh();
