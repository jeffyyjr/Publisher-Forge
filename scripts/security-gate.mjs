import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "..");
const severityOrder = ["info", "low", "medium", "high", "critical"];

function clean(value, limit = 700) {
  return String(value || "")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/g, "[REDACTED]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizedSeverity(value) {
  const severity = String(value || "").toLowerCase();
  return severityOrder.includes(severity) ? severity : "medium";
}

function shortHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function parseArguments(argv) {
  const options = {
    auditFile: "",
    report: path.join(repositoryRoot, "security-artifacts/security-report.json"),
    sarifDirs: [],
    sarifFiles: [],
    skipAudit: false,
    skipTests: false,
    zapFiles: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      index += 1;
      if (!argv[index]) throw new Error(argument + " requires a path.");
      return path.resolve(repositoryRoot, argv[index]);
    };

    if (argument === "--audit-file") options.auditFile = next();
    else if (argument === "--report") options.report = next();
    else if (argument === "--sarif") options.sarifFiles.push(next());
    else if (argument === "--sarif-dir") options.sarifDirs.push(next());
    else if (argument === "--zap") options.zapFiles.push(next());
    else if (argument === "--skip-audit") options.skipAudit = true;
    else if (argument === "--skip-tests") options.skipTests = true;
    else throw new Error("Unknown Security Gate option: " + argument);
  }

  return options;
}

function runCommand(command, args, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...(extra.env || {}) },
      shell: false
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let stoppedForSize = false;
    const maxBytes = 8 * 1024 * 1024;

    function collect(chunks) {
      return (chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > maxBytes) {
          stoppedForSize = true;
          child.kill("SIGTERM");
          return;
        }
        chunks.push(chunk);
      };
    }

    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => resolve({
      code: -1,
      stdout: "",
      stderr: error.message,
      stoppedForSize
    }));
    child.on("close", (code) => resolve({
      code: stoppedForSize ? -1 : (code ?? -1),
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      stoppedForSize
    }));
  });
}

function npmAuditFindings(document) {
  const findings = [];

  for (const [packageName, vulnerability] of Object.entries(
    document?.vulnerabilities || {}
  )) {
    const advisories = Array.isArray(vulnerability.via)
      ? vulnerability.via.filter((item) => item && typeof item === "object")
      : [];
    const records = advisories.length ? advisories : [vulnerability];

    for (const advisory of records) {
      const severity = normalizedSeverity(
        advisory.severity || vulnerability.severity
      );
      const source = advisory.source || advisory.url || vulnerability.range || severity;
      const fix = vulnerability.fixAvailable;
      const fixText = fix === true
        ? "Upgrade to the patched dependency version reported by npm audit."
        : fix && typeof fix === "object"
          ? "Upgrade " + clean(fix.name || packageName, 120) + " to " +
            clean(fix.version || "the patched release", 80) +
            (fix.isSemVerMajor ? " after reviewing the major-version changes." : ".")
          : "Replace, upgrade, or remove the vulnerable dependency before release.";

      findings.push({
        id: "npm:" + packageName + ":" + shortHash(source),
        scanner: "npm-audit",
        severity,
        title: clean(advisory.title || ("Vulnerable dependency: " + packageName), 240),
        location: "package-lock.json (" + clean(packageName, 140) + ")",
        evidence: clean(
          "Affected range " + (vulnerability.range || "reported by npm") +
          (vulnerability.isDirect ? "; direct dependency" : "; transitive dependency"),
          400
        ),
        remediation: fixText,
        reference: /^https:\/\//.test(advisory.url || "") ? advisory.url : null
      });
    }
  }

  return findings;
}

function sarifSeverity(result, rule, toolName) {
  const score = Number(
    result?.properties?.["security-severity"] ??
    rule?.properties?.["security-severity"]
  );

  if (Number.isFinite(score)) {
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    if (score > 0) return "low";
  }

  if (/gitleaks/i.test(toolName)) return "high";
  if (result?.level === "error") return "high";
  if (result?.level === "warning") return "medium";
  return "low";
}

