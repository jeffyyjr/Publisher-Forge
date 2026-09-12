import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import ffmpegPath from "ffmpeg-static";
import { createHash } from "crypto";
import { createWriteStream, readFileSync } from "fs";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const APP_VERSION = "0.22.0";
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.join(__dirname, "index.html");
const INLINE_SCRIPT_HASHES = inlineScriptSources(
  readFileSync(INDEX_PATH, "utf8")
).map((source) =>
  "'sha256-" + createHash("sha256").update(source).digest("base64") + "'"
);
let activeVideoRenders = 0;

function inlineScriptSources(html) {
  const source = String(html || "");
  const scripts = [];
  let offset = 0;

  while (offset < source.length) {
    const open = source.indexOf("<script", offset);
    if (open === -1) break;
    const bodyStart = source.indexOf(">", open);
    const close = bodyStart === -1
      ? -1
      : source.indexOf("</script>", bodyStart + 1);

    if (bodyStart === -1 || close === -1) {
      throw new Error("index.html contains an incomplete script element");
    }

    scripts.push(source.slice(bodyStart + 1, close));
    offset = close + "</script>".length;
  }

  return scripts;
}

const LARGE_JSON_ROUTES = new Set([
  "/api/export-bundle",
  "/api/export-pdf",
  "/api/kdp-cover",
  "/api/kdp-pricing",
  "/api/release-qa"
]);

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://upload.wikimedia.org",
    "media-src 'self' blob: https://upload.wikimedia.org",
    "object-src 'none'",
    "script-src 'self' " + INLINE_SCRIPT_HASHES.join(" "),
    "style-src 'self' 'unsafe-inline'"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none"
});

function createFixedWindowLimiter({
  max,
  windowMs,
  error,
  message,
  maxKeys = 5000
}) {
  const records = new Map();
  let lastSweep = Date.now();

  function sweep(now) {
    if (now - lastSweep < windowMs && records.size < maxKeys) return;

    for (const [key, value] of records) {
      if (now - value.started > windowMs) records.delete(key);
    }

    lastSweep = now;
  }

  const limiter = function fixedWindowLimiter(req, res, next) {
    const key = req.ip || "unknown";
    const now = Date.now();

    sweep(now);

    let current = records.get(key);

    if (!current || now - current.started > windowMs) {
      if (!current && records.size >= maxKeys) {
        res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error, message });
      }

      current = { started: now, count: 0 };
      records.set(key, current);
    }

    const resetSeconds = Math.max(
      1,
      Math.ceil((current.started + windowMs - now) / 1000)
    );

    res.set({
      "RateLimit-Limit": String(max),
      "RateLimit-Remaining": String(Math.max(0, max - current.count - 1)),
      "RateLimit-Reset": String(resetSeconds)
    });

    if (current.count >= max) {
      res.set("Retry-After", String(resetSeconds));
      return res.status(429).json({ error, message });
    }

    current.count += 1;
    next();
  };

  limiter.reset = () => records.clear();
  return limiter;
}

const limitAI = createFixedWindowLimiter({
  max: 15,
  windowMs: 15 * 60 * 1000,
  error: "Too many requests",
  message: "Wait a few minutes and try again."
});

const limitVideoRender = createFixedWindowLimiter({
  max: 3,
  windowMs: 60 * 60 * 1000,
  error: "Hourly video limit reached",
  message: "This beta can render three videos per hour. Try again later."
});

const limitExport = createFixedWindowLimiter({
  max: 8,
  windowMs: 15 * 60 * 1000,
  error: "Export limit reached",
  message: "Wait a few minutes before creating another large export."
});

const trendReportSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          platform: {
            type: "string",
            enum: ["KDP", "Etsy", "Shopify", "Both"]
          },
          audience: { type: "string" },
          evidence: { type: "string" },
          competitionNote: { type: "string" },
          angle: { type: "string" },
          risk: { type: "string" },
          demand: {
            type: "integer",
            description: "Estimated buyer demand from 0 to 100."
          },
          competition: {
            type: "integer",
            description: "Market crowding from 0 to 100, where a higher number means more competition."
          },
          margin: {
            type: "integer",
            description: "Potential profit margin from 0 to 100."
          },
          differentiation: {
            type: "integer",
            description: "Room for a distinct, defensible offer from 0 to 100."
          },
          confidence: {
            type: "integer",
            description: "Confidence in the public evidence from 0 to 100."
          }
        },
        required: [
          "title",
          "platform",
          "audience",
          "evidence",
          "competitionNote",
          "angle",
          "risk",
          "demand",
          "competition",
          "margin",
          "differentiation",
          "confidence"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "opportunities"],
  additionalProperties: false
};

const productionPackageSchema = {
  type: "object",
  properties: {
    packageTitle: { type: "string" },
    subtitle: { type: "string" },
    deliverableType: { type: "string" },
    draftMarkdown: { type: "string" },
    listingTitle: { type: "string" },
    listingDescription: { type: "string" },
    keywords: {
      type: "array",
      items: { type: "string" }
    },
    productionChecklist: {
      type: "array",
      items: { type: "string" }
    },
    riskFlags: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "packageTitle",
    "subtitle",
    "deliverableType",
    "draftMarkdown",
    "listingTitle",
    "listingDescription",
    "keywords",
    "productionChecklist",
    "riskFlags"
  ],
  additionalProperties: false
};

const qualityReviewSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    briefAlignment: { type: "integer" },
    buyerUsefulness: { type: "integer" },
    originalitySafety: { type: "integer" },
    listingQuality: { type: "integer" },
    productionReadiness: { type: "integer" },
    strengths: {
      type: "array",
      items: { type: "string" }
    },
    requiredFixes: {
      type: "array",
      items: { type: "string" }
    },
    blockers: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "summary",
    "briefAlignment",
    "buyerUsefulness",
    "originalitySafety",
    "listingQuality",
    "productionReadiness",
    "strengths",
    "requiredFixes",
    "blockers"
  ],
  additionalProperties: false
};

const revenueReviewSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    verdict: { type: "string", enum: ["SCALE", "ITERATE", "STOP"] },
    diagnosis: { type: "string" },
    nextExperiment: { type: "string" },
    successMetric: { type: "string" },
    stopCondition: { type: "string" },
    actions: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "summary",
    "verdict",
    "diagnosis",
    "nextExperiment",
    "successMetric",
    "stopCondition",
    "actions"
  ],
  additionalProperties: false
};

const viralRemixSchema = {
  type: "object",
  properties: {
    trendTitle: { type: "string" },
    trendSummary: { type: "string" },
    whyNow: { type: "string" },
    audience: { type: "string" },
    hook: { type: "string" },
    narration: { type: "string" },
    postCaption: { type: "string" },
    hashtags: {
      type: "array",
      minItems: 5,
      maxItems: 10,
      items: { type: "string" }
    },
    searchTerms: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: { type: "string" }
    },
    scenes: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          searchTerm: { type: "string" },
          narration: { type: "string" },
          onScreenText: { type: "string" }
        },
        required: ["searchTerm", "narration", "onScreenText"],
        additionalProperties: false
      }
    }
  },
  required: [
    "trendTitle",
    "trendSummary",
    "whyNow",
    "audience",
    "hook",
    "narration",
    "postCaption",
    "hashtags",
    "searchTerms",
    "scenes"
  ],
  additionalProperties: false
};

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.set(SECURITY_HEADERS);

  if (req.secure) {
    res.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
  }

  next();
});

app.use((req, res, next) => {
  if (req.method === "POST" && LARGE_JSON_ROUTES.has(req.path)) {
    return limitExport(req, res, next);
  }

  next();
});

const standardJsonParser = express.json({
  inflate: false,
  limit: "1mb",
  strict: true,
  type: "application/json"
});
const largeJsonParser = express.json({
  inflate: false,
  limit: "80mb",
  strict: true,
  type: "application/json"
});

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH"].includes(req.method) ||
      !req.path.startsWith("/api/")) {
    return next();
  }

  if (!req.is("application/json")) {
    return res.status(415).json({
      error: "JSON request required",
      message: "Send this request with Content-Type application/json."
    });
  }

  return (LARGE_JSON_ROUTES.has(req.path)
    ? largeJsonParser
    : standardJsonParser)(req, res, next);
});

function text(value, limit = 300) {
  return String(value || "").trim().slice(0, limit);
}

function score(value, fallback = 50) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : fallback;
}

function platform(value, allowBoth = false) {
  const allowed = allowBoth
    ? ["KDP", "Etsy", "Shopify", "Both"]
    : ["KDP", "Etsy", "Shopify"];

  return allowed.includes(value)
    ? value
    : allowBoth
      ? "Both"
      : "KDP";
}

function viralPlatform(value) {
  return ["TikTok", "YouTube Shorts", "Both"].includes(value)
    ? value
    : "Both";
}

function revenueChannel(value) {
  return [
    "KDP",
    "Etsy",
    "Shopify",
    "TikTok",
    "YouTube Shorts",
    "Viral Remix"
  ].includes(value)
    ? value
    : "KDP";
}

function viralDuration(value) {
  const seconds = Number(value);
  return [30, 45, 60].includes(seconds) ? seconds : 45;
}

function plainCommonsText(value, limit = 500) {
  return text(
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&quot;|&#34;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " "),
    limit
  );
}

function commonsMetadata(metadata, key, limit = 500) {
  return plainCommonsText(metadata?.[key]?.value, limit);
}

function reusableLicense(value) {
  const raw = plainCommonsText(value, 80);
  const normalized = raw.toUpperCase().replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ").trim();

  if (/\bPUBLIC DOMAIN\b/.test(normalized) || normalized === "PDM") {
    return {
      name: "Public Domain",
      className: "public-domain",
      attributionRequired: false,
      fallbackUrl: "https://creativecommons.org/publicdomain/mark/1.0/"
    };
  }

  if (/\bCC0\b/.test(normalized)) {
    return {
      name: "CC0",
      className: "cc0",
      attributionRequired: false,
      fallbackUrl: "https://creativecommons.org/publicdomain/zero/1.0/"
    };
  }

  if (/^CC BY(?: \d(?:\.\d)?)?$/.test(normalized)) {
    const version = normalized.match(/(\d(?:\.\d)?)/)?.[1] || "4.0";
    return {
      name: raw || "CC BY",
      className: "cc-by",
      attributionRequired: true,
      fallbackUrl: "https://creativecommons.org/licenses/by/" + version + "/"
    };
  }

  return null;
}

function safeWebUrl(value, allowedHosts) {
  try {
    const raw = String(value || "");
    const url = new URL(raw.startsWith("//") ? "https:" + raw : raw);
    if (url.protocol !== "https:") return "";
    if (allowedHosts && !allowedHosts.has(url.hostname)) return "";
    return url.href;
  } catch (error) {
    return "";
  }
}

function bestCommonsDerivative(info) {
  const maxBytes = 32 * 1024 * 1024;
  const duration = Number(info?.duration) || 0;
  const allowedHosts = new Set(["upload.wikimedia.org"]);
  const derivatives = Array.isArray(info?.derivatives)
    ? info.derivatives
    : [];
  const candidates = derivatives.map((item) => {
    const url = safeWebUrl(item.src, allowedHosts);
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    const bandwidth = Number(item.bandwidth) || 0;
    const estimatedBytes = bandwidth && duration
      ? Math.ceil((bandwidth * duration) / 8)
      : 0;
    const type = String(item.type || "").toLowerCase();

    return {
      url,
      width,
      height,
      bandwidth,
      estimatedBytes,
      type,
      maxDimension: Math.max(width, height),
      isTranscode: Boolean(item.transcodekey)
    };
  }).filter((item) =>
    item.url &&
    item.maxDimension >= 426 &&
    item.type.startsWith("video/") &&
    (!item.estimatedBytes || item.estimatedBytes <= maxBytes)
  );

  candidates.sort((a, b) => {
    const aTarget = Math.abs(Math.min(a.maxDimension, 1280) - 854);
    const bTarget = Math.abs(Math.min(b.maxDimension, 1280) - 854);
    const aPenalty = a.isTranscode ? 0 : 600;
    const bPenalty = b.isTranscode ? 0 : 600;
    return (aTarget + aPenalty) - (bTarget + bPenalty);
  });

  return candidates[0] || null;
}

function normalizeCommonsVideo(page, searchTerm = "") {
  const info = page?.videoinfo?.[0];
  if (!page?.title || !info) return null;

  const metadata = info.extmetadata || {};
  const license = reusableLicense(
    commonsMetadata(metadata, "LicenseShortName", 80) ||
    commonsMetadata(metadata, "UsageTerms", 80)
  );
  const derivative = bestCommonsDerivative(info);
  const restrictions = commonsMetadata(metadata, "Restrictions", 300);

  if (!license || !derivative || restrictions) return null;

  const sourceUrl = safeWebUrl(
    info.descriptionurl,
    new Set(["commons.wikimedia.org"])
  );
  const posterUrl = safeWebUrl(
    info.thumburl,
    new Set(["thumb.wikimedia.org", "upload.wikimedia.org"])
  );

  if (!sourceUrl) return null;

  const title = plainCommonsText(
    commonsMetadata(metadata, "ObjectName", 220) ||
      page.title.replace(/^File:/i, "")
        .replace(/\.(?:webm|ogv|ogg|mp4|mov|mpeg)$/i, ""),
    220
  );
  const creator = commonsMetadata(metadata, "Artist", 220) ||
    "Wikimedia Commons contributor";
  const licenseUrl = safeWebUrl(
    metadata?.LicenseUrl?.value,
    null
  ) || license.fallbackUrl;
  const assessments = commonsMetadata(metadata, "Assessments", 200);
  const resolution = derivative.width + "×" + derivative.height;
  const qualityScore =
    (license.className === "public-domain" ? 30 :
      license.className === "cc0" ? 27 : 22) +
    (/featured/i.test(assessments) ? 18 : 0) +
    Math.min(24, Math.round(derivative.maxDimension / 45)) +
    (Number(info.duration) >= 8 ? 12 : 0);

  return {
    id: String(page.pageid || page.title),
    commonsTitle: page.title,
    title,
    description: commonsMetadata(metadata, "ImageDescription", 500),
    creator,
    license: license.name,
    licenseClass: license.className,
    licenseUrl,
    attributionRequired: license.attributionRequired,
    attribution: title + " — " + creator + " — " + license.name,
    sourceUrl,
    mediaUrl: derivative.url,
    posterUrl,
    durationSeconds: Math.round(Number(info.duration) || 0),
    width: derivative.width,
    height: derivative.height,
    resolution,
    estimatedBytes: derivative.estimatedBytes,
    searchTerm: text(searchTerm, 120),
    qualityScore
  };
}

async function queryCommonsVideos(searchTerm) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: text(searchTerm, 120) + " filetype:video",
    gsrnamespace: "6",
    gsrlimit: "10",
    gsrwhat: "text",
    prop: "videoinfo",
    viprop: "url|mime|size|extmetadata|derivatives",
    viurlwidth: "640",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const response = await fetch(
    "https://commons.wikimedia.org/w/api.php?" + params.toString(),
    {
      headers: {
        "User-Agent": "PublisherForge/0.20 (https://github.com/jeffyyjr/Publisher-Forge)"
      },
      signal: AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    throw new Error("Reusable-footage search returned " + response.status + ".");
  }

  const data = await response.json();
  return (data?.query?.pages || [])
    .map((page) => normalizeCommonsVideo(page, searchTerm))
    .filter(Boolean);
}

