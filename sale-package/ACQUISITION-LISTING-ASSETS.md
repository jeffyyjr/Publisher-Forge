# Publisher Forge — Acquisition Listing Assets

Last verified: 2026-09-22

Use this document as the buyer-facing source for marketplace copy and screenshots. Claims intentionally distinguish working core paths from beta/adjacent capabilities and do not imply established revenue or demand.

## Concise feature list

### Core working paths
- Evidence-oriented trend and opportunity research.
- Product briefs and AI-assisted original-content generation.
- Quality-control and release-QA workflows.
- KDP-oriented PDF/ZIP packaging, cover/metadata support, page-count/pricing logic, and upload-handoff structure.
- Account sign-up/sign-in with persisted account state and usage controls.
- Growth instrumentation with source/campaign/content attribution.
- Launch analytics and user-agent-aware 404 logging.
- Automated repository tests and security gates.

### Beta / adjacent paths
- Shopify-oriented workflows.
- Pinterest-oriented workflows.
- Jobs/gigs opportunity workflows.
- Multi-step orchestration.
- Viral-video/remix tooling.

These adjacent paths add option value but should not be marketed as equally mature or validated. Billing/checkout is not a completed production feature.

## Tech-stack summary

- Node.js 22 / ECMAScript modules.
- Express 4 web application.
- SQLite persistence with production persistent-disk support.
- OpenAI API integration.
- PDFKit and JSZip for generated deliverables.
- ffmpeg-static for media processing.
- Render production hosting with `/api/health`.
- GitHub Actions plus repository security/test tooling.

Production currently deploys from `main`; acquisition documentation stays isolated on `sale-package`.

## Screenshot and caption checklist

Only use screenshots that show real current behavior. Do not expose user records, secrets, tokens, admin credentials, private email, or unrelated browser/account data.

1. **Public landing/launch page** — caption: “Publisher Forge live beta: AI-assisted publishing and digital-product workflow.”
2. **Trend/opportunity research result** — caption: “Evidence-oriented opportunity research turns a market question into a structured product direction.”
3. **Product brief / production workflow** — caption: “A selected opportunity moves into a structured production brief and generation workflow.”
4. **Quality/release QA state** — caption: “Built-in QA and release checks help catch output problems before packaging.”
5. **KDP/package output** — caption: “Publishing-oriented output supports PDF/ZIP packaging, metadata and release handoff.”
6. **Account/sign-in surface** — caption: “Persisted accounts and usage controls support a multi-user product path.”
7. **Growth/launch instrumentation** — caption: “Source/campaign/content attribution provides a foundation for measuring acquisition experiments.”
8. **Repository test/security evidence** — caption: “Automated tests and security gates are included for buyer diligence.”
9. **Optional beta montage** — Shopify/Pinterest/jobs/video surfaces may be shown only with an explicit “beta/adjacent workflow” label.

Avoid screenshots implying completed billing, established revenue, large user counts, marketplace auto-publishing, or validated customer demand unless later diligence produces direct evidence.

## Product history / timeline

This is a product-development timeline, not a revenue timeline.

- **Late August 2026:** Publisher Forge concept and repository work begin around autonomous research-to-publishing workflows.
- **Early September 2026:** Render deployment and core publishing/KDP-oriented workflow mature into a usable live beta; account and deployment work continue.
- **Early–mid September 2026:** Security/QA, orchestration, listing/growth, marketplace-adjacent and automation capabilities expand in the codebase.
- **Mid September 2026:** Sign-up/sign-in, beta launch work, social/community promotion and launch instrumentation are added/refined.
- **September 19–22, 2026:** Growth attribution and traffic instrumentation are tightened; founder-led YouTube/Product Hunt experiments produce limited tracked launch traffic. Evidence remains insufficient to claim meaningful revenue or validated recurring demand.
- **September 21–22, 2026:** A dedicated `sale-package` branch is organized for acquisition diligence without disturbing production `main`.

## Buyer-facing FAQ

### What exactly is being sold?
A live pre-revenue software asset: Publisher Forge source code and commit history, documented product workflows, deployment/handoff documentation, and specifically enumerated transferable product/media assets. Production user data, domains, brand/social accounts, and third-party accounts are included only if explicitly agreed and appropriate to transfer.

### Is Publisher Forge generating revenue?
No established revenue is being represented. The package positions Publisher Forge as a live pre-revenue beta with limited external traction.

### Does it have users or traction?
Founder-led beta promotion has produced tracked launch traffic, including tagged YouTube and Product Hunt visits. Earlier instrumentation identified a successful account creation, but the evidence did not establish social attribution or meaningful feature-use conversion. Traffic should not be interpreted as proven demand.

### What is the core product?
The core is an AI-assisted workflow that helps research an opportunity, create a product brief/content, perform quality/release checks, package publishing-oriented deliverables, and measure launch activity.

### Is every repository feature production-ready?
No. Core publishing, account, QA, packaging and instrumentation paths are distinguished from beta/adjacent Shopify, Pinterest, jobs/gigs, orchestration and viral-video paths. Buyers should diligence those adjacent paths independently.

### Does it include payments or subscriptions?
Billing/checkout is not represented as a completed production feature. Adding a commercial billing layer is a clear acquirer milestone.

### What does it run on?
Node.js 22 and Express, with SQLite persistence, OpenAI API integration, PDFKit, JSZip and ffmpeg-static. The current production deployment is on Render with persistent storage and a health endpoint.

### Is the seller's API key required?
No. The software is configuration-driven. A buyer should create and rotate into buyer-controlled credentials during cutover; personal credentials are excluded.

### Can it be moved away from Render?
The application is a Node service with documented configuration and persistence requirements, so another compatible host is possible. The existing handoff documentation describes the current Render topology and a clean redeployment/cutover sequence.

### What data transfers with the app?
That remains a diligence/closing decision. Existing production SQLite/user data is not assumed to transfer. It must be explicitly excluded, privacy-scrubbed/exported, or transferred under appropriate terms.

### What third-party/platform dependencies should a buyer expect?
At minimum, hosting/runtime infrastructure and AI API access are required for the corresponding features. Some optional workflows can depend on additional third-party services. The technical handoff and due-diligence package inventory these dependencies without transferring seller secrets.

### Why buy instead of rebuilding?
The acquisition thesis is build-time compression: a buyer receives a deployed product, source/history, publishing/QA/packaging workflows, account and analytics foundations, plus documented transfer knowledge. The price should reflect the software asset and option value—not nonexistent MRR.

### What still needs work?
Primary commercial work includes billing/checkout, tighter onboarding/distribution, further validation of adjacent workflows, and conversion of limited beta traffic into repeat usage and revenue. Current known limitations and costs will be captured in the due-diligence milestone.

## Listing-copy guardrails

Safe phrases: “live beta,” “pre-revenue,” “working software asset,” “deployed product,” “limited external traction,” “founder-led beta traffic experiments,” “AI-assisted.”

Avoid without new evidence: “profitable,” “validated SaaS,” “proven demand,” “active paying customers,” “MRR,” “fully autonomous marketplace publishing,” “production-ready across every workflow,” or specific user/revenue counts not supported by diligence evidence.
