# IronSite Manager — Hackathon Project Plan

---

## Problem Statement

Construction sites lose productivity because multiple contractor trades compete for the same physical space. Managers have no automated way to understand spatial congestion, and current AI vision models can see objects in a frame but fail at understanding spatial relationships — who's crowding whom, which zones are over-allocated, how congestion patterns evolve over time. The people who need this intelligence are non-technical and need simple, plain-language answers.

---

## What We're Building

A spatial intelligence platform with two layers:

**Layer 1 — A validated spatial reasoning technique** built and tested against the Ironsite dataset, proving measurable improvement over baseline AI vision capabilities.

**Layer 2 — A product** that applies that technique in a manager-friendly dashboard with async video intelligence and live site oversight.

Layer 1 is what wins the hackathon. Layer 2 is what proves real-world impact.

---

## The Technique: Temporal Spatial Memory with Zone-Grounded Reasoning

The core claim: Claude Vision out of the box gives spatially vague descriptions of construction footage. Our technique forces grounded spatial reasoning through three mechanisms:

1. **Zone decomposition** — every frame is analyzed by dividing the scene into spatial zones (quadrants, areas, elevation levels) and reasoning about each independently before synthesizing
2. **Entity-relationship mapping** — instead of listing objects, the model is prompted to describe spatial relationships: proximity, overlap, movement corridors, clearances
3. **Temporal memory chain** — sequential frames carry forward a cumulative spatial context so the model reasons about change over time, not isolated snapshots

The Ironsite dataset is the benchmark. We baseline Claude's naive performance on the dataset, develop the technique against it, and measure improvement.

---

## Dataset Integration Plan

The dataset arrives at hackathon start in an unknown format. We prepare for three scenarios:

| Format | Handling |
|---|---|
| Raw video files | Browser-side frame extraction via canvas API, sample at configurable intervals |
| Pre-extracted image frames | Direct ingestion, sort by filename/metadata for temporal ordering |
| Frames with metadata (timestamps, site IDs, labels) | Parse metadata to auto-group by site and sequence temporally |

Regardless of format, the dataset serves four roles:

**Role 1 — Baseline evaluation.** Run naive prompts against a sample of frames. Document failures in spatial reasoning. This becomes the "before" in the demo.

**Role 2 — Technique development.** Iterate prompts and chaining strategies against the dataset. Each experiment is logged: prompt version, frames used, quality of spatial reasoning output.

**Role 3 — Technique validation.** Run the final technique against held-out frames from the dataset. Score results against manually verified ground truth. This becomes the "after" in the demo.

**Role 4 — Product demo content.** The same real footage powers the live product demonstration, so judges see real Ironsite data flowing through the system end to end.

---

## 36-Hour Build Timeline

---

### Phase 1: Hours 0–4 — Setup & Dataset Exploration

Immediately when the dataset drops:

- Examine the dataset format, structure, and contents
- Build flexible ingestion — handle video, images, or mixed formats
- Extract a working sample: 20–30 frames spanning multiple sites and multiple time periods
- Manually review the sample: identify what spatial congestion and trade overlap actually look like in this footage
- Set up the app shell: single-file React, API key input, basic layout
- Split the team: one track on baseline experiments, one track on product scaffolding

**Deliverable:** Dataset is loadable, sample is curated, app shell exists.

---

### Phase 2: Hours 4–12 — Baseline & Technique Development

#### Experiment Track (spatial reasoning R&D)

**Hour 4–6: Run baseline experiments**

- Send sample frames to Claude with naive prompts: "Describe what you see" and "What's happening on this construction site"
- Log the outputs. Identify specific failures: vague spatial language, inability to detect congestion, no awareness of trade overlap, no zone-level reasoning
- Document 5–10 concrete failure cases with the frame and Claude's response

**Hour 6–9: Develop technique v1**