async function findReusableVideos(searchTerms, count = 6) {
  const terms = [...new Set(
    (Array.isArray(searchTerms) ? searchTerms : [])
      .map((item) => text(item, 120))
      .filter(Boolean)
  )].slice(0, 7);

  if (!terms.length) {
    throw new Error("No reusable-footage search terms were generated.");
  }

  const results = await Promise.allSettled(
    terms.map((term) => queryCommonsVideos(term))
  );
  const groups = [];

  results.forEach((result, termIndex) => {
    if (result.status !== "fulfilled") return;

    const group = result.value.map((item, itemIndex) => ({
        ...item,
        qualityScore: item.qualityScore +
          Math.max(0, 14 - termIndex * 2 - itemIndex)
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore);

    if (group.length) groups.push(group);
  });

  const selected = [];
  const selectedTitles = new Set();

  groups.forEach((group) => {
    if (selected.length >= count) return;
    const candidate = group.find((item) =>
      !selectedTitles.has(item.commonsTitle)
    );
    if (!candidate) return;
    selected.push(candidate);
    selectedTitles.add(candidate.commonsTitle);
  });

  const remaining = groups.flat()
    .filter((item) => !selectedTitles.has(item.commonsTitle))
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, Math.max(0, count - selected.length));
  const videos = selected.concat(remaining)
    .slice(0, count)
    .map(({ qualityScore, ...item }) => item);

  if (videos.length < 3) {
    throw new Error(
      "Fewer than three license-verified videos matched this topic. Try a broader topic."
    );
  }

  return videos;
}

async function reverifyCommonsVideos(titles) {
  const safeTitles = [...new Set(
    (Array.isArray(titles) ? titles : [])
      .map((item) => text(item, 260))
      .filter((item) => /^File:[^|]{1,250}$/i.test(item))
  )].slice(0, 6);

  if (safeTitles.length < 3) {
    throw new Error("Choose at least three license-verified source videos.");
  }

  const params = new URLSearchParams({
    action: "query",
    titles: safeTitles.join("|"),
    prop: "videoinfo",
    viprop: "url|mime|size|extmetadata|derivatives",
    viurlwidth: "640",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const response = await fetch(
    "https://commons.wikimedia.org/w/api.php?" + params.toString(),
    {
      headers: {
        "User-Agent": "PublisherForge/0.20 (https://github.com/jeffyyjr/Publisher-Forge)"
      },
      signal: AbortSignal.timeout(25000)
    }
  );

  if (!response.ok) {
    throw new Error("Could not recheck the footage licenses.");
  }

  const data = await response.json();
  const verified = new Map(
    (data?.query?.pages || [])
      .map((page) => normalizeCommonsVideo(page))
      .filter(Boolean)
      .map((item) => [item.commonsTitle, item])
  );
  const ordered = safeTitles.map((title) => verified.get(title)).filter(Boolean);

  if (ordered.length !== safeTitles.length) {
    throw new Error(
      "One or more source licenses changed or could not be verified. Run a new scan."
    );
  }

  return ordered;
}

function parseViralRemix(response) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown reason";
    throw new Error("Viral Remix response was incomplete: " + reason + ".");
  }

  const raw = String(response.output_text || "").trim();
  if (!raw) {
    throw new Error("Viral Remix returned no plan. Please try again.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Viral Remix could not read the completed plan.");
  }
}

function trimNarration(value, duration) {
  const words = text(value, 5000).split(/\s+/).filter(Boolean);
  const maximum = Math.max(55, Math.floor(duration * 2.25));
  const trimmed = words.slice(0, maximum).join(" ");
  return trimmed && !/[.!?]$/.test(trimmed) ? trimmed + "." : trimmed;
}

function normalizedRemixPlan(value, duration) {
  const plan = value && typeof value === "object" ? value : {};
  const scenes = Array.isArray(plan.scenes)
    ? plan.scenes.slice(0, 6).map((scene) => ({
        searchTerm: text(scene?.searchTerm, 120),
        narration: text(scene?.narration, 700),
        onScreenText: text(scene?.onScreenText, 180)
      }))
    : [];

  return {
    trendTitle: text(plan.trendTitle, 180) || "Original short-form remix",
    trendSummary: text(plan.trendSummary, 800),
    whyNow: text(plan.whyNow, 800),
    audience: text(plan.audience, 300),
    hook: text(plan.hook, 280),
    narration: trimNarration(
      plan.narration || scenes.map((scene) => scene.narration).join(" "),
      duration
    ),
    postCaption: text(plan.postCaption, 1000),
    hashtags: Array.isArray(plan.hashtags)
      ? plan.hashtags.slice(0, 10).map((item) => text(item, 80)).filter(Boolean)
      : [],
    searchTerms: Array.isArray(plan.searchTerms)
      ? plan.searchTerms.slice(0, 6).map((item) => text(item, 120)).filter(Boolean)
      : [],
    scenes
  };
}

function srtTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return [hours, minutes, secs].map((item) => String(item).padStart(2, "0"))
    .join(":") + "," + String(millis).padStart(3, "0");
}

function remixCaptions(plan, duration, count) {
  const sceneDuration = duration / count;
  const scenes = Array.from({ length: count }, (_, index) => {
    const scene = plan.scenes[index] || {};
    return text(
      scene.onScreenText || (index === 0 ? plan.hook : scene.narration),
      180
    ) || plan.trendTitle;
  });

  return scenes.map((caption, index) => [
    index + 1,
    srtTimestamp(index * sceneDuration) + " --> " +
      srtTimestamp((index + 1) * sceneDuration - 0.08),
    caption.replace(/\r?\n/g, " ").replace(/[{}\\]/g, ""),
    ""
  ].join("\n")).join("\n");
}

function subtitleBurnFilter(captionPath) {
  return "subtitles=" + captionPath.replace(/:/g, "\\:") +
    ":force_style='FontName=DejaVu Sans,FontSize=20," +
    "PrimaryColour=&H00FFFFFF,OutlineColour=&HAA000000," +
    "BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=105'";
}

function safeFilename(value) {
  return text(value, 120).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "viral-remix";
}

function sourceCredits(sources) {
  return sources.map((source, index) => [
    String(index + 1) + ". " + source.title,
    "Creator: " + source.creator,
    "License: " + source.license + " — " + source.licenseUrl,
    "Source: " + source.sourceUrl
  ].join("\n")).join("\n\n");
}

function postingCopy(plan, sources) {
  const hashtags = plan.hashtags.map((item) =>
    item.startsWith("#") ? item : "#" + item.replace(/\s+/g, "")
  ).join(" ");

  return [
    plan.postCaption,
    hashtags,
    "Production note: original AI-generated narration over licensed reusable footage.",
    "",
    "FOOTAGE CREDITS",
    sourceCredits(sources)
  ].filter((item) => item !== "").join("\n\n");
}

function runFfmpeg(args, timeoutMs = 240000) {
  const binary = ffmpegPath || process.env.FFMPEG_PATH || "ffmpeg";

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Video rendering took too long. Try the 30-second format."));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-5000);
    });
    child.on("error", (error) => {
      finish(new Error("Video renderer could not start: " + error.message));
    });
    child.on("close", (code) => {
      finish(code === 0
        ? null
        : new Error("Video renderer stopped: " + (stderr.trim() || "FFmpeg error"))
      );
    });
  });
}

async function downloadCommonsVideo(source, destination) {
  const allowedHosts = new Set(["upload.wikimedia.org"]);
  const url = safeWebUrl(source.mediaUrl, allowedHosts);
  if (!url) throw new Error("A source video URL was not trusted.");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "PublisherForge/0.20 (https://github.com/jeffyyjr/Publisher-Forge)"
    },
    signal: AbortSignal.timeout(90000)
  });
  const finalUrl = safeWebUrl(response.url, allowedHosts);

  if (!response.ok || !response.body || !finalUrl) {
    throw new Error("A verified source video could not be downloaded.");
  }

  const maximum = 36 * 1024 * 1024;
  const declared = Number(response.headers.get("content-length")) || 0;
  if (declared > maximum) {
    throw new Error("A source video exceeded the safe download size.");
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > maximum) {
        callback(new Error("A source video exceeded the safe download size."));
        return;
      }
      callback(null, chunk);
    }
  });

  await pipeline(
    Readable.fromWeb(response.body),
    limiter,
    createWriteStream(destination)
  );
}

async function generateNarration(plan, destination) {
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: "alloy",
    input: plan.narration,
    response_format: "mp3"
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("The original narration audio was empty.");
  }

  await fs.writeFile(destination, buffer);
}

async function renderViralRemix(
  plan,
  sources,
  duration,
  tempDirectory,
  narrationProvider = generateNarration
) {
  const sceneDuration = duration / sources.length;
  const orderedPlan = {
    ...plan,
    scenes: sources.map((source, index) => {
      const wanted = String(source.searchTerm || "").toLowerCase();
      return plan.scenes.find((scene) =>
        String(scene.searchTerm || "").toLowerCase() === wanted
      ) || plan.scenes[index] || {};
    })
  };
  const segmentPaths = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const extension = path.extname(new URL(source.mediaUrl).pathname) || ".webm";
    const inputPath = path.join(
      tempDirectory,
      "source-" + String(index + 1).padStart(2, "0") + extension
    );
    const outputPath = path.join(
      tempDirectory,
      "segment-" + String(index + 1).padStart(2, "0") + ".mp4"
    );
    const segmentCaptionPath = path.join(
      tempDirectory,
      "segment-" + String(index + 1).padStart(2, "0") + ".srt"
    );
    const available = Math.max(0, Number(source.durationSeconds) - sceneDuration);
    const offset = available > 1 ? Math.min(available, index * 4.25) : 0;
    const scene = orderedPlan.scenes[index] || {};
    const segmentCaption = text(
      scene.onScreenText || (index === 0 ? plan.hook : scene.narration),
      180
    ).replace(/\r?\n/g, " ").replace(/[{}\\]/g, "") || plan.trendTitle;
    const segmentSrt = [
      "1",
      "00:00:00,000 --> " + srtTimestamp(sceneDuration - 0.08),
      segmentCaption,
      ""
    ].join("\n");

    await downloadCommonsVideo(source, inputPath);
    await fs.writeFile(segmentCaptionPath, segmentSrt, "utf8");
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y",
      "-stream_loop", "-1",
      "-ss", offset.toFixed(2),
      "-i", inputPath,
      "-t", sceneDuration.toFixed(3),
      "-an",
      "-vf",
      "scale=720:1280:force_original_aspect_ratio=increase," +
        "crop=720:1280,setsar=1,fps=24," +
        subtitleBurnFilter(segmentCaptionPath),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "25",
      "-pix_fmt", "yuv420p",
      outputPath
    ]);
    segmentPaths.push(outputPath);
  }

  const concatPath = path.join(tempDirectory, "segments.txt");
  const baseVideoPath = path.join(tempDirectory, "base.mp4");
  const captionPath = path.join(tempDirectory, "captions.srt");
  const narrationPath = path.join(tempDirectory, "narration.mp3");
  const finalPath = path.join(tempDirectory, "viral-remix.mp4");
  const concatText = segmentPaths.map((item) =>
    "file '" + item.replace(/'/g, "'\\''") + "'"
  ).join("\n");
  const captions = remixCaptions(orderedPlan, duration, sources.length);

  await fs.writeFile(concatPath, concatText, "utf8");
  await fs.writeFile(captionPath, captions, "utf8");
  await narrationProvider(plan, narrationPath);
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", concatPath,
    "-c", "copy", baseVideoPath
  ]);

  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", baseVideoPath,
    "-i", narrationPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-filter:a", "apad",
    "-t", String(duration),
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    finalPath
  ]);

  return { finalPath, captionPath, captions };
}

function requireOpenAI(res) {
  if (client) return true;

  res.status(503).json({
    error: "OPENAI_API_KEY is not configured"
  });

  return false;
}

function validatedCover(value) {
  if (!value) return null;

  if (value.mimeType !== "image/png" || typeof value.base64 !== "string") {
    throw new Error("Cover must be a PNG image");
  }

  const buffer = Buffer.from(value.base64, "base64");
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    throw new Error("Cover image must be 15 MB or smaller");
  }

  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error("Cover image is not a valid PNG");
  }

  return buffer;
}

function illustrationPlaceholderPattern() {
  return /\[(?:Illustration|Image|Artwork)\s+Placeholder(?:\s*:\s*([^\]]+))?\]/gi;
}

function productionDraftSection(packageText) {
  const source = text(packageText, 50000);
  const match = source.match(
    /(?:^|\n)## Product draft\s*\n([\s\S]*?)(?=\n## Listing title(?:\n|$))/i
  );
  return match ? match[1] : source;
}

function normalizePageLabels(value) {
  const ones = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19
  };
  const tens = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  const numberWords = [
    ...Object.keys(ones),
    ...Object.keys(tens).flatMap((ten) => [
      ten,
      ...Object.keys(ones).slice(0, 9).map((one) => ten + "-" + one),
      ...Object.keys(ones).slice(0, 9).map((one) => ten + " " + one)
    ])
  ].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    "\\bPage\\s+(" + numberWords.join("|") + ")\\b",
    "gi"
  );

  return String(value || "").replace(pattern, (match, words) => {
    const parts = words.toLowerCase().split(/[-\s]+/);
    const number = parts.reduce(
      (total, part) => total + (ones[part] || tens[part] || 0),
      0
    );
    return number ? "Page " + number : match;
  });
}

function normalizedPackageData(packageData) {
  if (!packageData || typeof packageData !== "object") return packageData;

  const normalized = { ...packageData };
  for (const key of [
    "packageTitle", "subtitle", "deliverableType", "draftMarkdown",
    "listingTitle", "listingDescription"
  ]) {
    normalized[key] = normalizePageLabels(normalized[key]);
  }
  for (const key of ["keywords", "productionChecklist", "riskFlags"]) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key].map(normalizePageLabels);
    }
  }
  return normalized;
}

function publishingAuthor(value) {
  const requested = text(value, 160);
  return !requested || /^(?:Maxx? Powers|Logan Cross|Marina Solano)$/i.test(requested)
    ? "Maxx Powers"
    : requested;
}

function isColoringBookPackage(packageData) {
  return platform(packageData?.platform) === "KDP" &&
    /\b(coloring|colouring)\b/i.test([
      packageData?.packageTitle,
      packageData?.subtitle,
      packageData?.deliverableType,
      packageData?.draftMarkdown
    ].join(" "));
}

function cleanPublishingClaims(value, authorName, artworkCount) {
  return normalizePageLabels(value)
    .replace(/\bMarina Solano\b/gi, authorName)
    .replace(/\bLogan Cross\b/gi, authorName)
    .replace(/\bMaxx? Powers\b/gi, authorName)
    .replace(/\bHarbor\s*&\s*Hearth Press\b/gi, "Independently published")
    .replace(/commissioned artwork/gi, "AI-assisted artwork")
    .replace(
      /\b80\s+(?:complete\s+)?(?:interior\s+)?(?:plates?|coloring pages?|illustrations?)\b/gi,
      artworkCount + " original illustrations"
    );
}

function cleanPublishingObject(value, authorName, artworkCount) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      cleanPublishingObject(item, authorName, artworkCount)
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cleanPublishingObject(item, authorName, artworkCount)
      ])
    );
  }
  return typeof value === "string"
    ? cleanPublishingClaims(value, authorName, artworkCount)
    : value;
}

function coloringBookInterior(packageData, authorName) {
  const artwork = Array.isArray(packageData.interiorArt)
    ? packageData.interiorArt
    : [];
  const year = new Date().getUTCFullYear();
  const artPages = artwork.map((item, index) => {
    const number = index + 1;
    return "![Coloring page " + number + "](interior-art/interior-art-" +
      String(number).padStart(2, "0") + ".png)";
  });

  return [
    "## Copyright",
    "Text, selection, and arrangement copyright (c) " + year +
      " " + authorName + ". All rights reserved.",
    "Published independently.",
    "Illustrations in this edition were created using generative AI tools. No outside artist or publisher is credited.",
    "This book is for recreational coloring and creative practice. It is not medical or clinical advice.",
    "",
    "---",
    "",
    "## How to use this book",
    "Choose any page, test colors on the color-test page, and place a protective sheet behind the picture when using markers.",
    "Each illustration is printed on one side with a blank reverse to reduce bleed-through.",
    "",
    "---",
    "",
    "## Coloring pages",
    "",
    ...artPages
  ].join("\n");
}

function publicationReadyPackage(packageData, requestedAuthor) {
  const normalized = normalizedPackageData(packageData);
  if (!normalized) return normalized;

  const authorName = publishingAuthor(requestedAuthor || normalized.authorName);
  const artworkCount = Array.isArray(normalized.interiorArt)
    ? normalized.interiorArt.length
    : 0;
  const ready = { ...normalized, authorName };

  for (const key of ["packageTitle", "subtitle", "listingTitle"]) {
    ready[key] = cleanPublishingClaims(
      ready[key], authorName, artworkCount
    );
  }

  if (isColoringBookPackage(ready) && artworkCount) {
    ready.deliverableType = "KDP paperback coloring book";
    ready.draftMarkdown = coloringBookInterior(ready, authorName);
    ready.listingTitle = ready.packageTitle;
    ready.listingDescription = [
      ready.packageTitle + " is an easy-to-use adult coloring book featuring " +
        artworkCount + " original black-and-white illustrations.",
      "The KDP-ready 6 x 9 interior prints every illustration on one side with a blank reverse page, plus color-test and notes pages.",
      "Created for relaxed recreational coloring and creative practice."
    ].join(" ");
    ready.productionChecklist = [
      "Upload the supplied KDP interior PDF.",
      "Upload the supplied KDP cover-wrap PDF.",
      "Open KDP Print Previewer once and make sure the pages and cover look right.",
      "Answer KDP's AI-content question accurately for the generated illustrations."
    ];
    ready.riskFlags = [];
  } else {
    ready.draftMarkdown = cleanPublishingClaims(
      ready.draftMarkdown, authorName, artworkCount
    );
    ready.listingDescription = cleanPublishingClaims(
      ready.listingDescription, authorName, artworkCount
    );
  }

  return ready;
}

