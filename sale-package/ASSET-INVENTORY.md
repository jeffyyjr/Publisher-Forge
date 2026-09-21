# Publisher Forge — Acquisition Asset & Transfer Inventory

Verified 2026-09-21 against the private `jeffyyjr/Publisher-Forge` repository, `sale-package` branch, and connected Render service. This document inventories what exists; it does not grant access or transfer ownership.

## 1. Source and product IP

Included subject to the final purchase agreement:

- Private GitHub repository `jeffyyjr/Publisher-Forge`, including source and commit history.
- Node.js/Express application and browser UI.
- Publisher/KDP and Etsy workflow: research, evaluation, briefs, original production, QC, Release QA, packaging and marketplace handoff.
- Shopify beta workflow.
- Trend Radar and saved research-history logic.
- Account signup/sign-in, account-backed state and usage quotas.
- Project Vault and revenue-learning state logic.
- Growth analytics and UTM attribution instrumentation.
- Admin Growth Dashboard.
- AI Cover Studio and Interior Art Studio logic.
- PDF/ZIP/KDP packaging and release-validation logic.
- Revenue/Market Agent and Orchestrator Agent.
- Opportunity Agent, Pinterest Agent and Viral Remix workflow.
- Security Gate and release/security policy code.
- Tests and GitHub Actions workflows.

## 2. Buyer/sale materials currently present

- `sale-package/BUYER-MEMO.md`
- `sale-package/LISTING-DRAFT.md`
- `sale-package/TRANSFER-CHECKLIST.md`
- `sale-package/DEMO-MANIFEST.json`
- this inventory

The sale package is isolated on `sale-package`; production deploys from `main`.

## 3. Production deployment

Connected Render service verified 2026-09-21:

- Service: `Publisher-Forge`
- Repository: `jeffyyjr/Publisher-Forge`
- Production branch: `main`
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Region: Ohio
- Plan: `0.5c-512mb`
- Instances: 1
- Auto-deploy: enabled on commits to `main`
- Health check: `/api/health`
- Persistent disk: 1 GB mounted at `/var/data`
- Public service URL: `https://publisher-forge.onrender.com`

The Render account/workspace credentials themselves are not an acquisition asset. Closing should either transfer an agreed service/workspace through Render-supported controls or recreate production in a buyer-controlled account.

## 4. Persistence and data

The application uses Node's built-in SQLite support. Production is designed to use the persistent Render disk via `PF_DATA_DIR=/var/data` or a complete `PF_DB_PATH`.

Persisted/synchronized product state includes project vault data, revenue-agent history, Opportunity Agent results, Viral Remix usage counters, account quota counters, Money Agent settings, Command Center plan state and anonymous growth events.

User/customer database inclusion is **not assumed**. Before closing, seller and buyer must explicitly choose whether production data is excluded, transferred under an appropriate agreement, or supplied only after a privacy-safe scrub/export. Personal credentials and unrelated personal data are never part of the sale.

## 5. Runtime/dependency inventory

Verified from `package.json`:

- Node `>=22.5 <23`
- Express
- OpenAI SDK
- PDFKit
- JSZip
- ffmpeg-static
- dotenv
- @fontsource/inter

Third-party packages remain governed by their own licenses. A final diligence pass should preserve the lockfile and license evidence rather than implying ownership of third-party code.

## 6. External services and replaceable credentials

Known service/configuration dependencies include:

- OpenAI API — buyer supplies a new `OPENAI_API_KEY`.
- Optional Pixabay footage API — buyer supplies a new `PIXABAY_API_KEY` if used.
- Render — buyer-controlled hosting/service after transfer.
- GitHub — buyer-controlled repository after transfer.

Production persistence also uses `PF_DATA_DIR` or `PF_DB_PATH`. Beta/account configuration documented in the repo includes `PF_ADMIN_EMAILS` and `PF_QUOTA_TIMEZONE`.

Secret **values** are excluded. Personal OpenAI, Google/Gmail, GitHub, Render, banking and other personal credentials must never be delivered to a buyer.

## 7. Brand, content and media

Potentially transferable after final verification/agreement:

- Publisher Forge name/product identity as used in the repository and app.
- Product UI and repository-owned documentation.
- Sale-package copy and demo materials created specifically for Publisher Forge.
- Approved demo clips/stills that pass the `DEMO-MANIFEST.json` verification milestone.
- Original generated product/demo assets only where provenance/license permits transfer.

Not automatically included:

- unrelated social/community accounts;
- personal accounts;
- third-party stock/source media outside its applicable license;
- unrelated KDP/Etsy products or personal publishing rights unless specifically listed in the purchase agreement.

Viral Remix can use Wikimedia Commons metadata-verified Public Domain/CC0/CC BY material and optional Pixabay material under its provider license. Those source works are licensed, not owned by Publisher Forge; source/license records must travel with any relevant generated demo/output.

## 8. Security/release assets

Repository contains:

- `.github/workflows/security-gate.yml`
- `.github/workflows/staging-security.yml`
- `scripts/security-gate.mjs`
- `scripts/validate-security-target.mjs`
- `security/README.md`
- `security/policy.json`
- `security/accepted-risks.json`
- `.zap/rules.tsv`

The documented local verification commands are `npm test`, `npm run security:gate`, and `npm run security:target` where applicable. Current passing evidence belongs in the later due-diligence milestone rather than being inferred from file presence.

## 9. Explicit exclusions

Do not transfer:

- personal Gmail/Google access or private email;
- seller OpenAI keys or other API secrets;
- seller GitHub password/tokens;
- seller Render login credentials;
- banking/payment credentials or private financial data;
- Oracle Stack, Lead-OS or other unrelated repositories/projects;
- unrelated social accounts;
- personal data not legitimately required and agreed for the acquisition.

## 10. Items requiring a closing decision

- Whether any production SQLite/user data is included, scrubbed or excluded.
- Exact brand/domain/social assets included in the purchase agreement.
- Whether Render service ownership is transferred where supported or the buyer performs a clean redeploy.
- Which generated media/product assets have sufficient provenance to include.
- Any support/training period after closing.

## Milestone 1 conclusion

The acquisition has a separable software asset: a private source repository, live production configuration, persistence layer, product workflows, security/release tooling, and sale documentation. The main unresolved inventory questions are contractual/privacy decisions—not missing core source code. No secrets were copied into this inventory and no production change was made.