# Publisher Forge — Sale Readiness

Last updated: 2026-09-22

## Ordered milestone status

- [x] **1. Verify repo/deployment/sale branch/docs and build transfer asset inventory.** Completed 2026-09-21. Added `ASSET-INVENTORY.md`. Verified private repo, sale-package branch, existing sale documents, and connected Render production configuration. Production remains on `main`; no production changes or paid model calls were made.
- [x] **2. Buyer memo.** Completed 2026-09-22. Refined `BUYER-MEMO.md` against current architecture and live beta evidence. It now separates core working paths from beta/adjacent paths, describes the target buyer/user and transfer thesis, and explicitly avoids treating page views, possible signups, monetization options, or repository functionality as proven revenue/demand.
- [ ] **3. Technical handoff documentation.** Next.
- [ ] **4. Acquisition listing assets.**
- [ ] **5. Comparable-listing research and internal pricing notes.**
- [ ] **6. Due-diligence package.**
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

## Remaining blockers / diligence decisions

1. Decide whether the production SQLite/user database is excluded, transferred under an appropriate agreement, or privacy-scrubbed/exported.
2. Confirm the exact brand/domain/social assets included; unrelated/personal accounts are excluded by default.
3. Verify provenance/license of final demo media and generated assets before representing them as transferable IP.
4. Capture current operating-cost evidence and current test/security evidence during the due-diligence milestone.
5. Keep revenue/user claims evidence-based; do not infer revenue or customer demand from visits or repository functionality.
6. Technical handoff still needs an exact environment-variable-name inventory, clean deployment/redeployment sequence, storage migration notes, test/security commands, third-party dependency checklist, and credential-rotation steps.

## Next milestone

**Milestone 3 — Technical handoff documentation:** document Node/Render setup, environment-variable names without values, persistence/storage, deployment flow, test/security commands, third-party dependencies, and exact transfer steps. Keep credentials and secret values out of the sale package.