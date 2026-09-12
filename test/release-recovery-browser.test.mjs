import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = html.slice(html.indexOf("    async function runReleaseQa("), html.indexOf("    function resetQualityReview()"));
function harness(report) {
  let attempts = 0;
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { disabled: false, textContent: "", classList: { add() {} }, replaceChildren() {} });
    return elements.get(id);
  } };
  const context = { document, activePackage: {}, activeQualityReview: { verdict: "PASS" },
    activeCover: null, activeReleaseQa: null, activeProductionTitle: "Book", productionOutput: {},
    coverAuthorName: { value: "Maxx Powers" }, runReleaseQaButton: {}, downloadWrapButton: {}, sendRevenueButton: {},
    loading() {}, toast() {}, formatProductionPackage() { return "Package"; },
    fetch: async () => ({ ok: true }), readJson: async () => report,
    requestReleaseQa: async () => report,
    showReleaseQa(data) { context.activeReleaseQa = data; },
    async reviseAndRecheck(options) { attempts++; await context.runReleaseQa(options); }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, elements, attempts: () => attempts };
}

test("automatic recovery stops after two manuscript retries and never unlocks approval", async () => {
  const app = harness({ verdict: "BLOCKED", checks: [{ id: "page-count", status: "BLOCKED" }] });
  await app.context.runReleaseQa();
  assert.equal(app.attempts(), 2);
  assert.match(app.elements.get("approvalNote").textContent, /stopped after 2 attempts/);
  assert.equal(app.elements.get("approveProductionButton").disabled, true);
});

test("ready files and cover-only blockers do not trigger unnecessary paid manuscript revisions", async () => {
  for (const report of [{ verdict: "READY", checks: [] }, { verdict: "BLOCKED", checks: [{ id: "cover-art", status: "BLOCKED" }] }]) {
    const app = harness(report);
    await app.context.runReleaseQa();
    assert.equal(app.attempts(), 0);
  }
});

test("connection recovery preserves the draft, cover and written PASS, without paid revisions", async () => {
  const app = harness({});
  const book = { packageTitle: "RV logbook", draftMarkdown: "Original records", approvedAt: "old approval" };
  const cover = { base64: "existing artwork" };
  const review = { verdict: "PASS", overallScore: 88 };
  app.context.activePackage = book;
  app.context.activeCover = cover;
  app.context.activeQualityReview = review;
  app.context.requestReleaseQa = async (payload, onRetry) => {
    assert.equal(payload.package, book);
    assert.equal(payload.cover, cover);
    assert.equal(payload.qualityReview, review);
    onRetry({ attempt: 2, maxAttempts: 3, delayMs: 2000 });
    assert.equal(app.elements.get("releaseQaVerdict").textContent, "RECONNECTING");
    const error = new Error("Your draft and artwork are still in this tab. Tap Prepare final files.");
    error.code = "RELEASE_QA_CONNECTION";
    throw error;
  };
  await app.context.runReleaseQa();
  assert.equal(app.context.activePackage, book);
  assert.equal(app.context.activeCover, cover);
  assert.equal(app.context.activeQualityReview, review);
  assert.equal(app.context.activeReleaseQa, null);
  assert.equal(app.attempts(), 0);
  assert.equal(book.approvedAt, undefined);
  assert.equal(app.elements.get("releaseQaVerdict").textContent, "CONNECTION INTERRUPTED");
  assert.equal(app.elements.get("approveProductionButton").disabled, true);
  assert.equal(app.elements.get("downloadBundleButton").disabled, true);
  assert.equal(app.elements.get("downloadPdfButton").disabled, true);
  assert.equal(app.context.downloadWrapButton.disabled, true);
  assert.equal(app.context.runReleaseQaButton.disabled, false);
  assert.match(app.elements.get("approvalNote").textContent, /not Run quality check/);

  // Explicit retry is allowed after the bounded automatic recovery stops.
  const report = { verdict: "READY", checks: [] };
  app.context.requestReleaseQa = async () => report;
  await app.context.runReleaseQa();
  assert.equal(app.context.activeReleaseQa, report);
  assert.equal(app.attempts(), 0);
});

test("duplicate taps are ignored while Release QA is waiting for the same request", async () => {
  const app = harness({});
  let resolve;
  let requests = 0;
  app.context.requestReleaseQa = () => {
    requests++;
    return new Promise(done => { resolve = done; });
  };
  const pending = app.context.runReleaseQa();
  await app.context.runReleaseQa();
  assert.equal(requests, 1);
  resolve({ verdict: "READY", checks: [] });
  await pending;
  assert.equal(app.context.activeReleaseQa.verdict, "READY");
});

test("a late success or failure cannot overwrite a newly opened project", async () => {
  for (const fails of [false, true]) {
    const app = harness({});
    let settle;
    app.context.requestReleaseQa = () => new Promise((resolve, reject) => {
      settle = () => fails ? reject(new TypeError("Load failed")) : resolve({
        verdict: "READY", checks: [], fixedPackage: { packageTitle: "Old book" }
      });
    });
    const pending = app.context.runReleaseQa();
    const newBook = { packageTitle: "Different book" };
    app.context.activePackage = newBook;
    app.context.activeQualityReview = null;
    app.elements.get("releaseQaVerdict").textContent = "NOT CHECKED";
    settle();
    await pending;
    assert.equal(app.context.activePackage, newBook);
    assert.equal(app.context.activeReleaseQa, null);
    assert.equal(app.elements.get("releaseQaVerdict").textContent, "NOT CHECKED");
    assert.equal(app.context.runReleaseQaButton.disabled, true);
  }
});

test("manuscript revision retains compatible cover and interior images before independent recheck", async () => {
  const app = harness({});
  const art = [{ filename: "interior-art-01.png", base64: "art" }];
  const cover = { base64: "cover", authorName: "Maxx Powers" };
  app.context.activePackage = { packageTitle: "RV logbook", subtitle: "Records", platform: "KDP", authorName: "Maxx Powers", interiorArt: art };
  app.context.activePackageText = "Original package";
  app.context.activeProductionBrief = "Approved brief";
  app.context.activeCover = cover;
  app.context.activeReleaseQa = { verdict: "BLOCKED", checks: [{ id: "page-count", status: "BLOCKED", detail: "20 pages" }] };
  app.context.revisePackageButton = {};
  app.context.downloadCoverButton = {};
  app.context.productionActionsEnabled = () => {};
  app.context.readJson = async () => ({ packageTitle: "RV logbook", subtitle: "Records", platform: "KDP", draftMarkdown: "Expanded original draft" });
  app.context.showProductionPackage = data => { app.context.activePackage = data; app.context.activeCover = null; };
  let rechecked = false;
  app.context.runQualityReview = async (review, options) => {
    rechecked = true;
    assert.equal(review.verdict, "BLOCKED");
    assert.equal(options.recoveryAttempt, 1);
    assert.equal(app.context.activeCover, cover);
    assert.equal(app.context.activePackage.interiorArt, art);
    assert.equal(app.context.activePackage.authorName, "Maxx Powers");
  };
  const revisionSource = html.slice(html.indexOf("    async function reviseAndRecheck("), html.indexOf("    function revenueMoney("));
  vm.runInContext(revisionSource, app.context);
  await app.context.reviseAndRecheck({ recoveryAttempt: 1 });
  assert.equal(rechecked, true);
});
