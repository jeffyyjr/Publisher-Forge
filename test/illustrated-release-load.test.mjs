import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pricingSource = html.slice(
  html.indexOf("    async function loadKdpPricing("),
  html.indexOf("    function wrapCanvasText(")
);

function harness(packageData) {
  let requests = 0;
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, { hidden: true, className: "", textContent: "", replaceChildren() {} });
      }
      return elements.get(id);
    }
  };
  const context = {
    document,
    activePackage: packageData,
    resetKdpPricing() {},
    showKdpPricing() {},
    readJson: async () => ({}),
    fetch: async () => { requests++; return { ok: true }; }
  };
  vm.createContext(context);
  vm.runInContext(pricingSource, context);
  return { context, elements, requests: () => requests };
}

test("illustrated projects defer pricing to Release QA without uploading images twice", async () => {
  const packageData = {
    platform: "KDP",
    packageTitle: "Illustrated RV logbook",
    interiorArt: Array.from({ length: 8 }, (_, index) => ({
      mimeType: "image/png",
      base64: "large-image-" + index
    }))
  };
  const app = harness(packageData);
  await app.context.loadKdpPricing(packageData);
  assert.equal(app.requests(), 0);
  assert.equal(app.elements.get("kdpPricingCard").hidden, false);
  assert.match(app.elements.get("kdpPricingSummary").textContent, /during Release QA/);
  assert.match(app.elements.get("kdpPricingSummary").textContent, /avoids building the same large file twice/i);
});

test("plain KDP projects retain the lightweight early pricing request", async () => {
  const packageData = { platform: "KDP", packageTitle: "Plain logbook", interiorArt: [] };
  const app = harness(packageData);
  await app.context.loadKdpPricing(packageData);
  assert.equal(app.requests(), 1);
});

test("release rendering reuses validated artwork buffers instead of decoding them twice", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(server, /printablePdf\(packageData, \{\s*packageIsReady: true,\s*validatedInteriorArt: interiorArt\s*\}\)/);
  assert.match(server, /const interiorArt = Array\.isArray\(options\.validatedInteriorArt\)/);
});

test("request diagnostics record only route, status, duration and memory", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(server, /DIAGNOSTIC_ROUTES/);
  assert.match(server, /connection-closed/);
  assert.doesNotMatch(server, /\[request\].*(req\.body|packageTitle|authorName)/);
});
