# Publisher Forge — Sale Readiness

Last updated: 2026-09-21

## Ordered milestone status

- [x] **1. Verify repo/deployment/sale branch/docs and build transfer asset inventory.** Completed 2026-09-21. Added `ASSET-INVENTORY.md`. Verified private `jeffyyjr/Publisher-Forge` repo, `sale-package` branch, existing buyer memo/listing/transfer/demo manifest, and connected Render production configuration. Production remains on `main`; no production changes or paid model calls were made.
- [ ] **2. Buyer memo.** Next. Refine the existing memo against current product/traction evidence and remove or qualify any stale/unsupported claims.
- [ ] **3. Technical handoff documentation.**
- [ ] **4. Acquisition listing assets.**
- [ ] **5. Comparable-listing research and internal pricing notes.**
- [ ] **6. Due-diligence package.**
- [ ] **7. Demo integration and buyer-facing demo index.**
- [ ] **8. Final sale-readiness audit and ready-to-paste sale package.**

## Milestone 1 evidence

Repository is private and the sale-prep branch exists. Existing sale files before this milestone were `BUYER-MEMO.md`, `LISTING-DRAFT.md`, `TRANSFER-CHECKLIST.md`, and `DEMO-MANIFEST.json`.

Connected Render production service is `Publisher-Forge`, sourced from this repository's `main` branch with auto-deploy enabled. It uses Node, `npm install`, `npm start`, Ohio region, one `0.5c-512mb` instance, `/api/health`, and a 1 GB persistent disk mounted at `/var/data`.

The repository documents Node `>=22.5 <23`, Express, OpenAI SDK, PDFKit, JSZip, ffmpeg-static, dotenv and Inter font package dependencies. Persistence documentation identifies `PF_DATA_DIR`/`PF_DB_PATH` and SQLite-backed account/growth state.

See `ASSET-INVENTORY.md` for the transfer map and explicit exclusions.

## Remaining blockers / diligence decisions

These are not guessed and should be resolved before a binding listing or closing:

1. Decide whether the production SQLite/user database is excluded, transferred under an appropriate agreement, or privacy-scrubbed/exported.
2. Confirm the exact brand/domain/social assets included; unrelated/personal accounts are excluded by default.
3. Verify provenance/license of final demo media and generated assets before representing them as transferable IP.
4. Capture current operating-cost evidence and current test/security evidence during the due-diligence milestone.
5. Keep revenue/user claims evidence-based; do not infer revenue or customer demand from visits or repository functionality.

## Next milestone

**Milestone 2 — Buyer memo:** reconcile the current acquisition memo with the latest repo architecture and truthful beta traction evidence, clearly separating working functionality from beta/roadmap features and avoiding unsupported revenue/demand claims.