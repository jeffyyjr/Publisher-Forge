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

test("research history module and helpers are served as JavaScript", async () => {
  for (const filename of ["trend-history.js", "trend-evidence.mjs"]) {
    const response = await fetch(baseUrl + "/" + filename);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /javascript/);
  }
  const response = await fetch(baseUrl + "/");
  const html = await response.text();
  assert.match(html, /id="trendHistoryList"/);
  assert.match(html, /type="module" src="\/trend-history.js"/);
});

test("command center page is served", async () => {
  const response = await fetch(baseUrl + "/command-center");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Publisher Forge — Command Center/);
  assert.match(html, /Run Company Plan/);
  assert.match(html, /Project Pipeline/);
  assert.match(html, /Best Jobs & Gigs/);
  assert.match(html, /Revenue Signals/);
  assert.match(html, /Agent Settings/);
  assert.match(html, /src="\/command-center\.js"/);
});

test("command center browser logic uses existing Forge stores and Orchestrator", async () => {
  const response = await fetch(baseUrl + "/command-center.js");
  const source = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /javascript/);
  assert.match(source, /pfProjectVault/);
  assert.match(source, /pfRevenueTests/);
  assert.match(source, /publisherForge\.moneyAgentOpportunities\.v1/);
  assert.match(source, /publisherForge\.moneyAgentSettings\.v2/);
  assert.match(source, /\/api\/orchestrator\/next-action/);
  assert.match(source, /\/api\/money-agents\/status/);
});
