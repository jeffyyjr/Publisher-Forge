# Publisher Forge MVP

A browser-based AI product workflow for finding, evaluating, planning, producing, remixing, and measuring original Amazon KDP, Etsy, Shopify, TikTok, YouTube Shorts, Pinterest traffic, job, and gig opportunities.

## Operating principle
If AI or software can do a task reliably, automate it instead of making the operator do it manually.

## Run
Run `npm install`, set `OPENAI_API_KEY`, and start the server with `npm start`.

## Included
- Live KDP/Etsy/Shopify Trend Radar with cited public web sources
- Saved Trend Radar research history (last 12 attempts, including failures and timing), refresh restoration, JSON download, and account sync
- RV logbook and large-print Thanksgiving activity research presets that do not run paid scans until requested
- Explicit public-evidence limits: saved scans are not verified sales, score changes are not search growth, and source lists do not establish per-idea corroboration
- Consistent opportunity scoring and make/validate/skip decisions
- AI opportunity analysis
- Product Brief generation
- Production Agent for original draft content and listing metadata
- Quality Control Agent with deterministic scoring and approval blocking
- Automatic Quality Control recovery when a detailed review needs more response space
- Strong-review policy that passes scores of 85+ when no genuine release blocker remains, keeping minor polish as final checks
- One-tap package revision followed by a prior-issue-aware Quality Control recheck
- Release/QA Agent that builds the real files, applies safe metadata fixes, and checks manuscript structure, missing chapters, artwork, PDF integrity, embedded fonts, page dimensions, intentional blank pages, KDP page count, cover dimensions, spine sizing, and pricing
- Automatic short-logbook completion with usable labeled record forms, followed by pricing and cover sizing from the final PDF (no blank page padding or extra AI call)
- Bounded automatic manuscript revision and content/release rechecks when file QA still finds manuscript blockers (two attempts maximum); compatible front-cover and interior-art assets are retained
- Release QA connection recovery replays only the same deterministic file check, with two delayed retries and a 90-second timeout per attempt; it retains the current draft/artwork, never repeats paid generation because of a connection error, and keeps approval locked if recovery fails
- Server-side release enforcement that regenerates and retests final files before every approved PDF or ZIP download
- Human-only marketplace finishing checks separated from AI-fixable blockers
- Device-local Project Vault with automatic saving and project restoration
- One-tap approved publishing ZIP with draft, listing, QC, brief, and checklist files
- Print-formatted PDF export with a title page, structured headings, and page numbers
- AI Cover Studio with original artwork, exact title typography, PNG download, and ZIP inclusion
- Interior Art Studio that replaces up to 12 manuscript placeholders in safe automatic batches, embedding the finished black-and-white illustrations in the PDF and ZIP
- Single-sided KDP coloring pages with clean blank reverse sides and artwork-aware Quality Control
- Automatic page-label correction, embedded export fonts, and complete KDP black-and-white metadata
- One plain-language visual preview check for the user; technical PDF and cover checks stay automated
- Large illustrated publishing-bundle support with readable download errors
- Verified publishing metadata that uses the chosen pen name, removes invented credits, and limits page and file claims to what the bundle actually contains
- Automatic KDP paperback pricing with print-cost, royalty, and sales estimates
- Foolproof KDP handoff with a top-level `UPLOAD-TO-KDP` folder containing numbered manuscript, cover, copy-and-paste details, and upload steps
- Automatic KDP full-wrap cover PDF with calculated back, spine, front, bleed, and reserved barcode area
- Remembered author or pen name with matching front-cover typography
- Revenue/Market Agent with measured conversion, profit, scale/iterate/stop decisions, and one controlled next experiment
- Device-local revenue learning history for repeat test cycles
- Shopify beta path across research, analysis, production, Quality Control, Project Vault, ZIP export, and Revenue
- Shopify draft product JSON and guided listing handoff inside approved publishing bundles
- Orchestrator Agent beta that ranks the next best money action across KDP, Etsy, Shopify, Pinterest, Viral Remix, main-job, gig/freelance, and operations work
- Opportunity Agent beta that searches the live public web for source-backed main jobs, part-time work, contracts, freelance work, and gigs, then applies a deterministic Money Score
- Opportunity Agent source validation that drops any listing URL that cannot be matched back to live web-search evidence
- Pinterest Agent beta that creates seven-pin traffic campaigns for approved Forge products while keeping posting in Draft until an authorized account is connected and the user approves it
- Viral Remix beta with live trend research, an original six-scene script, and automatic 9:16 video assembly
- Reusable-footage search limited to Wikimedia Commons videos whose metadata verifies Public Domain, CC0, or CC BY rights
- Automatic license recheck before rendering, original voiceover, burned captions, posting copy, source credits, license manifest, and downloadable video ZIP
- Strict rejection of unknown, ordinary social-platform, noncommercial, no-derivatives, and share-alike footage licenses
- Security Gate beta with automated runtime-policy, dependency, secret, and code scanning before release
- Safe staging-only ZAP baseline workflow with an exact target allowlist and production denylist
- One normalized security report that blocks unresolved high and critical findings
- Downloadable Markdown drafts and JSON listing data
- Device-local human approval gate unlocked only after a passing review