function isAutomaticExportTask(value) {
  const source = String(value || "");
  return /Page\s+Fifty\b|(?:embed|outline|embedding).{0,45}fonts?|fonts?.{0,45}(?:embed|outline|embedding)|(?:set|document|confirm).{0,45}(?:black\s*(?:&|and)\s*white|B&W)|(?:black\s*(?:&|and)\s*white|B&W).{0,45}(?:setting|selection|metadata)|cover PDF|spine width|300\s*DPI|required bleed|PDF\/X|PDF validation|embedded images|single[- ]side ordering|placeholder image links?|font licenses?|OFL\.txt/i
    .test(source);
}

function extractIllustrationSlots(markdown) {
  const source = text(markdown, 50000);
  const matches = [...source.matchAll(illustrationPlaceholderPattern())];

  if (matches.length > 12) {
    throw new Error(
      "This draft has " + matches.length +
      " illustration placeholders. Interior Art Studio supports up to 12 per package."
    );
  }

  return matches.map((match, index) => {
    const start = Math.max(0, match.index - 420);
    const end = Math.min(source.length, match.index + match[0].length + 420);
    const nearby = source.slice(start, end)
      .replace(illustrationPlaceholderPattern(), " ")
      .replace(/[#*_`>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      index: index + 1,
      token: match[0],
      subject: text(match[1] || nearby, 700) ||
        "A simple original illustration supporting the surrounding lesson"
    };
  });
}

function validatedInteriorArt(value) {
  if (!value) return [];
  if (!Array.isArray(value) || value.length > 12) {
    throw new Error("Interior art must contain no more than 12 images");
  }

  let totalBytes = 0;
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return value.map((item, index) => {
    if (!item || item.mimeType !== "image/png" ||
        typeof item.base64 !== "string") {
      throw new Error("Interior illustration " + (index + 1) + " must be a PNG image");
    }

    const buffer = Buffer.from(item.base64, "base64");
    totalBytes += buffer.length;

    if (!buffer.length || buffer.length > 8 * 1024 * 1024 ||
        totalBytes > 36 * 1024 * 1024) {
      throw new Error("Interior artwork is too large");
    }

    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
      throw new Error("Interior illustration " + (index + 1) + " is not a valid PNG");
    }

    return {
      index: index + 1,
      filename: "interior-art-" + String(index + 1).padStart(2, "0") + ".png",
      alt: text(item.alt, 300) || "Interior illustration " + (index + 1),
      buffer
    };
  });
}

function localDecision(values) {
  const total =
    score(values.demand) * 0.30 +
    (100 - score(values.competition)) * 0.20 +
    score(values.margin) * 0.20 +
    score(values.differentiation) * 0.20 +
    score(values.confidence) * 0.10;

  const finalScore = Math.round(total);

  return {
    score: finalScore,
    verdict:
      finalScore >= 75
        ? "MAKE"
        : finalScore >= 55
          ? "VALIDATE"
          : "SKIP"
  };
}

function parseReport(response) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown reason";
    throw new Error("Trend Radar response was incomplete: " + reason + ".");
  }

  const raw = String(response.output_text || "").trim();

  if (!raw) {
    throw new Error("Trend Radar returned no report. Please try the scan again.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Trend Radar could not read the completed report.");
  }
}

function parseProductionPackage(response) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown reason";
    throw new Error("Production Agent response was incomplete: " + reason + ".");
  }

  const raw = String(response.output_text || "").trim();

  if (!raw) {
    throw new Error("Production Agent returned no package. Please try again.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Production Agent could not read the completed package.");
  }
}

function parseQualityReview(response) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown reason";
    throw new Error("Quality Control response was incomplete: " + reason + ".");
  }

  const raw = String(response.output_text || "").trim();

  if (!raw) {
    throw new Error("Quality Control returned no review. Please try again.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Quality Control could not read the completed review.");
  }
}

function parseRevenueReview(response) {
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown reason";
    throw new Error("Revenue Agent response was incomplete: " + reason + ".");
  }

  const raw = String(response.output_text || "").trim();

  if (!raw) {
    throw new Error("Revenue Agent returned no review. Please try again.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Revenue Agent could not read the completed review.");
  }
}

function measuredNumber(value, label, maximum = 10000000) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw new Error(label + " must be a number from 0 to " + maximum + ".");
  }

  return number;
}

function isHumanProductionCheck(value) {
  return /\b(cover (design|review|inspection)|final visual inspection|proofread(ing)?|trim (size|dimensions?)|bleed settings?|page dimensions?|final (file )?formatting|final layout|final page count|unfinalized page count|page count confirmation|isbn selection|marketplace upload|upload(ing)? (the )?(files?|product)|confirm current marketplace (rules|requirements)|print proof)\b/i
    .test(String(value || ""));
}

