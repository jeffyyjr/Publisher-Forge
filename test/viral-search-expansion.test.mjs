import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizedRemixPlan,
  reusableSearchTerms
} from "../server.js";

test("viral footage search broadens specific visual phrases without exploding the request count", () => {
  const terms = reusableSearchTerms([
    "snowy mountain road",
    "RV winter storage",
    "water pipe insulation",
    "freezing campground"
  ]);

  assert.ok(terms.length > 4);
  assert.ok(terms.length <= 12);
  assert.equal(new Set(terms).size, terms.length);
  assert.ok(terms.includes("snowy mountain road"));
  assert.ok(terms.some((term) => term === "snowy mountain" || term === "mountain road"));
});

test("normalized viral remix plan keeps ten search terms for a larger rights-safe source pool", () => {
  const plan = normalizedRemixPlan({
    trendTitle: "Winter prep",
    narration: "A practical original narration about preparing equipment for winter.",
    searchTerms: Array.from({ length: 10 }, (_, index) => "visual term " + (index + 1)),
    scenes: Array.from({ length: 6 }, (_, index) => ({
      searchTerm: "scene visual " + (index + 1),
      narration: "Scene narration " + (index + 1),
      onScreenText: "Scene " + (index + 1)
    }))
  }, 45);

  assert.equal(plan.searchTerms.length, 10);
  assert.equal(plan.scenes.length, 6);
});
