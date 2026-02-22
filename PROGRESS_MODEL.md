# IronSite Manager — Project Progress Model

## What It Is

**IronSite Manager** is a spatial intelligence platform for construction site management. AI agents analyze job site video footage to detect congestion, safety violations, and productivity bottlenecks, then deliver plain-English briefings to non-technical site managers.

**Core Problem:** Construction sites lose productivity when multiple trades compete for the same physical space. Current AI vision models identify objects but fail at understanding spatial relationships — who's crowding whom, which zones are over-allocated, how patterns change over time.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React 18 + Vite)   localhost:5173            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ Review   │ │ Live     │ │ (removed)│                │
│  │ Mode     │ │ Mode     │ │          │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│  Tabs: Briefing | Zones | Alerts | Media | Safety |    │
│        Productivity                                     │
│  WebSocket listeners for real-time pipeline updates     │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP + WebSocket
┌────────────────────▼────────────────────────────────────┐
│  Backend (FastAPI + Python)   localhost:8000             │
│  Routers: sites | video | safety | productivity |       │
│           alerts | streaming | workers                  │
│                                                         │
│  Pipeline: VideoAgent → SafetyAgent → ProductivityAgent │
│                                                         │
│  Storage: In-memory dicts (+ optional Supabase)         │
│  LLM: Ollama CLI (llama3.2) or Claude API               │
│  WS: ConnectionManager → pipeline:{site_id} channels    │
└─────────────────────────────────────────────────────────┘
```

---

## Pipeline Flow (Video Upload → UI)

```
1. User drops video in UploadZone
2. POST /api/video/upload → saves to uploads/ dir
3. Background task _process_video() kicks off:

   VideoAgent.process()
     └─ Reads cached Pegasus summary from app/summarizer/summary.txt
     └─ Builds 5 structured ZoneAnalysis objects (workers, PPE, hazards, egress, equipment)
     └─ Extracts video frame thumbnails
     └─ Returns VideoProcessingResult
     └─ Saves briefing text to BRIEFINGS[site_id]
     └─ WS broadcast: stage=video_complete

   SafetyAgent.process()
     └─ Phase 1: Deterministic OSHA 29 CFR 1926 rule checks
     │   - Hard hat, fall protection, harness, suspended loads, ladder contact
     │   - Fire watch, LOTO, egress, material stability, congestion
     └─ Phase 2: LLM executive summary (3 paragraphs)
     └─ Returns SafetyReport (violations, compliance, risk level)
     └─ WS broadcast: stage=safety_complete

   ProductivityAgent.process()
     └─ Phase 1: Congestion scoring (1-5), trade overlap detection, trend
     └─ Phase 2: LLM productivity briefing (2 paragraphs)
     └─ Returns ProductivityReport (zones, overlaps, suggestions)
     └─ WS broadcast: stage=productivity_complete

   WS broadcast: stage=pipeline_complete

