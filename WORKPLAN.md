# IronSite Manager — 6-Engineer Work Breakdown

> 36-hour hackathon. Everything below must ship. No task is optional.

---

## Engineer 1: Dataset & Ingestion Pipeline

**Role:** Own the data layer end-to-end. Every other engineer depends on you having frames loadable and organized by Hour 4.

### Phase 1 (Hours 0-4) — Dataset Wrangling
- [ ] Examine the Ironsite dataset the moment it drops — determine format (video files, image frames, metadata JSON, mixed)
- [ ] Extend `handleIngest` in `index.html` to handle all three format scenarios from PLAN.md:
  - Raw video files → frame extraction (already partially built via `extractVideoFrames`)
  - Pre-extracted image frames → direct ingestion with temporal ordering by filename/metadata
  - Frames with metadata (timestamps, site IDs, labels) → parse metadata JSON/CSV, auto-group by site, sequence temporally
- [ ] Build a metadata parser: if the dataset ships with a manifest file (JSON, CSV, or YAML), parse it to auto-populate `siteId`, `timestamp`, and any labels
- [ ] Improve `slugSite()` to intelligently group frames by site using dataset-specific naming conventions
- [ ] Build a configurable frame sampling interval for video extraction (currently hardcoded to 5s)
- [ ] Curate a working sample: 20-30 frames spanning multiple sites and time periods, saved as a named "sample set" in app state

### Phase 2 (Hours 4-12) — Smart Ingestion & Batch Processing
- [ ] Add batch upload progress UI — show per-file and overall progress bars
- [ ] Build frame deduplication — detect and skip near-duplicate frames from video extraction
- [ ] Add frame quality filtering — skip frames that are too dark, blurry, or transitional (use canvas pixel analysis)
- [ ] Build export/import of curated frame sets so the team can share a canonical sample set
- [ ] Add metadata overlay on frame thumbnails (timestamp, site ID, sequence number)

### Phase 3 (Hours 12-18) — Dataset for Demo
- [ ] Load the full Ironsite dataset through the pipeline
- [ ] Organize all frames into clean site groupings with correct temporal ordering
- [ ] Build a "demo dataset" preset — a curated subset that shows the best before/after comparisons
- [ ] Create a frame sequence selector for temporal analysis (pick start frame, end frame, interval)
- [ ] Pre-cache all frame data in a format ready for instant demo playback

### Phase 4 (Hours 18-24) — Live Feed Simulation
- [ ] Build looping video playback from dataset frames to simulate live camera feeds in Live Mode
- [ ] Create multiple simulated feeds from different sites running simultaneously
- [ ] Add frame cycling with configurable speed (fast for demo, real-time for immersion)

### Phase 5 (Hours 24-30) — Polish
- [ ] Ensure all dataset frames render correctly across the app
- [ ] Optimize image compression/sizing so the app stays responsive with 100+ frames loaded
- [ ] Test with the full dataset end-to-end; fix any edge cases

---

## Engineer 2: Spatial Reasoning Technique & Prompt Engineering

**Role:** Own the core technical innovation — the zone-grounded temporal spatial memory technique. This is what wins the hackathon. Your experiment results are the central evidence.

### Phase 1 (Hours 0-4) — Setup
- [ ] Review all prompts in `PROMPTS` object in `index.html`
- [ ] Set up a local experiment tracking structure: prompt version, frames used, quality scores, notes
- [ ] Identify 10 diverse frames from the sample set for baseline testing (once Engineer 1 has data ready)
- [ ] Define scoring rubric with 4 criteria (each scored 1-5):
  1. **Spatial grounding** — does it reference zones/positions?
  2. **Congestion detection** — does it identify trade overlap?
  3. **Temporal reasoning** — does it track changes? (for sequences)
  4. **Actionability** — does it give a manager something to act on?

### Phase 2 (Hours 4-12) — Baseline & Technique R&D
- [ ] **Hours 4-6: Run baselines.** Send 10 frames to Claude with the naive prompt `PROMPTS.baseline`. Log every response. Score each on the rubric. Document 5-10 specific failure cases (vague spatial language, missed congestion, no zone awareness)
- [ ] **Hours 6-9: Technique v1.** Iterate on `PROMPTS.zoneDecomposition` and `PROMPTS.entityRelationship`:
  - Test different zone schemas (quadrant-based, depth-based, activity-based)
  - Test entity-relationship prompt variations (force distance estimates, force trade identification)
  - Score outputs on the rubric; log improvements over baseline
  - Try at least 3 prompt variations for each step
