import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const STEP_TIMEOUT_MS = 12_000;
const MAX_STEPS = 20;
const RECORDING_TTL_MS = 10 * 60_000;
const MAX_RECORDING_SESSIONS = 2;
const recordings = new Map();

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizeBrowserSteps(input) {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_STEPS) throw new Error("Browser workflows are limited to 20 steps");

  return input.map((raw, index) => {
    const type = clean(raw?.type, 40);
    if (!["navigate", "click", "fill", "assertText", "wait"].includes(type)) {
      throw new Error(`Unsupported browser step at position ${index + 1}`);
    }

    if (type === "navigate") {
      const url = clean(raw.url, 1000);
      if (!url) throw new Error(`Step ${index + 1}: URL is required`);
      return { type, url };
    }

    if (type === "click") {
      const selector = clean(raw.selector, 500);
      if (!selector) throw new Error(`Step ${index + 1}: CSS selector is required`);
      return { type, selector };
    }

    if (type === "fill") {
      const selector = clean(raw.selector, 500);
      const value = String(raw.value ?? "").slice(0, 2000);
      if (!selector) throw new Error(`Step ${index + 1}: CSS selector is required`);
      return { type, selector, value };
    }

    if (type === "assertText") {
      const selector = clean(raw.selector, 500);
      const text = clean(raw.text, 500);
      if (!text) throw new Error(`Step ${index + 1}: expected text is required`);
      return { type, selector, text };
    }

    const ms = Math.min(10_000, Math.max(100, Number(raw.ms || 1000)));
    return { type, ms };
  });
}

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1365, height: 850 },
    executablePath,
    headless: "shell"
  });
}

async function securePage(page, validatePublicUrl) {
  const checkedHosts = new Map();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    try {
      const target = request.url();
      const parsed = new URL(target);
      if (!["http:", "https:"].includes(parsed.protocol)) return request.continue();

      const key = parsed.hostname;
      if (!checkedHosts.has(key)) {
        await validatePublicUrl(target);
        checkedHosts.set(key, true);
      }
      return request.continue();
    } catch {
      return request.abort("blockedbyclient");
    }
  });
}

async function stableSelectorAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;

    function escapeCss(value) {
      if (window.CSS?.escape) return CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    function selectorFor(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node.id) return "#" + escapeCss(node.id);

      for (const attr of ["data-testid", "data-test", "data-qa", "name", "aria-label"]) {
        const value = node.getAttribute(attr);
        if (value) return node.tagName.toLowerCase() + "[" + attr + "=\"" + String(value).replace(/"/g, "\\\"") + "\"]";
      }

      const parts = [];
      let current = node;
      while (current && current.nodeType === 1 && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    }

    return {
      selector: selectorFor(el),
      tag: el.tagName.toLowerCase(),
      type: String(el.getAttribute("type") || "").toLowerCase(),
      text: String(el.innerText || el.textContent || "").trim().slice(0, 160)
    };
  }, { x, y });
}

async function recorderScreenshot(session, dataDir) {
  const dir = join(dataDir, "recordings");
  await mkdir(dir, { recursive: true });
  const filename = `${session.id}.png`;
  await session.page.screenshot({ path: join(dir, filename), fullPage: false });
  session.updatedAt = Date.now();
  return `/recording-evidence/${filename}?v=${session.updatedAt}`;
}

async function closeRecording(id) {
  const session = recordings.get(id);
  if (!session) return;
  recordings.delete(id);
  await session.browser.close().catch(() => {});
}

function cleanupRecordings() {
  const cutoff = Date.now() - RECORDING_TTL_MS;
  for (const [id, session] of recordings) {
    if (session.updatedAt < cutoff) closeRecording(id).catch(() => {});
  }
}

setInterval(cleanupRecordings, 60_000).unref();

