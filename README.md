# Publisher Forge MVP

A browser-based AI product workflow for finding, evaluating, planning, producing, and measuring original Amazon KDP, Etsy, and Shopify product concepts.

## Operating principle
If AI or software can do a task reliably, automate it instead of making the operator do it manually.

## Run
Run `npm install`, set `OPENAI_API_KEY`, and start the server with `npm start`.

## Included
- Live KDP/Etsy/Shopify Trend Radar with cited public web sources
- Consistent opportunity scoring and make/validate/skip decisions
- AI opportunity analysis
- Product Brief generation
- Production Agent for original draft content and listing metadata
- Quality Control Agent with deterministic scoring and approval blocking
- Automatic Quality Control recovery when a detailed review needs more response space
- Strong-review policy that passes scores of 85+ when no genuine release blocker remains, keeping minor polish as final checks
- One-tap package revision followed by a prior-issue-aware Quality Control recheck
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
- KDP upload kit with a clearly named 6×9 interior PDF and guided upload steps
- Automatic KDP full-wrap cover PDF with calculated back, spine, front, bleed, and reserved barcode area
- Remembered author or pen name with matching front-cover typography
- Revenue/Market Agent with measured conversion, profit, scale/iterate/stop decisions, and one controlled next experiment
- Device-local revenue learning history for repeat test cycles
- Shopify beta path across research, analysis, production, Quality Control, Project Vault, ZIP export, and Revenue
- Shopify draft product JSON and guided listing handoff inside approved publishing bundles
- Downloadable Markdown drafts and JSON listing data
- Device-local human approval gate unlocked only after a passing review

## Forge product suite roadmap
- **Publisher Forge — active:** Research, create, quality-check, package, publish, and learn from Amazon KDP and Etsy products.
- **Shopify Forge — beta:** Reuses the opportunity and production engine for original Shopify digital products, product-page copy, SEO, tags, creative assets, approval, packaging, and measured results.
- **Clip Forge — planned inside the same app:** Turn owned or client-authorized long videos into vertical 9:16 YouTube Shorts and TikTok clips. Transcribe, identify hooks, cut clips, add captions and titles, require approval before publishing, and learn from views, retention, clicks, and revenue.
- **One app, three pipelines:** Publisher, Shopify, and Clips share one dashboard, account, Project Vault, Revenue/Market Agent, and Agent Memory. Each pipeline keeps its own production engine behind the scenes.
- **Shared learning loop:** Find money → evaluate → create → test → measure → learn → repeat. The Revenue/Market Agent compares results across every pipeline and recommends SCALE, ITERATE, or STOP.

## Next production layer
Add accounts, persistent project storage, payments, and controlled marketplace handoff. Keep data collection and API use compliant with current platform terms, and require human approval before publishing.
