import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { normalizeBrowserSteps, runBrowserWorkflow } from "./browser-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.WG_DATA_DIR || join(__dirname, ".data");
const DATA_FILE = join(DATA_DIR, "workflow-guardian.json");
const MAX_BODY = 512_000;
const DEFAULT_TIMEOUT_MS = 12_000;

let state = { workflows: [], runs: [], incidents: [] };

async function loadState() {
  try {
    state = JSON.parse(await readFile(DATA_FILE, "utf8"));
    state.workflows ||= [];
    state.runs ||= [];
    state.incidents ||= [];
  } catch {
    await persist();
  }
}

async function persist() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error("Request body too large");
  }
  return body ? JSON.parse(body) : {};
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip === "::1" || ip === "0.0.0.0" || ip === "127.0.0.1") return true;

  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] === 0
    );
  }

  const normalized = ip.toLowerCase();
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

export async function validatePublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP/HTTPS targets are supported");
  }

  if (url.username || url.password) {
    throw new Error("Credentials in URLs are not allowed");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Private or local network targets are not allowed");
  }

  return url;
}

async function safeFetch(startUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let current = await validatePublicUrl(startUrl);

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "WorkflowGuardian/0.2 (+synthetic-monitor)",
          accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.5"
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, finalUrl: current.href };
      current = await validatePublicUrl(new URL(location, current).href);
      continue;
    }

    return { response, finalUrl: current.href };
  }

  throw new Error("Too many redirects");
}

function normalizeWorkflow(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  const url = String(input.url || "").trim().slice(0, 1000);
  const expectedText = String(input.expectedText || "").trim().slice(0, 500);
  const intervalMinutes = Math.min(1440, Math.max(1, Number(input.intervalMinutes || 15)));
  const steps = normalizeBrowserSteps(input.steps || []);
  const mode = steps.length ? "browser" : "http";

  if (!name) throw new Error("Workflow name is required");
  if (!url) throw new Error("Target URL is required");

  return { name, url, expectedText, intervalMinutes, mode, steps };
}

async function validateWorkflowTargets(workflow) {
  await validatePublicUrl(workflow.url);
  for (const step of workflow.steps || []) {
    if (step.type === "navigate") await validatePublicUrl(step.url);
  }
}

function latestRun(workflowId) {
  return state.runs.find((run) => run.workflowId === workflowId) || null;
}

function activeIncident(workflowId) {
  return state.incidents.find((incident) => incident.workflowId === workflowId && !incident.resolvedAt) || null;
}

async function runHttpWorkflow(workflow) {
  const { response, finalUrl } = await safeFetch(workflow.url);
  const body = (await response.text()).slice(0, 100_000);
  const statusOk = response.status >= 200 && response.status < 400;
  const textOk = !workflow.expectedText || body.toLowerCase().includes(workflow.expectedText.toLowerCase());

  return {
    ok: statusOk && textOk,
    error: !statusOk
      ? `Unexpected HTTP status ${response.status}`
      : (!textOk ? `Expected text not found: "${workflow.expectedText}"` : null),
    evidence: {
      mode: "http",
      requestedUrl: workflow.url,
      finalUrl,
      statusCode: response.status,
      statusOk,
      expectedText: workflow.expectedText || null,
      expectedTextFound: workflow.expectedText ? textOk : null,
      responseSnippet: body.replace(/\s+/g, " ").trim().slice(0, 700)
    }
  };
}

async function runWorkflow(workflow, source = "manual") {
  const started = Date.now();
  const run = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowMode: workflow.mode || "http",
    source,
    startedAt: new Date(started).toISOString(),
    finishedAt: null,
    ok: false,
    evidence: {}
  };

  try {
    const result = workflow.mode === "browser"
      ? await runBrowserWorkflow({
          workflow,
          runId: run.id,
          dataDir: DATA_DIR,
          validatePublicUrl
        })
      : await runHttpWorkflow(workflow);

    run.ok = Boolean(result.ok);
    run.error = result.error || null;
    run.evidence = result.evidence || {};
  } catch (error) {
    run.ok = false;
    run.error = error?.name === "AbortError" ? "Workflow check timed out" : String(error?.message || error);
    run.evidence = {
      mode: workflow.mode || "http",
      requestedUrl: workflow.url,
      expectedText: workflow.expectedText || null
    };
  }

  run.finishedAt = new Date().toISOString();
  run.durationMs = Date.now() - started;

  state.runs.unshift(run);
  state.runs = state.runs.slice(0, 500);

  workflow.lastRunAt = run.finishedAt;
  workflow.lastStatus = run.ok ? "passing" : "failing";
  workflow.nextRunAt = new Date(Date.now() + workflow.intervalMinutes * 60_000).toISOString();

  const incident = activeIncident(workflow.id);
  if (!run.ok && !incident) {
    state.incidents.unshift({
      id: randomUUID(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      openedAt: run.finishedAt,
      resolvedAt: null,
      latestRunId: run.id,
      summary: run.error || "Workflow failed",
      screenshotUrl: run.evidence?.screenshotUrl || null
    });
  } else if (!run.ok && incident) {
    incident.latestRunId = run.id;
    incident.summary = run.error || incident.summary;
    incident.screenshotUrl = run.evidence?.screenshotUrl || incident.screenshotUrl || null;
  } else if (run.ok && incident) {
    incident.resolvedAt = run.finishedAt;
    incident.resolutionRunId = run.id;
  }

  await persist();
  return run;
}

