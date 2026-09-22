# Publisher Forge — Technical Handoff

Last verified: 2026-09-22

This document is for an asset buyer/operator. It intentionally lists configuration names but no secret values, account credentials, private email content, or customer data.

## 1. Runtime and repository

- Repository: private `jeffyyjr/Publisher-Forge`.
- Production branch: `main`. Sale-prep documentation is maintained separately on `sale-package` and should not be made the production branch during diligence.
- Runtime: Node.js. `package.json` requires Node `>=22.5 <23`.
- Install: `npm install`.
- Start: `npm start`, which runs `node dashboard-start.mjs`.
- Tests: `npm test` (`node --test`).
- Local security gate: `npm run security:gate`.
- Security-target validation: `npm run security:target`.

## 2. Current Render production topology

Verified against the connected Render service on 2026-09-22:

- Service name: `Publisher-Forge`.
- Type/runtime: Node web service.
- Source branch: `main`.
- Auto-deploy: enabled on commits to `main`.
- Build command: `npm install`.
- Start command: `npm start`.
- Region: Ohio.
- Current instance plan: `0.5c-512mb`, one instance.
- Health check: `/api/health`.
- Persistent disk: 1 GB mounted at `/var/data`.
- Render-provided `PORT` is consumed by the app; code falls back to port 10000 outside Render.

No production change is required merely to transfer the source. Do not point Render at `sale-package`.

## 3. Environment-variable inventory

### Core AI/runtime

- `OPENAI_API_KEY` — required for paid OpenAI-backed generation/research features. Buyer supplies a new key; never transfer the seller's key.
- `OPENAI_MODEL` — optional text-model override; code default is `gpt-5-mini`.
- `OPENAI_IMAGE_MODEL` — optional image-model override; code default is `gpt-image-2`.
- `OPENAI_TTS_MODEL` — optional speech-model override; code default is `gpt-4o-mini-tts`.
- `PORT` — normally supplied by Render; local fallback is 10000.
- `NODE_ENV` — conventional runtime/test mode flag.

### Persistence/account controls

- `PF_DATA_DIR` — directory for persistent SQLite storage; production design uses `/var/data`.
- `PF_DB_PATH` — optional full SQLite file path; use instead of `PF_DATA_DIR` when an exact database path is desired.
- `PF_ASSUME_PERSISTENT_STORAGE` — special override used by persistence detection; do not enable casually in production because it bypasses the mount check.
- `PF_ADMIN_EMAILS` — comma-separated trusted account emails that bypass daily beta quotas.
- `PF_ADMIN_EMAIL` — legacy/single-address fallback accepted by the code.
- `PF_QUOTA_TIMEZONE` — IANA timezone for daily quota resets; default is `America/New_York`.

### Optional media provider

- `PIXABAY_API_KEY` — optional. Viral Remix works with Wikimedia Commons without it; configuring it adds Pixabay video search subject to the provider/license checks in the product.

### Security/staging tooling

- `SECURITY_STAGING_URL` — staging target used by target validation/security workflow.
- `SECURITY_ALLOWED_TARGETS` — explicit allowlist used to prevent active security testing against unintended targets.
- `SECURITY_ZAP_EXIT_CODE` — security-gate integration input for ZAP results where applicable.

The repository's GitHub workflows may require their own GitHub-side security/scanner configuration. Treat all existing secrets as seller-owned credentials to be replaced, not transferred.

## 4. Persistence and data

Publisher Forge uses Node's built-in SQLite support for account-backed state. With `PF_DATA_DIR=/var/data`, the application stores `publisher-forge.sqlite` on the mounted persistent disk. If neither a valid mounted `PF_DATA_DIR` nor `PF_DB_PATH` is available, the app deliberately falls back to ephemeral storage and should not be treated as production-persistent.

Persisted state includes Project Vault data, Revenue Agent history, Opportunity Agent results, Viral Remix usage counters, daily beta quota counters, Money Agent settings, latest Command Center plan, account/session state, and anonymous growth/funnel events. Account writes use revisions to prevent silent overwrite conflicts.

Security-relevant storage behavior: passwords are scrypt-hashed and salted; raw passwords are not stored; server sessions use random tokens while only SHA-256 token hashes are stored; production cookies are HttpOnly/SameSite=Lax/Secure.

