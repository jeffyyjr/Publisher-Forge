import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const STEP_TIMEOUT_MS = 12_000;
const MAX_STEPS = 20;

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

export async function runBrowserWorkflow({ workflow, runId, dataDir, validatePublicUrl }) {
  const screenshotsDir = join(dataDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  const screenshotName = `${runId}.png`;
  const screenshotPath = join(screenshotsDir, screenshotName);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);

  const checkedHosts = new Map();
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    try {
      const target = request.url();
      const parsed = new URL(target);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return request.continue();
      }

      const cacheKey = parsed.hostname;
      let ok = checkedHosts.get(cacheKey);
      if (ok === undefined) {
        await validatePublicUrl(target);
        ok = true;
        checkedHosts.set(cacheKey, ok);
      }
      return request.continue();
    } catch {
      return request.abort("blockedbyclient");
    }
  });

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
          if (response && response.status() >= 400) {
            throw new Error(`Navigation returned HTTP ${response.status()}`);
          }
        } else if (step.type === "click") {
          item.selector = step.selector;
          await page.locator(step.selector).click();
        } else if (step.type === "fill") {
          item.selector = step.selector;
          const inputType = await page.$eval(step.selector, (el) => String(el.getAttribute("type") || "").toLowerCase());
          if (inputType === "password") {
            throw new Error("Password fields are not supported in v0.2. Secret storage comes next.");
          }
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
