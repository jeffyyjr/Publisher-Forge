import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  app,
  createFixedWindowLimiter,
  inlineScriptSources
} from "../server.js";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = "http://127.0.0.1:" + address.port;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("the browser application script parses", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const scripts = inlineScriptSources(html);

  assert.ok(scripts.length > 0);
  for (const source of scripts) new Function(source);
});

test("root responses carry the required browser security headers", async () => {
  const response = await fetch(baseUrl + "/", {
    headers: { "X-Forwarded-Proto": "https" }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);
  assert.doesNotMatch(
    response.headers.get("content-security-policy"),
    /script-src[^;]*'unsafe-inline'/
  );
  assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(response.headers.get("cache-control"), "no-store");

  const explicitIndex = await fetch(baseUrl + "/index.html");
  assert.equal(explicitIndex.status, 200);
});

test("server and repository files are not publicly served", async () => {
  for (const pathname of ["/server.js", "/package.json", "/package-lock.json", "/.env"]) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 404, pathname + " must remain private");
  }
});

test("cross-origin preflight receives no access grant", async () => {
  const response = await fetch(baseUrl + "/api/health", {
    method: "OPTIONS",
    headers: {
      Origin: "https://attacker.invalid",
      "Access-Control-Request-Method": "GET"
    }
  });

  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("API write routes require JSON and reject malformed bodies", async () => {
  const unsupported = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "title=test"
  });
  assert.equal(unsupported.status, 415);

  const malformed = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(malformed.status, 400);

  const compressed = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip"
    },
    body: "not-compressed"
  });
  assert.equal(compressed.status, 415);
});

test("ordinary API routes reject payloads above one megabyte", async () => {
  const response = await fetch(baseUrl + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "x".repeat(1_100_000) })
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error, "Request is too large");
});

test("artwork-bearing publishing routes retain their bounded large-payload path", async () => {
  const response = await fetch(baseUrl + "/api/kdp-pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      package: {
        platform: "Shopify",
        ignoredArtworkFixture: "x".repeat(1_100_000)
      }
    })
  });

  assert.equal(response.status, 400);
});

test("health reports Security Gate without exposing configuration values", async () => {
  const response = await fetch(baseUrl + "/api/health");
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.version, "0.21.0");
  assert.equal(body.securityGateAvailable, true);
  assert.doesNotMatch(serialized, /api[_-]?key|secret|token/i);
});

test("fixed-window limiter stops excess requests and can be reset", () => {
  const limiter = createFixedWindowLimiter({
    max: 2,
    windowMs: 60_000,
    error: "Limited",
    message: "Try later"
  });
  const request = { ip: "203.0.113.7" };
  let nextCalls = 0;

  function response() {
    return {
      headers: {},
      statusCode: 200,
      body: null,
      set(name, value) {
        if (typeof name === "object") Object.assign(this.headers, name);
        else this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };
  }

  limiter(request, response(), () => { nextCalls += 1; });
  limiter(request, response(), () => { nextCalls += 1; });
  const blocked = response();
  limiter(request, blocked, () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, "Limited");
  assert.ok(blocked.headers["Retry-After"]);

  limiter.reset();
  limiter(request, response(), () => { nextCalls += 1; });
  assert.equal(nextCalls, 3);
});
