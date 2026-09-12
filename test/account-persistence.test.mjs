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

test("account page and sync helper are served", async () => {
  const page = await fetch(baseUrl + "/account");
  const html = await page.text();
  const sync = await fetch(baseUrl + "/account-sync.js");

  assert.equal(page.status, 200);
  assert.match(html, /Publisher Forge — Account/);
  assert.match(html, /Save This Device to Account/);
  assert.equal(sync.status, 200);
  assert.match(sync.headers.get("content-type") || "", /javascript/);
});

test("account registration creates a session and versioned state", async () => {
  const email = `forge-${Date.now()}@example.com`;
  const register = await fetch(baseUrl + "/api/account/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "strong-test-password" })
  });
  const registered = await register.json();
  const cookie = register.headers.get("set-cookie");

  assert.equal(register.status, 201);
  assert.equal(registered.user.email, email);
  assert.match(cookie || "", /pf_session=/);
  assert.match(cookie || "", /HttpOnly/);
  assert.match(cookie || "", /SameSite=Lax/);

  const initial = await fetch(baseUrl + "/api/account/state", {
    headers: { Cookie: cookie }
  });
  const initialState = await initial.json();
  assert.equal(initial.status, 200);
  assert.equal(initialState.revision, 0);

  const save = await fetch(baseUrl + "/api/account/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      baseRevision: 0,
      state: {
        projectVault: [{ title: "Persistent test", platform: "KDP" }],
        revenueTests: [],
        trendHistory: [{ scannedAt: "2026-09-12T12:00:00Z", platform: "KDP", niche: "RV records", opportunities: [{ title: "RV test" }], sources: [] }],
        opportunities: [],
        moneyAgentSettings: { orchestrator: { mode: "balanced" } },
        commandCenterPlan: null
      }
    })
  });
  const saved = await save.json();
  assert.equal(save.status, 200);
  assert.equal(saved.revision, 1);
  assert.equal(saved.state.projectVault[0].title, "Persistent test");
  assert.equal(saved.state.trendHistory[0].opportunities[0].title, "RV test");
  assert.equal(saved.state.trendHistory[0].evidenceStatus, "NO_VERIFIED_SOURCES");

  const stale = await fetch(baseUrl + "/api/account/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ baseRevision: 0, state: {} })
  });
  const conflict = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(conflict.conflict, true);
});
