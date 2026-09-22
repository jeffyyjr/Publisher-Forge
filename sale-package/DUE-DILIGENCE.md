# Publisher Forge — Buyer Due Diligence

Evidence date: 2026-09-22

This is a disclosure-oriented diligence summary, not a claim of audited financial or commercial performance. It contains no credentials, secret values, private email content, or customer records.

## Executive diligence status

Publisher Forge is a live, pre-revenue beta software asset. The buyer is acquiring working source/IP, product workflows and handoff materials rather than a proven cash-flow business. Production remains deployed from `main`; sale-prep files remain isolated on `sale-package`.

## Current production/deployment evidence

Connected Render verification on 2026-09-22 shows:

- service: `Publisher-Forge`;
- source branch: `main` with commit-triggered auto-deploy;
- Node runtime, `npm install` build and `npm start` start command;
- Ohio region, one `0.5c-512mb` instance;
- `/api/health` configured as the health-check path;
- 1 GB persistent disk mounted at `/var/data`;
- current live deploy is commit `38bc28487b18b3f3bfa49301d12fb089f2ba0b3d`, deployed successfully on 2026-09-21;
- Render error-log review from that deployment through 2026-09-22 returned no error-level application logs.

No sale-package change was deployed while assembling this evidence.

## Test and security evidence

Repository commands are:

- `npm test` — Node test suite;
- `npm run security:gate` — repository security gate;
- `npm run security:target` — validates an explicitly authorized staging target before active testing.

The latest production commit has a GitHub Actions `Security Gate` push run completed successfully on 2026-09-21. A scheduled `Security Gate - Staging Baseline` run against the same production commit completed successfully on 2026-09-22. This is current CI/security evidence, not a third-party penetration-test certification.

The repository security policy requires vulnerability reports through private GitHub vulnerability reporting and explicitly does not authorize automated/active testing against the live production service. Active scans should use an owned/authorized staging target.

## Runtime and third-party dependencies

Direct npm dependencies currently declared are Express, OpenAI SDK, PDFKit, JSZip, `ffmpeg-static`, dotenv and `@fontsource/inter`. Node requirement is `>=22.5 <23`.

External/service dependencies include:

- Render for hosting/persistent disk;
- GitHub for source/CI;
- OpenAI for paid AI-backed generation/research;
- Wikimedia Commons for rights-aware media discovery;
- Pixabay only when a buyer configures its optional API key;
- target marketplace/social ecosystems such as Amazon KDP, Etsy, Shopify, Pinterest, TikTok and YouTube for workflows that interact with or prepare assets for those platforms.

Platform rules/APIs are external dependencies and can change. Product functionality does not imply transfer of third-party accounts.

## Persistence and customer/user data

Publisher Forge uses Node's SQLite support for account-backed state. Production is designed to persist the SQLite database on `/var/data` using `PF_DATA_DIR`/`PF_DB_PATH` configuration. Persisted state can include accounts/sessions, Project Vault data, agent histories/settings, beta quota counters and anonymous growth/funnel events.

Passwords are represented by the application as salted scrypt hashes rather than raw passwords; server sessions use random tokens while token hashes are stored. Production cookies are configured with HttpOnly, SameSite=Lax and Secure attributes.

The production SQLite database is **not automatically included in a sale**. Before closing, seller and buyer must explicitly choose one of: (1) exclude it and initialize clean storage, (2) transfer only data legally/contractually permitted under an appropriate privacy process, or (3) provide an agreed privacy-scrubbed export. No buyer should receive the current production database merely because the source/service transfers.

## IP, media and content-license notes

- Source code and repository-owned documentation are intended transfer assets subject to the final signed asset schedule.
- Seller credentials, secret values, personal email content and unrelated/personal accounts are excluded.
- Wikimedia/Pixabay or other externally sourced media remains subject to its source license/attribution requirements; transfer of the application does not convert third-party media into buyer-owned IP.
- Final demo/video outputs and stills require item-level provenance/license verification in Milestone 7 before being represented as transferable marketing assets.
- Generated manuscripts/covers and user-created project content should not be represented as seller-owned transferable IP without specific provenance/rights confirmation.
- Bundled package dependencies/fonts remain subject to their upstream licenses.

## Known limitations / disclosures

1. Publisher Forge is pre-revenue; no recurring revenue or established commercial demand is claimed.
2. Tracked beta traffic and account creation are product/interest signals, not proof of product-market fit.
3. Payments/billing are not represented as a completed production feature.
4. Some adjacent workflows — including marketplace/social/job/orchestration/video paths — vary in maturity and may be guided, draft or beta workflows rather than autonomous account actions.
5. Production currently uses a single SQLite-backed persistent disk; a horizontally scaled/multi-instance database architecture is not established.
6. AI-backed workflows incur variable provider usage cost and require buyer-owned credentials after transfer.
7. Third-party platform terms, APIs and publishing requirements can change independently of Publisher Forge.
8. Exact repository/hosting/domain/account transfer mechanics should be reconfirmed at closing rather than assumed from current provider UI.
9. Final demo-media rights/provenance are still pending Milestone 7 review.
10. Production user-data inclusion/exclusion is an unresolved closing decision and must be explicit.

## Ongoing-cost disclosure

Known cost categories are Render hosting/persistent storage, OpenAI usage when AI-backed workflows are invoked, optional Pixabay/API or future integration costs, and any domain/marketplace/social services a buyer elects to operate. The connected Render configuration identifies the current resource class but does not provide an invoice or a defensible all-in monthly cash-cost figure in the evidence reviewed for this milestone. Therefore no exact monthly operating-cost number is claimed here. A buyer should verify current provider invoices/pricing immediately before closing and model AI spend from expected usage.

## Clean disclosure list for buyer/data room

Provide or disclose before closing:

- current source repository and agreed source-history scope;
- `BUYER-MEMO.md`, `ASSET-INVENTORY.md`, `TECHNICAL-HANDOFF.md` and acquisition assets;
- current production topology and latest successful deploy identifier;
- latest CI/security run evidence and the limits of that evidence;
- environment-variable **names only**, with buyer replacing all secret values;
- persistence architecture and explicit production-data decision;
- known product limitations listed above;
- third-party dependency/account exclusions;
- media/license/provenance results from Milestone 7;
- final agreed brand/domain/social asset schedule;
- current provider invoices/pricing if seller chooses to disclose them during buyer diligence;
- transfer/cutover and credential-rotation checklist.

Do not provide passwords, API keys, secret environment values, personal Gmail content, private emails, financial-account data or unrelated personal accounts.

## Evidence gaps that must not be guessed

- exact all-in monthly operating cash cost from invoices;
- whether the production user database will be included in the transaction;
- exact brand/domain/social accounts included;
- item-level rights/provenance for final demo/video media;
- any claim of revenue, profitability, retained customers or closed-sale valuation unsupported by evidence.

These gaps are diligence decisions/evidence requests, not defects to hide.