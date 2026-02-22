# IronSite Manager — Project Structure & API Reference

## What This Project Is

A spatial intelligence platform for construction site management. AI agents analyze video footage from job sites to detect **congestion** (too many trades in one zone), **safety violations** (missing PPE, blocked corridors), and **productivity issues** (resource misallocation). A non-technical site manager sees plain-English briefings and live camera feeds in a dashboard.

## Current State (what's built)

Everything below is **implemented and working**. The backend serves seeded mock data on all endpoints. The frontend renders fully with or without the backend (falls back to local mock data with a "DEMO DATA" badge).

| Layer | Status | Notes |
|-------|--------|-------|
| **FastAPI backend** | All routers mounted, all endpoints return data | Seeded with 3 sites, 5 alerts, 6 feeds, zone data, briefings |
| **React frontend** | Components extracted, views wired to API | ReviewMode + LiveMode working, mock fallback built in |
| **Agent stubs** | Scaffolded with TODO comments | Each agent file has `process()` method ready for implementation |
| **Mock data** | Dual: backend `storage.py` + frontend `mockData.js` | Labeled, commented, matching the same dataset |
| **Dev tooling** | Vite proxy, venv, scripts/dev.sh | Frontend proxies `/api` and `/ws` to backend automatically |

### What's NOT built yet (for agents picking up work)
- Agent logic (video_agent, safety_agent, productivity_agent) — stubs only
- vest.ai GPU integration in video_agent
- Real WebSocket frame streaming (connection manager exists, no frame pushing yet)
- ExperimentsMode view (baseline vs technique comparison)
- Real Claude API calls from backend (client exists at `app/services/claude_client.py`)

---

## Project Layout

```
ironminer/
├── .gitignore
├── .venv/                           # Python virtualenv (not committed)
├── requirements.txt                 # fastapi, uvicorn, anthropic, etc.
├── PLAN.md                          # Hackathon plan & prompt engineering strategy
├── WORKPLAN.md                      # 6-engineer work breakdown
├── FRONTEND_AND_PROJ_STRUCTURE.md   # ← you are here
│
├── gui/                             # ── REACT FRONTEND (Vite) ──
│   ├── package.json                 # react, react-dom, vite, @vitejs/plugin-react
│   ├── vite.config.js               # Proxy: /api → :8000, /ws → ws://:8000
│   ├── index.html
│   └── src/
│       ├── main.jsx                 # React root mount
│       ├── App.jsx                  # Mode router (review|live), loads NavBar, fetches global counts
│       │
│       ├── api/                     # One file per API group — thin fetch wrappers
│       │   ├── client.js            # api() helper + wsUrl() for WebSocket URLs
│       │   ├── sites.js             # fetchSites, fetchSite, fetchBriefing, fetchTimeline
│       │   ├── video.js             # uploadVideo, fetchJobs, fetchJob, fetchJobResult
│       │   ├── safety.js            # runSafetyAnalysis, fetchSafetyReport, fetchViolations
│       │   ├── productivity.js      # runProductivityAnalysis, fetchZones, fetchOverlaps, fetchSuggestions
│       │   ├── alerts.js            # fetchAlerts, fetchAlert, acknowledgeAlert
│       │   └── streaming.js         # fetchFeeds, scanFeed, connectLiveFeed, connectAlerts, connectComms
│       │
│       ├── components/              # UI building blocks (extracted from manager.jsx)
│       │   ├── NavBar.jsx           # Top bar: logo, review/live toggle, urgent count, frame count
│       │   ├── SiteCard.jsx         # Site summary card with progress %, congestion bar
│       │   ├── ZoneRow.jsx          # Single zone row with congestion bar + trade list
│       │   ├── CongestionBar.jsx    # 5-segment visual bar (green/yellow/red)
│       │   ├── AlertCard.jsx        # Expandable alert with severity dot + detail
│       │   ├── BriefingView.jsx     # Plain-text briefing renderer, highlights "Recommendation:" lines
│       │   ├── LiveFeedCard.jsx     # Camera feed thumbnail with LIVE badge
│       │   └── UploadZone.jsx       # Drag-and-drop file upload
│       │
│       ├── views/
│       │   ├── ReviewMode.jsx       # Left: site list + upload. Right: briefing/zones/alerts tabs
│       │   └── LiveMode.jsx         # Left: enlarged feed + comms. Right: feed grid + alerts
│       │
│       ├── hooks/
│       │   ├── useWebSocket.js      # Generic WS hook (connect, send, onMessage)
│       │   └── useSiteData.js       # Fetch + cache site list
│       │
│       ├── utils/
│       │   ├── colors.js            # C palette, congestionColor(), severityStyle
│       │   ├── mockData.js          # ★ Labeled mock data — sites, alerts, briefings, feeds, zones
│       │   ├── frameExtractor.js    # Browser-side video→frames via Canvas API
│       │   └── alertLevel.js        # Classify text as high/medium/low
│       │
│       └── styles/
│           └── global.css           # Dark theme, Outfit + IBM Plex Mono fonts, animations
│
├── app/                             # ── FASTAPI BACKEND ──
│   ├── __init__.py
│   ├── main.py                      # FastAPI app: CORS, mounts all routers at /api/*
│   ├── config.py                    # Env vars: ANTHROPIC_API_KEY, VASTAI_API_KEY, etc.
│   │
│   ├── models/                      # Pydantic schemas (shared between routers and agents)
│   │   ├── site.py                  # Site, Zone, ZoneStatus, SiteCreate
│   │   ├── video.py                 # FrameData, VideoJob, VideoProcessingResult, FrameAnalyzeRequest
│   │   ├── analysis.py              # AnalysisResult, SafetyReport, SafetyViolation, ProductivityReport, TradeOverlap
│   │   ├── alert.py                 # Alert, AlertSeverity, AlertCreate
│   │   └── streaming.py             # FeedConfig, FeedCreate, LiveScanResult, AutoScanRequest
│   │
│   ├── routers/                     # API endpoints — one file per group
│   │   ├── sites.py                 # /api/sites — CRUD + briefing + timeline
│   │   ├── video.py                 # /api/video — upload, jobs, results, completion callback
│   │   ├── safety.py                # /api/safety — analyze, reports, violations
│   │   ├── productivity.py          # /api/productivity — analyze, zones, overlaps, suggestions, trend
│   │   ├── alerts.py                # /api/alerts — list, get, acknowledge, create
│   │   └── streaming.py             # /api/streaming — feeds CRUD + WebSocket endpoints
│   │
│   ├── agents/                      # ★ Agent logic — stubs ready for implementation
│   │   ├── base.py                  # BaseAgent ABC with process() method
│   │   ├── video_agent.py           # TODO: vest.ai GPU processing, frame extraction, zone analysis
│   │   ├── safety_agent.py          # TODO: PPE detection, violations, zone adherence
│   │   └── productivity_agent.py    # TODO: congestion scoring, trade overlap, resource allocation
│   │
│   ├── services/
│   │   ├── claude_client.py         # call_claude(messages, max_tokens) → str
│   │   ├── job_queue.py             # create_job(), get_job(), update_job() — in-memory
│   │   └── storage.py               # ★ In-memory data store — seeded with mock data for all endpoints
│   │
│   ├── ws/
│   │   └── manager.py               # ConnectionManager: connect, disconnect, broadcast per channel
│   │
│   └── tests/
│
└── scripts/
    └── dev.sh                       # Starts both backend (:8000) and frontend (:5173)
```