### Data-transfer decision that must be made before closing

The current production SQLite database may contain user/account data. It is **not automatically included in the asset transfer**. Before closing, choose and document one of these paths:

1. exclude the production database and deliver a clean/new database;
2. transfer permitted data under an appropriate buyer/seller agreement and privacy process; or
3. create a privacy-scrubbed/exported dataset that contains only agreed operational records.

Do not copy the disk or database to a buyer until that decision is explicit.

## 5. Main third-party/runtime dependencies

Direct npm dependencies currently declared:

- Express — HTTP application server.
- OpenAI SDK — AI generation/research calls.
- PDFKit — PDF generation.
- JSZip — ZIP/package generation.
- `ffmpeg-static` — video assembly/rendering support.
- `dotenv` — local environment loading.
- `@fontsource/inter` — bundled Inter font assets.

External content/service dependencies include OpenAI, Wikimedia Commons, optional Pixabay, GitHub, and Render. Marketplace-oriented workflows also depend on the current rules/requirements of Amazon KDP, Etsy, Shopify, Pinterest, TikTok, YouTube and other target platforms; repository functionality does not imply those platforms/accounts transfer with the asset.

## 6. Deployment and verification flow

For the current Render topology:

1. Work and review changes on a non-production branch.
2. Run `npm install` under a supported Node 22.x runtime.
3. Run `npm test`.
4. Run `npm run security:gate` for release/security evidence.
5. When staging security testing is intentionally used, configure only an approved staging URL/allowlist and run `npm run security:target` before active scanning.
6. Merge the approved production change to `main`.
7. Render auto-deploys commits to `main`; do not manually trigger a duplicate deploy when auto-deploy is functioning.
8. Confirm the Render deploy reaches `live` and check `/api/health`.
9. Verify account storage reports persistent storage and exercise critical workflows with budget-conscious test inputs. Do not use paid AI calls merely to prove the service is up.

## 7. Buyer transfer sequence

Recommended sequence; exact UI/account-transfer mechanics should be reconfirmed with GitHub/Render at closing because provider capabilities can change.

1. Sign the asset-purchase/transfer agreement and define exactly which code, brand/media assets, and data are included.
2. Decide the production-user-data treatment described above.
3. Give the buyer access to the repository using the provider-supported ownership/collaboration process, or transfer the repository if both parties have approved that action.
4. Buyer creates/replaces all credentials under buyer-controlled accounts: OpenAI first, then any optional Pixabay/security/integration credentials.
5. Transfer or recreate the Render service under the buyer's approved Render account/workspace. Preserve Node runtime, build/start commands, health path, disk mount, and production branch configuration.
6. If production data is included, move only the agreed database/disk data using an approved secure method. Otherwise initialize clean persistent storage.
7. Set environment variables by **name** from this document using buyer-owned values. Do not copy seller secret values from screenshots, chat, source control, or old environment exports.
8. Deploy and verify `/api/health`, persistent-storage status, sign-up/sign-in, a non-paid deterministic workflow, download/package generation, and security headers before using paid generation.
9. Run the test/security commands and retain the resulting evidence in the buyer's records.
10. Rotate/revoke seller credentials and remove seller access after the buyer confirms operation.
11. Separately transfer only the brand/domain/social/media assets explicitly included in the signed asset inventory. Personal or unrelated accounts are excluded by default.

## 8. Credential rotation checklist

At closing, buyer should replace or establish buyer-controlled values for every applicable secret/configuration credential, including OpenAI, optional Pixabay, GitHub/CI security integrations, Render access, domain/DNS credentials if a domain is included, and any future marketplace/social integrations. Seller should revoke old credentials after cutover is verified.

Never put credential values in the repository or sale documents.

## 9. Known handoff caveats

- Payments are not represented as a completed production feature.
- Several adjacent workflows are beta or guided/draft handoffs rather than autonomous publishing/account actions.
- Production currently uses a single SQLite-backed persistent disk; horizontal/multi-instance database architecture is not established by this handoff.
- Platform/API terms can change and must be rechecked by the buyer before activating integrations.
- Exact current operating costs and the latest dated security/test results belong in Milestone 6 due diligence rather than being guessed here.
- Final demo-media provenance/license verification remains a Milestone 7 task.