- [ ] **Hours 9-12: Technique v2 — temporal memory.** Select 3+ sequences of 3-5 frames from the same site:
  - Test `PROMPTS.temporal` — does carrying forward prior analysis improve congestion detection?
  - Iterate on the memory chain format (how much prior context to include, summary vs raw)
  - Design a congestion scoring prompt: rate each zone 1-5, flag multi-trade overlap, output structured scores
  - Add a structured output format to the briefing prompt (so Engineer 4 can parse it for visualizations)

### Phase 3 (Hours 12-18) — Formal Validation
- [ ] Select a held-out set of 10-15 frames/sequences NOT used during development
- [ ] Run both baseline and final technique against all held-out frames
- [ ] Score every output on the 4-criteria rubric
- [ ] Build a comparison table: baseline vs technique, per-frame scores, averages
- [ ] Calculate improvement percentages per criterion
- [ ] Write a narrative summary of findings: what improved, what the technique catches that baseline misses, specific examples
- [ ] Finalize the prompt chain — lock down the production versions of all prompts
- [ ] Update `PROMPTS` object in `index.html` with the final validated prompts

### Phase 4 (Hours 18-24) — Advanced Techniques
- [ ] Add a PPE/safety compliance prompt: detect missing hard hats, vests, harnesses in each zone
- [ ] Add a resource allocation prompt: based on congestion analysis, suggest worker/equipment redistribution
- [ ] Test multi-frame consensus: send the same frame with 2-3 prompt variations, synthesize for higher accuracy
- [ ] Refine the manager briefing prompt for maximum clarity and actionability

### Phase 5 (Hours 24-30) — Demo Evidence Package
- [ ] Prepare 3 killer before/after comparison pairs for the demo
- [ ] Write the one-page technique summary for judges: problem, approach, results, impact
- [ ] Ensure all experiment data is formatted and loadable in the Experiments tab (coordinate with Engineer 4)
- [ ] Record final improvement metrics: "X% improvement in spatial grounding" etc.

---

## Engineer 3: Claude API Integration & Analysis Pipeline

**Role:** Own the AI pipeline — API calls, chaining, caching, error handling, and the end-to-end analysis flow. Make it fast, reliable, and demo-proof.

### Phase 1 (Hours 0-4) — API Hardening
- [ ] Add robust error handling to `callClaude()`: retry with exponential backoff (3 attempts), timeout handling, rate limit detection
- [ ] Add response caching: cache analysis results by frame ID + prompt version so re-runs are instant
- [ ] Add API key validation on input (test with a minimal API call)
- [ ] Add a cost/usage tracker — count tokens sent/received, display in the UI footer

### Phase 2 (Hours 4-12) — Pipeline Architecture
- [ ] Refactor `runTechniqueChain()` to support configurable prompt chains (so Engineer 2 can swap prompts without touching pipeline code)
- [ ] Build parallel analysis: when analyzing a site with many frames, run independent frame analyses concurrently (batch of 3 at a time to respect rate limits)
- [ ] Add progress tracking for multi-step chains: emit events for "Step 1/4 complete", "Step 2/4 complete" etc.
- [ ] Build the site-level aggregation pipeline: after all frames analyzed, synthesize a site-wide summary
- [ ] Add structured output parsing: extract congestion scores, zone ratings, and alert levels from Claude's responses into structured data (JSON) that the UI can render
- [ ] Build a queue system for analysis requests so multiple site analyses don't compete for API bandwidth

### Phase 3 (Hours 12-18) — Advanced Pipelines
- [ ] Build the async intelligence pipeline end-to-end: upload footage -> extract frames -> zone analysis -> temporal comparison -> briefing (full automated flow)
- [ ] Build worker compliance pipeline: PPE detection, zone adherence checking (using prompts from Engineer 2)
- [ ] Build the resource allocation pipeline: congestion data -> suggestion generation
- [ ] Add streaming response support: show Claude's analysis text as it streams in (using SSE from the API)
- [ ] Build anomaly detection: compare current analysis against historical baseline, flag significant deviations