function printableText(value, limit) {
  return text(value, limit)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—‑]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function printablePdf(packageData) {
  return new Promise((resolve, reject) => {
    const normalizedPackage = publicationReadyPackage(
      packageData,
      packageData?.authorName
    );
    const market = platform(normalizedPackage.platform);
    const pageSize = market === "KDP" ? [432, 648] : "LETTER";
    const margin = 54;
    const title = printableText(normalizedPackage.packageTitle, 300) || "Untitled product";
    const subtitle = printableText(normalizedPackage.subtitle, 500);
    const deliverable = printableText(normalizedPackage.deliverableType, 200);
    const markdown = text(normalizedPackage.draftMarkdown, 50000);
    const interiorArt = validatedInteriorArt(normalizedPackage.interiorArt);
    const singleSidedArtwork = market === "KDP" &&
      /\b(coloring|colouring)\b/i.test([title, deliverable, markdown].join(" "));
    // Repeatable record forms are a real part of a logbook, not blank padding.
    // Never expand narrative books or a substantially empty draft this way.
    const recordBook = market === "KDP" && !singleSidedArtwork && markdown.length >= 500 &&
      /\b(log\s*book|record book|service journal)\b/i.test([title, subtitle, deliverable].join(" ")) &&
      !/\b(novel|fiction|poetry|short stor(?:y|ies))\b/i.test(deliverable);
    const rvRecords = /\b(rv|camper|motorhome|travel.trailer|winterization)\b/i
      .test([title, subtitle, markdown].join(" "));
    let recordPagesAdded = 0;
    const artByFilename = new Map(
      interiorArt.map((item) => [item.filename, item])
    );
    const chunks = [];
    const blankBackingPages = new Set();
    let finalPageCount = 0;
    const doc = new PDFDocument({
      size: pageSize,
      margins: { top: margin, right: margin, bottom: margin, left: margin },
      bufferPages: true,
      info: {
        Title: title,
        Author: normalizedPackage.authorName,
        Subject: deliverable || "Approved production copy"
      }
    });

    doc.registerFont(
      "Inter",
      path.join(__dirname, "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff")
    );
    doc.registerFont(
      "InterBold",
      path.join(__dirname, "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")
    );

    function cleanInline(value) {
      return printableText(value, 50000)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/[*_`]/g, "")
        .trim();
    }

    function ensureSpace(height) {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + height > bottom) doc.addPage();
    }

    function renderBody(source) {
      let needsPageAfterBlank = false;

      for (const rawLine of String(source || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        let openedFreshPage = false;

        if (!line) {
          if (!needsPageAfterBlank) doc.moveDown(0.55);
          continue;
        }

        if (needsPageAfterBlank) {
          doc.addPage();
          needsPageAfterBlank = false;
          openedFreshPage = true;
        }

        const illustration = line.match(
          /^!\[([^\]]+)\]\((?:interior-art\/)?(interior-art-\d{2}\.png)\)$/i
        );
        if (illustration && artByFilename.has(illustration[2])) {
          const art = artByFilename.get(illustration[2]);
          const availableWidth = doc.page.width -
            doc.page.margins.left - doc.page.margins.right;

          if (singleSidedArtwork && !openedFreshPage) doc.addPage();
          else ensureSpace(300);
          doc.image(art.buffer, {
            fit: [availableWidth, singleSidedArtwork ? 470 : 250],
            align: "center"
          });
          doc.moveDown(0.35);
          doc.font("Inter").fontSize(8.5).fillColor("#6B7480")
            .text(cleanInline(illustration[1]), { align: "center" });
          doc.moveDown(0.55);

          if (singleSidedArtwork) {
            doc.addPage();
            const blankRange = doc.bufferedPageRange();
            blankBackingPages.add(
              blankRange.start + blankRange.count - 1
            );
            needsPageAfterBlank = true;
          }
          continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const fontSize = level === 1 ? 21 : level === 2 ? 16 : 13;
          ensureSpace(level === 1 ? 90 : 145);
          doc.moveDown(level === 1 ? 0.7 : 0.45);
          doc.font("InterBold")
            .fontSize(fontSize)
            .fillColor(level === 1 ? "#C75A12" : "#202833")
            .text(cleanInline(heading[2]), { paragraphGap: 5 });
          continue;
        }

        const checklist = line.match(/^-\s*\[([ xX])\]\s+(.+)$/);
        if (checklist) {
          ensureSpace(28);
          doc.font("Inter").fontSize(10.5).fillColor("#202833")
            .text((checklist[1].trim() ? "[x] " : "[ ] ") + cleanInline(checklist[2]), {
              indent: 14,
              paragraphGap: 4,
              lineGap: 2
            });
          continue;
        }

        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) {
          ensureSpace(28);
          doc.font("Inter").fontSize(10.5).fillColor("#202833")
            .text("- " + cleanInline(bullet[1]), {
              indent: 14,
              paragraphGap: 4,
              lineGap: 2
            });
          continue;
        }

        if (/^_{3,}$|^-{3,}$/.test(line)) {
          ensureSpace(18);
          doc.moveDown(0.35)
            .strokeColor("#D6DBE1")
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .stroke()
            .moveDown(0.6);
          continue;
        }

        doc.font("Inter").fontSize(10.5).fillColor("#202833")
          .text(cleanInline(line), {
            align: "left",
            lineGap: 2.5,
            paragraphGap: 5
          });
      }
    }

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      buffer.pageCount = finalPageCount;
      buffer.intentionalBlankPageCount = blankBackingPages.size;
      buffer.contentPageCount = finalPageCount - blankBackingPages.size;
      buffer.recordPagesAdded = recordPagesAdded;
      resolve(buffer);
    });
    doc.on("error", reject);

    // Keep decorative title-page artwork inside KDP's printable safe area.
    doc.roundedRect(
      margin,
      margin - 18,
      doc.page.width - margin * 2,
      6,
      3
    ).fill("#E96E1A");
    doc.moveDown(4.5);
    doc.font("InterBold").fontSize(11).fillColor("#C75A12")
      .text(market === "KDP" ? "PAPERBACK EDITION" : "PRINTABLE EDITION");
    doc.moveDown(1.8);
    doc.font("InterBold").fontSize(market === "KDP" ? 28 : 32)
      .fillColor("#151B23").text(title, { align: "left", lineGap: 4 });

    if (subtitle) {
      doc.moveDown(0.8);
      doc.font("Inter").fontSize(15).fillColor("#5A6470")
        .text(subtitle, { lineGap: 3 });
    }

    doc.moveDown(2.5);
    doc.strokeColor("#E96E1A").lineWidth(2)
      .moveTo(margin, doc.y)
      .lineTo(doc.page.width - margin, doc.y)
      .stroke();
    doc.moveDown(1.2);
    doc.font("InterBold").fontSize(10).fillColor("#202833")
      .text(deliverable || "Approved production copy");
    if (normalizedPackage.authorName) {
      doc.moveDown(0.4);
      doc.font("Inter").fontSize(10).fillColor("#202833")
        .text("By " + normalizedPackage.authorName);
    }
    doc.moveDown(0.35);
    doc.font("Inter").fontSize(9.5).fillColor("#6B7480")
      .text(market + " production copy")
      .text("Approved " + text(normalizedPackage.approvedAt, 100));

    doc.addPage();
    renderBody(markdown || "No product draft was included.");

    if (singleSidedArtwork) {
      const supplementalPages = [
        {
          title: "Color Test Page",
          note: "Test pencils, markers, and shading here before coloring the artwork.",
          swatches: true
        },
        {
          title: "Palette Planner",
          note: "Plan favorite color combinations before starting a page.",
          swatches: true
        },
        {
          title: "My Favorite Pages",
          note: "Record favorite subjects, color choices, and ideas to try again."
        },
        {
          title: "Creative Notes",
          note: "Use this space for techniques, supplies, and future coloring ideas."
        }
      ];
      let supplementalIndex = 0;

      while (doc.bufferedPageRange().count < 24) {
        const page = supplementalPages[
          supplementalIndex % supplementalPages.length
        ];
        supplementalIndex += 1;
        doc.addPage();
        doc.font("InterBold").fontSize(18).fillColor("#202833")
          .text(page.title, { align: "center" });
        doc.moveDown(0.6);
        doc.font("Inter").fontSize(10).fillColor("#5A6470")
          .text(page.note, { align: "center" });
        doc.moveDown(1.5);

        if (page.swatches) {
          const boxWidth = 58;
          const boxHeight = 42;
          const gap = 14;
          const startX = (doc.page.width - (boxWidth * 4 + gap * 3)) / 2;
          const startY = doc.y;

          for (let swatch = 0; swatch < 16; swatch += 1) {
            const column = swatch % 4;
            const row = Math.floor(swatch / 4);
            doc.roundedRect(
              startX + column * (boxWidth + gap),
              startY + row * (boxHeight + gap),
              boxWidth,
              boxHeight,
              5
            ).lineWidth(1).strokeColor("#8A939E").stroke();
          }
        } else {
          const left = doc.page.margins.left;
          const right = doc.page.width - doc.page.margins.right;
          let lineY = doc.y;

          while (lineY < doc.page.height - 72) {
            doc.moveTo(left, lineY).lineTo(right, lineY)
              .lineWidth(0.7).strokeColor("#C9CFD6").stroke();
            lineY += 28;
          }
        }
      }
    }

    if (recordBook) {
      const forms = rvRecords ? [
        { title: "Seasonal Storage Record", fields: ["Date and storage location", "Vehicle / trailer reference", "Work recorded from owner's manual", "Provider / receipt reference", "Observations", "Next review date"] },
        { title: "Maintenance and Service Record", fields: ["Date and mileage / reference", "System or component", "Service performed by", "Parts and receipt reference", "Cost", "Follow-up / next due date"] },
        { title: "Storage Visit Record", fields: ["Visit date and location", "Owner's observations", "Changes since last visit", "Photos / document reference", "Service provider contacted", "Next visit / follow-up"] },
        { title: "Parts and Warranty Record", fields: ["Component / part reference", "Purchase and installation date", "Vendor / service provider", "Receipt / warranty reference", "Cost", "Notes and follow-up"] }
      ] : [
        { title: "Dated Activity Record", fields: ["Date / reference", "Activity or category", "Work completed", "Documents / receipt reference", "Observations", "Next action and date"] },
        { title: "Follow-up Record", fields: ["Date / reference", "Related entry", "Update or observation", "Contact / document reference", "Outcome", "Next action and date"] }
      ];
      while (doc.bufferedPageRange().count < 24) {
        const form = forms[recordPagesAdded % forms.length];
        doc.addPage();
        recordPagesAdded += 1;
        doc.font("InterBold").fontSize(17).fillColor("#202833")
          .text(form.title, margin, margin, { width: 324 });
        doc.font("Inter").fontSize(9).fillColor("#5A6470")
          .text("Reusable record form " + recordPagesAdded + ". Record your own information; this is not a procedure or safety instruction.", margin, margin + 30, { width: 324 });
        form.fields.forEach((label, index) => {
          const y = margin + 86 + index * 66;
          doc.font("InterBold").fontSize(10).fillColor("#202833")
            .text(label, margin, y, { width: 324, lineBreak: false });
          for (const offset of [22, 42]) {
            doc.moveTo(margin, y + offset).lineTo(doc.page.width - margin, y + offset)
              .lineWidth(0.6).strokeColor("#C9CFD6").stroke();
          }
        });
      }
    }

    const pages = doc.bufferedPageRange();
    finalPageCount = pages.count;
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      if (blankBackingPages.has(index)) continue;
      const isCover = index === pages.start;
      const originalBottomMargin = doc.page.margins.bottom;

      doc.page.margins.bottom = 0;
      doc.font("Inter").fontSize(8).fillColor("#7A838E");
      doc.text(
        isCover ? title : "Page " + index,
        doc.page.margins.left,
        doc.page.height - 34,
        {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: isCover ? "left" : "center",
          lineBreak: false
        }
      );
      doc.page.margins.bottom = originalBottomMargin;
    }

    doc.end();
  });
}

function dollars(value) {
  return Math.round(Number(value) * 100) / 100;
}

function endingIn99(value) {
  return dollars(Math.max(0.99, Math.ceil(Number(value) + 0.01) - 0.01));
}

function kdpPricing(pageCount) {
  const actualPageCount = Math.max(1, Math.round(Number(pageCount) || 1));
  const pricingPageCount = Math.max(24, actualPageCount);
  const printingCost = pricingPageCount <= 110
    ? 2.30
    : dollars(1 + pricingPageCount * 0.012);
  const fiftyRateMinimum = dollars(Math.ceil((printingCost / 0.50) * 100) / 100);
  const sixtyRateMinimum = dollars(Math.max(9.99,
    Math.ceil((printingCost / 0.60) * 100) / 100));
  const minimumListPrice = fiftyRateMinimum <= 9.98
    ? fiftyRateMinimum
    : sixtyRateMinimum;
  const marketTarget = pricingPageCount <= 120
    ? 12.99
    : pricingPageCount <= 220
      ? 14.99
      : 16.99;

  function option(label, targetRoyalty, targetPrice) {
    const price = endingIn99(Math.max(
      targetPrice,
      (printingCost + targetRoyalty) / 0.60,
      9.99
    ));
    const royaltyRate = price >= 9.99 ? 0.60 : 0.50;
    const royalty = dollars(royaltyRate * price - printingCost);

    return { label, price, royaltyRate, royalty };
  }

  const options = [
    option("Low", 1.50, 9.99),
    option("Standard", 3.00, marketTarget),
    option("Premium", 5.00, marketTarget + 3)
  ];
  const standard = options[1];

  return {
    marketplace: "Amazon.com",
    currency: "USD",
    format: "Paperback",
    trimSize: "6 x 9 in",
    ink: "Black ink",
    paper: "White paper",
    bleed: "No bleed",
    actualPageCount,
    pricingPageCount,
    minimumPageCount: 24,
    maximumPageCount: 828,
    pageCountReady: actualPageCount >= 24 && actualPageCount <= 828,
    estimatedPrintingCost: printingCost,
    minimumListPrice,
    options,
    recommendedPrice: standard.price,
    estimatedRoyaltyPerSale: standard.royalty,
    monthlyExamples: [10, 50, 100].map((sales) => ({
      sales,
      estimatedRoyalty: dollars(sales * standard.royalty)
    })),
    disclaimer:
      "Estimate for Amazon.com standard distribution using KDP's current black-ink regular-trim formula. Confirm the exact cost and royalty inside KDP before publishing.",
    calculatedAt: new Date().toISOString()
  };
}

function kdpCoverSpecs(pageCount) {
  const actualPageCount = Math.max(1, Math.round(Number(pageCount) || 1));
  const trimWidth = 6;
  const trimHeight = 9;
  const bleed = 0.125;
  const spineWidth = actualPageCount * 0.002252;
  const coverWidth = bleed + trimWidth + spineWidth + trimWidth + bleed;
  const coverHeight = bleed + trimHeight + bleed;

  return {
    format: "Paperback",
    trimSize: "6 x 9 in",
    ink: "Black ink",
    paper: "White paper",
    pageCount: actualPageCount,
    minimumPageCount: 24,
    maximumPageCount: 828,
    pageCountReady: actualPageCount >= 24 && actualPageCount <= 828,
    bleedInches: bleed,
    spineWidthInches: Number(spineWidth.toFixed(4)),
    coverWidthInches: Number(coverWidth.toFixed(4)),
    coverHeightInches: Number(coverHeight.toFixed(4)),
    spineTextIncluded: actualPageCount >= 80 && spineWidth * 72 >= 18,
    barcodeArea: {
      widthInches: 2,
      heightInches: 1.2,
      placement: "Lower-right corner of back cover; reserved for Amazon"
    },
    disclaimer:
      "Calculated for a left-to-right 6 x 9 inch paperback with black ink, white paper, and KDP-required cover bleed. Confirm the final file in KDP Print Previewer."
  };
}

function formatKdpCoverSpecs(specs) {
  return [
    "KDP PAPERBACK COVER SPECIFICATIONS",
    "",
    "Format: " + specs.format,
    "Trim: " + specs.trimSize,
    "Interior: " + specs.ink + ", " + specs.paper,
    "Interior pages: " + specs.pageCount,
    "Cover width: " + specs.coverWidthInches.toFixed(4) + " in",
    "Cover height: " + specs.coverHeightInches.toFixed(4) + " in",
    "Spine width: " + specs.spineWidthInches.toFixed(4) + " in",
    "Bleed: " + specs.bleedInches.toFixed(3) + " in on outside edges",
    "Spine text: " + (specs.spineTextIncluded ? "included" : "omitted"),
    "Barcode area: " + specs.barcodeArea.widthInches + " x " +
      specs.barcodeArea.heightInches + " in, " + specs.barcodeArea.placement,
    "",
    specs.pageCountReady
      ? "Page-count check: ready for KDP's 24-to-828-page range."
      : "PAGE-COUNT WARNING: the interior must contain 24 to 828 pages before generating a final cover.",
    "",
    specs.disclaimer
  ].join("\n");
}

function kdpWrapCoverPdf(packageData, cover, pageCount, authorName) {
  return new Promise((resolve, reject) => {
    const specs = kdpCoverSpecs(pageCount);

    if (!specs.pageCountReady) {
      reject(new Error(
        "The interior must contain 24 to 828 pages before a final KDP cover can be sized."
      ));
      return;
    }

    const points = 72;
    const bleed = specs.bleedInches * points;
    const trimWidth = 6 * points;
    const trimHeight = 9 * points;
    const spineWidth = specs.spineWidthInches * points;
    const coverWidth = specs.coverWidthInches * points;
    const coverHeight = specs.coverHeightInches * points;
    const backRight = bleed + trimWidth;
    const frontLeft = backRight + spineWidth;
    const title = printableText(packageData.packageTitle, 300) || "Untitled book";
    const subtitle = printableText(packageData.subtitle, 500);
    const author = printableText(authorName, 160);
    const blurb = printableText(packageData.listingDescription, 4000)
      .replace(/\s+/g, " ")
      .trim();
    const chunks = [];
    const doc = new PDFDocument({
      size: [coverWidth, coverHeight],
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      info: {
        Title: title + " paperback cover",
        Author: author,
        Subject: "KDP 6 x 9 paperback full cover"
      }
    });

    doc.registerFont(
      "Inter",
      path.join(__dirname, "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff")
    );
    doc.registerFont(
      "InterBold",
      path.join(__dirname, "node_modules/@fontsource/inter/files/inter-latin-700-normal.woff")
    );
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      buffer.coverSpecs = specs;
      resolve(buffer);
    });
    doc.on("error", reject);

    // A continuous background reaches every bleed edge. The generated front
    // artwork covers the front panel, while the back and spine stay readable.
    doc.rect(0, 0, coverWidth, coverHeight).fill("#111820");
    doc.rect(0, 0, backRight, 15).fill("#E96E1A");
    doc.image(cover, frontLeft, 0, {
      width: coverWidth - frontLeft,
      height: coverHeight
    });

    // The browser-generated cover may contain a stale author baked into the
    // bottom edge. Replace that area server-side with the verified pen name.
    doc.save();
    doc.fillOpacity(0.88)
      .rect(frontLeft, coverHeight - 58, coverWidth - frontLeft, 58)
      .fill("#0A0D11");
    doc.fillOpacity(1)
      .font("InterBold")
      .fontSize(12)
      .fillColor("#FFFFFF")
      .text(author, frontLeft + 20, coverHeight - 42, {
        width: coverWidth - frontLeft - 40,
        align: "left",
        lineBreak: false,
        ellipsis: true
      });
    doc.restore();

    const backX = bleed + 27;
    const backTextWidth = trimWidth - 54;
    doc.font("InterBold").fontSize(18).fillColor("#FFB15A")
      .text(title, backX, bleed + 38, {
        width: backTextWidth,
        lineGap: 3
      });

    let backY = doc.y + 15;
    if (subtitle) {
      doc.font("Inter").fontSize(10).fillColor("#D7DEE7")
        .text(subtitle, backX, backY, {
          width: backTextWidth,
          lineGap: 2
        });
      backY = doc.y + 16;
    }

    doc.strokeColor("#E96E1A").lineWidth(1.5)
      .moveTo(backX, backY)
      .lineTo(backX + 76, backY)
      .stroke();
    backY += 18;

    doc.font("Inter").fontSize(9.5).fillColor("#F3F6F9")
      .text(blurb || "A practical paperback created for focused, useful results.",
        backX, backY, {
          width: backTextWidth,
          height: 310,
          lineGap: 3,
          ellipsis: true
        });

    if (author) {
      doc.font("InterBold").fontSize(10).fillColor("#FFB15A")
        .text(author, backX, coverHeight - bleed - 54, {
          width: 190,
          lineBreak: false
        });
    }

    // Amazon adds its barcode here. Nothing meaningful is placed underneath.
    const barcodeWidth = 2 * points;
    const barcodeHeight = 1.2 * points;
    const barcodeX = backRight - 0.25 * points - barcodeWidth;
    const barcodeY = coverHeight - bleed - 0.25 * points - barcodeHeight;
    doc.rect(barcodeX, barcodeY, barcodeWidth, barcodeHeight).fill("#FFFFFF");

    if (specs.spineTextIncluded) {
      const spineCenterX = backRight + spineWidth / 2;
      const spineFontSize = Math.min(11, Math.max(7, spineWidth - 9));

      doc.save();
      doc.translate(spineCenterX, coverHeight / 2);
      doc.rotate(90);
      doc.font("InterBold").fontSize(spineFontSize).fillColor("#FFFFFF")
        .text(title, -trimHeight * 0.36, -spineFontSize / 2, {
          width: trimHeight * 0.72,
          align: "center",
          lineBreak: false,
          ellipsis: true
        });
      doc.restore();
    }

    doc.end();
  });
}

function formatKdpPricing(pricing) {
  return [
    "KDP PAPERBACK PRICING ESTIMATE",
    "",
    "Format: " + pricing.format,
    "Trim: " + pricing.trimSize,
    "Interior: " + pricing.ink + ", " + pricing.paper,
    "Bleed: " + pricing.bleed,
    "Interior pages: " + pricing.actualPageCount,
    "Estimated printing cost: $" + pricing.estimatedPrintingCost.toFixed(2),
    "Minimum list price: $" + pricing.minimumListPrice.toFixed(2),
    "",
    ...pricing.options.map((item) =>
      item.label + ": $" + item.price.toFixed(2) +
      " | estimated royalty $" + item.royalty.toFixed(2) +
      " per sale | " + Math.round(item.royaltyRate * 100) + "% rate"
    ),
    "",
    "STANDARD PRICE MONTHLY EXAMPLES",
    ...pricing.monthlyExamples.map((item) =>
      item.sales + " sales: $" + item.estimatedRoyalty.toFixed(2)
    ),
    "",
    pricing.pageCountReady
      ? "Page-count check: ready for KDP's 24-to-828-page range."
      : "PAGE-COUNT WARNING: this interior has " + pricing.actualPageCount +
        " pages. The supported range for this workflow is 24 to 828 pages.",
    "",
    pricing.disclaimer
  ].join("\n");
}

function cleanReleaseList(value, itemLimit, maximumItems = Infinity) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of value) {
    const normalized = text(item, itemLimit).replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalized);
    if (cleaned.length >= maximumItems) break;
  }

  return cleaned;
}

function releaseReadyPackage(packageData, requestedAuthor, fallbackTitle = "") {
  const original = normalizedPackageData(packageData);
  const ready = publicationReadyPackage(packageData, requestedAuthor);
  const autoFixes = [];

  if (!ready) {
    return { packageData: null, autoFixes };
  }

  const originalCore = original && {
    packageTitle: original.packageTitle,
    subtitle: original.subtitle,
    deliverableType: original.deliverableType,
    draftMarkdown: original.draftMarkdown,
    listingTitle: original.listingTitle,
    listingDescription: original.listingDescription,
    authorName: original.authorName
  };
  const readyCore = {
    packageTitle: ready.packageTitle,
    subtitle: ready.subtitle,
    deliverableType: ready.deliverableType,
    draftMarkdown: ready.draftMarkdown,
    listingTitle: ready.listingTitle,
    listingDescription: ready.listingDescription,
    authorName: ready.authorName
  };

  if (JSON.stringify(originalCore) !== JSON.stringify(readyCore)) {
    autoFixes.push(
      "Normalized page labels, authorship, and publishing claims in the final copy."
    );
  }

  if (!text(ready.packageTitle, 300) && text(fallbackTitle, 300)) {
    ready.packageTitle = text(fallbackTitle, 300);
    autoFixes.push("Filled the package title from the approved project title.");
  }

  if (!text(ready.listingTitle, 500) && text(ready.packageTitle, 300)) {
    ready.listingTitle = text(ready.packageTitle, 300);
    autoFixes.push("Filled the listing title from the package title.");
  }

  if (!text(ready.deliverableType, 200) && platform(ready.platform) === "KDP") {
    ready.deliverableType = "KDP paperback";
    autoFixes.push("Filled the missing deliverable type for the paperback export.");
  }

  const originalKeywords = Array.isArray(ready.keywords) ? ready.keywords : [];
  const keywordLimit = platform(ready.platform) === "KDP" ? 7 : 20;
  const cleanedKeywords = cleanReleaseList(originalKeywords, 200, keywordLimit);

  if (JSON.stringify(originalKeywords) !== JSON.stringify(cleanedKeywords)) {
    ready.keywords = cleanedKeywords;
    autoFixes.push("Removed empty or duplicate keywords and fitted the marketplace slots.");
  } else {
    ready.keywords = cleanedKeywords;
  }

  for (const [key, label] of [
    ["productionChecklist", "production checklist"],
    ["riskFlags", "risk flags"]
  ]) {
    const originalItems = Array.isArray(ready[key]) ? ready[key] : [];
    const cleanedItems = cleanReleaseList(originalItems, 500, 30);

    if (JSON.stringify(originalItems) !== JSON.stringify(cleanedItems)) {
      autoFixes.push("Removed empty or duplicate items from the " + label + ".");
    }
    ready[key] = cleanedItems;
  }

  return {
    packageData: ready,
    autoFixes: [...new Set(autoFixes)]
  };
}

function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 ||
      buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PNG dimensions could not be read");
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (!width || !height || width > 20000 || height > 20000) {
    throw new Error("PNG dimensions are outside the supported range");
  }

  return { width, height };
}

function pdfStructure(buffer, expectedWidth, expectedHeight) {
  const source = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : "";
  const mediaBoxes = [...source.matchAll(
    /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g
  )].map((match) => match.slice(1).map(Number));
  const dimensionsMatch = mediaBoxes.length > 0 && mediaBoxes.every((box) =>
    Math.abs(box[0]) < 0.02 &&
    Math.abs(box[1]) < 0.02 &&
    Math.abs(box[2] - expectedWidth) < 0.02 &&
    Math.abs(box[3] - expectedHeight) < 0.02
  );

  return {
    headerValid: source.startsWith("%PDF-"),
    eofValid: /%%EOF\s*$/.test(source),
    dimensionsMatch,
    mediaBoxCount: mediaBoxes.length,
    fontsEmbedded: /\/FontFile(?:2|3)?\b/.test(source),
    bytes: Buffer.isBuffer(buffer) ? buffer.length : 0
  };
}

function markdownReleaseIssues(markdown) {
  const source = String(markdown || "");
  const lines = source.split(/\r?\n/);
  const headings = [];

  lines.forEach((line, index) => {
    const match = line.trim().match(/^(#{1,3})\s+(.+)$/);
    if (match) headings.push({ index, title: match[2].trim() });
  });

  const emptySections = headings.filter((heading, index) => {
    const nextIndex = headings[index + 1]?.index ?? lines.length;
    return !lines.slice(heading.index + 1, nextIndex).some((line) => {
      const content = line.trim();
      return content && !/^[-_]{3,}$/.test(content);
    });
  }).map((heading) => heading.title);
  const chapterNumbers = headings.map((heading) =>
    heading.title.match(/^chapter\s+(\d+)\b/i)
  ).filter(Boolean).map((match) => Number(match[1]));
  const missingChapters = [];

  if (chapterNumbers.length) {
    const unique = [...new Set(chapterNumbers)].sort((a, b) => a - b);
    const last = unique[unique.length - 1];
    for (let number = 1; number <= last; number += 1) {
      if (!unique.includes(number)) missingChapters.push(number);
    }
  }

  return { headings, emptySections, missingChapters };
}

function releaseFingerprint(packageData, cover, interiorArt) {
  const payload = {
    platform: platform(packageData.platform),
    packageTitle: text(packageData.packageTitle, 300),
    subtitle: text(packageData.subtitle, 500),
    deliverableType: text(packageData.deliverableType, 200),
    draftMarkdown: text(packageData.draftMarkdown, 50000),
    listingTitle: text(packageData.listingTitle, 500),
    listingDescription: text(packageData.listingDescription, 10000),
    authorName: text(packageData.authorName, 160),
    keywords: cleanReleaseList(packageData.keywords, 200, 20),
    interiorArt: interiorArt.map((item) => ({
      filename: item.filename,
      sha256: createHash("sha256").update(item.buffer).digest("hex")
    })),
    coverSha256: cover
      ? createHash("sha256").update(cover).digest("hex")
      : null
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function buildReleaseQa({
  title,
  package: inputPackage,
  qualityReview,
  cover: inputCover,
  authorName: requestedAuthor
}) {
  const normalized = releaseReadyPackage(
    inputPackage,
    requestedAuthor,
    title
  );
  const packageData = normalized.packageData;

  if (!packageData) {
    throw new Error("A production package is required");
  }

  const market = platform(packageData.platform);
  const checks = [];
  const blockers = [];
  const warnings = [];
  const autoFixes = normalized.autoFixes;
  let cover = null;
  let coverDimensions = null;
  let interiorArt = [];
  let printable = null;
  let wrapCover = null;
  let pricing = null;
  let coverSpecs = null;

  function addCheck(id, label, status, detail, blocker) {
    checks.push({ id, label, status, detail });
    if (status === "BLOCKED" && (blocker || detail)) {
      blockers.push(blocker || detail);
    }
  }

  addCheck(
    "content-quality",
    "Written content QA",
    qualityReview?.verdict === "PASS" ? "PASS" : "BLOCKED",
    qualityReview?.verdict === "PASS"
      ? "The independent content review passed."
      : "The written package does not have a passing Quality Control report.",
    "Pass the written Quality Control check before release."
  );

  const missingMetadata = [
    ["packageTitle", "book title"],
    ["deliverableType", "deliverable type"],
    ["listingTitle", "listing title"],
    ["listingDescription", "listing description"],
    ["authorName", "author or pen name"]
  ].filter(([key]) => !text(packageData[key], key === "listingDescription" ? 10000 : 500))
    .map(([, label]) => label);

  addCheck(
    "metadata",
    "Listing metadata",
    missingMetadata.length
      ? "BLOCKED"
      : autoFixes.length
        ? "FIXED"
        : "PASS",
    missingMetadata.length
      ? "Missing " + missingMetadata.join(", ") + "."
      : (packageData.keywords || []).length +
        " clean keyword" + ((packageData.keywords || []).length === 1 ? "" : "s") +
        " and all required listing fields are present."
  );

  if (!(packageData.keywords || []).length) {
    warnings.push("No optional search keywords were supplied.");
  }

  const draft = text(packageData.draftMarkdown, 50000);
  const draftIssues = markdownReleaseIssues(draft);
  const draftBlockers = [];

  if (draft.length < 100) {
    draftBlockers.push("The manuscript is substantially empty.");
  }
  if (illustrationPlaceholderPattern().test(draft)) {
    draftBlockers.push("Unresolved illustration placeholders remain in the manuscript.");
  }
  if (draftIssues.emptySections.length) {
    draftBlockers.push(
      "These manuscript sections have no content: " +
      draftIssues.emptySections.slice(0, 4).join(", ") + "."
    );
  }
  if (draftIssues.missingChapters.length) {
    draftBlockers.push(
      "The chapter numbering skips: " +
      draftIssues.missingChapters.slice(0, 8).join(", ") + "."
    );
  }

  addCheck(
    "manuscript",
    "Manuscript sections",
    draftBlockers.length ? "BLOCKED" : "PASS",
    draftBlockers.length
      ? draftBlockers.join(" ")
      : draftIssues.headings.length +
        " structured section" + (draftIssues.headings.length === 1 ? "" : "s") +
        " checked; none are empty.",
    draftBlockers.join(" ")
  );

  try {
    interiorArt = validatedInteriorArt(packageData.interiorArt);
    const available = new Map(interiorArt.map((item) => [item.filename, item]));
    const references = [...draft.matchAll(
      /!\[[^\]]*\]\((?:interior-art\/)?(interior-art-\d{2}\.png)\)/gi
    )].map((match) => match[1].toLowerCase());
    const missingArt = [...new Set(references.filter((item) => !available.has(item)))];
    const unsupportedImages = [...draft.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((item) => !/(?:^|\/)interior-art-\d{2}\.png$/i.test(item));
    const smallArt = interiorArt.map((item) => ({
      filename: item.filename,
      ...pngDimensions(item.buffer)
    })).filter((item) => item.width < 900 || item.height < 900);
    const artBlockers = [];

    if (missingArt.length) {
      artBlockers.push("Missing embedded artwork files: " + missingArt.join(", ") + ".");
    }
    if (unsupportedImages.length) {
      artBlockers.push("The manuscript contains image links that cannot be embedded.");
    }
    if (smallArt.length) {
      artBlockers.push(
        "Interior artwork is too small for a clean print result: " +
        smallArt.map((item) => item.filename).join(", ") + "."
      );
    }
    if (isColoringBookPackage(packageData) && !interiorArt.length) {
      artBlockers.push("A coloring book needs generated interior artwork before release.");
    }

    addCheck(
      "interior-art",
      "Interior artwork",
      artBlockers.length ? "BLOCKED" : "PASS",
      artBlockers.length
        ? artBlockers.join(" ")
        : interiorArt.length
          ? interiorArt.length + " valid high-resolution PNG file" +
            (interiorArt.length === 1 ? "" : "s") + " embedded."
          : "No embedded illustrations are required for this manuscript.",
      artBlockers.join(" ")
    );
  } catch (error) {
    addCheck(
      "interior-art",
      "Interior artwork",
      "BLOCKED",
      error.message,
      "Repair or regenerate the interior artwork: " + error.message
    );
  }

  try {
    printable = await printablePdf(packageData);
    if (printable.recordPagesAdded) {
      autoFixes.push("Added " + printable.recordPagesAdded +
        " usable, labeled record forms to finish the logbook at " + printable.pageCount +
        " pages. Pricing and wrap sizing use the finished interior. No blank filler or repair instructions were added.");
    }
    const expectedSize = market === "KDP" ? [432, 648] : [612, 792];
    const structure = pdfStructure(printable, expectedSize[0], expectedSize[1]);
    const pdfProblems = [];

    if (!structure.headerValid || !structure.eofValid || structure.bytes < 1000) {
      pdfProblems.push("the PDF file structure is incomplete");
    }
    if (!structure.dimensionsMatch) {
      pdfProblems.push("one or more pages use the wrong dimensions");
    }
    if (!structure.fontsEmbedded) {
      pdfProblems.push("the required fonts are not embedded");
    }

    addCheck(
      "interior-pdf",
      "Interior PDF",
      pdfProblems.length ? "BLOCKED" : "PASS",
      pdfProblems.length
        ? "Interior PDF failed: " + pdfProblems.join("; ") + "."
        : "Valid " + Math.round(structure.bytes / 1024) + " KB PDF with " +
          printable.pageCount + " correctly sized pages and embedded fonts.",
      pdfProblems.length
        ? "Regenerate the interior PDF because " + pdfProblems.join("; ") + "."
        : ""
    );

    addCheck(
      "blank-pages",
      "Blank-page safety",
      "PASS",
      printable.intentionalBlankPageCount
        ? printable.intentionalBlankPageCount +
          " blank reverse page" +
          (printable.intentionalBlankPageCount === 1 ? " was" : "s were") +
          " intentionally placed behind artwork."
        : "The renderer did not insert blank reverse pages."
    );

    if (market === "KDP") {
      addCheck(
        "page-count",
        "KDP page count",
        printable.pageCount >= 24 && printable.pageCount <= 828
          ? "PASS"
          : "BLOCKED",
        printable.pageCount >= 24 && printable.pageCount <= 828
          ? printable.pageCount + " pages; the 24-to-828-page range is met."
          : printable.pageCount +
            " pages; this 6 x 9 black-and-white paperback workflow supports 24 to 828.",
        printable.pageCount < 24
          ? "Expand the manuscript from " + printable.pageCount +
            " to at least 24 finished pages."
          : "Reduce the manuscript from " + printable.pageCount +
            " to no more than 828 finished pages."
      );
    }
  } catch (error) {
    addCheck(
      "interior-pdf",
      "Interior PDF",
      "BLOCKED",
      error.message,
      "The interior PDF could not be generated: " + error.message
    );
  }

  if (inputCover) {
    try {
      cover = validatedCover(inputCover);
      coverDimensions = pngDimensions(cover);
      const expectedCover = market === "KDP" &&
        (coverDimensions.width !== 1838 || coverDimensions.height !== 2775);
      const authorMismatch = market === "KDP" && inputCover.authorName &&
        text(inputCover.authorName, 160) !== text(packageData.authorName, 160);
      const coverProblems = [];

      if (expectedCover) {
        coverProblems.push(
          "the front cover must be 1838 x 2775 pixels for this 6 x 9 workflow"
        );
      }
      if (authorMismatch) {
        coverProblems.push("the author name changed after this cover was generated");
      }

      addCheck(
        "cover-art",
        "Front cover artwork",
        coverProblems.length ? "BLOCKED" : "PASS",
        coverProblems.length
          ? "Cover failed: " + coverProblems.join("; ") + "."
          : "Valid " + coverDimensions.width + " x " +
            coverDimensions.height + " PNG.",
        coverProblems.length
          ? "Generate a new front cover because " + coverProblems.join("; ") + "."
          : ""
      );
    } catch (error) {
      addCheck(
        "cover-art",
        "Front cover artwork",
        "BLOCKED",
        error.message,
        "Generate a valid PNG front cover: " + error.message
      );
    }
  } else {
    addCheck(
      "cover-art",
      "Front cover artwork",
      market === "KDP" ? "BLOCKED" : "WARN",
      market === "KDP"
        ? "No front cover has been generated."
        : "No optional product cover was supplied.",
      market === "KDP" ? "Generate the front cover before release." : ""
    );
    if (market !== "KDP") warnings.push("No optional product cover was supplied.");
  }

  if (market === "KDP" && printable) {
    pricing = kdpPricing(printable.pageCount);
    coverSpecs = kdpCoverSpecs(printable.pageCount);
    const pricingReady = pricing.pageCountReady &&
      pricing.recommendedPrice > pricing.estimatedPrintingCost;

    addCheck(
      "pricing",
      "KDP pricing",
      pricingReady ? "PASS" : "BLOCKED",
      pricingReady
        ? "$" + pricing.recommendedPrice.toFixed(2) +
          " recommended price is above the estimated $" +
          pricing.estimatedPrintingCost.toFixed(2) + " print cost."
        : "Pricing cannot be finalized until the page-count requirement passes.",
      "Finish the interior before using the KDP pricing estimate."
    );

    if (cover && pricing.pageCountReady) {
      try {
        wrapCover = await kdpWrapCoverPdf(
          packageData,
          cover,
          printable.pageCount,
          packageData.authorName
        );
        const coverStructure = pdfStructure(
          wrapCover,
          coverSpecs.coverWidthInches * 72,
          coverSpecs.coverHeightInches * 72
        );
        const coverPdfReady = coverStructure.headerValid &&
          coverStructure.eofValid && coverStructure.dimensionsMatch &&
          coverStructure.fontsEmbedded && coverStructure.bytes >= 1000;

        addCheck(
          "cover-pdf",
          "KDP cover PDF",
          coverPdfReady ? "PASS" : "BLOCKED",
          coverPdfReady
            ? "Valid " + coverSpecs.coverWidthInches.toFixed(4) + " x " +
              coverSpecs.coverHeightInches.toFixed(4) +
              " inch wrap with a " + coverSpecs.spineWidthInches.toFixed(4) +
              " inch spine."
            : "The generated wrap cover failed its PDF structure or dimension check.",
          "Regenerate the KDP wrap cover before release."
        );
      } catch (error) {
        addCheck(
          "cover-pdf",
          "KDP cover PDF",
          "BLOCKED",
          error.message,
          "The KDP wrap cover could not be generated: " + error.message
        );
      }
    } else {
      addCheck(
        "cover-pdf",
        "KDP cover PDF",
        "BLOCKED",
        "The wrap cover waits for a valid front cover and a finished page count.",
        "Finish the interior and front cover so the KDP wrap can be generated."
      );
    }
  }

  const uniqueBlockers = [...new Set(blockers.filter(Boolean))];
  const fingerprint = releaseFingerprint(packageData, cover, interiorArt);
  const verdict = uniqueBlockers.length ? "BLOCKED" : "READY";
  const report = {
    reviewedAt: new Date().toISOString(),
    platform: market,
    verdict,
    packageFingerprint: fingerprint,
    summary: verdict === "READY"
      ? "Every final file passed. The package is ready for your approval and one marketplace preview."
      : uniqueBlockers.length + " release blocker" +
        (uniqueBlockers.length === 1 ? " remains." : "s remain."),
    checks,
    autoFixes,
    blockers: uniqueBlockers,
    warnings: [...new Set(warnings)],
    artifacts: {
      interiorPdf: printable ? {
        filename: market === "KDP"
          ? "1-manuscript-interior.pdf"
          : "printable.pdf",
        bytes: printable.length,
        pageCount: printable.pageCount,
        intentionalBlankPageCount: printable.intentionalBlankPageCount,
        recordPagesAdded: printable.recordPagesAdded || 0
      } : null,
      coverPdf: wrapCover ? {
        filename: "2-paperback-cover.pdf",
        bytes: wrapCover.length,
        widthInches: coverSpecs.coverWidthInches,
        heightInches: coverSpecs.coverHeightInches,
        spineWidthInches: coverSpecs.spineWidthInches
      } : null,
      coverPng: cover ? {
        width: coverDimensions.width,
        height: coverDimensions.height,
        bytes: cover.length
      } : null
    },
    pricing
  };

  return {
    report,
    packageData,
    printable,
    wrapCover,
    cover,
    coverSpecs,
    pricing,
    interiorArt
  };
}

function getSources(response) {
  const found = new Map();

  function remember(source) {
    if (!source?.url) return;

    try {
      const url = new URL(source.url);
      if (!["http:", "https:"].includes(url.protocol)) return;

      found.set(url.href, {
        title: source.title || url.hostname,
        url: url.href
      });
    } catch (error) {}
  }

  for (const item of response.output || []) {
    for (const source of item.action?.sources || []) {
      remember(source);
    }

    for (const part of item.content || []) {
      for (const note of part.annotations || []) {
        if (note.type === "url_citation") remember(note);
      }
    }
  }

  return [...found.values()].slice(0, 10);
}

app.get(["/", "/index.html"], (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(INDEX_PATH);
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: APP_VERSION,
    openaiConfigured: Boolean(client),
    trendRadarAvailable: Boolean(client),
    productionAgentAvailable: Boolean(client),
    qualityControlAvailable: Boolean(client),
    releaseQaAvailable: true,
    revisionAgentAvailable: Boolean(client),
    coverStudioAvailable: Boolean(client),
    securityGateAvailable: true,
    viralRemixAvailable: Boolean(client && (ffmpegPath || process.env.FFMPEG_PATH)),
    reusableFootageProvider: "Wikimedia Commons"
  });
});

app.post("/api/analyze", limitAI, async (req, res) => {
  const title = text(req.body.title, 200);
  const market = platform(req.body.platform);

  if (!title) {
    return res.status(400).json({
      error: "Product idea is required"
    });
  }

  const decision = localDecision(req.body);

  if (!client) {
    return res.json({
      ...decision,
      title,
      platform: market,
      reasoning: ["Local scoring used because OpenAI is not configured."]
    });
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You evaluate original Amazon KDP, Etsy, and Shopify product opportunities. Never copy books, listings, brands, trademarks, characters, artwork, or protected text. Be practical and concise.",
      input:
        "Evaluate this " + market + " idea: " + title + ". " +
        "The local score is " + decision.score + "/100 and the local verdict is " +
        decision.verdict + ". Give three strengths, two risks, and one specific way to improve it.",
      max_output_tokens: 900
    });

    res.json({
      ...decision,
      title,
      platform: market,
      aiAnalysis: response.output_text
    });
  } catch (error) {
    res.status(502).json({
      error: "AI analysis failed",
      message: error.message,
      fallback: decision
    });
  }
});

app.post("/api/product-brief", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.title, 200);
  const market = platform(req.body.platform);
  const notes = text(req.body.notes, 1200);

  if (!title) {
    return res.status(400).json({
      error: "Product idea is required"
    });
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the Product Architect for Publisher Forge. Create original, useful product plans. Never copy existing products or protected content.",
      input:
        "Create a complete " + market + " product brief for: " + title + ". " +
        (notes ? "Extra notes: " + notes + ". " : "") +
        "Include the buyer, problem, promise, differentiation, structure, page or section plan, metadata angle, risks, and QA checklist.",
      max_output_tokens: 1800
    });

    res.json({
      title,
      platform: market,
      brief: response.output_text
    });
  } catch (error) {
    res.status(502).json({
      error: "Product brief failed",
      message: error.message
    });
  }
});

app.post("/api/production-package", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.title, 200);
  const market = platform(req.body.platform);
  const brief = text(req.body.brief, 12000);

  if (!title) {
    return res.status(400).json({
      error: "Product idea is required"
    });
  }

  if (!brief) {
    return res.status(400).json({
      error: "An approved product brief is required"
    });
  }

  const keywordTarget = market === "Etsy"
    ? 13
    : market === "Shopify"
      ? 10
      : 7;

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the Production Agent for Publisher Forge. Turn an approved product brief into an original review package for a human publisher. Never copy existing books, listings, brands, trademarks, characters, artwork, or protected text. Never invent an author, illustrator, publisher, press, imprint, commissioned-art claim, font, license, delivered filename, or completed page count. If front matter genuinely needs an author and none was supplied, write [AUTHOR NAME]. Claim only artwork, pages, and files that are actually present in your returned package. Do not invent endorsements, sales claims, medical claims, or legal guarantees. Do not say the package was published or marketplace-approved. The draft must be useful and substantial, but clearly remain subject to human editing, fact-checking, design, formatting, and approval.",
      input:
        "Build a production review package for this " + market + " product. " +
        "Working title: " + title + ". Approved brief: " + brief + ". " +
        (market === "KDP"
          ? "Create original manuscript or interior copy in Markdown, plus KDP-oriented listing metadata."
          : market === "Etsy"
            ? "Create the complete written content and layout directions for the digital product in Markdown, plus Etsy-oriented listing metadata."
            : "Create the complete original digital product content and layout directions in Markdown, plus a conversion-focused Shopify product title, product-page description, product type, SEO angle, and tags. Treat the returned keyword phrases as Shopify tags.") +
        " If the finished product genuinely needs interior illustrations, add no more than twelve standalone tokens in the exact format [Illustration Placeholder: specific visual description]. Do not request extra marketing images inside the manuscript. Return exactly " + keywordTarget + " useful keyword phrases. " +
        "Do not describe files that Publisher Forge has not generated and do not assign credit to an unnamed person or company. Include a practical production checklist and identify any claims, facts, intellectual-property concerns, or design work that a human must review before release.",
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_production_package",
          strict: true,
          schema: productionPackageSchema
        }
      },
      max_output_tokens: 7000
    });

    const productionPackage = parseProductionPackage(response);

    res.json({
      createdAt: new Date().toISOString(),
      platform: market,
      ...productionPackage
    });
  } catch (error) {
    res.status(502).json({
      error: "Production package failed",
      message: error.message
    });
  }
});

app.post("/api/quality-review", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.title, 200);
  const market = platform(req.body.platform);
  const brief = text(req.body.brief, 12000);
  const packageText = text(req.body.packageText, 50000);
  const previousReview = text(req.body.previousReview, 12000);
  const draftText = productionDraftSection(packageText);
  const hasIllustrationPlaceholders =
    illustrationPlaceholderPattern().test(draftText);
  const resolvedInteriorArtCount = (
    draftText.match(
      /!\[[^\]]*Interior illustration[^\]]*\]\(interior-art-\d{2}\.png\)/gi
    ) || []
  ).length;
  const placeholderCleanedPackageText = resolvedInteriorArtCount &&
      !hasIllustrationPlaceholders
    ? packageText.replace(
        illustrationPlaceholderPattern(),
        "completed interior artwork"
      )
    : packageText;
  const packageTextForReview = normalizePageLabels(
    placeholderCleanedPackageText
  );

  if (!title || !brief || !packageText) {
    return res.status(400).json({
      error: "A title, approved brief, and production package are required"
    });
  }

  try {
    const qualityRequest = {
      model: MODEL,
      instructions:
        "You are the independent Quality Control Agent for Publisher Forge. Audit the written production package against its approved brief and intended marketplace. Score each category from 0 to 100. Be strict, specific, practical, and concise. Keep the summary under 80 words and return no more than four short items in each array. PASS means the written package is ready for human production review; it does not mean the marketplace approved it. Put only serious unresolved release-stopping content concerns in blockers, such as copied or infringing material, unsafe promises, a substantially empty draft, unresolved illustration placeholders inside the Product draft, major misalignment with the approved brief, invented author/illustrator/publisher attribution, a false commissioned-art or license claim, or unsupported claims about delivered filenames, artwork totals, or page counts. Markdown references to interior-art PNG files count as resolved artwork. Do not infer that artwork is missing from stale checklist or risk wording outside the Product draft. Publisher Forge automatically handles page numbering, embedded fonts and licenses, image embedding, resolution checks, single-sided coloring-page order, KDP page minimums, margins, bleed, spine width, cover PDF generation, and black-and-white metadata. Never assign those software tasks to the user. Put only concrete content corrections in requiredFixes. The only human final check is opening the marketplace preview once to make sure the finished product looks right. Do not block or require revision for that preview. Do not repeat a prior issue that the revised package resolved. If the written content and metadata are useful, aligned, original, and safe, return empty blockers and requiredFixes arrays. Do not claim that Amazon KDP, Etsy, or Shopify has approved the product.",
      input:
        "Review this " + market + " production package. " +
        "Working title: " + title + ".\n\n" +
        "APPROVED BRIEF:\n" + brief + "\n\n" +
        "INTERIOR ART STATUS: " + resolvedInteriorArtCount +
        " generated image references are present in the Product draft; " +
        (hasIllustrationPlaceholders
          ? "unresolved draft placeholders remain.\n\n"
          : "no unresolved draft placeholders remain.\n\n") +
        "PRODUCTION PACKAGE:\n" + packageTextForReview +
        (previousReview
          ? "\n\nPRIOR QUALITY REPORT:\n" + previousReview +
            "\n\nThis is a recheck. Verify each prior issue against the revised package and remove it when resolved."
          : ""),
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_quality_review",
          strict: true,
          schema: qualityReviewSchema
        }
      },
      reasoning: { effort: "low" }
    };

    let response = await client.responses.create({
      ...qualityRequest,
      max_output_tokens: 4000
    });

    if (response.status === "incomplete" &&
        response.incomplete_details?.reason === "max_output_tokens") {
      response = await client.responses.create({
        ...qualityRequest,
        instructions: qualityRequest.instructions +
          " Return the minimum wording necessary to complete every required JSON field.",
        max_output_tokens: 7000
      });
    }

    const review = parseQualityReview(response);
    const metrics = {
      briefAlignment: score(review.briefAlignment),
      buyerUsefulness: score(review.buyerUsefulness),
      originalitySafety: score(review.originalitySafety),
      listingQuality: score(review.listingQuality),
      productionReadiness: score(review.productionReadiness)
    };
    const overallScore = Math.round(
      Object.values(metrics).reduce((total, value) => total + value, 0) /
      Object.keys(metrics).length
    );
    const rawBlockers = Array.isArray(review.blockers)
      ? review.blockers.filter(Boolean)
      : [];
    const rawRequiredFixes = Array.isArray(review.requiredFixes)
      ? review.requiredFixes.filter(Boolean)
      : [];
    const resolvedArtworkComplaint = (item) =>
      resolvedInteriorArtCount > 0 && !hasIllustrationPlaceholders &&
      /(?:unresolved|missing|replace|placeholder).*(?:artwork|illustration)|(?:artwork|illustration).*(?:unresolved|missing|replace|placeholder)/i
        .test(String(item || ""));
    const initialHumanChecks = [...rawBlockers, ...rawRequiredFixes]
      .filter((item) =>
        isHumanProductionCheck(item) &&
        !resolvedArtworkComplaint(item) &&
        !isAutomaticExportTask(item));
    const blockers = rawBlockers.filter((item) =>
      !isHumanProductionCheck(item) &&
      !resolvedArtworkComplaint(item) &&
      !isAutomaticExportTask(item));
    let requiredFixes = rawRequiredFixes
      .filter((item) =>
        !isHumanProductionCheck(item) &&
        !resolvedArtworkComplaint(item) &&
        !isAutomaticExportTask(item));

    if (hasIllustrationPlaceholders &&
        !blockers.some((item) => /illustration placeholder/i.test(item))) {
      blockers.unshift(
        "Generate and insert every unresolved illustration placeholder before release."
      );
    }
    const strongReview = !blockers.length && overallScore >= 85;
    const recommendations = strongReview ? requiredFixes : [];

    if (strongReview) requiredFixes = [];

    const verdict = blockers.length
      ? "BLOCKED"
      : overallScore >= 75 && !requiredFixes.length
        ? "PASS"
        : "REVISE";
    const humanChecks = verdict === "PASS"
      ? [market === "KDP"
          ? "Open Amazon KDP's Print Previewer once and make sure the cover and pages look right before publishing."
          : "Open the finished files once and make sure they look right before listing them."]
      : [...new Set(initialHumanChecks)];

    res.json({
      reviewedAt: new Date().toISOString(),
      platform: market,
      overallScore,
      verdict,
      summary: review.summary,
      metrics,
      strengths: Array.isArray(review.strengths)
        ? review.strengths.filter(Boolean)
        : [],
      requiredFixes,
      blockers,
      humanChecks,
      recommendations
    });
  } catch (error) {
    res.status(502).json({
      error: "Quality review failed",
      message: error.message
    });
  }
});

app.post("/api/revise-package", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.title, 200);
  const market = platform(req.body.platform);
  const brief = text(req.body.brief, 12000);
  const packageText = text(req.body.packageText, 50000);
  const reviewText = text(req.body.reviewText, 12000);

  if (!title || !brief || !packageText || !reviewText) {
    return res.status(400).json({
      error: "A title, approved brief, production package, and quality review are required"
    });
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the Production Revision Agent for Publisher Forge. Rewrite the complete production package to resolve every concrete required fix and release blocker in the independent Quality Control report in one pass. Preserve strong material that still serves the approved brief, including every existing Markdown reference to an interior-art PNG. Make the actual corrections inside the draft, listing title, listing description, keywords, and other relevant fields; do not merely copy an AI-fixable issue into the checklist or risk flags. Never invent an author, illustrator, publisher, press, imprint, commissioned-art claim, font, license, delivered filename, or completed page count. If front matter genuinely needs an author and none was supplied, write [AUTHOR NAME]. Claim only artwork, pages, and files actually present in the package. If interior art is needed, use no more than twelve standalone tokens in the exact format [Illustration Placeholder: specific visual description] so Interior Art Studio can finish them automatically. Do not request separate marketing images inside the manuscript. For inherently human-only work such as final visual inspection, trim and bleed confirmation, proofreading, ISBN selection, or marketplace upload, include one clear checklist item without presenting it as an unresolved content defect. Never copy existing books, listings, brands, trademarks, characters, artwork, or protected text. Remove or qualify unsupported claims. Return a complete replacement package, not a patch or commentary. Do not say the package was published, marketplace-approved, or quality-approved. A separate Quality Control pass and human approval are still required.",
      input:
        "Revise this " + market + " production package. " +
        "Working title: " + title + ".\n\n" +
        "APPROVED BRIEF:\n" + brief + "\n\n" +
        "CURRENT PRODUCTION PACKAGE:\n" + packageText + "\n\n" +
        "QUALITY CONTROL REPORT:\n" + reviewText,
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_revised_package",
          strict: true,
          schema: productionPackageSchema
        }
      },
      max_output_tokens: 7000
    });

    const productionPackage = parseProductionPackage(response);

    res.json({
      createdAt: new Date().toISOString(),
      revisedAt: new Date().toISOString(),
      platform: market,
      ...productionPackage
    });
  } catch (error) {
    res.status(502).json({
      error: "Production revision failed",
      message: error.message
    });
  }
});

app.post("/api/generate-cover", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.packageTitle || req.body.title, 200);
  const subtitle = text(req.body.subtitle, 300);
  const deliverable = text(req.body.deliverableType, 160);
  const market = platform(req.body.platform);
  const description = text(req.body.listingDescription, 1200);

  if (!title) {
    return res.status(400).json({ error: "A package title is required" });
  }

  const prompt = [
    "Create original portrait product artwork for a " + market + " product.",
    "Product title for creative context: " + title + ".",
    subtitle ? "Subtitle for creative context: " + subtitle + "." : "",
    deliverable ? "Deliverable: " + deliverable + "." : "",
    description ? "Product purpose: " + description + "." : "",
    "Generate flat front-cover or primary product artwork only in a polished, commercially useful editorial style.",
    "Leave calm, uncluttered negative space across the upper half for title typography that will be added later.",
    "Do not render any words, letters, logos, watermarks, trademarks, brand marks, celebrities, copyrighted characters, product mockups, book spines, or back covers.",
    "Use original visual elements and avoid imitating any named artist or existing product."
  ].filter(Boolean).join("\n");

  try {
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1536",
      quality: "medium"
    });
    const base64 = result.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error("The image service did not return a cover image");
    }

    res.json({
      generatedAt: new Date().toISOString(),
      mimeType: "image/png",
      base64
    });
  } catch (error) {
    res.status(502).json({
      error: "Cover generation failed",
      message: error.code === "moderation_blocked"
        ? "The image request was blocked. Adjust the product wording and try again."
        : error.message
    });
  }
});

app.post("/api/generate-interior-art", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const title = text(req.body.packageTitle || req.body.title, 200);
  const market = platform(req.body.platform);
  const draftMarkdown = text(req.body.draftMarkdown, 50000);

  if (!title || !draftMarkdown) {
    return res.status(400).json({
      error: "A production package with draft content is required"
    });
  }

  try {
    const slots = extractIllustrationSlots(draftMarkdown);
    const startIndex = Math.max(0, Math.min(11,
      Number.parseInt(req.body.startIndex, 10) || 0));
    const batchSize = Math.max(1, Math.min(3,
      Number.parseInt(req.body.batchSize, 10) || 3));
    const batchSlots = slots.slice(0, batchSize).map((slot) => ({
      ...slot,
      index: startIndex + slot.index
    }));

    if (!slots.length) {
      return res.status(400).json({
        error: "No illustration placeholders were found in this draft"
      });
    }

    const artworks = [];

    for (const slot of batchSlots) {
      const prompt = [
        "Create one original black-and-white interior line illustration for a " +
          market + " publishing product titled " + title + ".",
        "Illustration context: " + slot.subject + ".",
        "Use clean confident black ink lines on a pure white background.",
        "Make it suitable for a 6 x 9 inch paperback interior: centered subject, generous margins, high contrast, no gray background, no color, and no full bleed.",
        "Keep the same practical field-guide and activity-book visual language across the set.",
        "Do not render any words, letters, numbers, captions, logos, watermarks, trademarks, brand marks, celebrities, copyrighted characters, or page borders.",
        "Do not imitate a named artist or existing publication."
      ].join("\n");
      const result = await client.images.generate({
        model: IMAGE_MODEL,
        prompt,
        size: "1024x1024",
        quality: "low"
      });
      const base64 = result.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error(
          "The image service did not return interior illustration " + slot.index
        );
      }

      artworks.push({
        index: slot.index,
        filename: "interior-art-" +
          String(slot.index).padStart(2, "0") + ".png",
        alt: "Original interior illustration " + slot.index,
        context: slot.subject,
        mimeType: "image/png",
        base64
      });
    }

    let replacementIndex = 0;
    const updatedMarkdown = draftMarkdown.replace(
      illustrationPlaceholderPattern(),
      (match) => {
        replacementIndex += 1;
        if (replacementIndex > batchSlots.length) return match;
        const artIndex = startIndex + replacementIndex;
        const filename = "interior-art-" +
          String(artIndex).padStart(2, "0") + ".png";
        return "![Interior illustration " + artIndex + "](" +
          filename + ")";
      }
    );

    res.json({
      generatedAt: new Date().toISOString(),
      sourceMarkdown: draftMarkdown,
      draftMarkdown: updatedMarkdown,
      artworks,
      remaining: Math.max(0, slots.length - batchSlots.length)
    });
  } catch (error) {
    const inputError = /supports up to 12/.test(error.message);
    res.status(inputError ? 409 : 502).json({
      error: inputError
        ? "Too many illustration placeholders"
        : "Interior art generation failed",
      message: error.code === "moderation_blocked"
        ? "An illustration request was blocked. Revise the affected section and try again."
        : error.message
    });
  }
});

app.post("/api/release-qa", async (req, res) => {
  if (!req.body.package || typeof req.body.package !== "object") {
    return res.status(400).json({
      error: "A production package is required"
    });
  }

  try {
    const release = await buildReleaseQa({
      title: text(req.body.title, 200),
      package: req.body.package,
      qualityReview: req.body.qualityReview,
      cover: req.body.cover,
      authorName: req.body.authorName
    });
    const fixedPackage = { ...release.packageData };

    // The browser already owns these image payloads. Avoid echoing tens of
    // megabytes of base64 back merely to return deterministic text fixes.
    delete fixedPackage.interiorArt;

    res.json({
      ...release.report,
      fixedPackage
    });
  } catch (error) {
    res.status(500).json({
      error: "Release check failed",
      message: error.message
    });
  }
});

app.post("/api/kdp-pricing", async (req, res) => {
  const packageData = publicationReadyPackage(
    req.body.package,
    req.body.package?.authorName
  );

  if (!packageData || platform(packageData.platform) !== "KDP") {
    return res.status(400).json({ error: "A KDP production package is required" });
  }

  try {
    const pdf = await printablePdf(packageData);
    res.json(kdpPricing(pdf.pageCount));
  } catch (error) {
    res.status(500).json({
      error: "KDP pricing estimate failed",
      message: error.message
    });
  }
});

app.post("/api/kdp-cover", async (req, res) => {
  const authorName = publishingAuthor(req.body.authorName);
  const packageData = publicationReadyPackage(req.body.package, authorName);
  let cover = null;

  if (!packageData || platform(packageData.platform) !== "KDP") {
    return res.status(400).json({ error: "A KDP production package is required" });
  }

  if (!authorName) {
    return res.status(400).json({ error: "Add an author or pen name first" });
  }

  try {
    cover = validatedCover(req.body.cover);
    const dimensions = pngDimensions(cover);

    if (dimensions.width !== 1838 || dimensions.height !== 2775) {
      return res.status(400).json({
        error: "Generate the KDP front cover again",
        message: "The front cover must be 1838 x 2775 pixels for this 6 x 9 workflow."
      });
    }
    if (req.body.cover?.authorName &&
        text(req.body.cover.authorName, 160) !== authorName) {
      return res.status(409).json({
        error: "The author name changed",
        message: "Generate the cover again so the artwork and KDP wrap use the same author name."
      });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!cover) {
    return res.status(400).json({ error: "Generate a front cover first" });
  }

  try {
    const printable = await printablePdf(packageData);
    const wrap = await kdpWrapCoverPdf(
      packageData,
      cover,
      printable.pageCount,
      authorName
    );
    const specs = wrap.coverSpecs;
    const structure = pdfStructure(
      wrap,
      specs.coverWidthInches * 72,
      specs.coverHeightInches * 72
    );

    if (!structure.headerValid || !structure.eofValid ||
        !structure.dimensionsMatch || !structure.fontsEmbedded) {
      throw new Error("The generated cover did not pass its final PDF validation.");
    }
    const filename = text(packageData.packageTitle, 100)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "publisher-forge-book";

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="' + filename + '-kdp-cover-wrap.pdf"',
      "Cache-Control": "no-store"
    });
    res.send(wrap);
  } catch (error) {
    res.status(409).json({
      error: "KDP cover could not be created",
      message: error.message
    });
  }
});

app.post("/api/export-bundle", async (req, res) => {
  const title = text(req.body.title, 200);
  const brief = text(req.body.brief, 12000);
  const packageText = text(req.body.packageText, 50000);
  const authorName = publishingAuthor(req.body.authorName);
  let packageData = publicationReadyPackage(req.body.package, authorName);
  const artworkCount = Array.isArray(packageData?.interiorArt)
    ? packageData.interiorArt.length
    : 0;
  const qualityReview = cleanPublishingObject(
    req.body.qualityReview,
    authorName,
    artworkCount
  );
  let release = null;
  let cover = null;

  if (!title || !brief || !packageText || !packageData || !qualityReview) {
    return res.status(400).json({
      error: "An approved package and passing quality review are required"
    });
  }

  if (qualityReview.verdict !== "PASS" || !packageData.approvedAt) {
    return res.status(409).json({
      error: "Pass Quality Control and approve the package before exporting"
    });
  }

  try {
    release = await buildReleaseQa({
      title,
      package: packageData,
      qualityReview,
      cover: req.body.cover,
      authorName
    });
  } catch (error) {
    return res.status(500).json({
      error: "Release QA could not validate the publishing package",
      message: error.message
    });
  }

  if (release.report.verdict !== "READY") {
    return res.status(409).json({
      error: "Release QA blocked this export",
      message: release.report.blockers[0] ||
        "Run the release check again before exporting.",
      releaseQa: release.report
    });
  }

  packageData = release.packageData;
  cover = release.cover;

  const bundleName = text(packageData.packageTitle || title, 100)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "publisher-forge-package";
  const listingData = {
    platform: platform(packageData.platform),
    packageTitle: text(packageData.packageTitle, 300),
    subtitle: text(packageData.subtitle, 500),
    deliverableType: text(packageData.deliverableType, 200),
    listingTitle: text(packageData.listingTitle, 500),
    listingDescription: text(packageData.listingDescription, 10000),
    authorName,
    keywords: Array.isArray(packageData.keywords)
      ? packageData.keywords.map((item) => text(item, 200)).filter(Boolean)
      : [],
    riskFlags: Array.isArray(packageData.riskFlags)
      ? packageData.riskFlags.map((item) => text(item, 500)).filter(Boolean)
      : [],
    createdAt: text(packageData.createdAt, 100),
    revisedAt: text(packageData.revisedAt, 100),
    approvedAt: text(packageData.approvedAt, 100)
  };
  if (listingData.platform === "KDP") {
    listingData.paperbackSettings = {
      interiorInk: "Black & White",
      paper: "White",
      trimSize: "6 x 9 in",
      bleed: "No bleed",
      embeddedFonts: ["Inter Regular", "Inter Bold"]
    };
  }
  const shopifyProduct = listingData.platform === "Shopify"
    ? {
        status: "draft",
        title: listingData.listingTitle || listingData.packageTitle,
        description: listingData.listingDescription,
        productType: listingData.deliverableType,
        tags: listingData.keywords,
        seo: {
          title: text(listingData.listingTitle, 70),
          description: text(listingData.listingDescription, 320)
        }
      }
    : null;
  const checklistItems = Array.isArray(packageData.productionChecklist)
    ? packageData.productionChecklist
        .map((item) => text(item, 500))
        .filter((item) => item && !isAutomaticExportTask(item))
    : [];

  try {
    const zip = new JSZip();
    const product = zip.folder("product");
    const interiorArtFolder = product.folder("interior-art");
    const review = zip.folder("review");
    const listing = zip.folder("listing");
    const upload = listingData.platform === "KDP"
      ? zip.folder("UPLOAD-TO-KDP")
      : null;
    const interiorArt = release.interiorArt;
    const printable = release.printable;
    const pricing = release.pricing;
    const coverSpecs = release.coverSpecs;
    const wrapCover = release.wrapCover;
    const kdpUploadGuide = pricing ? [
      "PUBLISHER FORGE — KDP PAPERBACK UPLOAD GUIDE",
      "",
      "Release QA: PASS (" + pricing.actualPageCount + " interior pages)",
      "",
      "1. In KDP Bookshelf, choose Create > Paperback.",
      "2. Open 3-copy-paste-book-details.txt and copy each value into the matching KDP field.",
      "3. Choose black ink, white paper, 6 x 9 inch trim, and no bleed.",
      "4. Upload 1-manuscript-interior.pdf as the manuscript.",
      "5. After the manuscript processes, upload 2-paperback-cover.pdf as the book cover.",
      "6. Open Print Previewer and resolve every warning before continuing.",
      "7. Review rights, AI-content disclosure, territories, and marketplace settings yourself.",
      "8. Start with the suggested price of $" +
        pricing.recommendedPrice.toFixed(2) +
        ". Confirm KDP's displayed print cost and royalty before saving.",
      "9. Let Amazon place the barcode in the reserved white area on the back cover.",
      "10. Publish only after the preview, metadata, cover, pricing, and rights are correct.",
      "",
      "KDP Bookshelf: https://kdp.amazon.com/bookshelf"
    ].join("\n") : "";
    const copyPasteDetails = pricing ? [
      "KDP BOOK DETAILS — COPY AND PASTE",
      "",
      "TITLE",
      listingData.listingTitle || listingData.packageTitle,
      "",
      "SUBTITLE",
      listingData.subtitle || "Leave blank",
      "",
      "AUTHOR OR PEN NAME",
      listingData.authorName,
      "",
      "DESCRIPTION",
      listingData.listingDescription,
      "",
      "KEYWORDS",
      ...(listingData.keywords.length
        ? listingData.keywords.map((item, index) =>
            (index + 1) + ". " + item
          )
        : ["No optional keywords supplied"]),
      "",
      "PAPERBACK SETTINGS",
      "Ink: Black & White",
      "Paper: White",
      "Trim: 6 x 9 inches",
      "Bleed: No bleed",
      "Suggested Amazon.com price: $" + pricing.recommendedPrice.toFixed(2),
      "Estimated printing cost: $" + pricing.estimatedPrintingCost.toFixed(2),
      "",
      "Confirm KDP's live price and royalty calculation before publishing."
    ].join("\n") : "";
    const startHere = pricing ? [
      "START HERE — YOUR KDP FILES PASSED RELEASE QA",
      "",
      "Only use the files inside this UPLOAD-TO-KDP folder for the paperback listing.",
      "",
      "1-manuscript-interior.pdf — upload in KDP's Manuscript section",
      "2-paperback-cover.pdf — upload in KDP's Book Cover section",
      "3-copy-paste-book-details.txt — title, description, author, keywords, and settings",
      "4-upload-steps.txt — the exact order to finish the listing",
      "",
      "Final human step: open KDP Print Previewer once. Publisher Forge cannot see Amazon's processed preview, so do not skip that check."
    ].join("\n") : "";
    const readme = [
      "PUBLISHER FORGE — APPROVED PUBLISHING BUNDLE",
      "",
      "Product: " + (listingData.packageTitle || title),
      "Marketplace: " + listingData.platform,
      "Approved: " + listingData.approvedAt,
      "",
      "This bundle passed written Quality Control, deterministic Release QA, and user approval.",
      "Publisher Forge does not upload or publish anything automatically.",
      "",
      "FILES",
      ...(pricing
        ? [
            "UPLOAD-TO-KDP/ — the only four files needed to finish the paperback listing",
            "START-HERE.txt — one-page map of the final handoff"
          ]
        : []),
      "product/full-package.md — complete review package",
      "product/draft.md — product content",
      "product/printable.pdf — formatted printable product",
      ...(pricing
        ? ["product/kdp-paperback-interior-6x9.pdf — KDP manuscript upload file"]
        : []),
      ...(cover && !pricing
        ? ["product/cover.png — original generated front cover"]
        : []),
      ...(interiorArt.length
        ? [
            "product/interior-art/ — original generated interior PNG files (" +
              interiorArt.length + ")"
          ]
        : []),
      ...(wrapCover
        ? ["product/kdp-paperback-cover-wrap.pdf — print-ready back, spine, and front cover"]
        : []),
      "listing/listing.json — marketplace title, description, and keywords",
      ...(pricing
        ? [
            "listing/kdp-pricing.txt — price, print cost, and royalty estimates",
            "listing/kdp-pricing.json — machine-readable pricing estimates",
            "listing/kdp-cover-specs.txt — calculated cover and spine measurements",
            "listing/kdp-cover-specs.json — machine-readable cover measurements",
            "listing/kdp-upload-guide.txt — exact paperback upload sequence"
          ]
        : []),
      ...(shopifyProduct
        ? [
            "listing/shopify-product.json — ready-to-copy draft product data",
            "listing/shopify-upload-guide.txt — guided Shopify draft-listing sequence"
          ]
        : []),
      "review/quality-review.json — final written Quality Control report",
      "review/release-qa.json — deterministic file-validation report",
      "review/production-checklist.md — remaining human production steps",
      "review/approved-brief.txt — source brief used to create the package"
    ].join("\n");
    const draft = [
      "# " + (listingData.packageTitle || title),
      listingData.subtitle,
      text(packageData.draftMarkdown, 50000)
    ].filter(Boolean).join("\n\n");
    const fullPackage = [
      "# " + (listingData.packageTitle || title),
      listingData.subtitle,
      "Marketplace: " + listingData.platform,
      "Author: " + authorName,
      "",
      "## Product draft",
      text(packageData.draftMarkdown, 50000),
      "",
      "## Listing title",
      listingData.listingTitle,
      "",
      "## Listing description",
      listingData.listingDescription,
      "",
      "## Keywords",
      ...listingData.keywords.map((item) => "- " + item),
      "",
      "## Production checklist",
      ...checklistItems.map((item) => "- " + item)
    ].filter((item) => item !== undefined && item !== null).join("\n");
    const checklist = [
      "# Production checklist",
      "",
      ...(checklistItems.length
        ? checklistItems.map((item) => "- [ ] " + item)
        : ["- [ ] Complete a final human review."])
    ].join("\n");

    zip.file("README.txt", readme);
    if (startHere) zip.file("START-HERE.txt", startHere);
    product.file("full-package.md", fullPackage);
    product.file("draft.md", draft);
    product.file("printable.pdf", printable);
    if (pricing) product.file("kdp-paperback-interior-6x9.pdf", printable);
    if (pricing && cover) product.file("front-cover.png", cover);
    if (cover && !pricing) product.file("cover.png", cover);
    interiorArt.forEach((item) => {
      interiorArtFolder.file(item.filename, item.buffer);
    });
    if (wrapCover) product.file("kdp-paperback-cover-wrap.pdf", wrapCover);
    if (upload) {
      upload.file("1-manuscript-interior.pdf", printable);
      upload.file("2-paperback-cover.pdf", wrapCover);
      upload.file("3-copy-paste-book-details.txt", copyPasteDetails);
      upload.file("4-upload-steps.txt", kdpUploadGuide);
    }
    listing.file("listing.json", JSON.stringify(listingData, null, 2));
    if (shopifyProduct) {
      listing.file(
        "shopify-product.json",
        JSON.stringify(shopifyProduct, null, 2)
      );
      listing.file("shopify-upload-guide.txt", [
        "PUBLISHER FORGE — SHOPIFY PRODUCT DRAFT GUIDE",
        "",
        "1. In Shopify, create a new product and keep its status as Draft.",
        "2. Copy the title, description, product type, and tags from shopify-product.json.",
        cover
          ? "3. Add product/cover.png as the primary product image."
          : "3. Generate product artwork in Publisher Forge before making the listing active.",
        "4. Add product/printable.pdf or the finished digital deliverable to your configured digital-delivery workflow.",
        "5. Set the price, inventory behavior, tax settings, and delivery settings for the actual offer.",
        "6. Preview the product page once on mobile and desktop.",
        "7. Keep the product in Draft until rights, claims, files, price, and checkout behavior are correct.",
        "8. Activate it yourself only after the final preview passes."
      ].join("\n"));
    }
    if (pricing) {
      listing.file("kdp-pricing.txt", formatKdpPricing(pricing));
      listing.file("kdp-pricing.json", JSON.stringify(pricing, null, 2));
      listing.file("kdp-cover-specs.txt", formatKdpCoverSpecs(coverSpecs));
      listing.file("kdp-cover-specs.json", JSON.stringify(coverSpecs, null, 2));
      listing.file("kdp-upload-guide.txt", kdpUploadGuide);
    }
    review.file("quality-review.json", JSON.stringify(qualityReview, null, 2));
    review.file("release-qa.json", JSON.stringify(release.report, null, 2));
    review.file("production-checklist.md", checklist);
    review.file("approved-brief.txt", brief);

    const archive = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition":
        'attachment; filename="' + bundleName + '-publishing-bundle.zip"',
      "Cache-Control": "no-store"
    });
    res.send(archive);
  } catch (error) {
    res.status(500).json({
      error: "Publishing bundle failed",
      message: error.message
    });
  }
});

app.post("/api/export-pdf", async (req, res) => {
  const title = text(req.body.title, 200);
  let packageData = publicationReadyPackage(
    req.body.package,
    req.body.authorName || req.body.package?.authorName
  );
  const qualityReview = req.body.qualityReview;

  if (!title || !packageData || !qualityReview) {
    return res.status(400).json({
      error: "An approved package and passing quality review are required"
    });
  }

  if (qualityReview.verdict !== "PASS" || !packageData.approvedAt) {
    return res.status(409).json({
      error: "Pass Quality Control and approve the package before exporting"
    });
  }

  let release;

  try {
    release = await buildReleaseQa({
      title,
      package: packageData,
      qualityReview,
      cover: req.body.cover,
      authorName: req.body.authorName || packageData.authorName
    });
  } catch (error) {
    return res.status(500).json({
      error: "Release QA could not validate the printable PDF",
      message: error.message
    });
  }

  if (release.report.verdict !== "READY") {
    return res.status(409).json({
      error: "Release QA blocked this PDF",
      message: release.report.blockers[0] ||
        "Run the release check again before exporting.",
      releaseQa: release.report
    });
  }

  packageData = release.packageData;

  const filename = text(packageData.packageTitle || title, 100)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "publisher-forge-product";

  try {
    const pdf = release.printable;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        'attachment; filename="' + filename + '-printable.pdf"',
      "Cache-Control": "no-store"
    });
    res.send(pdf);
  } catch (error) {
    res.status(500).json({
      error: "Printable PDF failed",
      message: error.message
    });
  }
});

app.post("/api/revenue-review", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  try {
    const title = text(req.body.title, 200);
    const market = revenueChannel(req.body.platform);
    const days = measuredNumber(req.body.days, "Test days", 365);
    const views = measuredNumber(req.body.views, "Views", 100000000);
    const orders = measuredNumber(req.body.orders, "Orders", 10000000);
    const grossRevenue = measuredNumber(
      req.body.grossRevenue,
      "Gross revenue"
    );
    const costs = measuredNumber(req.body.costs, "Costs");
    const context = text(req.body.context, 4000);

    if (!title) {
      return res.status(400).json({
        error: "Product title is required"
      });
    }

    if (days < 1) {
      return res.status(400).json({
        error: "Test days must be at least 1"
      });
    }

    if (views === 0 && orders > 0) {
      return res.status(400).json({
        error: "Views are required when orders are greater than zero"
      });
    }

    if (views === 0 && orders === 0 && grossRevenue === 0 && costs === 0) {
      return res.status(400).json({
        error: "Enter at least one measured result"
      });
    }

    const metrics = {
      days: Math.round(days),
      views: Math.round(views),
      orders: Math.round(orders),
      grossRevenue: dollars(grossRevenue),
      costs: dollars(costs),
      conversionRate: views > 0
        ? Number(((orders / views) * 100).toFixed(2))
        : 0,
      netProfit: dollars(grossRevenue - costs),
      revenuePerView: views > 0
        ? dollars(grossRevenue / views)
        : 0,
      profitPerOrder: orders > 0
        ? dollars((grossRevenue - costs) / orders)
        : 0
    };
    const prompt = [
      "Review this measured product or short-form content test and choose the next move.",
      "Product or video: " + title,
      "Channel: " + market,
      "Test metrics: " + JSON.stringify(metrics),
      context ? "Product/listing context: " + context : "",
      "Use only the supplied measurements. Do not invent benchmarks, sales, or costs.",
      "Choose SCALE only when the observed economics support careful expansion; ITERATE when one focused test can answer the biggest uncertainty; STOP when continuing the same offer is not justified.",
      "Recommend exactly one next experiment, a measurable success metric, a stop condition, and 2 to 4 ordered actions."
    ].filter(Boolean).join("\n");

    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the Revenue/Market Agent for Publisher Forge. Turn real marketplace or short-form video results into cautious, measurable next actions. Protect the operator from invented certainty and uncontrolled spending.",
      reasoning: { effort: "low" },
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_revenue_review",
          strict: true,
          schema: revenueReviewSchema
        }
      },
      max_output_tokens: 1800
    });
    const review = parseRevenueReview(response);

    res.json({
      title,
      platform: market,
      measuredAt: new Date().toISOString(),
      metrics,
      summary: text(review.summary, 800),
      verdict: review.verdict,
      diagnosis: text(review.diagnosis, 1200),
      nextExperiment: text(review.nextExperiment, 800),
      successMetric: text(review.successMetric, 500),
      stopCondition: text(review.stopCondition, 500),
      actions: Array.isArray(review.actions)
        ? review.actions.slice(0, 4).map((item) => text(item, 400))
        : []
    });
  } catch (error) {
    const isInputError = /must be a number/.test(error.message);
    res.status(isInputError ? 400 : 502).json({
      error: isInputError ? "Invalid test metrics" : "Revenue review failed",
      message: error.message
    });
  }
});

app.post("/api/viral-remix/scout", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const selectedPlatform = viralPlatform(req.body.platform);
  const duration = viralDuration(req.body.duration);
  const topic = text(req.body.topic, 180);
  const today = new Date().toISOString().slice(0, 10);
  const wordTarget = duration === 30 ? "55 to 65" :
    duration === 60 ? "115 to 130" : "82 to 96";
  const prompt = [
    "Today is " + today + ".",
    "Search the live web for a current high-interest topic and short-form format pattern suitable for " +
      (selectedPlatform === "Both" ? "TikTok and YouTube Shorts" : selectedPlatform) + ".",
    topic
      ? "Build around this requested topic: " + topic + "."
      : "Choose a broad, brand-safe topic with clear current momentum and useful evergreen value.",
    "Use current public evidence, but do not copy, quote, summarize, name, or imitate a specific creator or viral video.",
    "Avoid celebrities, copyrighted characters, private people, breaking tragedies, medical or financial claims, dangerous stunts, political persuasion, and content centered on children.",
    "Create a genuinely original " + duration + "-second narrated video concept with " + wordTarget + " narration words and exactly six scenes.",
    "Make each search term a simple two-to-four-word visual phrase likely to find reusable video on Wikimedia Commons.",
    "The six on-screen text lines must be short, specific, and form a complete story. Return exactly six unique search terms and six scenes."
  ].join(" ");

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are Viral Remix for Publisher Forge. Use trend research only as market intelligence. Create original narration, structure, and captions. Never reproduce a source video's script, sequence, branding, or protected expression.",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      reasoning: { effort: "low" },
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_viral_remix",
          strict: true,
          schema: viralRemixSchema
        }
      },
      max_output_tokens: 4200
    });
    const rawPlan = parseViralRemix(response);
    const plan = normalizedRemixPlan(rawPlan, duration);
    const searchTerms = [
      ...plan.scenes.map((scene) => scene.searchTerm),
      ...plan.searchTerms
    ];

    if (!plan.narration || plan.scenes.length < 3) {
      throw new Error("The original remix script was incomplete. Please try again.");
    }

    const videos = await findReusableVideos(searchTerms, 6);
    const rightsCheckedAt = new Date().toISOString();

    res.json({
      status: "READY_TO_RENDER",
      scannedAt: rightsCheckedAt,
      rightsCheckedAt,
      platform: selectedPlatform,
      duration,
      topic,
      plan,
      videos,
      trendSources: getSources(response),
      rightsPolicy: {
        accepted: ["Public Domain", "CC0", "CC BY"],
        rejected: ["Unknown", "Standard social-platform license", "CC BY-NC", "CC BY-ND", "CC BY-SA"],
        note:
          "Trend research supplies the idea. Only metadata-verified reusable footage is downloaded, and every license is rechecked before rendering."
      },
      humanApprovalRequired: true
    });
  } catch (error) {
    res.status(502).json({
      error: "Viral Remix scan failed",
      message: error.message
    });
  }
});

app.post(
  "/api/viral-remix/render",
  limitAI,
  limitVideoRender,
  async (req, res) => {
  if (!requireOpenAI(res)) return;
  if (!ffmpegPath && !process.env.FFMPEG_PATH) {
    return res.status(503).json({
      error: "Video renderer is unavailable",
      message: "The server does not have a video renderer configured."
    });
  }
  if (activeVideoRenders >= 1) {
    return res.status(429).json({
      error: "Video renderer is busy",
      message: "Another remix is rendering. Try again in a few minutes."
    });
  }

  const selectedPlatform = viralPlatform(req.body.platform);
  const duration = viralDuration(req.body.duration);
  const plan = normalizedRemixPlan(req.body.plan, duration);
  const requestedVideos = Array.isArray(req.body.videos)
    ? req.body.videos.slice(0, 6)
    : [];
  const titles = requestedVideos.length
    ? requestedVideos.map((item) => item?.commonsTitle)
    : [];

  if (!plan.narration || plan.scenes.length < 3) {
    return res.status(400).json({
      error: "Remix plan is incomplete",
      message: "Run a fresh Viral Remix scan before rendering."
    });
  }

  activeVideoRenders += 1;
  const tempPrefix = path.join(os.tmpdir(), "publisher-forge-viral-");
  let tempDirectory = "";

  try {
    const requestedTerms = new Map(requestedVideos.map((item) => [
      text(item?.commonsTitle, 260),
      text(item?.searchTerm, 120)
    ]));
    const sources = (await reverifyCommonsVideos(titles)).map((source) => ({
      ...source,
      searchTerm: requestedTerms.get(source.commonsTitle) || ""
    }));
    tempDirectory = await fs.mkdtemp(tempPrefix);
    const rendered = await renderViralRemix(
      plan,
      sources,
      duration,
      tempDirectory
    );
    const createdAt = new Date().toISOString();
    const slug = safeFilename(plan.trendTitle);
    const videoFilename = slug + "-vertical.mp4";
    const postText = postingCopy(plan, sources);
    const manifest = {
      product: "Publisher Forge Viral Remix",
      version: APP_VERSION,
      createdAt,
      platform: selectedPlatform,
      durationSeconds: duration,
      output: {
        filename: videoFilename,
        aspectRatio: "9:16",
        resolution: "720×1280",
        narration: "Original AI-generated voiceover",
        captions: "Burned into the MP4 and included as SRT"
      },
      plan,
      rights: {
        checkedAt: createdAt,
        acceptedLicenses: ["Public Domain", "CC0", "CC BY"],
        allSourcesReverified: true,
        sources
      },
      approval: {
        requiredBeforePublishing: true,
        note:
          "Preview the finished video and paste posting-copy.txt with it so source credits travel with the post."
      }
    };
    const readme = [
      "PUBLISHER FORGE — VIRAL REMIX BETA",
      "",
      "READY FILE",
      videoFilename + " — original vertical video with narration and burned captions",
      "",
      "BEFORE POSTING",
      "1. Watch the MP4 once and confirm every visual fits the narration.",
      "2. Paste posting-copy.txt into the platform caption or description.",
      "3. Keep the source credits intact, especially for CC BY footage.",
      "4. Use the platform's AI or synthetic-media disclosure when its rules require it.",
      "5. Publish only after your approval; Publisher Forge does not auto-post.",
      "",
      "RIGHTS NOTE",
      "Every included source was rechecked as Public Domain, CC0, or CC BY immediately before rendering. This metadata check does not clear separate privacy, publicity, trademark, endorsement, or local-law issues visible in the footage.",
      "",
      "FILES",
      "captions.srt — editable caption timing",
      "posting-copy.txt — original post copy, hashtags, and source credits",
      "source-licenses.txt — full source and license record",
      "remix-manifest.json — plan, output details, and rights audit"
    ].join("\n");
    const zip = new JSZip();

    zip.file(
      videoFilename,
      await fs.readFile(rendered.finalPath),
      { compression: "STORE" }
    );
    zip.file("captions.srt", rendered.captions);
    zip.file("posting-copy.txt", postText);
    zip.file("source-licenses.txt", sourceCredits(sources));
    zip.file("remix-manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("README-FIRST.txt", readme);

    const archive = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 4 }
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="' + slug + '-viral-remix.zip"'
    );
    res.setHeader("X-Publisher-Forge-Rights-Checked", createdAt);
    res.send(archive);
  } catch (error) {
    const rightsError = /license|verified source|recheck/i.test(error.message);
    res.status(rightsError ? 409 : 502).json({
      error: rightsError ? "Footage rights check stopped" : "Viral Remix render failed",
      message: error.message
    });
  } finally {
    activeVideoRenders = Math.max(0, activeVideoRenders - 1);
    if (tempDirectory && tempDirectory.startsWith(tempPrefix)) {
      await fs.rm(tempDirectory, { recursive: true, force: true })
        .catch(() => {});
    }
  }
  }
);

app.post("/api/trend-radar", limitAI, async (req, res) => {
  if (!requireOpenAI(res)) return;

  const market = platform(req.body.platform, true);
  const niche = text(req.body.niche, 160);
  const today = new Date().toISOString().slice(0, 10);

  const prompt =
    "Today is " + today + ". Search the live web for current demand signals and find five original product opportunities for " +
    (market === "Both" ? "Amazon KDP and Etsy" : market) +
    (niche ? " related to " + niche : "") +
    ". Use multiple public signals. Return exactly five ideas. Score demand, competition, margin, differentiation, and confidence from 0 to 100. A higher competition score means a more crowded market. Do not calculate the final score, verdict, or rank. Do not claim private sales data. Avoid trademarks, celebrities, copyrighted characters, medical promises, copying, and obvious platform risks.";

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are Trend Radar for Publisher Forge. Find practical, original product opportunities and report only evidence supported by your web research.",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      reasoning: { effort: "low" },
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_trend_report",
          strict: true,
          schema: trendReportSchema
        }
      },
      max_output_tokens: 5000
    });

    const report = parseReport(response);

    if (!Array.isArray(report.opportunities)) {
      throw new Error("Trend Radar returned no opportunities.");
    }

    const opportunities = report.opportunities
      .slice(0, 5)
      .map((item) => {
        const signals = {
          demand: Math.round(score(item.demand)),
          competition: Math.round(score(item.competition)),
          margin: Math.round(score(item.margin)),
          differentiation: Math.round(score(item.differentiation)),
          confidence: Math.round(score(item.confidence))
        };
        const decision = localDecision(signals);

        return {
          title: text(item.title, 160),
          platform: market === "Both"
            ? platform(item.platform, true)
            : market,
          audience: text(item.audience, 250),
          evidence: text(item.evidence, 600),
          competitionNote: text(item.competitionNote, 250),
          angle: text(item.angle, 350),
          risk: text(item.risk, 350),
          ...signals,
          score: decision.score,
          verdict: decision.verdict
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));

    res.json({
      scannedAt: new Date().toISOString(),
      platform: market,
      niche,
      summary: text(report.summary, 800),
      opportunities,
      sources: getSources(response)
    });
  } catch (error) {
    res.status(502).json({
      error: "Trend Radar failed",
      message: error.message
    });
  }
});

app.use((error, req, res, next) => {
  if (error?.type === "encoding.unsupported") {
    return res.status(415).json({
      error: "Compressed requests are not supported",
      message: "Send the JSON request without Content-Encoding."
    });
  }

  if (error?.type === "entity.too.large" || error?.status === 413) {
    const largeExport = LARGE_JSON_ROUTES.has(req.path);

    return res.status(413).json({
      error: largeExport
        ? "Publishing package is too large"
        : "Request is too large",
      message: largeExport
        ? "The artwork package exceeded the download limit. Generate fewer or smaller images and try again."
        : "This request exceeded the standard Publisher Forge size limit."
    });
  }

  if (error instanceof SyntaxError && error?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON",
      message: "Check the request data and try again."
    });
  }

  console.error(
    "Publisher Forge request failed:",
    error?.message || "Unknown error"
  );
  res.status(500).json({
    error: "Publisher Forge server error",
    message: "The server could not finish that request. Please try again."
  });
});

const isEntrypoint = process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (process.env.NODE_ENV !== "test" && isEntrypoint) {
  app.listen(PORT, () => {
    console.log("Publisher Forge running on port " + PORT);
  });
}

export {
  app,
  buildReleaseQa,
  createFixedWindowLimiter,
  findReusableVideos,
  inlineScriptSources,
  reverifyCommonsVideos,
  renderViralRemix,
  revenueChannel,
  normalizedRemixPlan,
  remixCaptions,
  runFfmpeg
};
