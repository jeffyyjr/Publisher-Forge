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
  const badge = await fetch(baseUrl + "/account-badge.js");
  const appPage = await fetch(baseUrl + "/");
  const appHtml = await appPage.text();

  assert.equal(page.status, 200);
  assert.match(html, /Publisher Forge — Account/);
  assert.match(html, /Save This Device to Account/);
  assert.match(html, /id="statProjects"/);
  assert.match(html, /id="statProfit"/);
  assert.equal(sync.status, 200);
  assert.match(sync.headers.get("content-type") || "", /javascript/);
  assert.equal(badge.status, 200);
  assert.match(badge.headers.get("content-type") || "", /javascript/);
  assert.match(appHtml, /id="accountLink"/);
  assert.match(appHtml, /\/account-sync\.js/);
  assert.match(appHtml, /\/account-badge\.js/);
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
        revenueTests: [{
          title: "Video test",
          metrics: {
            views: 1200,
            orders: 8,
            grossRevenue: 96.50,
            netProfit: 61.25
          }
        }],
        trendHistory: [{ scannedAt: "2026-09-12T12:00:00Z", platform: "KDP", niche: "RV records", opportunities: [{ title: "RV test" }], sources: [] }],
        opportunities: [{ title: "Opportunity test" }],
        usageStats: { viralScans: 4, viralRenders: 3, viralShares: 2 },
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

  const statsResponse = await fetch(baseUrl + "/api/account/stats", {
    headers: { Cookie: cookie }
  });
  const stats = await statsResponse.json();
  assert.equal(statsResponse.status, 200);
  assert.equal(stats.stats.projects, 1);
  assert.equal(stats.stats.revenueTests, 1);
  assert.equal(stats.stats.trendScans, 1);
  assert.equal(stats.stats.opportunities, 1);
  assert.equal(stats.stats.views, 1200);
  assert.equal(stats.stats.orders, 8);
  assert.equal(stats.stats.grossRevenue, 96.5);
  assert.equal(stats.stats.netProfit, 61.25);
  assert.equal(stats.stats.viralScans, 4);
  assert.equal(stats.stats.viralRenders, 3);
  assert.equal(stats.stats.viralShares, 2);

  const stale = await fetch(baseUrl + "/api/account/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ baseRevision: 0, state: {} })
  });
  const conflict = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(conflict.conflict, true);
});
