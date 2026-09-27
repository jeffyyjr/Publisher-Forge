# Publisher Forge — Buyer Data Room Index

Updated: 2026-09-27

Use this as the navigation page for a serious buyer. Keep public listing material separate from private diligence.

## Public / first-look material

1. `FINAL-SALE-PACKAGE.md` — ready-to-paste acquisition listing.
2. Live product — https://publisher-forge.onrender.com
3. Final buyer demo / still set — pending completion and verification.

## Serious-buyer diligence material

1. `BUYER-MEMO.md` — acquisition overview, stage, product scope and transfer thesis.
2. `ASSET-INVENTORY.md` — source/IP, deployment, persistence, services, brand/media and exclusions.
3. `TECHNICAL-HANDOFF.md` — runtime, configuration, deployment and cutover procedure.
4. `DUE-DILIGENCE.md` — deployment/security evidence, dependencies, limitations, data/IP treatment and diligence gaps.
5. `ACQUISITION-LISTING-ASSETS.md` — feature summaries, buyer FAQ, screenshot rules and claim guardrails.
6. `TRANSFER-CHECKLIST.md` — pre-close and post-close transfer sequence.
7. `DEMO-INDEX.md` — demo verification requirements and buyer-video structure.
8. `DEMO-MANIFEST.json` — machine-readable media manifest; currently awaiting approved clips.

## Internal seller-only material

Do not send these automatically to buyers:

1. `PRICING-COMPS-INTERNAL.md` — comparable-market notes and internal negotiation bands.
2. `DEAL-TERMS-INTERNAL.md` — internal pricing, negotiation and closing preferences.
3. `OUTREACH-PACK.md` — buyer targeting, outreach messages and objection handling.
4. `SALE-READINESS.md` — internal milestone/status tracker.

## Recommended disclosure sequence

### Stage 1 — first contact
Share:
- short listing;
- asking price;
- live product;
- truthful pre-revenue disclosure.

### Stage 2 — qualified interest
Share:
- Buyer Memo;
- Acquisition Listing Assets / FAQ;
- final verified demo when available.

### Stage 3 — serious diligence
Share:
- Asset Inventory;
- Technical Handoff;
- Due Diligence;
- Transfer Checklist;
- source access under appropriate terms.

### Stage 4 — offer / closing
Finalize:
- exact asset schedule;
- payment structure;
- data-transfer treatment;
- repository/hosting cutover;
- credential rotation;
- agreed transition assistance;
- acceptance criteria.

## Data and privacy default

Existing production SQLite/user data is **excluded by default** from the sale package.

If a buyer requests production data, treat that as a separate diligence item requiring a specific decision about legal basis, privacy, necessity, scrubbing/export and contractual treatment. Do not provide the production database merely because source code is being sold.

## Credentials

Never place secret values in the data room.

Buyer should create fresh:
- OpenAI API credentials;
- GitHub credentials;
- Render/hosting credentials;
- optional provider credentials such as Pixabay.

Seller personal Google/Gmail, banking, GitHub tokens, Render login credentials and unrelated project credentials are excluded.

## Demo-media status

Written sale and diligence materials are ready independently of the video.

The remaining media task is to record/approve actual product footage, verify visible feature claims and provenance, populate `DEMO-MANIFEST.json`, select stills and then attach those assets to the buyer package.

Until that occurs, do not represent a planned demo clip as a verified transferable asset.