- Design zone decomposition prompt: force Claude to divide the frame into regions and analyze each
- Design entity-relationship prompt: require Claude to describe spatial relationships, not just objects
- Test both against the same baseline frames and compare output quality
- Log improvements and remaining gaps

**Hour 9–12: Develop technique v2 — add temporal memory**

- Select sequences of 3–5 frames from the same site across different times
- Build the memory chain: frame 1 analysis becomes context for frame 2, cumulative context carries forward
- Test whether temporal context improves congestion detection and change tracking
- Design the congestion scoring prompt: rate each zone's density, flag multi-trade overlap
- Run against multiple sequences from the dataset, log results

#### Product Track (UI & pipeline)

- Build video/image upload and frame extraction pipeline
- Build the site grouping UI — cards per site, simple and large
- Build the summary display — plain-language briefing cards, no tables or charts
- Wire up Claude API calls with loading states
- Build the frame viewer so judges can see what the AI is looking at alongside its analysis

**Deliverable:** A documented experiment log showing baseline failures and technique improvements, plus a functional upload-to-analysis pipeline.

---

### Phase 3: Hours 12–18 — Validation & Async Intelligence

#### Experiment Track

**Hour 12–14: Formal evaluation**

- Select a held-out set of 10–15 frames/sequences not used during development
- Run both baseline prompts and the final technique against them
- Score each output on specific criteria: spatial grounding (does it reference zones/positions?), congestion detection (does it identify trade overlap?), temporal reasoning (does it track changes?), actionability (does it give a manager something to act on?)
- Build a simple comparison table: baseline vs technique, per-frame scores
- This is the evidence slide for the judges

**Hour 14–18: Integrate validated technique into the product**

- The winning prompt chain from experiments becomes the production pipeline
- Build the async intelligence flow end to end: upload footage → extract frames → zone-grounded analysis → temporal comparison → plain-language briefing
- Build the congestion view: per-zone density summary, which trades are where, recommendations for reallocation
- Build worker compliance checking: PPE, zone adherence flagged in summaries
- Ensure all outputs use simple, non-technical language

#### Product Track

- Build resource allocation suggestions based on congestion analysis
- Build day-over-day comparison view using temporal memory
- Build the anomaly/alert system: surface the most important spatial issues first
- Polish the upload experience — drag and drop, progress indicators, clear feedback

**Deliverable:** Validated technique with scored evidence, fully functional async intelligence mode.

---

### Phase 4: Hours 18–24 — Real-Time Mode & Integration

- Build live stream viewer: grid of camera feeds (use looping dataset video as simulated live feeds)
- Build feed selection with worker/camera identification
- Build manager-to-worker comms UI: talk button, simple audio or chat interface
- If feasible: periodic live frame analysis — grab a frame from the "live" feed every 30 seconds, run through the spatial technique, surface alerts in real time
- Connect both modes into unified dashboard with simple toggle: "Review" mode (async) and "Live" mode (real-time)
- Ensure navigation between modes is obvious and requires zero training

**Deliverable:** Both product modes functional and connected.

---

### Phase 5: Hours 24–30 — Polish & Demo Assembly

- Load the full Ironsite dataset and run the complete pipeline
- Polish UI for non-technical users: large text, plain language, minimal controls, clear visual hierarchy
- Build the demo flow:
  1. Show a raw frame from the dataset → run baseline prompt → show vague output (the problem)
  2. Run the same frame through the technique → show grounded spatial analysis (the improvement)
  3. Run a multi-frame sequence → show temporal reasoning catching congestion changes
  4. Show the full product: footage goes in, manager gets plain-English briefing, congestion alerts, resource suggestions
  5. Show live mode: manager watches feeds and talks to workers
- Build or polish the evaluation comparison view so judges can see baseline vs technique side by side
- Add the experiment log as an accessible panel in the app — show your work

**Deliverable:** Complete demo-ready app with embedded evidence of technique improvement.

---

### Phase 6: Hours 30–36 — Final Prep & Submission

