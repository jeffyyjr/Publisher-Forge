# Publisher Forge — Sale Readiness

Last updated: 2026-09-22

## Ordered milestone status

- [x] **1. Verify repo/deployment/sale branch/docs and build transfer asset inventory.** Completed 2026-09-21. Added `ASSET-INVENTORY.md`.
- [x] **2. Buyer memo.** Completed 2026-09-22. Refined `BUYER-MEMO.md` with evidence-bounded product/traction claims.
- [x] **3. Technical handoff documentation.** Completed 2026-09-22. Added `TECHNICAL-HANDOFF.md`.
- [x] **4. Acquisition listing assets.** Completed 2026-09-22. Added `ACQUISITION-LISTING-ASSETS.md`.
- [x] **5. Comparable-listing research and internal pricing notes.** Completed 2026-09-22. Added `PRICING-COMPS-INTERNAL.md`; internal initial range $15,000–$22,500, practical opening ask $19,500, private $10,000 cash-equivalent floor, subject to diligence.
- [x] **6. Due-diligence package.** Completed 2026-09-22. Added `DUE-DILIGENCE.md` with current deployment/security evidence, limitations, cost categories/evidence gap, dependencies, IP/media notes, data handling and clean disclosures.
- [ ] **7. Demo integration and buyer-facing demo index.** In progress / blocked on approved media. Added `DEMO-INDEX.md` with verification gate, planned buyer-demo structure, still-selection rules, and the exact missing-media gap. `DEMO-MANIFEST.json` still has an empty `clips` array with `master` and `teaser` null, so no clip can yet be truthfully verified.
- [ ] **8. Final sale-readiness audit and ready-to-paste sale package.** Begins only after Milestone 7 is complete.

## Milestone 7 evidence / blocker

On 2026-09-22 the sale-package branch was re-inspected before doing new work. `DEMO-MANIFEST.json` lists seven planned topics, but all remain `planned`; `clips` is empty and both `master` and `teaser` are null. The sale-package directory contains the written sale documents but no approved demo output referenced by the manifest. Repository search also did not surface a demo/teaser/video asset that could substitute for the required approved outputs.

`DEMO-INDEX.md` was therefore added rather than fabricating media verification. It defines the per-clip verification gate (visible feature proof, environment, provenance/license, transfer status, claim qualification, still timestamps/captions), the priority order for final buyer-facing stills, and acquisition-video notes. No clip, screenshot, or transferable-media claim is marked verified until actual approved media can be inspected.

Production `main` was not changed or redeployed, and no paid model calls were made for this verification.

## Remaining blockers / diligence decisions

1. **Milestone 7 blocking item:** approved demo outputs must be added to `sale-package/DEMO-MANIFEST.json` or otherwise made available through a connected source. Current manifest contains plans only, not inspectable media.
2. Decide whether the production SQLite/user database is excluded, transferred under an appropriate agreement, or privacy-scrubbed/exported.
3. Confirm the exact brand/domain/social assets included; unrelated/personal accounts are excluded by default.
4. Verify provenance/license of final demo media and generated assets before representing them as transferable IP.
5. Obtain/verify current provider invoices if an exact monthly operating-cost figure is needed for buyer diligence.
6. Keep revenue/user claims evidence-based; do not infer revenue or customer demand from visits or repository functionality.
7. Reconfirm provider-specific repository/Render ownership-transfer mechanics at closing.
8. Capture/select the final screenshot/still set only after the demo outputs pass the Milestone 7 verification gate.

## Next milestone

**Finish Milestone 7 — Demo integration:** when approved demo outputs become available, inspect each actual clip against `DEMO-INDEX.md`, update the manifest/index with pass/fail feature and provenance verification, select the strongest factual stills, and then mark Milestone 7 complete. Do not begin the final Milestone 8 package until this evidence gate is satisfied.