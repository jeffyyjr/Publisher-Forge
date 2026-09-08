import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "../dashboard-start.mjs";
import { app } from "../server.js";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("money agent dashboard is served with settings controls", async () => {
  const response = await fetch(baseUrl + "/money-agents");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Orchestrator Agent/);
  assert.match(html, /Opportunity Agent/);
  assert.match(html, /Pinterest Agent/);
  assert.match(html, /Shopify Agent/);
  assert.match(html, /Global Safety & Automation Controls/);
  assert.match(html, /src="\/money-agents\.js"/);
});

test("money agent browser script is served as JavaScript", async () => {
  const response = await fetch(baseUrl + "/money-agents.js");
  const source = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript/);
  assert.match(source, /\/api\/opportunity-scan/);
  assert.match(source, /\/api\/orchestrator\/next-action/);
  assert.match(source, /\/api\/pinterest-plan/);
});

test("money agent status endpoint remains available", async () => {
  const response = await fetch(baseUrl + "/api/money-agents/status");
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.status, "READY");
  assert.equal(data.humanApprovalRequired, true);
});
