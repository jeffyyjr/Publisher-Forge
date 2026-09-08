import assert from "node:assert/strict";
import test from "node:test";

import {
  comparableUrl,
  moneyScore,
  safeHttpsUrl,
  verifiedOpportunityUrl
} from "../start.mjs";

test("moneyScore rewards pay potential, fit, and confidence while penalizing effort", () => {
  const strong = moneyScore({
    incomePotential: 90,
    fit: 85,
    confidence: 90,
    applicationEffort: 20
  });
  const weak = moneyScore({
    incomePotential: 40,
    fit: 50,
    confidence: 45,
    applicationEffort: 80
  });

  assert.equal(strong, 85);
  assert.equal(weak, 33);
  assert.ok(strong > weak);
});

test("safeHttpsUrl rejects non-HTTPS destinations", () => {
  assert.equal(safeHttpsUrl("http://example.com/job"), "");
  assert.equal(safeHttpsUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpsUrl("not-a-url"), "");
  assert.equal(
    safeHttpsUrl("https://example.com/job?id=1"),
    "https://example.com/job?id=1"
  );
});

test("comparableUrl ignores query strings and trailing slashes", () => {
  assert.equal(
    comparableUrl("https://EXAMPLE.com/jobs/123/?utm_source=test"),
    "https://example.com/jobs/123"
  );
});

test("verifiedOpportunityUrl only accepts a URL backed by collected sources", () => {
  const sources = [
    {
      title: "Example job",
      url: "https://jobs.example.com/openings/123?source=search"
    }
  ];

  assert.equal(
    verifiedOpportunityUrl(
      "https://jobs.example.com/openings/123?utm_campaign=agent",
      sources
    ),
    "https://jobs.example.com/openings/123?source=search"
  );
  assert.equal(
    verifiedOpportunityUrl("https://jobs.example.com/openings/999", sources),
    ""
  );
});