function normalizeSarif(document, sourceName = "SARIF") {
  const findings = [];

  for (const run of document?.runs || []) {
    const driver = run?.tool?.driver || {};
    const toolName = clean(driver.name || sourceName, 100);
    const rules = new Map((driver.rules || []).map((rule) => [rule.id, rule]));

    for (const result of run.results || []) {
      const rule = rules.get(result.ruleId) || {};
      const physical = result.locations?.[0]?.physicalLocation || {};
      const uri = clean(physical.artifactLocation?.uri || "repository", 260);
      const line = Number(physical.region?.startLine);
      const location = uri + (Number.isFinite(line) ? ":" + line : "");
      const message = clean(result.message?.text || result.message?.markdown, 600);
      const fingerprint = Object.values(result.partialFingerprints || {})[0] ||
        Object.values(result.fingerprints || {})[0] || location;
      const ruleTitle = rule.shortDescription?.text || rule.name ||
        result.ruleId || "Scanner finding";
      const secretFinding = /gitleaks/i.test(toolName);

      findings.push({
        id: clean(toolName, 50).toLowerCase().replace(/[^a-z0-9]+/g, "-") +
          ":" + clean(result.ruleId || "finding", 100) + ":" +
          shortHash(fingerprint),
        scanner: toolName,
        severity: sarifSeverity(result, rule, toolName),
        title: clean(ruleTitle, 240),
        location,
        evidence: secretFinding
          ? "A credential-like value was detected. Matched content is intentionally redacted."
          : message,
        remediation: secretFinding
          ? "Revoke and rotate the credential, remove it from code and Git history, and store the replacement in encrypted secret storage."
          : "Review the reported data flow, apply the scanner guidance, and add a regression test before release.",
        reference: /^https:\/\//.test(rule.helpUri || "") ? rule.helpUri : null
      });
    }
  }

  return findings;
}

function withoutMarkup(value) {
  return clean(String(value || "").replace(/<[^>]*>/g, " "), 700);
}

function safeReportedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.origin + parsed.pathname;
  } catch (error) {
    return "staging target";
  }
}

function normalizeZap(document, policy) {
  const findings = [];
  const promoted = new Set(policy?.staging?.zapPromoteRules || []);
  const riskMap = { "0": "info", "1": "low", "2": "medium", "3": "high" };
  const sites = Array.isArray(document?.site) ? document.site : [];

  for (const site of sites) {
    for (const alert of site.alerts || []) {
      const ruleId = String(alert.pluginid || alert.alertRef || "unknown");
      const firstUri = alert.instances?.[0]?.uri || site["@name"] || "";
      const severity = promoted.has(ruleId)
        ? "high"
        : (riskMap[String(alert.riskcode)] || "medium");

      findings.push({
        id: "zap:" + ruleId + ":" + shortHash(firstUri),
        scanner: "OWASP ZAP Baseline",
        severity,
        title: withoutMarkup(alert.name || alert.alert || ("ZAP rule " + ruleId)),
        location: safeReportedUrl(firstUri),
        evidence: withoutMarkup(alert.desc || alert.riskdesc || "Passive scan alert"),
        remediation: withoutMarkup(
          alert.solution || "Apply the recommended response hardening and rerun the passive baseline."
        ),
        reference: /^https:\/\//.test(alert.reference || "")
          ? String(alert.reference).split(/\s+/)[0]
          : null
      });
    }
  }

  return findings;
}

async function filesBelow(directory, extension) {
  const found = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const item = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(item);
      else if (entry.isFile() && entry.name.endsWith(extension)) found.push(item);
    }
  }

  await walk(directory);
  return found.slice(0, 50);
}

async function readJson(file, maxBytes = 20 * 1024 * 1024) {
  const contents = await fs.readFile(file);
  if (contents.byteLength > maxBytes) {
    throw new Error(path.basename(file) + " is too large to normalize.");
  }
  return JSON.parse(contents.toString("utf8"));
}

function applyAcceptedRisks(findings, acceptedDocument, policy, now = new Date()) {
  const accepted = Array.isArray(acceptedDocument?.acceptedRisks)
    ? acceptedDocument.acceptedRisks
    : [];
  const invalid = [];
  const valid = new Map();

  for (const item of accepted) {
    const expires = new Date(item?.expiresAt || "");
    if (!item?.id || !item?.approvedBy || !item?.reason ||
        Number.isNaN(expires.getTime()) || expires <= now) {
      invalid.push(clean(item?.id || "unnamed-exception", 160));
      continue;
    }
    valid.set(item.id, item);
  }

  const annotated = findings.map((finding) => {
    const exception = valid.get(finding.id);
    const canAccept = exception &&
      (finding.severity !== "critical" || policy.allowCriticalExceptions);

    return canAccept
      ? {
          ...finding,
          acceptedRisk: {
            approvedBy: clean(exception.approvedBy, 120),
            expiresAt: new Date(exception.expiresAt).toISOString(),
            reason: clean(exception.reason, 500)
          }
        }
      : finding;
  });

  return { findings: annotated, invalid };
}

