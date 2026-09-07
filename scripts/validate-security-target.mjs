import { promises as dns } from "node:dns";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, "..");

function origin(value, label) {
  let parsed;

  try {
    parsed = new URL(String(value || "").trim());
  } catch (error) {
    throw new Error(label + " must be a complete URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error(label + " must use HTTPS.");
  }

  if (parsed.username || parsed.password) {
    throw new Error(label + " cannot contain credentials.");
  }

  if (parsed.port && parsed.port !== "443") {
    throw new Error(label + " must use the standard HTTPS port.");
  }

  if (parsed.search || parsed.hash) {
    throw new Error(label + " cannot contain a query string or fragment.");
  }

  if (parsed.pathname !== "/") {
    throw new Error(label + " must point to the staging origin root.");
  }

  return parsed.origin;
}

function privateIpv4(address) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;

  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function privateAddress(address) {
  const type = net.isIP(address);

  if (type === 4) return privateIpv4(address);
  if (type !== 6) return true;

  const normalized = address.toLowerCase();
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mapped) return privateIpv4(mapped[1]);

  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized);
}

function validateSecurityTarget({ target, allowedTargets, policy }) {
  const targetOrigin = origin(target, "SECURITY_STAGING_URL");
  const allowed = String(allowedTargets || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => origin(item, "SECURITY_ALLOWED_TARGETS entry"));

  if (!allowed.length) {
    throw new Error("SECURITY_ALLOWED_TARGETS must contain an exact authorized origin.");
  }

  if (!allowed.includes(targetOrigin)) {
    throw new Error("The staging target is not in SECURITY_ALLOWED_TARGETS.");
  }

  const production = (policy?.staging?.productionOrigins || [])
    .map((item) => origin(item, "Production denylist entry"));

  if (production.includes(targetOrigin)) {
    throw new Error("Security Gate refuses to scan a production origin.");
  }

  const hostname = new URL(targetOrigin).hostname.toLowerCase();

  if (hostname === "localhost" || hostname.endsWith(".local") ||
      (net.isIP(hostname) && privateAddress(hostname))) {
    throw new Error("Security Gate refuses local or private-network targets.");
  }

  return { targetOrigin, hostname };
}

async function validateResolvedAddresses(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length) {
    throw new Error("The staging hostname did not resolve.");
  }

  if (addresses.some((item) => privateAddress(item.address))) {
    throw new Error("The staging hostname resolved to a private-network address.");
  }
}

async function main() {
  const policy = JSON.parse(
    await fs.readFile(path.join(repositoryRoot, "security/policy.json"), "utf8")
  );
  const validated = validateSecurityTarget({
    target: process.env.SECURITY_STAGING_URL,
    allowedTargets: process.env.SECURITY_ALLOWED_TARGETS,
    policy
  });

  await validateResolvedAddresses(validated.hostname);
  console.log("Security target authorized: " + validated.targetOrigin);
}

const isEntrypoint = process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isEntrypoint) {
  main().catch((error) => {
    console.error("Security target rejected: " + error.message);
    process.exitCode = 1;
  });
}

export { privateAddress, validateSecurityTarget };