4. Frontend WebSocket listeners auto-refresh each tab
```

---

## Backend Structure

### Routers (app/routers/)

| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| sites | `/api/sites` | CRUD sites, briefings, timelines |
| video | `/api/video` | Upload, job tracking, pipeline orchestration |
| safety | `/api/safety` | Safety reports, OSHA violations |
| productivity | `/api/productivity` | Congestion zones, trade overlaps, suggestions |
| alerts | `/api/alerts` | Cross-site alert feed with acknowledgment |
| streaming | `/api/streaming` | Camera feeds, LiveKit tokens, WebSocket endpoints |
| workers | `/api/workers` | Helmet-cam worker registration, heartbeat |

### Agents (app/agents/)

| Agent | Input | Output |
|-------|-------|--------|
| VideoAgent | Video file path | `VideoProcessingResult` (zones, frames, metadata) |
| SafetyAgent | site_id + VideoProcessingResult | `SafetyReport` (violations, compliance, risk, summary) |
| ProductivityAgent | site_id + VideoProcessingResult | `ProductivityReport` (zones, overlaps, trend, suggestions, summary) |

All agents follow a **two-phase pattern**:
- **Phase 1**: Deterministic analysis (no LLM needed, always works)
- **Phase 2**: LLM executive summary (graceful fallback if Ollama/Claude unavailable)

### Models (app/models/)

| Model | Key Fields |
|-------|------------|
| `Site` | id, name, address, zones, status, progress |
| `VideoJob` | job_id, site_id, status (queued/processing/completed/failed) |
| `VideoProcessingResult` | frames[], zones[], zone_analyses, temporal_chain, metadata |
| `ZoneAnalysis` | zone_id, workers[], equipment[], hazards[], egress[], trades_present[], area_sqft |
| `WorkerDetection` | worker_id, trade, ppe (PPEDetection), elevation_ft, on_scaffold |
| `SafetyReport` | violations[], ppe_compliance, zone_adherence, overall_risk, summary |
| `SafetyViolation` | zone, type, description, severity, cfr_reference, workers_affected |
| `ProductivityReport` | zones[], trade_overlaps[], congestion_trend, resource_suggestions[], summary |

### Services (app/services/)

| Service | Purpose |
|---------|---------|
| `db.py` | Async Supabase wrapper with in-memory fallback |
| `storage.py` | In-memory dicts: SITES, ALERTS, BRIEFINGS, VIDEO_JOBS, VIDEO_RESULTS, PRODUCTIVITY_REPORTS |
| `llm_client.py` | Swappable LLM (Ollama CLI subprocess or Claude API) |
| `livekit_service.py` | LiveKit JWT token generation |
| `worker_registry.py` | In-memory helmet-cam worker registry |
| `job_queue.py` | Video job queue management |

### WebSocket Layer (app/ws/)

`ConnectionManager` maintains channels: `pipeline:{site_id}`, `live:{feed_id}`, `alerts`, `comms:{feed_id}`

---

## Frontend Structure

### Views (gui/src/views/)

| View | Purpose |
|------|---------|
| **ReviewMode** | Main dashboard — site selector, tabbed content (briefing/zones/alerts/media/safety/productivity) |
| **LiveMode** | Real-time helmet-cam monitoring, push-to-talk, live alerts |

*ProductivityMode was removed — productivity is now a tab inside ReviewMode.*

### Components (gui/src/components/)

| Component | Purpose |
|-----------|---------|
| NavBar | Top nav, mode switcher (Review / Live), urgent alert badge |
| SiteCard | Site summary card in sidebar |
| BriefingView | AI briefing display + upload zone + activity timeline |
| UploadZone | Drag-and-drop video upload |
| SafetyPanel | Auto-loading safety violations, PPE compliance, risk gauge |
| ProductivityPanel | Auto-loading congestion grid, trade overlaps, suggestions |
| ZoneRow | Single zone with congestion bar and trade details |
| AlertCard | Alert with severity badge, detail, acknowledge button |
| MediaGallery | Thumbnail grid of extracted video frames |
| AddProjectModal | New site creation form |
| LiveStreamView/ | Worker video grid, audio controls, connection status |

### API Layer (gui/src/api/)

| Module | Exports |
|--------|---------|
| client.js | `api()` base fetch, `wsUrl()` builder |
| sites.js | `fetchSites()`, `createSite()`, `fetchBriefing()`, `fetchTimeline()` |
| video.js | `uploadVideo()`, `fetchJobs()`, `fetchJobResult()` |
| safety.js | `fetchSafetyReport()`, `fetchViolations()` |
| productivity.js | `fetchProductivityReport()`, `fetchZones()`, `fetchOverlaps()` |
| alerts.js | `fetchAlerts()`, `acknowledgeAlert()` |
| streaming.js | `fetchFeeds()`, `getManagerToken()`, `connectPipeline()` (WebSocket) |

### Hooks (gui/src/hooks/)

`useWebSocket`, `useSiteData`, `useLiveStream`, `useAudioControls`

---

## Key Files

```
app/
├── main.py                          # FastAPI app, router mounting, CORS
├── config.py                        # Env var loading (API keys, LLM config)
├── agents/
│   ├── base.py                      # BaseAgent ABC
│   ├── video_agent.py               # Cached Pegasus summary → structured zones
│   ├── safety_agent.py              # OSHA rule engine + LLM summary
│   └── productivity_agent.py        # Congestion scoring + LLM briefing
├── models/
│   ├── site.py, alert.py, video.py  # Pydantic schemas
│   ├── analysis.py                  # SafetyReport, ProductivityReport
│   └── streaming.py                 # FeedConfig, WorkerInfo
├── routers/
│   ├── sites.py, video.py, safety.py, productivity.py
│   ├── alerts.py, streaming.py, workers.py
├── services/
│   ├── db.py, storage.py, llm_client.py
│   ├── livekit_service.py, worker_registry.py
│   └── job_queue.py
├── ws/manager.py                    # WebSocket ConnectionManager
├── summarizer/
│   ├── summary.py                   # Twelve Labs Pegasus API caller
│   └── summary.txt                  # Cached Pegasus output (used by VideoAgent)
└── utils/video.py                   # Video splitting helpers

gui/
├── src/
│   ├── App.jsx                      # Root: NavBar + ReviewMode | LiveMode
│   ├── views/ReviewMode.jsx         # Main dashboard with 6 tabs
│   ├── views/LiveMode.jsx           # Real-time helmet-cam monitoring
│   ├── components/                  # 14 reusable components
│   ├── api/                         # 7 API client modules
│   ├── hooks/                       # 4 custom React hooks
│   └── utils/                       # Mock data, colors, helpers
├── package.json                     # React 18, LiveKit, Supabase deps
└── vite.config.js                   # Dev server config
```

---

## Current State

### Working
- Full pipeline: upload video → VideoAgent → SafetyAgent → ProductivityAgent → UI
- VideoAgent reads cached `app/summarizer/summary.txt` (no Twelve Labs API calls)
- Deterministic analysis (Phase 1) always works for both safety and productivity
- LLM summaries via `ollama run llama3.2` CLI subprocess (workaround for Homebrew 0.16.3 serve bug)
- WebSocket push updates at each pipeline stage
- SafetyPanel and ProductivityPanel auto-load existing reports and listen for updates
- ReviewMode has 6 tabs: briefing, zones, alerts, media, safety, productivity
- Graceful fallback to mock data when backend unavailable

### Known Issues
- Ollama 0.16.3 (Homebrew) `serve` API can't find models — using CLI subprocess as workaround
- Twelve Labs Pegasus API rate-limited (3600 sec/hour free tier) — using cached summary.txt
- `summary.py` must be run manually to generate new summary.txt for different videos
- No persistent database without Supabase configured — in-memory storage resets on restart

### Environment
- Python 3.14 (local), 3.11 (.python-version for deployment)
- Node.js 18+
- Ollama 0.16.3 with llama3.2
- Optional: Supabase, LiveKit, Vast.ai

---

## How to Run

```bash
# Backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend
cd gui && npm run dev

# Generate new video summary (requires TWELVE_LABS_API_KEY)
python app/summarizer/summary.py --video path/to/video.mp4 --output app/summarizer/summary.txt
```

Swagger docs: http://localhost:8000/docs
App: http://localhost:5173
