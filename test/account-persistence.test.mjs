import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "../dashboard-start.mjs";
import { app } from "../server.js";

app.post("/__test/quota/:feature", (req, res) => {
  const quota = app.locals.publisherForgeQuota;
  if (!quota) return res.status(500).json({ error: "Quota system missing" });
  if (!quota.consume(req, res, req.params.feature)) return;
  res.json({ ok: true });
});

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
  assert.match(html, /id="quotaGrid"/);
  assert.match(html, /id="growthDashboardLink"/);
  assert.equal(sync.status, 200);
  assert.match(sync.headers.get("content-type") || "", /javascript/);
  assert.equal(badge.status, 200);
  assert.match(badge.headers.get("content-type") || "", /javascript/);
  assert.match(appHtml, /id="accountLink"/);
  assert.match(appHtml, /\/account-sync\.js/);
  assert.match(appHtml, /\/account-badge\.js/);
  assert.match(appHtml, /id="guestCta"/);
  assert.match(appHtml, /first live Trend Radar scan is free/i);
});

test("anonymous visitors get one Trend Radar demo before signup", async () => {
  const first = await fetch(baseUrl + "/__test/quota/trendRadar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  const visitorCookie = (first.headers.get("set-cookie") || "").split(";")[0];
  assert.equal(first.status, 200);
  assert.match(visitorCookie, /pf_visit=/);

  const second = await fetch(baseUrl + "/__test/quota/trendRadar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: visitorCookie },
    body: "{}"
  });
  const secondBody = await second.json();
  assert.equal(second.status, 401);
  assert.equal(secondBody.code, "GUEST_DEMO_USED");
  assert.match(secondBody.message, /create a free account/i);

  const protectedFeature = await fetch(baseUrl + "/__test/quota/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: visitorCookie },
    body: "{}"
  });
  assert.equal(protectedFeature.status, 401);
});

test("account registration creates a session and versioned state", async () => {
  const email = `forge-${Date.now()}@example.com`;
  const launch = await fetch(baseUrl + "/api/launch-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "page_view",
      source: "tiktok",
      campaign: "beta_feeler",
      content: "test_angle",
      path: "/launch"
    })
  });
  const visitorCookie = (launch.headers.get("set-cookie") || "").split(";")[0];
  assert.equal(launch.status, 204);
  assert.match(visitorCookie, /pf_visit=/);

  const register = await fetch(baseUrl + "/api/account/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: visitorCookie },
    body: JSON.stringify({ email, password: "strong-test-password" })
  });
  const registered = await register.json();
  const sessionSetCookie = register.headers.get("set-cookie");
  const sessionCookie = (sessionSetCookie || "").split(";")[0];
  const cookie = [visitorCookie, sessionCookie].filter(Boolean).join("; ");

  assert.equal(register.status, 201);
  assert.equal(registered.user.email, email);
  assert.match(sessionSetCookie || "", /pf_session=/);
  assert.match(sessionSetCookie || "", /HttpOnly/);
  assert.match(sessionSetCookie || "", /SameSite=Lax/);

  const limitsResponse = await fetch(baseUrl + "/api/account/limits", {
    headers: { Cookie: cookie }
  });
  const limits = await limitsResponse.json();
  assert.equal(limitsResponse.status, 200);
  assert.equal(limits.admin, false);
  assert.equal(limits.timezone, "America/New_York");
  assert.equal(limits.limits.trendRadar.limit, 3);
  assert.equal(limits.limits.viralScout.limit, 2);
  assert.equal(limits.limits.viralRender.limit, 1);
  assert.equal(limits.limits.productBuild.limit, 1);

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

  for (let i = 0; i < 3; i += 1) {
    const use = await fetch(baseUrl + "/__test/quota/trendRadar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}"
    });
    assert.equal(use.status, 200);
  }

  const blocked = await fetch(baseUrl + "/__test/quota/trendRadar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{}"
  });
  const blockedBody = await blocked.json();
  assert.equal(blocked.status, 429);
  assert.equal(blockedBody.code, "DAILY_LIMIT");
  assert.equal(blockedBody.feature, "trendRadar");
  assert.match(blockedBody.message, /resets at midnight/i);

  const updatedLimits = await fetch(baseUrl + "/api/account/limits", {
    headers: { Cookie: cookie }
  }).then((response) => response.json());
  assert.equal(updatedLimits.limits.trendRadar.used, 3);
  assert.equal(updatedLimits.limits.trendRadar.remaining, 0);

  const deniedGrowth = await fetch(baseUrl + "/api/admin/growth?days=30", {
    headers: { Cookie: cookie }
  });
  assert.equal(deniedGrowth.status, 403);

  process.env.PF_ADMIN_EMAILS = email;
  try {
    const growthResponse = await fetch(baseUrl + "/api/admin/growth?days=30", {
      headers: { Cookie: cookie }
    });
    const growth = await growthResponse.json();
    assert.equal(growthResponse.status, 200);
    assert.equal(growth.totals.visitors, 1);
    assert.equal(growth.totals.signups, 1);
    assert.equal(growth.totals.demoStarts, 1);
    assert.equal(growth.totals.demoCompletions, 1);
    assert.equal(growth.totals.demoCompletionRate, 100);
    assert.equal(growth.totals.featureUses, 3);
    assert.equal(growth.sources[0].source, "tiktok");
    assert.equal(growth.sources[0].campaign, "beta_feeler");
    assert.equal(growth.sources[0].content, "test_angle");
    assert.equal(growth.sources[0].signups, 1);
    assert.equal(growth.sources[0].featureUses, 3);

    const growthPage = await fetch(baseUrl + "/admin/growth", {
      headers: { Cookie: cookie },
      redirect: "manual"
    });
    assert.equal(growthPage.status, 200);
    assert.match(await growthPage.text(), /Growth Dashboard/);
  } finally {
    delete process.env.PF_ADMIN_EMAILS;
  }
});
