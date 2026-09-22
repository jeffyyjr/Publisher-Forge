# Publisher Forge — Sale Readiness

Last updated: 2026-09-22

## Ordered milestone status

- [x] **1. Verify repo/deployment/sale branch/docs and build transfer asset inventory.** Completed 2026-09-21. Added `ASSET-INVENTORY.md`. Verified private repo, sale-package branch, existing sale documents, and connected Render production configuration. Production remains on `main`; no production changes or paid model calls were made.
- [x] **2. Buyer memo.** Completed 2026-09-22. Refined `BUYER-MEMO.md` against current architecture and live beta evidence. It separates core working paths from beta/adjacent paths and avoids treating traffic or functionality as proven revenue/demand.
- [x] **3. Technical handoff documentation.** Completed 2026-09-22. Added `TECHNICAL-HANDOFF.md` covering verified Node/Render topology, configuration names without values, persistence, deployment/test/security flow, dependencies, transfer sequence and caveats.
- [x] **4. Acquisition listing assets.** Completed 2026-09-22. Added `ACQUISITION-LISTING-ASSETS.md` with a concise feature list, tech-stack summary, nine-shot screenshot/caption checklist, evidence-bounded product timeline, buyer FAQ, and listing-copy claim guardrails. Core working paths are explicitly separated from beta/adjacent capabilities; billing and commercial traction are not overstated.
- [x] **5. Comparable-listing research and internal pricing notes.** Completed 2026-09-22. Added `PRICING-COMPS-INTERNAL.md` using dated public marketplace evidence, explicitly separating asking prices from closed-sale evidence. Internal initial asking range is $15,000–$22,500 with a $19,500 practical list target and a private $10,000 cash-equivalent negotiation floor, subject to diligence.
- [ ] **6. Due-diligence package.** Next.
- [ ] **7. Demo integration and buyer-facing demo index.**
- [ ] **8. Final sale-readiness audit and ready-to-paste sale package.**

## Milestone 1 evidence

Repository is private and the sale-prep branch exists. Existing sale files before milestone 1 were `BUYER-MEMO.md`, `LISTING-DRAFT.md`, `TRANSFER-CHECKLIST.md`, and `DEMO-MANIFEST.json`.

Connected Render production service is `Publisher-Forge`, sourced from this repository's `main` branch with auto-deploy enabled. It uses Node, `npm install`, `npm start`, Ohio region, one `0.5c-512mb` instance, `/api/health`, and a 1 GB persistent disk mounted at `/var/data`.

The repository documents Node `>=22.5 <23`, Express, OpenAI SDK, PDFKit, JSZip, ffmpeg-static, dotenv and Inter font package dependencies. Persistence documentation identifies `PF_DATA_DIR`/`PF_DB_PATH` and SQLite-backed account/growth state.

See `ASSET-INVENTORY.md` for the transfer map and explicit exclusions.

## Milestone 2 evidence

`BUYER-MEMO.md` was refreshed on 2026-09-22. Render application logs were reviewed through 2026-09-22 without making paid model calls. They show tagged launch-page traffic from YouTube and Product Hunt campaigns plus direct traffic. YouTube experiments include demo-view events; Product Hunt-tagged launch views continued into 2026-09-22.

The memo deliberately does not convert these traffic observations into customer or revenue claims. Earlier instrumentation review found one successful `account_created` event without demonstrated social attribution and no verified `quota_consumed` event; the current log review did not establish a stronger conversion claim. Accordingly the memo describes Publisher Forge as a live, pre-revenue beta with limited external traction.

The memo also distinguishes core working product paths from Shopify/Pinterest/jobs/orchestration/viral-video adjacent paths and states that payments are not a completed production feature.

## Milestone 3 evidence

`TECHNICAL-HANDOFF.md` was added on 2026-09-22. Repository verification confirms Node `>=22.5 <23`, `npm start`, `npm test`, `npm run security:gate`, and `npm run security:target`; direct dependencies include Express, OpenAI SDK, PDFKit, JSZip, ffmpeg-static, dotenv, and Inter font assets.

Connected Render verification confirms production still deploys from `main` with auto-deploy enabled, `npm install` / `npm start`, Node runtime, Ohio region, `/api/health`, one `0.5c-512mb` instance, and a 1 GB disk at `/var/data`. The sale-package branch was not deployed and main was not modified.

The handoff inventories configuration names without secret values, including OpenAI model/key variables, `PF_DATA_DIR`/`PF_DB_PATH`, quota/admin controls, optional Pixabay, and staging/security variables. It documents SQLite data handling, a clean buyer-controlled credential rotation, and an exact transfer/cutover sequence while explicitly leaving the production-user-data inclusion decision unresolved until an appropriate agreement/privacy process exists.

## Milestone 4 evidence

`ACQUISITION-LISTING-ASSETS.md` was added on 2026-09-22. Its feature/stack language is aligned with the verified buyer memo and technical handoff. It includes a nine-shot capture plan with captions and privacy/claim safeguards, plus a product-development timeline grounded in repository history and the verified beta period rather than a fabricated revenue timeline.

The buyer FAQ explicitly states that Publisher Forge is pre-revenue, that tracked beta traffic is not proven demand, that billing is unfinished, that adjacent workflows vary in maturity, that personal credentials are excluded, and that production user-data transfer remains an explicit diligence/closing decision. A final guardrail section lists safe versus unsupported marketplace claims.

## Milestone 5 evidence

`PRICING-COMPS-INTERNAL.md` was added on 2026-09-22. Research used current public Acquire.com, Flippa and Microns evidence. Current marketplace observations include a $9,000 asking price for a very early AI SaaS with 29 stated subscribers and minimal economics, while revenue-producing AI SaaS examples currently ask roughly $60,000 to $300,000+ depending on traction. These are recorded as asking-price observations rather than assumed closed-sale prices.

Acquire.com's January 2026 report states that confirmed SaaS transactions in 2024 and 2025 had a median 3.9x profit multiple and notes that asking prices often exceed final outcomes. Its current 2026 market commentary describes approximately 3–5x profit or 1–3x revenue ranges for operating SaaS businesses. Those multiples are not applied directly to Publisher Forge because it is pre-revenue.

The internal pricing note recommends an initial $15,000–$22,500 range, with $19,500 as a practical starting ask and a private $10,000 cash-equivalent negotiation floor. This is a seller strategy judgment grounded in Publisher Forge's working software/IP and transfer package while discounting heavily for absent revenue, limited traction, unfinished billing and product-market-fit risk; it is not represented as an appraisal or guaranteed market value.

## Remaining blockers / diligence decisions

1. Decide whether the production SQLite/user database is excluded, transferred under an appropriate agreement, or privacy-scrubbed/exported.
2. Confirm the exact brand/domain/social assets included; unrelated/personal accounts are excluded by default.
3. Verify provenance/license of final demo media and generated assets before representing them as transferable IP.
4. Capture current operating-cost evidence and current test/security evidence during the due-diligence milestone.
5. Keep revenue/user claims evidence-based; do not infer revenue or customer demand from visits or repository functionality.
6. Reconfirm provider-specific repository/Render ownership-transfer mechanics at closing; the handoff documents the safe sequence rather than guessing future provider UI behavior.
7. Capture the final screenshot/still set after demo-media provenance and feature claims are verified in milestone 7; milestone 4 defines the shot list but deliberately does not fabricate screenshots.

## Next milestone

**Milestone 6 — Due-diligence package:** capture current test/security and deployment evidence, known limitations and ongoing costs, third-party/platform dependencies, IP/content-license notes, customer/user-data handling, and a clean buyer disclosure list.