### Phase 4 (Hours 18-24) — Live Mode Pipeline
- [ ] Build the live scanning pipeline: grab frame from simulated feed -> run abbreviated analysis -> surface alerts
- [ ] Optimize for speed: use a shorter prompt chain for live scanning (zone + briefing only, skip full entity-relationship)
- [ ] Add alert deduplication: don't fire the same alert repeatedly across consecutive scans
- [ ] Build alert severity classification from Claude's response (critical/warning/info)

### Phase 5 (Hours 24-30) — Demo Reliability
- [ ] Pre-run all demo dataset analyses and cache results
- [ ] Add fallback mode: if API is slow/down during demo, serve cached results seamlessly
- [ ] Stress test: run 20+ frames through the full pipeline, verify no failures
- [ ] Add a "demo mode" toggle that uses pre-cached results for instant response during presentation

---

## Engineer 4: Dashboard UI — Review Mode & Experiments

**Role:** Own the Review Mode experience, the Experiments comparison view, and all data visualization. Make it so clear a non-technical site manager could use it.

### Phase 1 (Hours 0-4) — UI Foundation Polish
- [ ] Improve the `DropZone` component: add drag-and-drop visual feedback, file type icons, multi-file progress
- [ ] Fix responsive layout: ensure `siteGrid` works well from 1024px to 1920px+ screens
- [ ] Add a loading skeleton state for site cards while analysis is pending
- [ ] Improve the `NavBar`: add a connection status indicator, add a help tooltip

### Phase 2 (Hours 4-12) — Review Mode Buildout
- [ ] Build the congestion heatmap view: color-coded zone overlay showing density levels (render as a visual legend next to the frame image, with zone descriptions color-matched)
- [ ] Build the trade overlap matrix: which trades are sharing space, displayed as a simple colored grid
- [ ] Improve `SiteCard` with:
  - Congestion trend indicator (arrow up/down/stable)
  - Last analyzed timestamp
  - Number of alerts/issues found
- [ ] Build the resource allocation panel: display suggestions from the analysis as actionable cards ("Move crew B from Zone 3 to Zone 5")
- [ ] Build worker compliance panel: PPE status, zone adherence flags, displayed as simple pass/fail badges per zone

### Phase 3 (Hours 12-18) — Comparison & Evidence Views
- [ ] Build the side-by-side comparison view for judges: same frame, baseline output on left, technique output on right, with scoring
- [ ] Build the scoring visualization: bar charts or progress bars showing baseline vs technique scores per criterion
- [ ] Build the day-over-day comparison view: two timestamps side by side with delta annotations
- [ ] Build the anomaly/alert feed: a scrollable list of the most important spatial issues across all sites, sorted by severity
- [ ] Improve the `ExperimentsMode`:
  - Add filters: by site, by type (baseline/technique), by date
  - Add the scoring data from Engineer 2's validation results
  - Make the comparison table print-friendly for the judges' one-pager

### Phase 4 (Hours 18-24) — Integration
- [ ] Wire up congestion scores from Engineer 3's structured output into the heatmap and trend indicators
- [ ] Wire up compliance data into the compliance panel
- [ ] Wire up resource suggestions into the allocation panel
- [ ] Add notification badges on the nav tabs when new alerts/analyses arrive
- [ ] Build the "demo walkthrough" panel: a guided tour overlay that walks through baseline -> technique -> product

