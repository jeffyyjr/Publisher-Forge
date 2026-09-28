# Publisher Forge — Buyer Technical Overview

This document gives a prospective buyer or technical reviewer a concise map of the current Publisher Forge implementation and production setup.

## Tech stack

| Layer | Current implementation |
| --- | --- |
| Frontend | Vanilla HTML, CSS, and browser JavaScript |
| Application server | Node.js 22 + Express 4 |
| AI | OpenAI API via the official OpenAI Node SDK |
| Database | SQLite using Node's built-in `node:sqlite` |
| Authentication | Email/password accounts, scrypt password hashing, server-managed sessions in secure cookies |
| PDF generation | PDFKit |
| ZIP/package generation | JSZip |
| Video processing | FFmpeg through `ffmpeg-static` |
| Hosting | Render Web Service |
| Persistent storage | Render disk / filesystem-backed SQLite when `PF_DB_PATH` or `PF_DATA_DIR` points to a mounted persistent location |
| Security | CSP and related response headers, same-origin checks, fixed-window rate limiting, dependency/secret/code scanning, and staging-only ZAP checks |

## Application shape

Publisher Forge is deliberately a single-service Node application rather than a multi-service frontend/backend split.

- `dashboard-start.mjs` is the production entry point.
- `server.js` contains the main Express app, publishing workflows, AI routes, export logic, QA/release logic, and media-processing support.
- `start.mjs` adds the Money/Opportunity, Pinterest, Shopify, and Orchestrator agent routes.
- `account-persistence.mjs` owns account authentication, session handling, quotas, growth-event persistence, and SQLite-backed user state.
- Browser pages and their JavaScript are served by the same Express process.
- Generated PDFs, ZIPs, covers, and videos are built server-side and returned through the application.

## Production deployment

The current production service runs on Render from the `main` branch.

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`
- Node requirement: `>=22.5 <23`
- The production process listens on the host-provided `PORT` (falling back to `10000` locally).
- A mounted persistent disk can hold the SQLite database so account and usage data survive deploys/restarts.

## Buyer-provided credentials and operating costs

The OpenAI account and API credits are **not included in a transfer of the codebase**. After acquisition, the buyer should replace any seller-side credentials and configure their own `OPENAI_API_KEY` in the deployment environment.

OpenAI API usage is billed separately to the buyer according to the models and volume used. Costs are therefore variable rather than a fixed Publisher Forge software fee. AI research/analysis, product generation, image generation, quality-review calls, and text-to-speech can all contribute to ongoing API spend.

Publisher Forge includes daily usage quotas to reduce accidental or unbounded spend during the beta, but a buyer should still set appropriate OpenAI billing limits and review current OpenAI pricing before production use. Render hosting and optional third-party services/providers may create additional operating costs.

## Important environment variables

No secret values belong in the repository. The implementation expects or supports:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_TTS_MODEL`
- `PORT`
- `PF_DB_PATH` or `PF_DATA_DIR`
- `PF_ADMIN_EMAIL` / `PF_ADMIN_EMAILS`
- `PF_QUOTA_TIMEZONE`
- `PIXABAY_API_KEY` (optional)

Additional security/staging variables are documented under `security/`.

## What is implemented

The current codebase includes the working KDP/Etsy publishing workflow, Shopify beta path, Trend Radar research, product briefs, production, deterministic and AI-assisted QA, release-file checks, PDF/ZIP export, KDP cover/pricing support, account state, usage quotas, growth analytics, Viral Remix, Pinterest planning, Opportunity Agent, Orchestrator Agent, and security/release gates.

Human approval remains intentional for consequential marketplace actions such as publishing, posting, applying, spending, or activating connected-account actions.

## Handoff considerations

A buyer should be able to run the application with a standard Node 22 environment and the required server-side environment variables. The architecture does not require a separate frontend build, container orchestration layer, or external relational database to get started.

For production ownership transfer, the main items are:

1. Repository ownership/access.
2. Render service and persistent disk.
3. Server-side environment variables and API credentials.
4. Domain/DNS, if a custom domain is added.
5. Any third-party marketplace or media-provider credentials added in the future.
6. A fresh security-gate run after credentials and deployment ownership are transferred.

## Known production-extension areas

The roadmap still includes deeper authenticated marketplace handoffs, payments, broader persistent project/opportunity storage, and expanded controlled integrations. Those are extensions to the current product rather than prerequisites for running the existing application.