function summaryFor(findings) {
  const summary = Object.fromEntries(severityOrder.map((item) => [item, 0]));
  for (const finding of findings) summary[finding.severity] += 1;
  return summary;
}

function fixPlan(report) {
  const actionable = report.findings
    .filter((item) => !item.acceptedRisk)
    .sort((a, b) => severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity));
  const lines = [
    "# Publisher Forge Security Fix Plan",
    "",
    "Decision: **" + report.decision + "**",
    "Generated: " + report.generatedAt,
    "Commit: " + report.commit,
    ""
  ];

  if (!actionable.length) {
    lines.push("No unaccepted scanner findings remain.");
  } else {
    for (const finding of actionable) {
      lines.push(
        "## " + finding.severity.toUpperCase() + " — " + finding.title,
        "",
        "- ID: `" + finding.id + "`",
        "- Scanner: " + finding.scanner,
        "- Location: " + finding.location,
        "- Evidence: " + finding.evidence,
        "- Fix: " + finding.remediation,
        finding.reference ? "- Guidance: " + finding.reference : "",
        ""
      );
    }
  }

  lines.push(
    "## Retest",
    "",
    "Apply fixes on a branch, rerun Security Gate, and require a passing report before merge."
  );
  return lines.join("\n") + "\n";
}

