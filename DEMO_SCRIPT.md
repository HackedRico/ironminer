# IronMiner Demo Script — Hackathon Presentation to IronSite.AI

**Total Time:** ~5 minutes
**Team Size:** 6 speakers

---

## THE HOOK (Speaker 1 — 30 sec)

> "Last year, a superintendent on a 14-story build in Houston watched two crews — electricians and plumbers — pile into the same 400-square-foot mechanical room on the 9th floor. Nobody coordinated. Within an hour, a plumber tripped over conduit, fell into an open panel, and the site shut down for three days. That's $280,000 lost — not from bad workers, but from **bad visibility**."
>
> "The problem isn't that site managers don't care. It's that they're managing 200 workers across 30 zones with a clipboard, a radio, and their gut. We built something to change that. This is **IronMiner**."

---

## THE PROBLEM (Speaker 2 — 30 sec)

> "Construction sites are spatial chaos. Multiple trade crews — electrical, plumbing, steel, concrete — compete for the same physical space every single day. This causes three things:"
>
> 1. **Congestion kills productivity** — trades waiting on each other, stacking up in tight zones.
> 2. **Safety violations go unnoticed** — blocked exits, missing PPE, fall hazards that nobody catches until OSHA shows up.
> 3. **Superintendents are flying blind** — they get incident reports *after* the damage is done, not before.
>
> "Existing AI vision tools can detect *objects* — a hard hat, a crane. But they don't understand *spatial relationships*. They can't tell you that Zone C has three trades in 400 square feet and the egress is blocked. **We can.**"

---

## THE SOLUTION — WHAT WE BUILT (Speaker 3 — 45 sec)

> "IronMiner is a spatial intelligence platform for construction sites. It takes jobsite video — from drones, fixed cameras, or helmet cams — and runs it through a **three-agent AI pipeline**:"
>
> 1. **Video Agent** — Analyzes footage and maps workers, equipment, and hazards into structured zones.
> 2. **Safety Agent** — Applies OSHA regulatory rules automatically. Fall protection, PPE compliance, blocked egress, hot work violations — all checked against real CFR citations.
> 3. **Productivity Agent** — Scores congestion per zone on a 1-to-5 scale, detects trade overlaps, and flags bottlenecks.
>
> "Each agent has two phases. Phase 1 is deterministic — pure rules, no AI hallucination, always works. Phase 2 uses Claude to generate a plain-English briefing that a superintendent can read in 30 seconds on their phone. If the LLM goes down, you still get every violation and every score. The AI is additive, not a dependency."

---

## LIVE DEMO — REVIEW MODE (Speaker 4 — 90 sec)

*[Share screen. Open the app at localhost:5173. Navigate to Review Mode.]*

> "Let me show you what a superintendent sees after uploading a site video."

**Step 1 — Upload**
*[Select a site from the sidebar. Drag a video into the upload zone on the Briefing tab.]*

> "We drop in a video from this morning's walkthrough. The pipeline kicks off — you can see the progress updating in real-time over WebSockets."

**Step 2 — Briefing Tab**
*[Show the AI-generated briefing and activity timeline.]*

> "Here's the executive briefing. Plain English. No jargon. It tells the super: 'You have a critical congestion issue in Zone C, two OSHA fall-protection violations, and electrical needs to be rescheduled away from plumbing in Zone A.'"

**Step 3 — Zones Tab**
*[Click to Zones tab. Show the congestion heatmap.]*

> "Each zone gets a congestion score. Zone C is a 5 — critical. Eight workers, three trades, 400 square feet. That's a collision waiting to happen."

**Step 4 — Safety Tab**
*[Click to Safety tab. Show violations with OSHA citations.]*

> "Here's where it gets serious. Every violation has an OSHA CFR reference. This isn't a guess — it's 29 CFR 1926.501, fall protection. 29 CFR 1926.34, blocked egress. The super can hand this report directly to their safety officer."

**Step 5 — Productivity Tab**
*[Click to Productivity tab. Show trade overlaps and recommendations.]*

> "And here are the actionable recommendations. Stagger the electrical crew's shift by two hours. Relocate steel staging out of Zone A. These are specific, not generic."

---

## LIVE DEMO — LIVE MODE (Speaker 5 — 45 sec)

*[Switch to Live Mode in the nav bar.]*

> "Now let's talk about real-time. Review Mode is for analyzing footage after the fact. **Live Mode** is what's happening right now on the jobsite."

*[Show the worker sidebar with status indicators. Click on a worker to show their helmet-cam feed.]*

> "Every worker with a helmet cam shows up here. Green dot means their camera is active. We can pull up any feed, see what they see, and push alerts directly to them."

*[Show the alert notification and push-to-talk controls.]*

> "If the Safety Agent detects a violation in real-time, the superintendent can push an alert straight to the affected worker's device. No radio chatter. No delay. And with push-to-talk built in, they can coordinate crews instantly."

---

## WHY THIS MATTERS + CLOSE (Speaker 6 — 30 sec)

> "Construction is a $2 trillion industry with a 2% profit margin. A single safety shutdown costs six figures. A single productivity bottleneck can push a project weeks behind schedule."
>
> "IronMiner gives superintendents what they've never had: **real-time spatial awareness** of their entire site, backed by OSHA-grade safety rules and AI that speaks their language."
>
> "We're not replacing the superintendent's judgment. We're giving them the visibility to use it *before* something goes wrong, not after."
>
> "We built this in [X] hours. We'd love to build the next phase with IronSite."

---

## SUGGESTED ROLE ASSIGNMENTS

| Speaker | Role | Section |
|---------|------|---------|
| **1** | Storyteller / Team Lead | Hook — the Houston story |
| **2** | Domain Expert | The Problem — why construction needs this |
| **3** | Technical Architect | The Solution — three-agent pipeline |
| **4** | Demo Driver | Review Mode walkthrough |
| **5** | Demo Driver #2 | Live Mode walkthrough |
| **6** | Business / Closer | Why it matters + call to action |

---

## TIPS

- **Speaker 4** should have the app loaded and a video ready to upload *before* the demo starts. Don't waste time on loading screens.
- If the LLM is slow during the demo, have a pre-loaded site with results already cached — show that one while the new upload processes in the background.
- The "DEMO DATA" badge will show if the backend is down. Make sure the backend is running.
- Keep transitions tight. Each speaker should already be standing/positioned when their section starts.
