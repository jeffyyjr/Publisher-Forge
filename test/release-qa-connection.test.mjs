import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = html.slice(html.indexOf("    async function requestReleaseQa("), html.indexOf("    async function runReleaseQa("));
const ready = { verdict: "READY", checks: [{ id: "interior-pdf", status: "PASS" }] };
const payload = { title: "RV logbook", package: { draftMarkdown: "Original records" }, cover: { base64: "original cover" } };

function response(status = 200, data = ready, retryAfter = null) {
  return { status, ok: status >= 200 && status < 300,
    headers: { get: () => retryAfter },
    text: async () => typeof data === "string" ? data : JSON.stringify(data) };
}

function harness(steps, { abortRequests = false } = {}) {
  const calls = [];
  const delays = [];
  const timers = new Set();
  const context = {
    AbortController,
    setTimeout(fn, ms) {
      const timer = { ms };
      timers.add(timer);
      if (ms !== 90000) delays.push(ms);
      if (ms !== 90000 || abortRequests) queueMicrotask(() => {
        if (timers.delete(timer)) fn();
      });
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    async fetch(url, options) {
      calls.push({ url, ...options });
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(options) : step;
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { request: context.requestReleaseQa, calls, delays, timers };
}

test("Safari Load failed recovers using identical input and only the deterministic Release QA endpoint", async () => {
  const app = harness([new TypeError("Load failed"), response(503, "<html>Restarting</html>"), response()]);
  const retries = [];
  const mutablePayload = structuredClone(payload);
  const originalBody = JSON.stringify(mutablePayload);
  const result = await app.request(mutablePayload, retry => {
    retries.push(retry.attempt);
    mutablePayload.title = "Changed after request began";
  });
  assert.equal(result.verdict, "READY");
  assert.deepEqual(retries, [2, 3]);
  assert.deepEqual(app.delays, [2000, 5000]);
  assert.equal(app.calls.length, 3);
  for (const call of app.calls) {
    assert.equal(call.url, "/api/release-qa");
    assert.equal(call.method, "POST");
    assert.equal(call.body, originalBody);
    assert.equal(call.cache, "no-store");
    assert.ok(call.signal);
  }
  assert.equal(app.timers.size, 0);
});

test("persistent network failure stops after three requests with useful next steps", async () => {
  const app = harness([new TypeError("Load failed")]);
  await assert.rejects(app.request(payload), error => {
    assert.equal(error.code, "RELEASE_QA_CONNECTION");
    assert.match(error.message, /after 3 attempts/);
    assert.match(error.message, /draft and artwork are still in this tab/);
    assert.match(error.message, /Prepare final files/);
    return true;
  });
  assert.equal(app.calls.length, 3);
  assert.deepEqual(app.delays, [2000, 5000]);
  assert.equal(app.timers.size, 0);
});

test("temporary gateway and request timeout statuses are retried", async () => {
  for (const status of [408, 502, 503, 504]) {
    const app = harness([response(status, { error: "Temporarily unavailable" }), response()]);
    assert.equal((await app.request(payload)).verdict, "READY");
    assert.equal(app.calls.length, 2);
    assert.equal(app.timers.size, 0);
  }
});

test("validation, access, oversize, rate-limit and real build errors are not automatically repeated", async () => {
  for (const status of [400, 401, 403, 413, 422, 429, 500]) {
    for (const data of [{ message: "Specific build or validation error" }, "<html>Error</html>"]) {
      const app = harness([response(status, data, status === 429 ? "120" : null)]);
      await assert.rejects(app.request(payload), error => {
        assert.equal(error.status, status);
        assert.notEqual(error.code, "RELEASE_QA_CONNECTION");
        assert.doesNotMatch(error.message, /<html>/);
        if (status === 413) assert.match(error.message, /too large/);
        if (status === 429) assert.match(error.message, /2 minute/);
        return true;
      });
      assert.equal(app.calls.length, 1);
      assert.deepEqual(app.delays, []);
      assert.equal(app.timers.size, 0);
    }
  }
});

test("an interrupted or incomplete response body is retried but never treated as approval", async () => {
  for (const interrupted of [response(200, '{"verdict":'), response(200, { verdict: "READY" }), response(200, null),
    { ...response(), text: async () => { throw new TypeError("Load failed"); } }]) {
    const app = harness([interrupted, response()]);
    assert.equal((await app.request(payload)).verdict, "READY");
    assert.equal(app.calls.length, 2);
    assert.equal(app.timers.size, 0);
  }
});

test("hung requests are aborted, retried with bounded delay, and eventually stop", async () => {
  const app = harness([options => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Request timed out", "AbortError")), { once: true });
  })], { abortRequests: true });
  await assert.rejects(app.request(payload), { code: "RELEASE_QA_CONNECTION" });
  assert.equal(app.calls.length, 3);
  assert.ok(app.calls.every(call => call.signal.aborted));
  assert.equal(app.timers.size, 0);
});

test("valid QA blockers return immediately for the existing repair workflow, not transport retries", async () => {
  const blocked = { verdict: "BLOCKED", checks: [{ id: "cover-art", status: "BLOCKED" }] };
  const app = harness([response(200, blocked)]);
  assert.equal((await app.request(payload)).verdict, "BLOCKED");
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.delays, []);
  assert.equal(app.timers.size, 0);
});