async function buildReport(options) {
  const policy = await readJson(path.join(repositoryRoot, "security/policy.json"));
  const acceptedDocument = await readJson(
    path.join(repositoryRoot, "security/accepted-risks.json")
  );
  const findings = [];
  const scanners = [];
  const scannerErrors = [];

  if (!options.skipTests) {
    const syntax = await runCommand(process.execPath, ["--check", "server.js"]);
    scanners.push({
      name: "Node syntax",
      status: syntax.code === 0 ? "passed" : "failed"
    });
    if (syntax.code !== 0) {
      findings.push({
        id: "policy:server-syntax",
        scanner: "Node syntax",
        severity: "high",
        title: "Server source does not parse",
        location: "server.js",
        evidence: clean(syntax.stderr || syntax.stdout || "Syntax check failed."),
        remediation: "Correct the syntax error and rerun the complete gate.",
        reference: null
      });
    }

    const tests = await runCommand(process.execPath, ["--test"], {
      env: { NODE_ENV: "test" }
    });
    scanners.push({
      name: "Runtime security contract",
      status: tests.code === 0 ? "passed" : "failed"
    });
    if (tests.code !== 0) {
      findings.push({
        id: "policy:runtime-contract",
        scanner: "Node test runner",
        severity: "high",
        title: "Runtime security contract failed",
        location: "test/",
        evidence: clean(tests.stderr || tests.stdout || "Security tests failed."),
        remediation: "Restore the failing security control and add or update its regression test.",
        reference: null
      });
    }
  }

  if (!options.skipAudit) {
    let auditDocument;
    try {
      if (options.auditFile) {
        auditDocument = await readJson(options.auditFile);
      } else {
        const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
        const audit = await runCommand(npmCommand, ["audit", "--omit=dev", "--json"]);
        auditDocument = JSON.parse(audit.stdout || "{}");
        if (audit.code < 0 || audit.code > 1 || auditDocument.error) {
          throw new Error(clean(
            auditDocument.error?.summary || audit.stderr || "npm audit failed"
          ));
        }
      }

      const auditFindings = npmAuditFindings(auditDocument);
      findings.push(...auditFindings);
      scanners.push({
        name: "npm audit",
        status: auditFindings.length ? "findings" : "passed",
        findingCount: auditFindings.length
      });
    } catch (error) {
      scannerErrors.push("npm audit: " + clean(error.message));
      scanners.push({ name: "npm audit", status: "error" });
    }
  }

  const sarifFiles = [...options.sarifFiles];
  for (const directory of options.sarifDirs) {
    try {
      sarifFiles.push(...await filesBelow(directory, ".sarif"));
    } catch (error) {
      scannerErrors.push("SARIF directory: " + clean(error.message));
    }
  }

  for (const file of [...new Set(sarifFiles)]) {
    try {
      const sarifFindings = normalizeSarif(await readJson(file), path.basename(file));
      findings.push(...sarifFindings);
      scanners.push({
        name: "SARIF: " + path.basename(file),
        status: sarifFindings.length ? "findings" : "passed",
        findingCount: sarifFindings.length
      });
    } catch (error) {
      scannerErrors.push(path.basename(file) + ": " + clean(error.message));
      scanners.push({ name: "SARIF: " + path.basename(file), status: "error" });
    }
  }

  for (const file of options.zapFiles) {
    try {
      const zapFindings = normalizeZap(await readJson(file), policy);
      findings.push(...zapFindings);
      scanners.push({
        name: "OWASP ZAP Baseline",
        status: zapFindings.length ? "findings" : "passed",
        findingCount: zapFindings.length
      });
    } catch (error) {
      scannerErrors.push("OWASP ZAP: " + clean(error.message));
      scanners.push({ name: "OWASP ZAP Baseline", status: "error" });
    }
  }

  if (options.zapFiles.length && process.env.SECURITY_ZAP_EXIT_CODE) {
    const zapExitCode = Number(process.env.SECURITY_ZAP_EXIT_CODE);
    const validExitCode = Number.isInteger(zapExitCode) &&
      [0, 1, 2].includes(zapExitCode);

    if (!validExitCode) {
      scannerErrors.push(
        "OWASP ZAP: scanner execution failed with exit code " +
        clean(process.env.SECURITY_ZAP_EXIT_CODE, 20)
      );
    } else if (zapExitCode === 1 && !findings.some((item) =>
      item.scanner === "OWASP ZAP Baseline" &&
      policy.blockSeverities.includes(item.severity)
    )) {
      scannerErrors.push(
        "OWASP ZAP: policy failure was not represented by a blocking normalized finding"
      );
    }
  }

  const unique = [...new Map(findings.map((item) => [item.id, item])).values()];
  const acceptance = applyAcceptedRisks(unique, acceptedDocument, policy);
  const blocking = acceptance.findings.filter((item) =>
    !item.acceptedRisk && policy.blockSeverities.includes(item.severity)
  );
  const blocked = blocking.length > 0 || acceptance.invalid.length > 0 ||
    (policy.failClosedOnScannerError && scannerErrors.length > 0);
  const commitResult = await runCommand("git", ["rev-parse", "HEAD"]);
  const commit = clean(process.env.GITHUB_SHA || commitResult.stdout || "unknown", 64);

  return {
    schemaVersion: 1,
    agent: "Publisher Forge Security Gate",
    gateVersion: policy.gateVersion,
    generatedAt: new Date().toISOString(),
    commit,
    decision: blocked ? "BLOCKED" : "PASS",
    releaseEligible: !blocked,
    policy: {
      blockSeverities: policy.blockSeverities,
      failClosedOnScannerError: policy.failClosedOnScannerError,
      criticalExceptionsAllowed: policy.allowCriticalExceptions
    },
    summary: summaryFor(acceptance.findings),
    blockingFindingIds: blocking.map((item) => item.id),
    invalidAcceptedRisks: acceptance.invalid,
    scannerErrors,
    scanners,
    findings: acceptance.findings
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await buildReport(options);
  const reportDirectory = path.dirname(options.report);

  await fs.mkdir(reportDirectory, { recursive: true });
  await fs.writeFile(options.report, JSON.stringify(report, null, 2) + "\n", "utf8");
  await fs.writeFile(
    path.join(reportDirectory, "fix-plan.md"),
    fixPlan(report),
    "utf8"
  );

  console.log("Security Gate: " + report.decision);
  console.log(
    "Findings — critical " + report.summary.critical +
    ", high " + report.summary.high +
    ", medium " + report.summary.medium +
    ", low " + report.summary.low
  );
  console.log("Normalized report: " + path.relative(repositoryRoot, options.report));

  if (!report.releaseEligible) process.exitCode = 1;
}

const isEntrypoint = process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isEntrypoint) {
  main().catch((error) => {
    console.error("Security Gate failed closed: " + clean(error.message));
    process.exitCode = 1;
  });
}

export {
  applyAcceptedRisks,
  buildReport,
  npmAuditFindings,
  normalizeSarif,
  normalizeZap,
  parseArguments
};