export async function startRecording({ url, dataDir, validatePublicUrl }) {
  cleanupRecordings();
  if (recordings.size >= MAX_RECORDING_SESSIONS) {
    throw new Error("Two recorder sessions are already active. Finish or cancel one first.");
  }

  await validatePublicUrl(url);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await securePage(page, validatePublicUrl);

  const session = {
    id: randomUUID(),
    browser,
    page,
    steps: [{ type: "navigate", url }],
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  recordings.set(session.id, session);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (response && response.status() >= 400) throw new Error(`Navigation returned HTTP ${response.status()}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const screenshotUrl = await recorderScreenshot(session, dataDir);
    return {
      id: session.id,
      screenshotUrl,
      currentUrl: page.url(),
      steps: session.steps
    };
  } catch (error) {
    await closeRecording(session.id);
    throw error;
  }
}

export async function recordingClick({ id, x, y, dataDir }) {
  const session = recordings.get(id);
  if (!session) throw new Error("Recorder session expired. Start again.");
  const hit = await stableSelectorAt(session.page, Number(x), Number(y));
  if (!hit?.selector) throw new Error("Could not identify the clicked element");

  session.steps.push({ type: "click", selector: hit.selector });
  await session.page.locator(hit.selector).click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    screenshotUrl: await recorderScreenshot(session, dataDir),
    currentUrl: session.page.url(),
    hit,
    steps: session.steps
  };
}

export async function recordingFill({ id, value, dataDir }) {
  const session = recordings.get(id);
  if (!session) throw new Error("Recorder session expired. Start again.");

  const active = await session.page.evaluate(() => {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
    const type = String(el.getAttribute("type") || "").toLowerCase();
    if (type === "password") return { password: true };

    function escapeCss(value) {
      if (window.CSS?.escape) return CSS.escape(value);
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }
    if (el.id) return { selector: "#" + escapeCss(el.id), password: false };
    for (const attr of ["data-testid", "data-test", "data-qa", "name", "aria-label"]) {
      const attrValue = el.getAttribute(attr);
      if (attrValue) {
        return {
          selector: el.tagName.toLowerCase() + "[" + attr + "=\"" + String(attrValue).replace(/"/g, "\\\"") + "\"]",
          password: false
        };
      }
    }
    return null;
  });

  if (active?.password) throw new Error("Password fields are blocked until encrypted secret storage is added.");
  if (!active?.selector) throw new Error("Tap an input field in the screenshot first.");

  const safeValue = String(value ?? "").slice(0, 2000);
  await session.page.locator(active.selector).fill(safeValue);
  session.steps.push({ type: "fill", selector: active.selector, value: safeValue });
  return {
    screenshotUrl: await recorderScreenshot(session, dataDir),
    currentUrl: session.page.url(),
    steps: session.steps
  };
}

export async function recordingAssert({ id, text, dataDir }) {
  const session = recordings.get(id);
  if (!session) throw new Error("Recorder session expired. Start again.");
  const expected = clean(text, 500);
  if (!expected) throw new Error("Expected text is required");

  const found = await session.page.evaluate((value) => (document.body?.innerText || "").includes(value), expected);
  if (!found) throw new Error("That text is not currently visible on the page.");

  session.steps.push({ type: "assertText", selector: "", text: expected });
  return {
    screenshotUrl: await recorderScreenshot(session, dataDir),
    currentUrl: session.page.url(),
    steps: session.steps
  };
}

export async function finishRecording(id) {
  const session = recordings.get(id);
  if (!session) throw new Error("Recorder session expired. Start again.");
  const steps = normalizeBrowserSteps(session.steps);
  await closeRecording(id);
  return { steps };
}

export async function cancelRecording(id) {
  await closeRecording(id);
  return { ok: true };
}

export async function runBrowserWorkflow({ workflow, runId, dataDir, validatePublicUrl }) {
  const screenshotsDir = join(dataDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  const screenshotName = `${runId}.png`;
  const screenshotPath = join(screenshotsDir, screenshotName);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await securePage(page, validatePublicUrl);

  const steps = workflow.steps?.length
    ? workflow.steps
    : [
        { type: "navigate", url: workflow.url },
        ...(workflow.expectedText ? [{ type: "assertText", text: workflow.expectedText, selector: "" }] : [])
      ];

  const evidence = {
    mode: "browser",
    steps: [],
    screenshotUrl: null,
    finalUrl: null,
    pageTitle: null
  };

  let failedStep = null;

  try {
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const started = Date.now();
      const item = {
        position: i + 1,
        type: step.type,
        ok: false,
        durationMs: 0
      };

      try {
        if (step.type === "navigate") {
          await validatePublicUrl(step.url);
          const response = await page.goto(step.url, { waitUntil: "domcontentloaded" });
          item.url = step.url;
          item.statusCode = response?.status() ?? null;
          if (response && response.status() >= 400) throw new Error(`Navigation returned HTTP ${response.status()}`);
        } else if (step.type === "click") {
          item.selector = step.selector;
          await page.locator(step.selector).click();
        } else if (step.type === "fill") {
          item.selector = step.selector;
          const inputType = await page.$eval(step.selector, (el) => String(el.getAttribute("type") || "").toLowerCase());
          if (inputType === "password") throw new Error("Password fields are not supported yet. Secret storage comes next.");
          await page.locator(step.selector).fill(step.value);
          item.valueLength = step.value.length;
        } else if (step.type === "assertText") {
          item.selector = step.selector || null;
          item.expectedText = step.text;
          const found = step.selector
            ? await page.$eval(step.selector, (el, expected) => (el.textContent || "").includes(expected), step.text).catch(() => false)
            : await page.evaluate((expected) => (document.body?.innerText || "").includes(expected), step.text);
          if (!found) throw new Error(`Expected text not found: "${step.text}"`);
        } else if (step.type === "wait") {
          item.waitMs = step.ms;
          await new Promise((resolve) => setTimeout(resolve, step.ms));
        }

        item.ok = true;
      } catch (error) {
        item.error = String(error?.message || error);
        failedStep = { position: i + 1, type: step.type, error: item.error };
      } finally {
        item.durationMs = Date.now() - started;
        evidence.steps.push(item);
      }

      if (failedStep) break;
    }

    evidence.finalUrl = page.url();
    evidence.pageTitle = await page.title().catch(() => null);

    if (failedStep) {
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      evidence.screenshotUrl = `/evidence/${screenshotName}`;
      evidence.failedStep = failedStep;
      return {
        ok: false,
        error: `Step ${failedStep.position} (${failedStep.type}) failed: ${failedStep.error}`,
        evidence
      };
    }

    return { ok: true, evidence };
  } catch (error) {
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    evidence.screenshotUrl = `/evidence/${screenshotName}`;
    evidence.finalUrl = page.url();
    evidence.failedStep = failedStep;
    return {
      ok: false,
      error: String(error?.message || error),
      evidence
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