---

## Data Flow

```
  Video upload → VIDEO AGENT (vest.ai GPU) → VideoProcessingResult
                                                  │
                                    ┌─────────────┴─────────────┐
                                    v                           v
                             SAFETY AGENT              PRODUCTIVITY AGENT
                             → SafetyReport            → ProductivityReport
                                    │                           │
                                    └─────────┬─────────────────┘
                                              v
                                           ALERTS
                                              v
                                          FRONTEND
```

**Key contract:** `VideoProcessingResult` is the bridge between agents. Video Agent produces it, Safety and Productivity agents consume it. Each agent fetches it via `GET /api/video/jobs/{id}/result`.

---

## Mock Data (for development without real AI)

Mock data lives in **two places** (same content, different formats):

| Location | Format | Used by |
|----------|--------|---------|
| `app/services/storage.py` | Python dicts | Backend — returned by all API endpoints |
| `gui/src/utils/mockData.js` | JS exports | Frontend — fallback when backend is offline |

### What's in the mock data

| Dataset | Count | Key fields |
|---------|-------|------------|
| **Sites** | 3 | Riverside Tower (high congestion), Harbor Warehouse (medium), Oakfield Homes (low) |
| **Zones** | 11 total | Congestion 1-5, trades[], workers count, status ok/warning/critical |
| **Alerts** | 5 | 2 high (trade stacking, missing PPE), 1 medium (blocked path), 2 low (positive progress) |
| **Briefings** | 3 | Plain-English summaries, each ends with "Recommendation:" |
| **Feeds** | 6 | 4 fixed cameras, 2 helmet cams, across 2 sites |

### Frontend fallback behavior

Each view tries the API first. On failure, it sets `usingMock = true` and loads from `mockData.js`. A yellow **DEMO DATA** badge appears so you know which mode you're in.

---

## API Endpoints