- Full end-to-end test with real dataset
- Fix edge cases and bugs
- Rehearse the demo: who presents what, timing, transitions
- Prepare a one-page summary of the technique for judges: problem, approach, results, impact
- Final submission

---

## Prompt Engineering Strategy

### Baseline prompt (the "before")

> "Describe what is happening in this construction site image."

### Technique prompt chain (the "after")

**Prompt 1 — Zone Decomposition:**

> "Divide this construction site image into spatial zones (foreground/midground/background, left/center/right, ground level/elevated). For each zone, describe: what trade or activity is happening, how many workers are present, what equipment and materials occupy the space, and how crowded the zone is on a 1-5 scale."

**Prompt 2 — Entity-Relationship Mapping:**

> "Based on your zone analysis, describe the spatial relationships: which trades are working adjacent to each other, where are movement corridors blocked, where is equipment creating clearance issues, and which zones have multiple trades competing for the same space."

**Prompt 3 — Temporal Comparison (when multiple frames available):**

> "Here is your previous analysis of this site from [earlier time]. Compare against the current frame. What has changed spatially? Have congestion hotspots shifted? Have new trade overlaps appeared? Has any area cleared up? Rate the overall congestion trend: improving, stable, or worsening."

**Prompt 4 — Manager Briefing:**

> "Summarize your spatial analysis as a briefing for a non-technical construction site manager. Use plain language, no jargon. Lead with the most important issue. Keep it under 150 words. End with one specific recommendation."

---

## Demo Narrative for Judges

> "Current AI models can identify objects in construction footage but can't reason about space — they don't understand that three trades stacked in the same zone is a productivity problem. We took Ironsite's real job site footage and proved this: baseline Claude gives vague descriptions with no spatial awareness.
>
> We developed a technique — zone-grounded temporal spatial memory — that forces the model to decompose scenes into spatial regions, map relationships between entities, and carry forward a cumulative understanding of the site across time. Tested against the same dataset, our technique catches congestion patterns and trade overlap that the baseline completely misses.
>
> We built this into IronSite Manager, a dashboard designed for non-technical site managers. Raw footage goes in. Plain-English congestion alerts, resource allocation suggestions, and daily briefings come out. Live, managers can watch any camera and talk to any worker. The spatial intelligence layer means they finally know where the problems are before they become delays."

---

## Technical Architecture

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Single-file React (JSX) | One artifact, no build step needed |
| AI | Claude API (vision + text) | Sonnet for speed, frame analysis + text summaries |
| Video frames | Browser-side extraction | Canvas API pulls frames from uploaded video |
| Live streams | WebRTC or simulated | Real WebRTC if time allows, mock feeds for demo |
| Live comms | WebRTC audio or UI simulation | Voice channel between manager and worker |
| Storage | In-memory / browser state | No backend needed for demo |

---

## Team Split Recommendation

| Person | Focus |
|---|---|
| Person A | Dataset wrangling, baseline experiments, prompt engineering, technique validation, experiment logging |
| Person B | App UI/UX, frame extraction pipeline, API integration, product polish |
| Both | Integration (hours 18–24), demo prep (hours 28+) |

If solo: prioritize the technique track first (hours 0–14), then build just enough product to demo it convincingly.

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Dataset format is unexpected | Blocks everything | Build flexible ingestion first, support video + images + metadata |
| Claude Vision doesn't improve much with technique | Kills the core claim | Test early (hours 4–8). If zone prompting doesn't help, pivot to multi-frame consensus or frame annotation strategies |
| API rate limits or latency | Slows demo | Cache all analysis results, pre-run the demo dataset, show cached results with option to run live |
| Live streaming too complex for timeframe | Incomplete Mode 2 | Simulate with looping video, focus demo time on the technique evidence |
| UI looks too technical | Fails the "non-technical user" test | Design for someone's parent. Big text. Few buttons. No dashboards. If you have to explain it, simplify it |
