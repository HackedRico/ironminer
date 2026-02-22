# Demo Checklist — IronMiner Hackathon

## Setup (one-time)

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd gui && npm install && cd ..
```

## Start the App

**Terminal 1 — Backend:**
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd gui && npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Demo Click Paths

### Path 1: Pre-loaded Site Overview (Riverside Tower)

1. App opens → **Review Mode** is default
2. Left sidebar shows 3 sites → click **Riverside Tower**
3. Walk through each tab:
   - **Briefing** — AI summary is pre-loaded. Shows congestion warning for Zone B, safety concern in Zone C.
   - **Zones** — 5 zones with congestion bars. Zone B is 5/5 (critical, red).
   - **Alerts** — 3 alerts (2 high, 1 low). Click to expand details.
   - **Media** — Shows uploaded video frames/thumbnails.
   - **3D** — Interactive 3D BIM model. Click zone boxes to see details. Zone B pulses red.
   - **Safety** — Pre-loaded violations with OSHA citations. Overall risk: critical. PPE compliance grid.
   - **Productivity** — Congestion trend, zone scores, trade overlaps with severity badges, recommendations.

### Path 2: Second Site (Harbor Warehouse)

1. Click **Harbor Warehouse** in sidebar
2. Same tabs all populated — different data (3 zones, lumber staging blocking access road)

### Path 3: Live Video Upload

1. Stay on Riverside Tower (or create a new project via "+" button)
2. Go to **Briefing** tab
3. Drag and drop `site_walkthrough.mp4` into the upload zone
   - The pipeline runs: Video Agent → Safety Agent → Productivity Agent
   - WebSocket updates show progress in real-time
4. After completion, refresh each tab:
   - **Briefing** — New summary about masonry/roofing scenario
   - **Zones** — Updated zone data (4 zones: masonry staging, roofing, MEP rough-in, parking)
   - **Safety** — New violations (fall protection in roofing zone, electrical LOTO in MEP zone)
   - **Productivity** — Updated congestion scores and trade overlaps

**Canned VLM Note:** The file `demo_assets/site_walkthrough.json` contains pre-built zone data that maps to `site_walkthrough.mp4`. The system auto-detects this and skips real video analysis, making the demo instant.

### Path 4: Productivity Benchmarks

1. Go to **Productivity** tab on any site
2. Click **"Team Benchmarks"** toggle (top of panel)
3. See list of pre-seeded teams → click **"Electrical Crew"**
4. See 4 pre-loaded benchmark goals
5. Click **"Run Evaluation"** → results appear:
   - Overall productivity score (pie chart)
   - Pass/fail for each goal with similarity scores
   - Gap summary showing unmet goals
6. **Edit a goal** — change text or add a new goal
7. Click **"Save"** → version increments
8. Click **"Run Evaluation"** again → results update with new scores

### Path 5: Team Management

1. Switch to **Teams** mode (top nav)
2. See worker pool on left, team cards on right
3. Drag workers between pool and teams
4. Click a worker → see 7-day history panel

### Path 6: Live Mode

1. Switch to **Live** mode (top nav)
2. See worker sidebar with live status indicators
3. If LiveKit is running: see live video feeds
4. If not: see clean "DEMO" placeholder

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check `source .venv/bin/activate` and `pip install -r requirements.txt` |
| "DEMO DATA" badge appears | Backend is down or unreachable. Check Terminal 1. |
| Safety/Productivity tabs show "No report" | Backend didn't seed correctly. Check logs for import errors. |
| Upload hangs | Check backend logs. FFmpeg must be installed for frame extraction. |
| Benchmark evaluation fails | Expected — `sentence-transformers` may not be installed. System falls back to keyword evaluator automatically. |

## Key Files for Demo

| File | Purpose |
|------|---------|
| `demo_assets/site_walkthrough.json` | Canned VLM output for upload demo |
| `app/services/storage.py` | Seed data (sites, alerts, reports, benchmarks) |
| `app/data/mock_video_results.py` | Mock video analysis for s1 + s2 |
| `gui/src/utils/mockData.js` | Frontend fallback mock data |
