# Publisher Forge — Sale Readiness

Last updated: 2026-09-22

## Ordered milestone status

- [x] **1. Verify repo/deployment/sale branch/docs and build transfer asset inventory.** Completed 2026-09-21. Added `ASSET-INVENTORY.md`.
- [x] **2. Buyer memo.** Completed 2026-09-22. Refined `BUYER-MEMO.md` with evidence-bounded product/traction claims.
- [x] **3. Technical handoff documentation.** Completed 2026-09-22. Added `TECHNICAL-HANDOFF.md`.
- [x] **4. Acquisition listing assets.** Completed 2026-09-22. Added `ACQUISITION-LISTING-ASSETS.md`.
- [x] **5. Comparable-listing research and internal pricing notes.** Completed 2026-09-22. Added `PRICING-COMPS-INTERNAL.md`; internal initial range $15,000–$22,500, practical opening ask $19,500, private $10,000 cash-equivalent floor, subject to diligence.
- [x] **6. Due-diligence package.** Completed 2026-09-22. Added `DUE-DILIGENCE.md` with current deployment/security evidence, limitations, cost categories/evidence gap, dependencies, IP/media notes, data handling and clean disclosures.
- [ ] **7. Demo integration and buyer-facing demo index.** Next.
- [ ] **8. Final sale-readiness audit and ready-to-paste sale package.**

## Milestone 6 evidence

`DUE-DILIGENCE.md` was added on 2026-09-22. Connected Render verification shows production still deploys from `main`, with commit-triggered auto-deploy, Node runtime, `npm install` / `npm start`, Ohio region, one `0.5c-512mb` instance, `/api/health`, and a 1 GB persistent disk at `/var/data`. The current live production deploy is commit `38bc28487b18b3f3bfa49301d12fb089f2ba0b3d`, successfully deployed 2026-09-21. Error-level Render logs reviewed from that deployment through 2026-09-22 returned no errors.

GitHub Actions evidence for that same production commit includes a successful `Security Gate` push run on 2026-09-21 and a successful scheduled `Security Gate - Staging Baseline` run on 2026-09-22. These are CI/security-gate evidence, not a third-party penetration-test certification. Repository commands remain `npm test`, `npm run security:gate`, and `npm run security:target`; the security policy prohibits unauthorized active testing of production.

The diligence package documents Node/direct dependencies, Render/GitHub/OpenAI/Wikimedia/optional Pixabay and marketplace/social dependencies, SQLite/user-data handling, credential exclusions, known product limitations, and IP/content-license caveats. It explicitly keeps the production database out of the automatic transfer scope until a privacy/contract decision is made.

Exact all-in monthly operating cash cost could not be established from the connected evidence without invoices/provider billing. Rather than guess, the package identifies the cost categories (Render, variable OpenAI usage, optional providers/integrations/domain/platform services) and records the exact-cost figure as a diligence evidence gap.

Production `main` was not changed or redeployed for sale preparation, and no paid model calls were made for verification.

## Remaining blockers / diligence decisions

1. Decide whether the production SQLite/user database is excluded, transferred under an appropriate agreement, or privacy-scrubbed/exported.
2. Confirm the exact brand/domain/social assets included; unrelated/personal accounts are excluded by default.
3. Verify provenance/license of final demo media and generated assets before representing them as transferable IP.
4. Obtain/verify current provider invoices if an exact monthly operating-cost figure is needed for buyer diligence.
5. Keep revenue/user claims evidence-based; do not infer revenue or customer demand from visits or repository functionality.
6. Reconfirm provider-specific repository/Render ownership-transfer mechanics at closing.
7. Capture the final screenshot/still set after demo-media provenance and feature claims are verified in Milestone 7.

## Next milestone

**Milestone 7 — Demo integration and buyer-facing demo index:** inspect `DEMO-MANIFEST.json` and approved outputs, verify each clip actually demonstrates the claimed product behavior and has acceptable provenance, select the strongest screenshots/stills, and create a buyer-facing demo index plus acquisition-video notes. Do not represent unverified media as transferable IP.