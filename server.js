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

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(__dirname));

function text(value, limit = 300) {
  return String(value || "")
    .trim()
    .slice(0, limit);
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
    requestLog.set(key, {
      started: now,
      count: 1
    });

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
  if (client) {
    return true;
  }

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

function parseReport(value) {
  const raw = String(value || "");
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first === -1 || last === -1) {
    throw new Error(
      "Trend Radar returned an invalid report."
    );
  }

  return JSON.parse(
    raw.slice(first, last + 1)
  );
}

function getSources(response) {
  const found = new Map();

  for (const item of response.output || []) {
    for (const part of item.content || []) {
      for (const note of part.annotations || []) {
        if (
          note.type === "url_citation" &&
          note.url
        ) {
          found.set(note.url, {
            title: note.title || note.url,
            url: note.url
          });
        }
      }
    }
  }

  return [...found.values()].slice(0, 10);
}

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "0.6.0",
    openaiConfigured: Boolean(client),
    trendRadarAvailable: Boolean(client)
  });
});

app.post(
  "/api/analyze",
  limitAI,
  async (req, res) => {
    const title = text(
      req.body.title,
      200
    );

    const market = platform(
      req.body.platform
    );

    if (!title) {
      return res.status(400).json({
        error: "Product idea is required"
      });
    }

    const decision = localDecision(
      req.body
    );

    if (!client) {
      return res.json({
        ...decision,
        title,
        platform: market,
        reasoning: [
          "Local scoring used because OpenAI is not configured."
        ]
      });
    }

    try {
      const response =
        await client.responses.create({
          model: MODEL,

          instructions:
            "You evaluate original KDP and Etsy product opportunities. Never copy books, listings, brands, trademarks, characters, artwork, or protected text. Be practical and concise.",

          input:
            "Evaluate this " +
            market +
            " idea: " +
            title +
            ". The local score is " +
            decision.score +
            "/100 and the local verdict is " +
            decision.verdict +
            ". Give three strengths, two risks, and one specific way to improve it.",

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
  }
);

app.post(
  "/api/product-brief",
  limitAI,
  async (req, res) => {
    if (!requireOpenAI(res)) {
      return;
    }

    const title = text(
      req.body.title,
      200
    );

    const market = platform(
      req.body.platform
    );

    const notes = text(
      req.body.notes,
      1200
    );

    if (!title) {
      return res.status(400).json({
        error: "Product idea is required"
      });
    }

    try {
      const response =
        await client.responses.create({
          model: MODEL,

          instructions:
            "You are the Product Architect for Publisher Forge. Create original, useful product plans. Never copy existing products or protected content.",

          input:
            "Create a complete " +
            market +
            " product brief for: " +
            title +
            ". " +
            (
              notes
                ? "Extra notes: " + notes + ". "
                : ""
            ) +
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
  }
);

app.post(
  "/api/trend-radar",
  limitAI,
  async (req, res) => {
    if (!requireOpenAI(res)) {
      return;
    }

    const market = platform(
      req.body.platform,
      true
    );

    const niche = text(
      req.body.niche,
      160
    );

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const prompt =
      "Today is " +
      today +
      ". Search the live web for current demand signals and find five original product opportunities for " +
      (
        market === "Both"
          ? "Amazon KDP and Etsy"
          : market
      ) +
      (
        niche
          ? " related to " + niche
          : ""
      ) +
      ". Use multiple public signals. Do not claim private sales data. Avoid trademarks, celebrities, copyrighted characters, medical promises, copying, and obvious platform risks. Rank the best idea first. " +
      'Return only JSON shaped like: {"summary":"short overview","opportunities":[{"title":"idea","platform":"KDP, Etsy, or Both","audience":"buyer","evidence":"current signals","competition":"level and reason","angle":"differentiation","risk":"main risk","score":75,"verdict":"MAKE, VALIDATE, or SKIP"}]}';

    try {
      const response =
        await client.responses.create({
          model: MODEL,

          tools: [
            {
              type: "web_search"
            }
          ],

          tool_choice: "required",
          input: prompt,
          max_output_tokens: 2600
        });

      const report = parseReport(
        response.output_text
      );

      if (
        !Array.isArray(
          report.opportunities
        )
      ) {
        throw new Error(
          "Trend Radar returned no opportunities."
        );
      }

      const opportunities =
        report.opportunities
          .slice(0, 5)
          .map((item, index) => ({
            rank: index + 1,

            title: text(
              item.title,
              160
            ),

            platform: platform(
              item.platform,
              true
            ),

            audience: text(
              item.audience,
              250
            ),

            evidence: text(
              item.evidence,
              600
            ),

            competition: text(
              item.competition,
              250
            ),

            angle: text(
              item.angle,
              350
            ),

            risk: text(
              item.risk,
              350
            ),

            score: Math.round(
              score(item.score)
            ),

            verdict: [
              "MAKE",
              "VALIDATE",
              "SKIP"
            ].includes(item.verdict)
              ? item.verdict
              : "VALIDATE"
          }));

      res.json({
        scannedAt:
          new Date().toISOString(),

        platform: market,
        niche,

        summary: text(
          report.summary,
          800
        ),

        opportunities,

        sources: getSources(response)
      });
    } catch (error) {
      res.status(502).json({
        error: "Trend Radar failed",
        message: error.message
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    "Publisher Forge running on port " +
    PORT
  );
});