## Forge product suite roadmap
- **Publisher Forge — active:** Research, create, quality-check, package, publish, and learn from Amazon KDP and Etsy products.
- **Shopify Forge — beta:** Reuses the opportunity and production engine for original Shopify digital products, product-page copy, SEO, tags, creative assets, approval, packaging, and measured results.
- **Money/Opportunity layer — beta:** Treat main jobs, part-time work, contracts, freelance gigs, and Forge business opportunities as competing income channels. Opportunity Agent finds source-backed work; Orchestrator Agent decides which action deserves attention next.
- **Pinterest Agent — beta:** Turns approved products into seven-pin discovery campaigns with board strategy, keywords, creative briefs, CTAs, and controlled draft handoff. Authorized account posting comes later.
- **Viral Remix — beta inside the same app:** Study current public trend signals, match the angle with metadata-verified reusable footage, write an original script, cut a vertical 9:16 video, add narration and captions, preserve source credits, and require approval before publishing.
- **Security Gate — beta across the same app:** Scan each proposed release, normalize scanner evidence, block unresolved high or critical findings, and keep active testing confined to an explicitly allowlisted staging environment.
- **Release/QA Agent — beta across the same app:** Build and validate the actual customer-facing and marketplace files, automatically repair safe metadata issues, and keep approval locked until every deterministic release check passes.
- **One app, shared pipelines:** Publisher, Shopify, Pinterest, Viral Remix, Opportunity, Release QA, and Security Gate share one dashboard, Project Vault, Orchestrator, Revenue/Market Agent, and learning loop. Each pipeline keeps its own specialized engine behind the scenes.
- **Shared learning loop:** Find money → evaluate → create/apply → test → measure → learn → repeat. The Revenue/Market Agent measures results while the Orchestrator allocates the next block of time.

## Money-agent API beta
- `GET /api/money-agents/status` — reports the Orchestrator, Opportunity, Pinterest, and Shopify agent layer.
- `POST /api/opportunity-scan` — searches current public web evidence for paid work and returns only listings whose URLs can be matched to the search evidence.
- `POST /api/pinterest-plan` — creates a seven-pin Draft campaign from an approved product title, description, keywords, audience, and optional destination URL.
- `POST /api/orchestrator/next-action` — ranks the next action across Forge products, traffic, jobs/gigs, and operational blockers using only supplied state.

## Next production layer
Add authenticated accounts, persistent project and opportunity storage, payments, controlled Shopify/Pinterest marketplace handoff, and a unified dashboard for the Orchestrator queue. Keep data collection and API use compliant with current platform terms, and require human approval before publishing, applying, spending, or activating account actions.

## Security Gate
Run `npm run security:gate` to execute the local release policy, runtime security tests, and dependency audit. The GitHub workflow adds Gitleaks and CodeQL results to the same normalized report. See `security/README.md` for staging configuration, release enforcement, and the future MobSF mobile layer.