### `/api/sites`
| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/sites` | List all sites |
| POST | `/api/sites` | Create a site |
| GET | `/api/sites/{site_id}` | Get site detail + zones |
| GET | `/api/sites/{site_id}/frames` | Get frames for a site |
| GET | `/api/sites/{site_id}/briefing` | Get latest AI briefing |
| GET | `/api/sites/{site_id}/timeline` | Get temporal analysis chain |

### `/api/video` — Video Agent
| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/video/upload` | Upload video/images (multipart) |
| GET | `/api/video/jobs/{job_id}` | Poll processing status |
| GET | `/api/video/jobs/{job_id}/result` | Get finished `VideoProcessingResult` |
| GET | `/api/video/jobs` | List jobs (`?site_id=`, `?status=`) |
| POST | `/api/video/analyze-frame` | Analyze a single frame |
| POST | `/api/video/jobs/{job_id}/complete` | Internal callback when agent finishes |

### `/api/safety` — Safety Agent
| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/safety/analyze` | Run safety analysis (`{site_id, video_job_id}`) |
| GET | `/api/safety/report/{site_id}` | Get latest safety report |
| GET | `/api/safety/report/{site_id}/violations` | List violations (`?severity=`) |
| POST | `/api/safety/analyze-frame` | Single frame safety check |

### `/api/productivity` — Productivity Agent
| Method | Path | What it does |
|--------|------|--------------|
| POST | `/api/productivity/analyze` | Run productivity analysis (`{site_id, video_job_id}`) |
| GET | `/api/productivity/report/{site_id}` | Get latest productivity report |
| GET | `/api/productivity/report/{site_id}/zones` | Zone congestion data |
| GET | `/api/productivity/report/{site_id}/overlaps` | Trade overlap data |
| GET | `/api/productivity/report/{site_id}/suggestions` | Resource allocation suggestions |
| GET | `/api/productivity/trend/{site_id}` | Congestion trend (`?hours=`) |

### `/api/alerts`
| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/alerts` | List alerts (`?site_id=`, `?severity=`, `?acknowledged=`) |
| GET | `/api/alerts/{alert_id}` | Get single alert |
| PATCH | `/api/alerts/{alert_id}/acknowledge` | Acknowledge an alert |
| POST | `/api/alerts` | Create alert (used internally by agents) |

### `/api/streaming` + WebSockets
| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/streaming/feeds` | List camera feeds (`?site_id=`) |
| POST | `/api/streaming/feeds` | Register a new feed |
| POST | `/api/streaming/feeds/{feed_id}/scan` | Trigger immediate scan |
| POST | `/api/streaming/feeds/{feed_id}/auto-scan` | Toggle auto-scan on/off |
| WS | `/api/streaming/ws/live/{feed_id}` | Live frame stream |
| WS | `/api/streaming/ws/alerts` | Real-time alert push |
| WS | `/api/streaming/ws/comms/{feed_id}` | Manager-worker chat |

---

## Who Owns What

| Person | Files to implement | Input | Output |
|--------|-------------------|-------|--------|
| **Video Agent** | `app/agents/video_agent.py` + `app/routers/video.py` | Raw video/images | `VideoProcessingResult` |
| **Safety Agent** | `app/agents/safety_agent.py` + `app/routers/safety.py` | `VideoProcessingResult` | `SafetyReport` + alerts |
| **Productivity Agent** | `app/agents/productivity_agent.py` + `app/routers/productivity.py` | `VideoProcessingResult` | `ProductivityReport` + alerts |
| **Frontend** | `gui/src/` | All API responses | Dashboard |

---

## For Agents Picking Up Work

### If you're implementing an agent (video/safety/productivity):
1. Your entry point is `app/agents/<your>_agent.py` — implement the `process()` method
2. Your router is already wired at `app/routers/<your>.py` — it calls your agent and stores results
3. Models are defined in `app/models/` — don't change the shapes, the frontend depends on them
4. Use `app/services/claude_client.py` for Claude API calls
5. Store results in the dicts in `app/services/storage.py` (e.g., `SAFETY_REPORTS`, `PRODUCTIVITY_REPORTS`)
6. Test via Swagger at `http://localhost:8000/docs`

### If you're working on the frontend:
1. Components are in `gui/src/components/` — extracted from `manager.jsx`, already styled
2. API wrappers are in `gui/src/api/` — one file per endpoint group, already wired
3. Mock data is in `gui/src/utils/mockData.js` — labeled, falls back automatically
4. Add new views in `gui/src/views/` and import in `App.jsx`
5. Vite proxy handles `/api` → backend, no CORS issues in dev

### Key files to read first:
- `app/services/storage.py` — all seeded data lives here, understand the data shapes
- `app/models/` — Pydantic schemas define the API contract
- `gui/src/utils/mockData.js` — labeled mock data with field-by-field comments
- `gui/src/api/client.js` — how frontend talks to backend

---

## Running

```bash
# Backend (from project root)
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
# → Swagger docs at http://localhost:8000/docs

# Frontend
cd gui && npm install && npm run dev
# → http://localhost:5173

# Both at once
./scripts/dev.sh
```
