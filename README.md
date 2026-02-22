# IronSite Manager

Spatial intelligence platform for construction site management. AI agents analyze job site video footage to detect congestion, safety violations, and productivity bottlenecks — then deliver plain-English briefings to non-technical site managers.

## The Problem

Construction sites lose productivity when multiple trades compete for the same physical space. Current AI vision models can identify objects but fail at understanding spatial relationships — who's crowding whom, which zones are over-allocated, how patterns change over time.

## What This Does

Three AI agents work together:

1. **Video Agent** — Ingests site footage, extracts frames, runs spatial analysis via GPU processing (vest.ai)
2. **Safety Agent** — Analyzes for PPE compliance, zone adherence, blocked corridors
3. **Productivity Agent** — Scores congestion per zone, detects trade overlap, suggests resource reallocation

Results flow into a dashboard with two modes:
- **Review Mode** — Upload footage, get AI briefings, view zone congestion maps, browse alerts
- **Live Mode** — Monitor camera feeds in real-time, talk to workers, get instant alerts

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| AI | Claude API (vision + text) |
| GPU Processing | Vast.ai |
| Live Comms | WebSockets |

## Quick Start

### Prerequisites

- Python 3.11 (VastAI currently requires `distutils`, which is not available in 3.12+)
- Node.js 18+

### Setup

```bash
# Clone
git clone <repo-url> && cd ironminer

# Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend dependencies
cd gui && npm install && cd ..

# Environment variables (optional — mock data works without these)
cp .env.example .env
```

### Run

The easiest way — start both servers at once:

```bash
./scripts/dev.sh
```

This launches:
- **Backend** at `http://localhost:8000` (Swagger docs at `/docs`)
- **Frontend** at `http://localhost:5173`

Press `Ctrl+C` to stop both.

Or run them separately:

```bash
# Terminal 1: Backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd gui && npm run dev
```

The frontend proxies `/api` and `/ws` requests to the backend automatically (configured in `vite.config.js`), so no CORS issues in development.

### Without the Backend

The frontend works standalone — it falls back to built-in mock data and shows a yellow "DEMO DATA" badge. Useful for UI development without running the API.

## Project Structure

```
ironminer/
├── gui/                    React frontend (Vite)
│   └── src/
│       ├── api/            API client wrappers (one file per endpoint group)
│       ├── components/     UI components (SiteCard, AlertCard, ZoneRow, etc.)
│       ├── views/          Page-level views (ReviewMode, LiveMode)
│       ├── hooks/          React hooks (useWebSocket, useSiteData)
│       └── utils/          Colors, mock data, frame extraction helpers
│
├── app/                    FastAPI backend
│   ├── main.py             App entry point — mounts all routers
│   ├── models/             Pydantic schemas (Site, Alert, VideoJob, etc.)
│   ├── routers/            API endpoints (sites, video, safety, productivity, alerts, streaming)
│   ├── agents/             AI agent logic (video, safety, productivity)
│   ├── services/           Shared services (Claude client, storage, job queue)
│   └── ws/                 WebSocket connection manager
│
├── scripts/
│   └── dev.sh              Start both servers with one command
│
└── requirements.txt        Python dependencies
```

See [FRONTEND_AND_PROJ_STRUCTURE.md](FRONTEND_AND_PROJ_STRUCTURE.md) for the full file-by-file breakdown, API endpoint reference, and onboarding guide for new contributors.

## API Overview

All endpoints are at `/api/*`. Full details in the Swagger docs at `http://localhost:8000/docs`.

| Group | Prefix | Purpose |
|-------|--------|---------|
| Sites | `/api/sites` | Site CRUD, briefings, timelines |
| Video | `/api/video` | Upload footage, track processing jobs |
| Safety | `/api/safety` | Safety reports, violation lists |
| Productivity | `/api/productivity` | Congestion zones, trade overlaps, suggestions |
| Alerts | `/api/alerts` | Cross-site alert feed with acknowledgment |
| Streaming | `/api/streaming` | Camera feeds, live scanning, WebSocket endpoints |

## Contributing

Each agent is independent. Pick your area and implement:

- **Video Agent** → `app/agents/video_agent.py` + `app/routers/video.py`
- **Safety Agent** → `app/agents/safety_agent.py` + `app/routers/safety.py`
- **Productivity Agent** → `app/agents/productivity_agent.py` + `app/routers/productivity.py`
- **Frontend** → `gui/src/`

Agent stubs have TODO comments explaining what to build. Models in `app/models/` define the API contract — don't change the shapes without coordinating with the frontend.
