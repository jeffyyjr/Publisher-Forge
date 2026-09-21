# Publisher Forge — Acquisition Memo

## Executive summary

Publisher Forge is a live AI-assisted publishing and digital-product operations platform. It combines opportunity research, AI production, quality control, release validation, packaging, account persistence, growth analytics, and adjacent monetization workflows in one Node.js application.

**Current stage:** live beta / pre-revenue with limited external traction.  
**Live app:** https://publisher-forge.onrender.com  
**Repository:** jeffyyjr/Publisher-Forge  
**Runtime:** Node.js 22, Express, SQLite persistence, OpenAI API, PDFKit, JSZip, ffmpeg-static.  
**Hosting:** Render web service with persistent disk and health checks.  
**Security:** automated GitHub security gate with CodeQL, Gitleaks, npm audit, runtime security tests, staging-only ZAP support, and release blocking for unresolved high/critical findings.

The asset is being offered because the founder is reallocating time to other software projects, not because the application has been shut down. The service is live and the codebase is actively maintained through the sale-preparation period.

## What the buyer gets

- Full Publisher Forge source code and commit history.
- Live production architecture and deployment documentation.
- Publisher Forge brand/product identity and buyer-demo materials included in this sale package.
- Trend Radar research pipeline for KDP, Etsy, and Shopify opportunities.
- AI opportunity analysis, product briefs, original draft generation, listing metadata, and packaging.
- Quality Control and Release QA pipelines.
- KDP-focused PDF/ZIP generation, cover tooling, metadata validation, page-count/pricing logic, and upload handoff structure.
- Account sign-up/sign-in, persisted per-account state, usage controls, and stats.
- Admin growth dashboard with source/campaign/content attribution and recent traffic instrumentation.
- 404 path + user-agent logging for distinguishing crawler/bot hits from real visitors.
- Device-local project vault and revenue-learning history.
- Shopify beta path.
- Pinterest planning agent.
- Opportunity Agent for source-backed jobs/gigs.
- Orchestrator Agent for ranking next money actions.
- Viral Remix workflow with reusable-footage safeguards, narration/captions, license records, and vertical-video packaging.
- Automated Security Gate and runtime-policy checks.

## Product flow

The core Publisher Forge workflow is:

1. **Discover** — Trend Radar searches current public web evidence for product opportunities.
2. **Evaluate** — opportunities are ranked with evidence, competition, differentiation, margin and confidence signals.
3. **Plan** — Forge creates a product brief and recommended production path.
4. **Produce** — AI creates original content/assets and marketplace metadata.
5. **Quality control** — deterministic and AI-assisted checks identify blockers.
6. **Release QA** — real output files are rebuilt and validated before approval.
7. **Package** — final files are assembled into marketplace-friendly download bundles.
8. **Measure** — growth and revenue tracking feed future iteration decisions.

## Current technical architecture

- Node.js 22 / ECMAScript modules
- Express 4
- SQLite persistence
- OpenAI API
- PDFKit
- JSZip
- ffmpeg-static
- Render production hosting
- GitHub Actions CI/security workflows

Production runs from `main` and auto-deploys to Render on commit. The Render service uses a persistent disk at `/var/data`, a health endpoint at `/api/health`, and a single production instance.

## Reliability and security posture

The repository includes automated tests covering account persistence, launch analytics, command center behavior, release QA, retry/recovery behavior, security controls, Trend Radar history, and viral workflows.

The Security Gate includes:

- CodeQL JavaScript/TypeScript analysis
- Gitleaks history scan
- npm dependency audit
- runtime security tests
- normalized findings
- release blocking for unresolved high/critical findings
- staging-only active security testing controls

The most recent traffic-instrumentation release passed the production Security Gate and the runtime test suite before merge.

## Growth instrumentation

The app tracks:

- anonymous launch visits
- app opens
- signup conversion
- returning and active users
- feature usage
- UTM source/campaign/content
- recent traffic path
- user agent for launch traffic
- path + user agent for 404 responses

This was added specifically to prevent bots/crawlers from being mistaken for real prospects.

## Monetization opportunities

The current codebase leaves several straightforward buyer paths:

- SaaS subscription for creators / indie publishers.
- Credit-based AI generation.
- Higher-priced KDP production tier.
- Agency / done-for-you publishing workflow.
- Shopify digital-product research and production tier.
- White-label creator-business platform.
- Licensing the Release QA / Security Gate portions independently.
- Expanding the Orchestrator into a broader monetization operating system.

Payments are not presented as a completed production feature in this sale package. A buyer should treat billing integration as an obvious next commercial milestone.

## Current stage and traction

Publisher Forge should be evaluated as a **working software asset / live beta**, not as a mature recurring-revenue company.

The product has been deployed publicly and promoted through founder-led launch experiments, including YouTube and community channels. External user/revenue traction is still limited. No revenue or customer count should be assumed unless separately documented during diligence.

That is also the opportunity: the buyer is acquiring the built product, infrastructure, workflows and IP before a full monetization/growth program has been executed.

## Why it is transferable

The application is already separated from the founder's personal credentials through environment-variable configuration. The buyer should create new credentials for all third-party services at transfer rather than receiving the seller's API keys.

Primary transfer items:

- GitHub repository ownership/access
- brand/product assets
- Render deployment configuration or a clean redeployment
- environment-variable checklist
- database/data transfer decision
- documentation
- demo videos
- launch/growth materials

## Important transfer exclusions

The sale package must **not** include:

- personal Gmail access
- personal OpenAI credentials or API keys
- personal Google credentials
- personal GitHub credentials
- unrelated projects (Oracle Stack, Lead-OS, etc.)
- private financial information
- unrelated social accounts unless separately negotiated

Third-party API keys should be regenerated by the buyer.

## Buyer fit

Publisher Forge is best suited for a buyer who already understands one or more of:

- AI SaaS
- Amazon KDP / creator tools
- digital-product marketplaces
- growth/creator software
- workflow automation
- indie SaaS acquisition and monetization

A technical buyer can operate the current stack directly. A marketing-oriented buyer could focus on pricing, payments, onboarding and distribution while retaining the existing product engine.

## Diligence package in progress

This `sale-package` branch will contain:

- this acquisition memo
- buyer-facing listing draft
- transfer checklist
- demo-video manifest
- seven ~30-second workflow clips
- one stitched buyer walkthrough
- concise teaser video when the footage supports it

The production application remains on `main`; sale-preparation files on this branch do not trigger the Render production deployment.
