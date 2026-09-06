# Publisher Forge MVP

A browser-based AI publishing workflow for finding, evaluating, planning, and producing original Amazon KDP and Etsy product concepts.

## Operating principle
If AI or software can do a task reliably, automate it instead of making the operator do it manually.

## Run
Run `npm install`, set `OPENAI_API_KEY`, and start the server with `npm start`.

## Included
- Live KDP/Etsy Trend Radar with cited public web sources
- Consistent opportunity scoring and make/validate/skip decisions
- AI opportunity analysis
- Product Brief generation
- Production Agent for original draft content and listing metadata
- Quality Control Agent with deterministic scoring and approval blocking
- One-tap package revision followed by a prior-issue-aware Quality Control recheck
- Human-only KDP/Etsy finishing checks separated from AI-fixable blockers
- Device-local Project Vault with automatic saving and project restoration
- One-tap approved publishing ZIP with draft, listing, QC, brief, and checklist files
- Print-formatted PDF export with a title page, structured headings, and page numbers
- AI Cover Studio with original artwork, exact title typography, PNG download, and ZIP inclusion
- Interior Art Studio that replaces up to 12 manuscript placeholders in safe automatic batches, embedding the finished black-and-white illustrations in the PDF and ZIP
- Automatic KDP paperback pricing with print-cost, royalty, and sales estimates
- KDP upload kit with a clearly named 6×9 interior PDF and guided upload steps
- Automatic KDP full-wrap cover PDF with calculated back, spine, front, bleed, and reserved barcode area
- Remembered author or pen name with matching front-cover typography
- Revenue/Market Agent with measured conversion, profit, scale/iterate/stop decisions, and one controlled next experiment
- Device-local revenue learning history for repeat test cycles
- Downloadable Markdown drafts and JSON listing data
- Device-local human approval gate unlocked only after a passing review

## Next production layer
Add accounts, persistent project storage, payments, and controlled marketplace handoff. Keep data collection and API use compliant with current platform terms, and require human approval before publishing.