### Phase 5 (Hours 24-30) — Final Polish
- [ ] Design pass: ensure all text is large, readable, plain language, minimal controls
- [ ] Add transitions and animations for analysis results appearing
- [ ] Test with non-technical user (anyone on the team who isn't building it): can they understand every screen?
- [ ] Build the embedded experiment log panel accessible from the main nav
- [ ] Final responsive pass: test on projector resolution (common at hackathon demos)

---

## Engineer 5: Live Mode & Real-Time Features

**Role:** Own Live Mode — the camera grid, real-time scanning, alerts, and the manager-to-worker communication system. Make it feel like a real operations center.

### Phase 1 (Hours 0-4) — Live Mode Foundation
- [ ] Redesign the `LiveMode` layout: full-screen camera grid on left (2x2 or 3x3), selected feed enlarged on right
- [ ] Build feed selection: click a grid cell to enlarge that feed, show site name and camera label
- [ ] Add "LIVE" indicator badge with pulsing animation on each feed
- [ ] Style the grid to look like a security/operations center

### Phase 2 (Hours 4-12) — Real-Time Scanning
- [ ] Build the periodic scan system: grab a frame from the active feed every N seconds (configurable: 15s, 30s, 60s)
- [ ] Build the alert overlay: when a scan detects congestion or safety issues, show an alert banner on that feed cell
- [ ] Build alert history panel: scrollable timeline of all alerts per feed, with timestamps
- [ ] Add alert sound/visual notification for critical alerts (optional audio beep, screen flash)
- [ ] Build alert acknowledgment: manager can dismiss/acknowledge alerts

### Phase 3 (Hours 12-18) — Communication System
- [ ] Build the manager-to-worker comms panel:
  - Chat-based communication (already scaffolded in `CommsPanel`)
  - Add worker identification: each feed has an associated worker name/ID
  - Add quick-reply buttons: "Move to Zone X", "Check PPE", "Clear area", "Stand by"
  - Add message status indicators (sent, delivered)
- [ ] Build a "Talk" button with visual feedback (simulated push-to-talk):
  - Press and hold = recording indicator
  - Release = "message sent" feedback
  - Display voice messages as chat bubbles with a speaker icon
- [ ] Build worker status panel: list of all identified workers, their current zone, their last check-in time
- [ ] Add simulated worker responses (pre-scripted responses for demo purposes, triggered after a delay)

### Phase 4 (Hours 18-24) — Integration & Unified Dashboard
- [ ] Connect the Review ↔ Live mode toggle so it's a seamless one-click switch
- [ ] When switching to Live, auto-select the most critical feed (highest congestion)
- [ ] Build the unified alert system: alerts from Live scanning appear in Review mode too
- [ ] Add picture-in-picture: manager can watch a live feed while reviewing async analysis
- [ ] Build multi-feed monitoring: show reduced analysis summaries below each grid cell

### Phase 5 (Hours 24-30) — Demo Polish
- [ ] Pre-script a demo scenario: "Manager sees alert on Camera 2, clicks it, sees congestion, sends message to worker, worker responds"
- [ ] Add smooth transitions between feed selection
- [ ] Ensure the looping video simulation (from Engineer 1) looks convincing as "live"
- [ ] Test the full live mode flow end-to-end with real dataset frames
- [ ] Add a "Demo Mode" that auto-plays the scripted scenario

---

## Engineer 6: Demo Flow, Polish & Submission

**Role:** Own the overall user experience, the demo narrative, the judges' evidence, and submission readiness. You are the glue — you integrate everyone's work, handle the final presentation layer, and make sure we actually submit.

### Phase 1 (Hours 0-4) — App Shell & Architecture
- [ ] Set up the project for the team: create a clear file/component structure if we split beyond single-file (or establish code regions if staying single-file)
- [ ] Add error boundary: global error handling so the app never shows a white screen during demo
- [ ] Build the API key persistence: save to localStorage so judges don't have to re-enter
- [ ] Add a "Getting Started" onboarding state: when the app first loads with no data, show clear instructions
- [ ] Set up browser tab title and favicon for professional appearance

### Phase 2 (Hours 4-12) — Cross-Cutting UX
- [ ] Build a global notification/toast system for success/error/info messages (replace `setError` with proper toasts)
- [ ] Add keyboard shortcuts: Escape to go back, arrow keys to navigate frames, Space to toggle play
- [ ] Build the mode toggle UI: make Review/Live switch prominent and obvious, zero confusion
- [ ] Add a global loading overlay for long operations
- [ ] Build breadcrumb navigation: Home > Site > Frame so users always know where they are

### Phase 3 (Hours 12-18) — Demo Flow Builder
- [ ] Build the demo walkthrough system — a guided sequence that tells the story:
  1. **Step 1 — The Problem:** Show a raw frame, run baseline prompt, display the vague output
  2. **Step 2 — The Technique:** Same frame through the technique, show grounded spatial analysis
  3. **Step 3 — Temporal Intelligence:** Multi-frame sequence showing congestion change tracking
  4. **Step 4 — The Product:** Full pipeline — footage in, briefing out, congestion alerts, resource suggestions
  5. **Step 5 — Live Operations:** Live feed monitoring, manager sends message to worker
- [ ] Build a "Present Mode" button that:
  - Goes full-screen
  - Hides the API key input
  - Uses larger fonts
  - Disables editing controls, only shows results
- [ ] Build the evaluation evidence panel: accessible from any screen, shows the before/after comparison data from Engineer 2

### Phase 4 (Hours 18-24) — Integration Testing
- [ ] Integrate all 5 engineers' work into a cohesive flow
- [ ] Test every user path: upload -> analyze -> review briefing -> check timeline -> switch to live -> scan -> communicate
- [ ] Fix UI inconsistencies between components built by different engineers
- [ ] Ensure all loading states, empty states, and error states are handled gracefully
- [ ] Test with the full Ironsite dataset end-to-end

### Phase 5 (Hours 24-30) — Submission Prep
- [ ] Build the one-page technique summary view (in-app or separate, for judges):
  - Problem statement
  - Approach (zone decomposition + entity-relationship + temporal memory)
  - Results (improvement metrics from Engineer 2)
  - Real-world impact
- [ ] Create the demo script: who presents what, timing for each section, transitions
- [ ] Run full rehearsal: time it, identify weak points, fix them
- [ ] Final bug sweep: test every button, every state, every edge case
- [ ] Optimize initial load time (ensure the single HTML file loads fast)
- [ ] Final submission packaging and upload

### Phase 6 (Hours 30-36) — Final Prep
- [ ] Full end-to-end test with real dataset on a clean browser
- [ ] Fix any remaining edge cases or bugs found during rehearsal
- [ ] Ensure cached demo data is loaded and ready
- [ ] Coordinate rehearsal: run through the demo 2-3 times with the full team
- [ ] Submit

---

## Dependency Map

```
Hour 0                    Hour 4                    Hour 12                   Hour 18         Hour 24         Hour 30    Hour 36
  |                         |                         |                         |               |               |          |
  E1: Dataset wrangling --> E1: Batch/quality -------> E1: Full dataset -------> E1: Live sim -> E1: Polish      |          |
  |                         |                         |                         |               |               |          |
  E2: Setup/rubric -------> E2: Baseline + Tech R&D -> E2: Validation ---------> E2: Advanced -> E2: Evidence    |          |
  |                         |                         |                         |               |               |          |
  E3: API hardening ------> E3: Pipeline build ------> E3: Advanced pipelines -> E3: Live pipe-> E3: Demo cache  |          |
  |                         |                         |                         |               |               |          |
  E4: UI foundation ------> E4: Review mode UI ------> E4: Comparison views ---> E4: Wire up --> E4: Final polish|          |
  |                         |                         |                         |               |               |          |
  E5: Live mode layout ---> E5: Scanning + alerts ---> E5: Comms system -------> E5: Integrate-> E5: Demo script |          |
  |                         |                         |                         |               |               |          |
  E6: App shell ----------> E6: Cross-cutting UX ----> E6: Demo flow builder --> E6: Integrate-> E6: Submit prep -> SUBMIT
```

## Critical Handoff Points

| Hour | From | To | What |
|------|------|----|------|
| 4 | E1 | E2 | Sample frame set ready for baseline experiments |
| 4 | E1 | ALL | Dataset is loadable, everyone can test with real data |
| 12 | E2 | E3 | Validated prompt chain ready for pipeline integration |
| 12 | E2 | E4 | Scoring data and comparison pairs ready for UI |
| 14 | E3 | E4 | Structured output format defined so UI can parse it |
| 18 | E3 | E5 | Live scanning pipeline ready for Live Mode |
| 18 | E1 | E5 | Looping video simulation ready for Live Mode |
| 18 | E2 | E3 | PPE/compliance and resource allocation prompts finalized |
| 24 | ALL | E6 | All features complete, E6 begins integration testing |
| 28 | E2 | E6 | One-page technique summary and evidence package ready |
| 30 | E6 | ALL | Demo script distributed, rehearsal begins |

## Communication Protocol

- **Hour 0:** Quick standup — confirm assignments, exchange contact info
- **Every 4 hours:** 5-minute sync — blockers, progress, handoffs
- **Hour 18:** Integration check — everyone merges their work, verify it works together
- **Hour 24:** Feature freeze — no new features, only fixes and polish
- **Hour 30:** Code freeze — only critical bug fixes
- **Hour 34:** Rehearsal — full demo run-through

## What "Done" Looks Like

A judge sits down. They see:
1. Real Ironsite footage loaded in the app
2. A side-by-side showing baseline Claude fails at spatial reasoning, our technique succeeds
3. Scored evidence: X% improvement across 4 criteria on held-out test frames
4. A full product demo: footage goes in, plain-English briefings come out with congestion alerts and resource suggestions
5. Live mode: camera grid, real-time scanning, manager talks to workers
6. Everything is plain language, large text, zero jargon, obvious navigation
