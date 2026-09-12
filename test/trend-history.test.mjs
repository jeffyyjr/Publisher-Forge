import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { addSnapshot, normalizeHistory, normalizeSnapshot, previousSnapshot } from "../trend-evidence.mjs";

const fixture = (overrides = {}) => ({
  scannedAt: "2026-09-12T12:00:00.000Z", platform: "KDP", niche: "RV records",
  summary: "Test hypothesis", opportunities: [{ title: "Original logbook", score: 80 }],
  sources: [{ title: "Public listing", url: "https://example.com/listing" }], ...overrides
});

test("snapshots retain selected public fields, not secrets or arbitrary payloads", () => {
  const result = normalizeSnapshot(fixture({ apiKey: "SECRET", rawResponse: "PRIVATE" }));
  assert.equal(result.evidenceStatus, "PUBLIC_WEB_ONLY");
  assert.match(result.warning, /not measured sales/);
  assert.equal(result.apiKey, undefined);
  assert.equal(result.rawResponse, undefined);
  assert.equal(result.opportunities[0].demand, null);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|PRIVATE/);
});

test("invalid dates, missing ideas and unsafe URLs are rejected", () => {
  assert.equal(normalizeSnapshot(fixture({ scannedAt: "bad" })), null);
  assert.equal(normalizeSnapshot(fixture({ opportunities: [] })), null);
  const result = normalizeSnapshot(fixture({ sources: [null, { url: "javascript:alert(1)" }, { url: "https://user:pass@example.com" }] }));
  assert.deepEqual(result.sources, []);
  assert.equal(result.evidenceStatus, "NO_VERIFIED_SOURCES");
  assert.throws(() => addSnapshot([], {}), /no valid dated opportunities/);
});

test("history is bounded, normalized and same-scan saves are idempotent", () => {
  let history = [];
  for (let day = 1; day <= 20; day++) history = addSnapshot(history, fixture({ scannedAt: `2026-09-${String(day).padStart(2, "0")}T12:00:00Z` }));
  assert.equal(history.length, 12);
  assert.equal(history[0].scannedAt, "2026-09-20T12:00:00.000Z");
  assert.equal(addSnapshot(history, history[0]).length, 12);
  assert.deepEqual(normalizeHistory("corrupt"), []);
});

test("comparison only selects an earlier matching marketplace and query", () => {
  const earlier = fixture({ scannedAt: "2026-09-10T12:00:00Z", niche: " rv records " });
  const history = [fixture({ platform: "Etsy" }), fixture({ niche: "Other" }), earlier, fixture()];
  assert.equal(previousSnapshot(history, fixture()).scannedAt, "2026-09-10T12:00:00.000Z");
  assert.equal(previousSnapshot(history, fixture({ niche: "New query" })), null);
});

function browser(storageError = false) {
  const listeners = new Map();
  const elements = new Map();
  const storage = new Map();
  const element = () => ({ textContent: "", value: "", disabled: false, children: [], handlers: {},
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.handlers[name] = callback; }, click() {} });
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  const window = { addEventListener(name, callback) { listeners.set(name, callback); }, renderRadar() {} };
  const localStorage = { getItem: key => storage.get(key), setItem(key, value) { if (storageError) throw new Error("Storage full"); storage.set(key, value); } };
  const source = readFileSync(new URL("../trend-history.js", import.meta.url), "utf8").replace(/^import .*;\n/, "");
  vm.runInNewContext(source, { document, window, localStorage, addSnapshot, normalizeHistory, previousSnapshot, URL, Blob, setTimeout });
  return { listeners, elements, storage };
}

test("browser saves successful scans, restores them and presets do not run paid scans", () => {
  const app = browser();
  app.listeners.get("publisherForge:trendScan")({ detail: fixture() });
  assert.equal(JSON.parse(app.storage.get("publisherForge.trendHistory.v1")).length, 1);
  assert.match(app.elements.get("trendEvidenceNote").textContent, /not yet established/);
  assert.equal(app.elements.get("exportTrendHistory").disabled, false);
  app.elements.get("trendHistoryList").children[0].handlers.click();
  assert.match(app.elements.get("radarHeading").textContent, /not a fresh search/);
  app.elements.get("thanksgivingWorkflow").handlers.click();
  assert.equal(app.elements.get("radarPlatform").value, "Etsy");
  assert.match(app.elements.get("niche").value, /Large-print/);
  assert.match(app.elements.get("trendEvidenceNote").textContent, /does not spend API credits/);
});

test("failed local saves are visible and do not pretend a scan was persisted", () => {
  const app = browser(true);
  app.listeners.get("publisherForge:trendScan")({ detail: fixture() });
  assert.match(app.elements.get("trendEvidenceNote").textContent, /could not be saved: Storage full/);
  assert.equal(app.storage.size, 0);
});

test("failed scan attempts retain timing without persisting credential-bearing errors", () => {
  const app = browser();
  app.listeners.get("publisherForge:trendFailure")({ detail: fixture({ status: "FAILED", durationMs: 1500, error: "SECRET", opportunities: [] }) });
  const saved = JSON.parse(app.storage.get("publisherForge.trendHistory.v1"))[0];
  assert.equal(saved.status, "FAILED");
  assert.equal(saved.durationMs, 1500);
  assert.deepEqual(saved.opportunities, []);
  assert.doesNotMatch(JSON.stringify(saved), /SECRET/);
  assert.equal(previousSnapshot([saved], fixture()), null);
  app.elements.get("trendHistoryList").children[0].handlers.click();
  assert.match(app.elements.get("trendEvidenceNote").textContent, /Failed scan/);
});
