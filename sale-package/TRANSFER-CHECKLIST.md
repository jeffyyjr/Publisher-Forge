# Publisher Forge — Transfer Checklist

## Before listing

- [ ] Decide whether to make the GitHub repository private before public sale outreach.
- [ ] Confirm all production secrets exist only in environment variables.
- [ ] Search Git history for accidental secrets and confirm Security Gate is clean.
- [ ] Confirm live production health endpoint responds normally.
- [ ] Capture current screenshots and buyer-demo videos.
- [ ] Document current revenue as $0 unless verified otherwise.
- [ ] Document current customer/user counts exactly; do not estimate.
- [ ] Record current monthly infrastructure/API operating costs.
- [ ] Decide whether current production database is included, scrubbed, or excluded.
- [ ] Decide which brand/social assets are included.

## Buyer diligence

Provide:

- [ ] Acquisition memo
- [ ] Feature inventory
- [ ] Technology stack
- [ ] Architecture/deployment explanation
- [ ] Test/security evidence
- [ ] Live demo URL
- [ ] Demo video master
- [ ] Current operating costs
- [ ] Current traction/revenue disclosure
- [ ] Known limitations / unfinished work
- [ ] Commercial roadmap options

## Never transfer directly

- [ ] Personal Gmail credentials
- [ ] Personal Google credentials
- [ ] Personal OpenAI API key
- [ ] Personal GitHub password/token
- [ ] Personal Render credentials
- [ ] Personal banking/payment credentials
- [ ] Unrelated project repositories
- [ ] Private personal data

## Closing / technical handoff

Buyer should create fresh accounts/keys where appropriate.

- [ ] Transfer or duplicate repository into buyer-controlled GitHub
- [ ] Buyer creates OpenAI API key
- [ ] Buyer creates optional Pixabay key
- [ ] Buyer creates/accepts Render workspace
- [ ] Recreate environment variables
- [ ] Deploy buyer-controlled production service
- [ ] Verify persistent storage/database path
- [ ] Run `npm test`
- [ ] Run `npm run security:gate`
- [ ] Verify `/api/health`
- [ ] Verify signup/sign-in
- [ ] Verify Trend Radar
- [ ] Verify KDP output generation
- [ ] Verify admin growth dashboard
- [ ] Verify launch analytics and user-agent tracking
- [ ] Rotate every credential after transfer
- [ ] Remove seller access after acceptance

## Commercial handoff

- [ ] Transfer brand assets included in purchase
- [ ] Transfer agreed social/community accounts only if explicitly included
- [ ] Transfer demo videos and sale media
- [ ] Provide a final architecture walkthrough
- [ ] Provide known-issues list
- [ ] Confirm IP/assets included in purchase agreement
- [ ] Confirm third-party services remain subject to their own terms/licenses

## Current known commercial gaps

- Payments/subscriptions are not represented as a completed production billing system.
- External user and revenue traction is limited.
- Marketplace publishing still includes controlled/human finishing steps in areas where direct automated account actions are not safely authorized.
- The product contains several broad beta modules; a buyer may improve conversion by narrowing positioning around the strongest workflow.
