# Publisher Forge — Acquisition Memo

Last verified: 2026-09-22

## Executive summary

Publisher Forge is a live beta software asset for AI-assisted publishing and digital-product operations. It combines opportunity research, production workflows, quality/release checks, packaging, account persistence, and growth instrumentation in a Node.js application.

**Current stage:** live beta / pre-revenue.  
**Live app:** https://publisher-forge.onrender.com  
**Repository:** private `jeffyyjr/Publisher-Forge` repository.  
**Runtime:** Node.js 22, Express, SQLite persistence, OpenAI API, PDFKit, JSZip, ffmpeg-static.  
**Hosting:** Render web service with persistent disk and health endpoint.  

This is being positioned as an acquisition of working software, source code, deployment know-how, product workflows, and transferable product assets—not as an acquisition of established revenue or a proven customer base.

## Target buyer / user

The product is designed around creators, indie publishers, digital-product operators, and small teams that want one workflow for researching an opportunity, producing an original product, checking the output, packaging it, and measuring launch activity.

A likely acquirer is an AI-SaaS operator, creator-tool company, KDP/digital-product operator, agency, or technical founder who can add billing, tighten onboarding, and build distribution around the existing product engine.

## What is working today

The repository and live service support a broad operating surface. Buyer diligence should distinguish mature core paths from beta/adjacent paths.

### Core working product paths

- Trend/opportunity research and evidence-oriented opportunity analysis.
- Product briefs and AI-assisted original-content generation.
- Quality-control and release-QA logic.
- KDP-oriented PDF/ZIP generation, cover/metadata support, page-count/pricing logic, and upload-handoff structure.
- Account sign-up/sign-in with persisted account state and usage controls.
- Growth instrumentation with source/campaign/content attribution.
- Launch-page analytics and user-agent-aware 404 logging.
- Security/test automation in the repository.

### Beta / adjacent product paths

The codebase also contains Shopify, Pinterest, jobs/gigs opportunity, orchestration, and viral-video/remix functionality. These expand the product's option value, but a buyer should evaluate each path independently rather than assume every adjacent workflow has equal production maturity or market validation.

Payments are **not** represented as a completed production feature. Billing/checkout remains a commercial milestone for an acquirer.

## Main workflow

1. **Discover** — gather current public evidence for product opportunities.
2. **Evaluate** — rank opportunities using evidence, competition, differentiation, margin and confidence signals.
3. **Plan** — create a product brief and recommended production path.
4. **Produce** — generate original content/assets and marketplace metadata.
5. **Quality control** — run deterministic and AI-assisted checks.
6. **Release QA** — rebuild/validate output files before approval.
7. **Package** — assemble marketplace-friendly deliverables.
8. **Measure** — record launch/growth signals for iteration.

## Architecture

- Node.js 22 / ECMAScript modules
- Express 4
- SQLite persistence
- OpenAI API integration
- PDFKit
- JSZip
- ffmpeg-static
- Render production hosting
- GitHub Actions CI/security workflows

Production deploys from `main` to Render. Sale-preparation work stays on `sale-package`, so sale documentation does not itself trigger production deployment. The production service uses persistent storage mounted at `/var/data` and exposes `/api/health`.

## Reliability and security posture

The repository includes automated tests for account persistence, launch analytics, command-center behavior, release QA, retry/recovery behavior, security controls, Trend Radar history, and viral workflows.

Security automation includes CodeQL JavaScript/TypeScript analysis, Gitleaks scanning, npm dependency audit, runtime security tests, normalized findings, release blocking for unresolved high/critical findings, and controls around staging-only active security testing.

Exact current test/security results will be captured separately in the due-diligence milestone; this memo does not treat historical passing results as proof of a future clean scan.

## Truthful traction snapshot

Publisher Forge has been publicly deployed and subjected to founder-led beta traffic experiments. Render application logs through **2026-09-22** show tracked launch-page traffic from YouTube and Product Hunt-tagged campaigns, plus direct visits. YouTube-tagged experiments generated launch visits and demo-view events. Product Hunt-tagged traffic continued to generate launch-page views into 2026-09-22.

These are **traffic signals, not proof of commercial demand**. Current evidence does not justify representing Publisher Forge as having meaningful revenue, a proven conversion funnel, or a validated recurring customer base. The sale package therefore treats the asset as **pre-revenue with limited external traction**.

Account/feature-use evidence should be disclosed conservatively. Prior instrumentation review found a successful `account_created` event but no demonstrated social attribution to that signup, and no verified `quota_consumed` feature-use event at that point. The current Render log review did not establish a stronger conversion claim. Buyer diligence should use the underlying logs/data rather than extrapolate from page views.

## Why the asset is transferable

The software is configuration-driven rather than dependent on transferring the seller's personal credentials. A buyer can receive the repository and product assets, create fresh third-party credentials, deploy to a new Render account or assume an agreed infrastructure path, and migrate only the data that the parties explicitly agree is appropriate to transfer.

Primary transfer candidates are:

- Publisher Forge source code and commit history.
- Product/brand assets specifically identified as included.
- Deployment and environment-variable documentation.
- Render architecture/redeployment instructions.
- Approved demo and launch materials with verified provenance.
- Transferable documentation and workflow assets.
- Production data only if separately reviewed for privacy, necessity, and contractual transfer terms.

## Explicit exclusions / safeguards

The package must not include personal Gmail access, personal API keys, personal Google/GitHub credentials, private financial information, unrelated projects, or unrelated social accounts. Third-party credentials should be regenerated by the buyer.

The final agreement must also state whether the existing SQLite/user data is excluded, scrubbed/exported, or transferred under an appropriate agreement. Brand/domain/social assets must be enumerated rather than assumed.

## Commercial upside without overclaiming

Potential monetization paths include SaaS subscriptions, credit-based AI generation, a higher-priced publishing-production tier, agency/done-for-you workflows, creator-business tooling, or licensing selected QA/security components. These are buyer opportunities, **not current revenue streams**.

The acquisition thesis is straightforward: a buyer receives a live, working product and its supporting code/infrastructure before a full billing and distribution program has been executed. The buyer is paying for build-time compression and product optionality, not for proven MRR.

## Diligence package in progress

The `sale-package` branch is being organized into a buyer memo, asset inventory, technical handoff, acquisition listing assets, comparable-listing/internal pricing notes, due-diligence evidence, demo index, transfer checklist, and final marketplace/outreach package.

Production remains on `main`; sale-preparation documentation does not disturb the live service.