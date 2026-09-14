# Publisher Forge — Public Beta Launch Pack

This file is the ready-to-use launch kit for the current Publisher Forge beta.

## Positioning

**One-line pitch**

Publisher Forge connects AI research, product creation, release QA, marketplace packaging, and revenue learning into one workflow.

**Who it is for**

- Indie publishers and small digital-product operators
- Builders who are tired of stitching together disconnected AI chats
- People testing KDP, Etsy, Shopify, Pinterest, and related product workflows
- Early adopters willing to test a working beta and report friction

**What we do not claim**

- No guaranteed sales or revenue
- No claim that public listings equal verified sales
- No fully autonomous marketplace publishing
- No automatic spending, posting, applying, or publishing without approval

## Primary launch URL

Use the public beta front door:

`/launch`

On the current Render deployment this should resolve as:

`https://publisher-forge.onrender.com/launch`

If the production hostname changes, use the new hostname plus `/launch`.

## Product Hunt

Official Product Hunt guidance currently limits the tagline to 60 characters and the description to 500 characters. Product Hunt also says not to ask people directly for upvotes.

**Name**

Publisher Forge

**Tagline**

AI agents that turn ideas into publish-ready products

**Description**

Publisher Forge connects the messy steps between an idea and a usable marketplace product. Research current opportunities, build original content and listing metadata, run release QA on the actual files, prepare guided KDP packages, and record real results for the next decision. Publishing is the most mature path today, with Shopify, Pinterest, opportunity search, viral remix, security, and orchestration in beta.

**Maker comment**

I built Publisher Forge because I was tired of using AI for one step and then manually carrying the work through five more tools.

The beta now connects research → opportunity scoring → production → quality review → release QA → marketplace packaging → revenue learning.

The part I care about most is reliability. If the software can do something safely and repeatedly, it should do it. If a marketplace or quality decision still needs a human, Forge should make that decision obvious instead of pretending it is automatic.

The publishing pipeline is the most mature part today. The broader goal is a small AI-operated business system where specialized agents share the same projects and learning loop.

I am looking for people who will actually try it and tell me exactly where it wastes their time.

**Suggested launch tags**

AI, Productivity, Publishing

**Product Hunt asset checklist**

- Square thumbnail, ideally 240 × 240 or larger
- 3–5 screenshots showing: Trend Radar, Production, Release QA, KDP handoff, Command Center
- One short screen recording showing research → build → QA → export
- Do not use URL shorteners or tracking links in the Product Hunt product URL

## Indie Hackers post

### Title

I built an AI-agent pipeline that actually produced my KDP publishing package

### Body

I have been building Publisher Forge as an attempt to stop treating AI like a chatbot and start treating it like a small operating team.

The current flow connects:

Research → opportunity scoring → product brief → production → quality control → release QA → publishing package → revenue learning.

The publishing side is the most mature. It can research current public signals, generate original product content and metadata, build and inspect release files, size KDP covers, check pricing inputs, and create an organized handoff package.

I have also been connecting Shopify, Pinterest, job/gig opportunity search, viral remix, a security gate, and an orchestrator into the same project.

The rule behind the project is simple: if software can do a task reliably, the operator should not have to keep doing it manually.

It is still a beta and I am not pretending every marketplace action should be automated. Publishing, posting, applying, or spending still needs human approval.

I am opening it up now because I need real users more than I need another feature. I would especially like feedback from anyone who has tried to build or sell digital products with AI and got stuck doing the annoying handoff work manually.

Public beta: https://publisher-forge.onrender.com/launch

## Short social post

Publisher Forge is finally open as a public beta.

Instead of using AI for one step and manually carrying the work through everything else, Forge connects:

research → build → QA → packaging → revenue learning

The KDP/publishing pipeline is the most mature today, with Shopify, Pinterest, opportunity search, viral remix, security, and orchestration in beta.

I need real users more than I need another feature now.

Try it: https://publisher-forge.onrender.com/launch

## LinkedIn-style post

I have been building Publisher Forge around one rule:

If AI or software can do a task reliably, the operator should not have to keep doing it manually.

The result is becoming more than a content generator.

Publisher Forge connects opportunity research, product scoring, production, quality control, release QA, marketplace packaging, and revenue learning into the same workflow.

The publishing/KDP path is the most mature. It can move from an opportunity idea to an organized publishing bundle while keeping human approval in the places where it actually matters.

I am opening the beta now because the next bottleneck is not another feature. It is real-world usage.

I want people to use it, break it, and tell me exactly where the workflow still wastes time.

Public beta: https://publisher-forge.onrender.com/launch

## 30-second Shorts / TikTok script

**Hook — 0–5 sec**

"I got tired of asking AI to make something and then doing all the annoying work after it."

**5–12 sec**

"So I built Publisher Forge. It starts by researching current product opportunities and ranking what is actually worth testing."

**12–20 sec**

"Then separate agents build the product, check the quality, inspect the release files, and prepare the publishing package."

**20–26 sec**

"The goal is not fake full automation. Anything that still needs a human decision stays a human decision."

**26–30 sec**

"It is in public beta now. If you build digital products, try to break it."

## Demo recording shot list

1. Open `/launch` and show the one-line value proposition.
2. Click **Try the beta**.
3. Run or restore a Trend Radar example.
4. Open an opportunity and show the product brief.
5. Move to Production and show the generated package.
6. Show Release QA / approval gating.
7. Show the organized KDP export / handoff.
8. End on Command Center and the public beta URL.

Target length: 45–60 seconds. Keep cuts fast and show the product rather than narrating every feature.

## First-party launch analytics

The public launch page sends small same-origin events to:

`POST /api/launch-event`

No email, password, customer content, or IP address is intentionally written into the launch event payload.

Events currently include:

- `page_view`
- `open_app`
- `create_account`
- `view_demo`
- `view_repo`
- `feedback`

The server writes these as one-line JSON records prefixed with `publisher_forge_launch`. On Render, search service logs for that prefix to see traffic and CTA activity without adding a paid analytics service.

UTM/source values are accepted from the launch URL and truncated before logging.

## Launch sequence

1. Merge and deploy the public-beta branch.
2. Open `/launch` on phone and desktop.
3. Confirm the **Try beta**, **Account**, GitHub, and feedback links.
4. Check Render logs for a `page_view` event.
5. Record the 45–60 second demo.
6. Create the Product Hunt account now if needed; new accounts currently have a one-week wait before they can submit a product.
7. Post the short social announcement and Indie Hackers story first.
8. Invite early users to report problems, not to praise the product.
9. Track: landing views → app opens → account attempts → feedback.
10. Do not add another major agent until outside-user friction gives a stronger reason than internal brainstorming.

## What comes after initial traffic

The next monetization step should be based on usage evidence. Do not add payments just to say the app charges money. First identify which workflow strangers repeatedly use and what their expensive/manual alternative is. Then price that outcome.
