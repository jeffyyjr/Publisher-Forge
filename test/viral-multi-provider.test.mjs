import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizePixabayVideo,
  reusableSearchTerms
} from "../server.js";

test("Pixabay video normalization preserves provider rights and audit metadata", () => {
  const source = normalizePixabayVideo({
    id: 125,
    pageURL: "https://pixabay.com/videos/id-125/",
    tags: "flowers, yellow, blossom",
    duration: 12,
    views: 4462,
    user_id: 1281706,
    user: "Coverr-Free-Footage",
    videos: {
      medium: {
        url: "https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.mp4",
        width: 1280,
        height: 720,
        size: 3562083,
        thumbnail: "https://cdn.pixabay.com/video/2015/08/08/125-135736646_medium.jpg"
      },
      small: {
        url: "https://cdn.pixabay.com/video/2015/08/08/125-135736646_small.mp4",
        width: 640,
        height: 360,
        size: 1030736,
        thumbnail: "https://cdn.pixabay.com/video/2015/08/08/125-135736646_small.jpg"
      }
    }
  }, "yellow flowers");

  assert.equal(source.providerKey, "pixabay");
  assert.equal(source.sourceKey, "pixabay:125");
  assert.equal(source.license, "Pixabay Content License");
  assert.equal(source.attributionRequired, false);
  assert.equal(source.searchTerm, "yellow flowers");
  assert.match(source.sourceUrl, /^https:\/\/pixabay\.com\//);
  assert.match(source.mediaUrl, /^https:\/\/cdn\.pixabay\.com\//);
});

test("Pixabay normalization rejects untrusted media hosts", () => {
  const source = normalizePixabayVideo({
    id: 999,
    pageURL: "https://pixabay.com/videos/id-999/",
    tags: "safe test",
    duration: 9,
    user_id: 1,
    user: "tester",
    videos: {
      medium: {
        url: "https://evil.example/video.mp4",
        width: 1280,
        height: 720,
        size: 1000,
        thumbnail: "https://evil.example/poster.jpg"
      }
    }
  }, "safe test");

  assert.equal(source, null);
});

test("expanded search still caps derived visual terms", () => {
  const terms = reusableSearchTerms([
    "snowy mountain road",
    "RV winter storage",
    "water pipe insulation",
    "freezing campground",
    "winter tools",
    "camper exterior"
  ]);

  assert.ok(terms.length >= 6);
  assert.ok(terms.length <= 24);
  assert.equal(terms.length, new Set(terms).size);
});
