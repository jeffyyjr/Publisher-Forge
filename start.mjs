import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { app, createFixedWindowLimiter } from "./server.js";

const PORT = process.env.PORT || 10000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const limitMoneyAgents = createFixedWindowLimiter({
  max: 12,
  windowMs: 15 * 60 * 1000,
  error: "Too many money-agent requests",
  message: "Wait a few minutes and try again."
});

const opportunitySchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    opportunities: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          category: {
            type: "string",
            enum: ["MAIN_JOB", "PART_TIME", "CONTRACT", "FREELANCE", "GIG"]
          },
          location: { type: "string" },
          remote: { type: "boolean" },
          pay: { type: "string" },
          source: { type: "string" },
          sourceUrl: { type: "string" },
          fitReason: { type: "string" },
          gap: { type: "string" },
          freshnessNote: { type: "string" },
          applicationEffort: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          incomePotential: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          fit: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          confidence: {
            type: "integer",
            minimum: 0,
            maximum: 100
          }
        },
        required: [
          "title",
          "company",
          "category",
          "location",
          "remote",
          "pay",
          "source",
          "sourceUrl",
          "fitReason",
          "gap",
          "freshnessNote",
          "applicationEffort",
          "incomePotential",
          "fit",
          "confidence"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "opportunities"],
  additionalProperties: false
};

const pinterestPlanSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    campaignGoal: { type: "string" },
    boards: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    pins: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          board: { type: "string" },
          keywords: {
            type: "array",
            minItems: 4,
            maxItems: 10,
            items: { type: "string" }
          },
          creativeBrief: { type: "string" },
          cta: { type: "string" },
          destination: { type: "string" },
          testingAngle: { type: "string" }
        },
        required: [
          "title",
          "description",
          "board",
          "keywords",
          "creativeBrief",
          "cta",
          "destination",
          "testingAngle"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "campaignGoal", "boards", "pins"],
  additionalProperties: false
};

const orchestratorSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    primaryAction: { type: "string" },
    primaryChannel: {
      type: "string",
      enum: [
        "KDP",
        "Etsy",
        "Shopify",
        "Pinterest",
        "Viral Remix",
        "Main Job",
        "Gig/Freelance",
        "Operations"
      ]
    },
    priorityScore: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    reason: { type: "string" },
    expectedOutcome: { type: "string" },
    queue: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          rank: { type: "integer", minimum: 1, maximum: 5 },
          channel: {
            type: "string",
            enum: [
              "KDP",
              "Etsy",
              "Shopify",
              "Pinterest",
              "Viral Remix",
              "Main Job",
              "Gig/Freelance",
              "Operations"
            ]
          },
          action: { type: "string" },
          reason: { type: "string" },
          urgency: { type: "integer", minimum: 0, maximum: 100 },
          effort: { type: "integer", minimum: 0, maximum: 100 },
          confidence: { type: "integer", minimum: 0, maximum: 100 }
        },
        required: [
          "rank",
          "channel",
          "action",
          "reason",
          "urgency",
          "effort",
          "confidence"
        ],
        additionalProperties: false
      }
    },
    nextActions: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    },
    defer: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" }
    },
    guardrails: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    }
  },
  required: [
    "summary",
    "primaryAction",
    "primaryChannel",
    "priorityScore",
    "reason",
    "expectedOutcome",
    "queue",
    "nextActions",
    "defer",
    "guardrails"
  ],
  additionalProperties: false
};

function text(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function score(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : fallback;
}

function safeNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

function comparableUrl(value) {
  const safe = safeHttpsUrl(value);
  if (!safe) return "";

  try {
    const url = new URL(safe);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.origin.toLowerCase() + pathname;
  } catch (error) {
    return "";
  }
}

function collectWebSources(response) {
  const found = new Map();

  function remember(source) {
    const url = safeHttpsUrl(source?.url);
    if (!url) return;
    const key = comparableUrl(url) || url;
    if (found.has(key)) return;
    found.set(key, {
      title: text(source?.title || source?.name || new URL(url).hostname, 240),
      url
    });
  }

  for (const item of response?.output || []) {
    for (const source of item?.action?.sources || []) remember(source);

    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        if (annotation?.type === "url_citation") {
          remember({
            title: annotation?.title,
            url: annotation?.url
          });
        }
      }
    }
  }

  return [...found.values()];
}

function parseJsonResponse(response, agentName) {
  if (response?.status === "incomplete") {
    const reason = response?.incomplete_details?.reason || "unknown reason";
    throw new Error(agentName + " response was incomplete: " + reason + ".");
  }

  const raw = String(response?.output_text || "").trim();
  if (!raw) throw new Error(agentName + " returned no result. Please try again.");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(agentName + " could not read its completed result.");
  }
}

