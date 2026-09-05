import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requestLog = new Map();

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
          platform: { type: "string", enum: ["KDP", "Etsy", "Both"] },
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

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(__dirname));

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
    ? ["KDP", "Etsy", "Both"]
    : ["KDP", "Etsy"];

  return allowed.includes(value)
    ? value
    : allowBoth
      ? "Both"
      : "KDP";
}

function limitAI(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = requestLog.get(key);

  if (!current || now - current.started > windowMs) {
    requestLog.set(key, { started: now, count: 1 });
    return next();
  }

  if (current.count >= 15) {
    return res.status(429).json({
      error: "Too many requests",
      message: "Wait a few minutes and try again."
    });
  }

  current.count += 1;
  next();
}

function requireOpenAI(res) {
  if (client) return true;

  res.status(503).json({
    error: "OPENAI_API_KEY is not configured"
  });

  return false;
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "0.9.0",
    openaiConfigured: Boolean(client),
    trendRadarAvailable: Boolean(client),
    productionAgentAvailable: Boolean(client),
    qualityControlAvailable: Boolean(client),
    revisionAgentAvailable: Boolean(client)
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
        "You evaluate original KDP and Etsy product opportunities. Never copy books, listings, brands, trademarks, characters, artwork, or protected text. Be practical and concise.",
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

  const keywordTarget = market === "Etsy" ? 13 : 7;

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the Production Agent for Publisher Forge. Turn an approved product brief into an original review package for a human publisher. Never copy existing books, listings, brands, trademarks, characters, artwork, or protected text. Do not invent endorsements, sales claims, medical claims, or legal guarantees. Do not say the package was published or marketplace-approved. The draft must be useful and substantial, but clearly remain subject to human editing, fact-checking, design, formatting, and approval.",
      input:
        "Build a production review package for this " + market + " product. " +
        "Working title: " + title + ". Approved brief: " + brief + ". " +
        (market === "KDP"
          ? "Create original manuscript or interior copy in Markdown, plus KDP-oriented listing metadata."
          : "Create the complete written content and layout directions for the digital product in Markdown, plus Etsy-oriented listing metadata.") +
        " Return exactly " + keywordTarget + " useful keyword phrases. " +
        "Include a practical production checklist and identify any claims, facts, intellectual-property concerns, or design work that a human must review before release.",
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

  if (!title || !brief || !packageText) {
    return res.status(400).json({
      error: "A title, approved brief, and production package are required"
    });
  }

  try {
    const response = await client.responses.create({
      model: MODEL,
      instructions:
        "You are the independent Quality Control Agent for Publisher Forge. Audit the production package against its approved brief and intended marketplace. Score each category from 0 to 100. Be strict, specific, and practical. Check whether the draft is useful and complete, whether listing copy matches the product, and whether claims, trademarks, copyrighted material, unsafe promises, missing formatting work, or unsupported facts require human attention. Put only serious release-stopping concerns in blockers. Put concrete corrections needed before approval in requiredFixes. Do not claim that Amazon KDP or Etsy has approved the product.",
      input:
        "Review this " + market + " production package. " +
        "Working title: " + title + ".\n\n" +
        "APPROVED BRIEF:\n" + brief + "\n\n" +
        "PRODUCTION PACKAGE:\n" + packageText,
      text: {
        format: {
          type: "json_schema",
          name: "publisher_forge_quality_review",
          strict: true,
          schema: qualityReviewSchema
        }
      },
      max_output_tokens: 2200
    });

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
    const blockers = Array.isArray(review.blockers)
      ? review.blockers.filter(Boolean)
      : [];
    const requiredFixes = Array.isArray(review.requiredFixes)
      ? review.requiredFixes.filter(Boolean)
      : [];
    const verdict = blockers.length
      ? "BLOCKED"
      : overallScore >= 80 && !requiredFixes.length
        ? "PASS"
        : "REVISE";

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
      blockers
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
        "You are the Production Revision Agent for Publisher Forge. Rewrite the complete production package to resolve every concrete required fix and release blocker in the independent Quality Control report. Preserve strong material that still serves the approved brief. Never copy existing books, listings, brands, trademarks, characters, artwork, or protected text. Remove or qualify unsupported claims and flag facts, rights, formatting, or design work that still needs human verification. Return a complete replacement package, not a patch or commentary. Do not say the package was published, marketplace-approved, or quality-approved. A separate Quality Control pass and human approval are still required.",
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
          platform: platform(item.platform, true),
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

app.listen(PORT, () => {
  console.log("Publisher Forge running on port " + PORT);
});
