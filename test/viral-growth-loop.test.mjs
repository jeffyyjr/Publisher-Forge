import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const launchHtml = readFileSync(new URL("../launch.html", import.meta.url), "utf8");
const launchJs = readFileSync(new URL("../launch.js", import.meta.url), "utf8");
const dashboardStart = readFileSync(new URL("../dashboard-start.mjs", import.meta.url), "utf8");

test("Viral Remix exposes safe one-tap starter topics without auto-running a scan", () => {
  for (const topic of [
    "Crazy weather phenomena",
    "Deep ocean discoveries",
    "Space mysteries",
    "Weird animal behavior"
  ]) {
    assert.match(indexHtml, new RegExp(`data-viral-topic="${topic}"`));
  }
  assert.match(indexHtml, /Starter buttons only fill the topic/);
  assert.match(indexHtml, /button\.addEventListener\("click"/);
});

test("topic deep links prefill Viral Remix and launch page passes shared topics through", () => {
  assert.match(indexHtml, /initialParams\.get\("topic"\)/);
  assert.match(indexHtml, /requestedInitialView === "viral"/);
  assert.match(launchJs, /sharedTopic/);
  assert.match(launchJs, /target\.searchParams\.set\("topic", sharedTopic\)/);
  assert.match(launchHtml, /view=viral&topic=Crazy%20weather%20phenomena/);
});

test("a successful Viral Remix render unlocks the measured creator share loop", () => {
  assert.match(indexHtml, /id="viralShareButton"/);
  assert.match(indexHtml, /viralShareButton\.disabled = false/);
  assert.match(indexHtml, /navigator\.share/);
  assert.match(indexHtml, /utm_source", "viral_share"/);
  assert.match(indexHtml, /trackViralLaunchEvent\("viral_scan_complete"\)/);
  assert.match(indexHtml, /trackViralLaunchEvent\("viral_render_complete"\)/);
  assert.match(indexHtml, /trackViralLaunchEvent\("viral_share"\)/);
  assert.match(dashboardStart, /"viral_scan_complete"/);
  assert.match(dashboardStart, /"viral_render_complete"/);
  assert.match(dashboardStart, /"viral_share"/);
});
