import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAcceptedRisks,
  npmAuditFindings,
  normalizeSarif,
  normalizeZap
} from "../scripts/security-gate.mjs";
import {
  privateAddress,
  validateSecurityTarget
} from "../scripts/validate-security-target.mjs";

test("npm audit findings normalize package risk and remediation", () => {
  const findings = npmAuditFindings({
    vulnerabilities: {
      example: {
        severity: "high",
        isDirect: false,
        range: "<2.0.0",
        via: [{
          source: 123,
          title: "Example advisory",
          severity: "high",
          url: "https://github.com/advisories/example"
        }],
        fixAvailable: { name: "example", version: "2.0.0", isSemVerMajor: false }
      }
    }
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].remediation, /2\.0\.0/);
});

test("SARIF security scores and redacted secret findings normalize", () => {
  const codeql = normalizeSarif({
    runs: [{
      tool: { driver: {
        name: "CodeQL",
        rules: [{
          id: "js/example",
          shortDescription: { text: "Example data flow" },
          properties: { "security-severity": "8.1" }
        }]
      } },
      results: [{
        ruleId: "js/example",
        level: "warning",
        message: { text: "Untrusted data reaches a sink" },
        locations: [{ physicalLocation: {
          artifactLocation: { uri: "server.js" },
          region: { startLine: 42 }
        } }]
      }]
    }]
  });
  const secrets = normalizeSarif({
    runs: [{
      tool: { driver: { name: "gitleaks", rules: [] } },
      results: [{
        ruleId: "generic-api-key",
        level: "error",
        message: { text: "sk-example-should-not-survive" },
        locations: [{ physicalLocation: {
          artifactLocation: { uri: "fixture.txt" },
          region: { startLine: 3 }
        } }]
      }]
    }]
  });

  assert.equal(codeql[0].severity, "high");
  assert.equal(codeql[0].location, "server.js:42");
  assert.equal(secrets[0].severity, "high");
  assert.doesNotMatch(secrets[0].evidence, /sk-example/);
});

test("ZAP policy promotes required browser controls to high severity", () => {
  const findings = normalizeZap({
    site: [{
      "@name": "https://staging.example.com",
      alerts: [{
        pluginid: "10038",
        riskcode: "2",
        name: "Content Security Policy Header Not Set",
        desc: "Header missing",
        instances: [{ uri: "https://staging.example.com/?private=value" }]
      }]
    }]
  }, { staging: { zapPromoteRules: ["10038"] } });

  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].location, "https://staging.example.com/");
});

test("risk exceptions expire and cannot waive critical findings", () => {
  const finding = {
    id: "scanner:one",
    severity: "critical"
  };
  const result = applyAcceptedRisks([finding], {
    acceptedRisks: [{
      id: "scanner:one",
      approvedBy: "owner",
      reason: "temporary",
      expiresAt: "2099-01-01T00:00:00.000Z"
    }]
  }, { allowCriticalExceptions: false }, new Date("2026-01-01T00:00:00.000Z"));

  assert.equal(result.findings[0].acceptedRisk, undefined);
});

test("staging target validation requires exact allowlisting and denies production", () => {
  const policy = {
    staging: { productionOrigins: ["https://publisher-forge.onrender.com"] }
  };
  const valid = validateSecurityTarget({
    target: "https://publisher-forge-staging.onrender.com",
    allowedTargets: "https://publisher-forge-staging.onrender.com",
    policy
  });

  assert.equal(valid.hostname, "publisher-forge-staging.onrender.com");
  assert.throws(() => validateSecurityTarget({
    target: "https://publisher-forge.onrender.com",
    allowedTargets: "https://publisher-forge.onrender.com",
    policy
  }), /production/);
  assert.throws(() => validateSecurityTarget({
    target: "http://staging.example.com",
    allowedTargets: "http://staging.example.com",
    policy
  }), /HTTPS/);
});

test("private address detection covers loopback and common private ranges", () => {
  assert.equal(privateAddress("127.0.0.1"), true);
  assert.equal(privateAddress("10.2.3.4"), true);
  assert.equal(privateAddress("192.168.1.5"), true);
  assert.equal(privateAddress("::1"), true);
  assert.equal(privateAddress("8.8.8.8"), false);
});