function enrichedWorkflows() {
  return state.workflows.map((workflow) => ({
    ...workflow,
    latestRun: latestRun(workflow.id),
    activeIncident: activeIncident(workflow.id)
  }));
}

async function serveEvidence(pathname, res) {
  const match = pathname.match(/^\/evidence\/([0-9a-f-]{36})\.png$/i);
  if (!match) return false;
  try {
    const image = await readFile(join(DATA_DIR, "screenshots", `${match[1]}.png`));
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "private, max-age=60"
    });
    res.end(image);
  } catch {
    json(res, 404, { error: "Evidence image not found" });
  }
  return true;
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && await serveEvidence(url.pathname, res)) return;

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, product: "Workflow Guardian", version: "0.2.0", browserReplay: true });
  }

  if (req.method === "GET" && url.pathname === "/api/workflows") {
    return json(res, 200, { workflows: enrichedWorkflows() });
  }

  if (req.method === "GET" && url.pathname === "/api/incidents") {
    return json(res, 200, { incidents: state.incidents.slice(0, 100) });
  }

  if (req.method === "GET" && url.pathname === "/api/runs") {
    return json(res, 200, { runs: state.runs.slice(0, 100) });
  }

  if (req.method === "POST" && url.pathname === "/api/workflows") {
    try {
      const input = normalizeWorkflow(await readJson(req));
      await validateWorkflowTargets(input);
      const now = new Date().toISOString();
      const workflow = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        lastRunAt: null,
        lastStatus: "unknown",
        nextRunAt: now
      };
      state.workflows.unshift(workflow);
      await persist();
      return json(res, 201, { workflow });
    } catch (error) {
      return json(res, 400, { error: String(error?.message || error) });
    }
  }

  const runMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
  if (req.method === "POST" && runMatch) {
    const workflow = state.workflows.find((item) => item.id === runMatch[1]);
    if (!workflow) return json(res, 404, { error: "Workflow not found" });
    const run = await runWorkflow(workflow, "manual");
    return json(res, run.ok ? 200 : 502, { run, workflow });
  }

  const deleteMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const before = state.workflows.length;
    state.workflows = state.workflows.filter((item) => item.id !== deleteMatch[1]);
    if (state.workflows.length === before) return json(res, 404, { error: "Workflow not found" });
    await persist();
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = await readFile(join(__dirname, "index.html"), "utf8");
    return text(res, 200, html, "text/html; charset=utf-8");
  }

  return json(res, 404, { error: "Not found" });
}

async function runDueWorkflows() {
  const now = Date.now();
  for (const workflow of state.workflows) {
    const next = workflow.nextRunAt ? Date.parse(workflow.nextRunAt) : 0;
    if (next <= now) {
      await runWorkflow(workflow, "schedule").catch((error) => {
        console.error("scheduled run failed", workflow.id, error);
      });
    }
  }
}

await loadState();

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    json(res, 500, { error: "Unexpected server error" });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Workflow Guardian v0.2 listening on ${PORT}`);

  if (process.env.WG_BROWSER_SMOKE_TEST === "1") {
    const smokeRunId = randomUUID();
    runBrowserWorkflow({
      workflow: {
        id: "browser-smoke-test",
        name: "Browser smoke test",
        mode: "browser",
        url: "https://example.com",
        steps: [
          { type: "navigate", url: "https://example.com" },
          { type: "assertText", selector: "", text: "Example Domain" }
        ]
      },
      runId: smokeRunId,
      dataDir: DATA_DIR,
      validatePublicUrl
    }).then((result) => {
      console.log("WG_BROWSER_SMOKE_TEST", JSON.stringify({
        ok: result.ok,
        error: result.error || null,
        steps: result.evidence?.steps?.map((step) => ({
          position: step.position,
          type: step.type,
          ok: step.ok,
          error: step.error || null
        })) || []
      }));
    }).catch((error) => {
      console.error("WG_BROWSER_SMOKE_TEST_FATAL", error);
    });
  }
});

setInterval(() => {
  runDueWorkflows().catch((error) => console.error("scheduler error", error));
}, 60_000).unref();