function moneyScore(values) {
  const gross =
    score(values?.incomePotential) * 0.40 +
    score(values?.fit) * 0.35 +
    score(values?.confidence) * 0.25;
  const effortPenalty = score(values?.applicationEffort) * 0.15;
  return Math.round(Math.max(0, Math.min(100, gross - effortPenalty)));
}

function verifiedOpportunityUrl(value, sources) {
  const candidate = safeHttpsUrl(value);
  if (!candidate) return "";
  const candidateKey = comparableUrl(candidate);
  const match = sources.find((source) =>
    comparableUrl(source.url) === candidateKey
  );
  return match?.url || "";
}

function profileText(body) {
  return [
    text(body.profile, 3500),
    body.location ? "Location: " + text(body.location, 160) : "",
    body.remote === true ? "Remote work is preferred or acceptable." : "",
    body.remote === false ? "Do not assume remote work is required." : "",
    body.minimumPay ? "Minimum desired pay: " + text(body.minimumPay, 120) : "",
    body.availability ? "Availability: " + text(body.availability, 500) : "",
    body.query ? "Target roles or work: " + text(body.query, 500) : ""
  ].filter(Boolean).join("\n");
}

function registerMoneyAgents(application = app, options = {}) {
  const ai = options.client === undefined ? client : options.client;
  const model = options.model || MODEL;

  application.get("/api/money-agents/status", (req, res) => {
    res.json({
      status: "READY",
      openAIConfigured: Boolean(ai),
      humanApprovalRequired: true,
      agents: [
        { name: "Orchestrator Agent", status: "beta", purpose: "Ranks the next best money action across Forge pipelines and work opportunities." },
        { name: "Opportunity Agent", status: "beta", purpose: "Finds source-backed main jobs, part-time work, contracts, freelance work, and gigs." },
        { name: "Pinterest Agent", status: "beta", purpose: "Builds seven-pin traffic campaigns for approved products without auto-posting." },
        { name: "Shopify Agent", status: "beta", purpose: "Uses the existing Shopify production, QA, bundle, and Revenue pipeline." }
      ]
    });
  });

  application.post("/api/opportunity-scan", limitMoneyAgents, async (req, res) => {
    if (!ai) {
      return res.status(503).json({
        error: "Opportunity Agent is unavailable",
        message: "OPENAI_API_KEY is not configured."
      });
    }

    const profile = profileText(req.body || {});
    if (!profile) {
      return res.status(400).json({
        error: "Add a work profile or target role",
        message: "Give the Opportunity Agent enough information to judge fit."
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      "Today is " + today + ".",
      "Search the live public web for currently actionable paid work that fits this profile:",
      profile,
      "Return up to eight strong opportunities across main jobs, part-time work, contracts, freelance projects, and gigs when those categories genuinely fit.",
      "Prefer concrete openings over generic career pages. Do not invent an opening, company, salary, location, remote status, requirement, or URL.",
      "Use the exact public listing URL that supports each result. If pay is not publicly listed, set pay to 'Not listed' and incomePotential to 0 rather than estimating it.",
      "Score fit from the supplied profile only. Score confidence from the quality and freshness of the public evidence. Score applicationEffort from the apparent application burden, where 100 means very high effort.",
      "For freshnessNote, state what the public evidence says about timing or simply say that the opening should be verified before applying.",
      "Avoid commission-only or pay-to-start work unless the user explicitly requested it. Do not auto-apply or claim that an application was submitted."
    ].join("\n");

    try {
      const response = await ai.responses.create({
        model,
        instructions:
          "You are the Opportunity Agent for Publisher Forge. Find legitimate, source-backed paid work and rank it for practical fit. Treat job search as one income pipeline alongside the user's businesses. Never fabricate openings or compensation.",
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        reasoning: { effort: "low" },
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "publisher_forge_opportunity_scan",
            strict: true,
            schema: opportunitySchema
          }
        },
        max_output_tokens: 5200
      });
      const report = parseJsonResponse(response, "Opportunity Agent");
      const sources = collectWebSources(response);
      const opportunities = (Array.isArray(report.opportunities)
        ? report.opportunities
        : [])
        .map((item) => ({
          title: text(item.title, 220),
          company: text(item.company, 220),
          category: item.category,
          location: text(item.location, 220),
          remote: Boolean(item.remote),
          pay: text(item.pay, 180) || "Not listed",
          source: text(item.source, 160),
          sourceUrl: verifiedOpportunityUrl(item.sourceUrl, sources),
          fitReason: text(item.fitReason, 800),
          gap: text(item.gap, 600),
          freshnessNote: text(item.freshnessNote, 500),
          applicationEffort: Math.round(score(item.applicationEffort)),
          incomePotential: Math.round(score(item.incomePotential)),
          fit: Math.round(score(item.fit)),
          confidence: Math.round(score(item.confidence)),
          moneyScore: moneyScore(item)
        }))
        .filter((item) => item.title && item.sourceUrl)
        .sort((a, b) => b.moneyScore - a.moneyScore)
        .map((item, index) => ({ ...item, rank: index + 1 }));

      if (!opportunities.length) {
        throw new Error(
          "No opening had a source URL that could be verified against the live search evidence. Try a broader search."
        );
      }

      res.json({
        scannedAt: new Date().toISOString(),
        summary: text(report.summary, 1000),
        opportunities,
        sources,
        note: "Listings can close quickly. Verify the posting before applying.",
        humanApprovalRequired: true
      });
    } catch (error) {
      res.status(502).json({
        error: "Opportunity scan failed",
        message: error.message
      });
    }
  });

  application.post("/api/pinterest-plan", limitMoneyAgents, async (req, res) => {
    if (!ai) {
      return res.status(503).json({
        error: "Pinterest Agent is unavailable",
        message: "OPENAI_API_KEY is not configured."
      });
    }

    const title = text(req.body?.title || req.body?.packageTitle, 220);
    const description = text(
      req.body?.description || req.body?.listingDescription,
      5000
    );
    const keywords = Array.isArray(req.body?.keywords)
      ? req.body.keywords.slice(0, 20).map((item) => text(item, 120)).filter(Boolean)
      : [];
    const platform = text(req.body?.platform, 80) || "approved Forge product";
    const destinationUrl = safeHttpsUrl(req.body?.destinationUrl);
    const audience = text(req.body?.audience, 600);

    if (!title || !description) {
      return res.status(400).json({
        error: "An approved product title and description are required"
      });
    }

    const prompt = [
      "Build a seven-pin Pinterest traffic campaign for this approved Publisher Forge product.",
      "Product: " + title,
      "Source marketplace: " + platform,
      "Description: " + description,
      keywords.length ? "Existing keywords: " + keywords.join(", ") : "",
      audience ? "Audience: " + audience : "",
      destinationUrl
        ? "Destination URL: " + destinationUrl
        : "No destination URL is connected yet. For each pin destination, say 'Add product URL before posting'.",
      "Create exactly seven distinct pins that test different buyer-intent angles without making unsupported claims.",
      "Use concise natural titles, useful descriptions, keyword clusters, a clear creative brief, and a non-spammy CTA.",
      "Choose two to four coherent board names and assign every pin to one of those boards.",
      "Do not imply that anything was posted. Do not invent performance data, trends, reviews, scarcity, discounts, or product features not in the supplied description."
    ].filter(Boolean).join("\n");

    try {
      const response = await ai.responses.create({
        model,
        instructions:
          "You are the Pinterest Agent for Publisher Forge. Turn approved products into original Pinterest discovery campaigns that drive qualified traffic while preserving claims, rights, and human approval.",
        reasoning: { effort: "low" },
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "publisher_forge_pinterest_plan",
            strict: true,
            schema: pinterestPlanSchema
          }
        },
        max_output_tokens: 4200
      });
      const plan = parseJsonResponse(response, "Pinterest Agent");
      const boards = Array.isArray(plan.boards)
        ? plan.boards.slice(0, 4).map((item) => text(item, 120)).filter(Boolean)
        : [];
      const pins = Array.isArray(plan.pins)
        ? plan.pins.slice(0, 7).map((pin, index) => ({
            pinNumber: index + 1,
            title: text(pin.title, 140),
            description: text(pin.description, 700),
            board: text(pin.board, 120),
            keywords: Array.isArray(pin.keywords)
              ? pin.keywords.slice(0, 10).map((item) => text(item, 100)).filter(Boolean)
              : [],
            creativeBrief: text(pin.creativeBrief, 700),
            cta: text(pin.cta, 180),
            destination: destinationUrl || "Add product URL before posting",
            testingAngle: text(pin.testingAngle, 300)
          }))
        : [];

      res.json({
        createdAt: new Date().toISOString(),
        product: title,
        summary: text(plan.summary, 1000),
        campaignGoal: text(plan.campaignGoal, 500),
        boards,
        pins,
        postingStatus: "DRAFT",
        humanApprovalRequired: true,
        nextConnection:
          "Connect an authorized Pinterest business account before adding controlled draft publishing."
      });
    } catch (error) {
      res.status(502).json({
        error: "Pinterest plan failed",
        message: error.message
      });
    }
  });

  application.post("/api/orchestrator/next-action", limitMoneyAgents, async (req, res) => {
    if (!ai) {
      return res.status(503).json({
        error: "Orchestrator Agent is unavailable",
        message: "OPENAI_API_KEY is not configured."
      });
    }

    const goal = text(req.body?.goal, 800) || "Increase reliable income and profit.";
    const timeAvailableHours = safeNumber(req.body?.timeAvailableHours, 0, 168, 0);
    const cashBudget = safeNumber(req.body?.cashBudget, 0, 1000000, 0);
    const state = req.body?.state && typeof req.body.state === "object"
      ? req.body.state
      : {};
    const opportunities = Array.isArray(req.body?.opportunities)
      ? req.body.opportunities.slice(0, 20)
      : [];
    const context = text(req.body?.context, 5000);
    const prompt = [
      "Choose the single best next money action for Publisher Forge's operator and build a short ranked queue behind it.",
      "Goal: " + goal,
      "Available hours: " + timeAvailableHours,
      "Cash budget available for this decision: $" + cashBudget.toFixed(2),
      "Forge state: " + JSON.stringify(state).slice(0, 12000),
      opportunities.length
        ? "Current source-backed job/gig opportunities: " + JSON.stringify(opportunities).slice(0, 12000)
        : "No current Opportunity Agent results were supplied.",
      context ? "Additional context: " + context : "",
      "Available channels are KDP, Etsy, Shopify, Pinterest, Viral Remix, Main Job, Gig/Freelance, and Operations.",
      "Use only the supplied facts. Never invent sales, revenue, conversion, job availability, pay, costs, deadlines, or completion status.",
      "Favor the action with the best combination of expected income impact, confidence, time efficiency, and removal of important blockers.",
      "Do not recommend spending the full available budget just because it exists. Do not auto-publish, auto-apply, purchase, or send anything. Human approval remains required for external actions.",
      "If the system is blocked by reliability, release, or account setup work, Operations can outrank a revenue action.",
      "Return a queue of no more than five items with unique ranks, then give the immediate next actions and what should be deferred."
    ].filter(Boolean).join("\n");

    try {
      const response = await ai.responses.create({
        model,
        instructions:
          "You are the Orchestrator Agent for Publisher Forge. Run the system like a disciplined tiny company: allocate time and attention to the highest-value action, coordinate specialist agents, and refuse busywork. Preserve human approval for publishing, applications, spending, and account actions.",
        reasoning: { effort: "medium" },
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "publisher_forge_orchestrator_next_action",
            strict: true,
            schema: orchestratorSchema
          }
        },
        max_output_tokens: 3600
      });
      const plan = parseJsonResponse(response, "Orchestrator Agent");
      const queue = Array.isArray(plan.queue)
        ? plan.queue.slice(0, 5)
          .map((item) => ({
            rank: Math.round(safeNumber(item.rank, 1, 5, 5)),
            channel: item.channel,
            action: text(item.action, 700),
            reason: text(item.reason, 800),
            urgency: Math.round(score(item.urgency)),
            effort: Math.round(score(item.effort)),
            confidence: Math.round(score(item.confidence))
          }))
          .sort((a, b) => a.rank - b.rank)
        : [];

      res.json({
        createdAt: new Date().toISOString(),
        summary: text(plan.summary, 1200),
        primaryAction: text(plan.primaryAction, 800),
        primaryChannel: plan.primaryChannel,
        priorityScore: Math.round(score(plan.priorityScore)),
        reason: text(plan.reason, 1200),
        expectedOutcome: text(plan.expectedOutcome, 800),
        queue,
        nextActions: Array.isArray(plan.nextActions)
          ? plan.nextActions.slice(0, 5).map((item) => text(item, 500)).filter(Boolean)
          : [],
        defer: Array.isArray(plan.defer)
          ? plan.defer.slice(0, 5).map((item) => text(item, 500)).filter(Boolean)
          : [],
        guardrails: Array.isArray(plan.guardrails)
          ? plan.guardrails.slice(0, 5).map((item) => text(item, 500)).filter(Boolean)
          : [],
        humanApprovalRequired: true
      });
    } catch (error) {
      res.status(502).json({
        error: "Orchestrator planning failed",
        message: error.message
      });
    }
  });

  return application;
}

registerMoneyAgents(app);

const __filename = fileURLToPath(import.meta.url);
const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (process.env.NODE_ENV !== "test" && isEntrypoint) {
  app.listen(PORT, () => {
    console.log("Publisher Forge + Money Agents running on port " + PORT);
  });
}

export {
  collectWebSources,
  comparableUrl,
  moneyScore,
  registerMoneyAgents,
  safeHttpsUrl,
  verifiedOpportunityUrl
};
