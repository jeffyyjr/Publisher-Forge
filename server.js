import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";

import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const state = {
  opportunities: [],
  lessons: [],
  products: []
};

function fallbackScore({ demand, competition, margin, differentiation, confidence }) {
  const score =
    demand * 0.30 +
    (100 - competition) * 0.20 +
    margin * 0.20 +
    differentiation * 0.20 +
    confidence * 0.10;

  if (score >= 75) return { verdict: "MAKE", score: Math.round(score) };
  if (score >= 55) return { verdict: "VALIDATE", score: Math.round(score) };
  return { verdict: "SKIP", score: Math.round(score) };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "publisher-forge",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/analyze", async (req, res) => {
  const {
    title,
    platform = "KDP",
    demand = 50,
    competition = 50,
    margin = 50,
    differentiation = 50,
    confidence = 50
  } = req.body;

  const base = fallbackScore({
    demand,
    competition,
    margin,
    differentiation,
    confidence
  });

  if (!client) {
    return res.json({
      ...base,
      title,
      platform,
      reasoning: [
        "OpenAI key is not configured yet.",
        "This result uses the local scoring model only."
      ]
    });
  }

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "You are the decision engine for Publisher Forge, an AI publishing system. Evaluate original KDP and Etsy product opportunities. Avoid copying competitors. Prefer underserved demand, clear buyer intent, strong differentiation, reasonable margins, and low platform/IP risk. Return concise reasoning."
        },
        {
          role: "user",
          content: `
Evaluate this product opportunity.

Title: ${title}
Platform: ${platform}
Demand: ${demand}/100
Competition: ${competition}/100
Margin: ${margin}/100
Differentiation: ${differentiation}/100
Confidence: ${confidence}/100
Local score: ${base.score}
Local verdict: ${base.verdict}

Give:
1. Final verdict: MAKE, VALIDATE, or SKIP
2. 3 strongest reasons
3. 2 biggest risks
4. One concrete way to improve differentiation
`
        }
      ]
    });

    res.json({
      ...base,
      title,
      platform,
      aiAnalysis: response.output_text
    });
  } catch (error) {
    res.status(500).json({
      error: "AI analysis failed",
      message: error.message,
      fallback: base
    });
  }
});

app.post("/api/product-brief", async (req, res) => {
  const { title, platform = "KDP", notes = "" } = req.body;

  if (!client) {
    return res.status(400).json({
      error: "OPENAI_API_KEY is not configured"
    });
  }

  try {
    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "You are the Product Architect for Publisher Forge. Create original, practical publishing product briefs. Do not copy existing books, listings, covers, brands, or protected text."
        },
        {
          role: "user",
          content: `
Create a product brief for:

Title/idea: ${title}
Platform: ${platform}
Notes: ${notes}

Include:
- Target buyer
- Main problem solved
- Product promise
- Differentiation
- Suggested structure
- Page/section plan
- Metadata angle
- Risks to check
- QA checklist
`
        }
      ]
    });

    res.json({
      title,
      platform,
      brief: response.output_text
    });
  } catch (error) {
    res.status(500).json({
      error: "Product brief generation failed",
      message: error.message
    });
  }
});

app.post("/api/learn", (req, res) => {
  const lesson = {
    id: crypto.randomUUID(),
    ...req.body,
    createdAt: new Date().toISOString()
  };

  state.lessons.unshift(lesson);
  res.json(lesson);
});

app.get("/api/lessons", (req, res) => {
  res.json(state.lessons);
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Publisher Forge running on port ${PORT}`);
});
