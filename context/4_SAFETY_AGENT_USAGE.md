# Update 4 — Supabase Persistence + Safety PoC Tab

> Shipped on `safety-agent` branch. Adds a Supabase seed script for real persistence and a "Safety" tab in ReviewMode for human-in-the-loop review.

---

## What Changed

The Safety Agent worked end-to-end against in-memory mock data but had no persistence layer and no way to see results in the UI. This update does two things: (1) a Python seed script pushes mock data into Supabase so the pipeline can use a real database, and (2) a new Safety tab in ReviewMode lets you trigger analysis and review violations as a human-in-the-loop PoC.

---

## Part 1: Supabase Persistence

### Data Flow

```
app/services/storage.py (in-memory seed data)
    ↓ model_dump(mode="json")
scripts/seed_supabase.py
    ↓ upsert via supabase-py
Supabase PostgreSQL (6 tables)
```

### Schema

Six tables in Supabase. `video_results` and `safety_reports` store full Pydantic model blobs as JSONB to avoid 10+ normalized tables for a PoC.

| Table | Primary Key | Notable Columns |
|-------|-------------|-----------------|
| `sites` | `id TEXT` | name, address, status, progress, congestion, trades, workers, frames, last_scan, `zones JSONB` |
| `alerts` | `id TEXT` | site_id FK, severity, title, detail, source_agent, acknowledged, created_at |
| `briefings` | `site_id TEXT` | text |
| `feeds` | `id TEXT` | label, site_id FK, worker, type, auto_scan, scan_interval |
| `video_results` | `job_id TEXT` | site_id FK, `data JSONB` (full `VideoProcessingResult`) |
| `safety_reports` | `site_id TEXT` | `data JSONB` (full `SafetyReport`), generated_at |

### Seed Script

**File:** `scripts/seed_supabase.py`

- Imports data from `app/services/storage.py` (SITES, ALERTS, BRIEFINGS, FEEDS, VIDEO_RESULTS)
- Uses `supabase-py` client with credentials from `.env`
- Calls `model_dump(mode="json")` on each Pydantic model to serialize
- Idempotent — uses upsert on primary key so it can be re-run safely

**Run:**
```bash
.venv/bin/python scripts/seed_supabase.py
```

**Expected output:**
```
Upserting 3 sites...
Upserting 5 alerts...
Upserting 3 briefings...
Upserting 6 feeds...
Upserting 1 video results...
Done! All seed data upserted.
```

### Config

**File:** `app/config.py` — two env vars added:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | `""` | Project URL (`https://<project-id>.supabase.co`) |
| `SUPABASE_KEY` | `""` | Service role key (never commit this) |

**File:** `.env` (gitignored) — must contain:

```
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_KEY=<your-service-role-key>
```

**Dependency:** `supabase` added to `requirements.txt`.

### SQL Setup (manual, one-time)

Before running the seed script, create the tables in the Supabase SQL Editor:

```sql
CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  status TEXT,
  progress INT,
  congestion TEXT,
  trades INT,
  workers INT,
  frames INT,
  last_scan TIMESTAMPTZ,
  zones JSONB
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id),
  site_name TEXT,
  severity TEXT,
  title TEXT,
  detail TEXT,
  source_agent TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ
);

CREATE TABLE briefings (
  site_id TEXT PRIMARY KEY REFERENCES sites(id),
  text TEXT
);

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  label TEXT,
  site_id TEXT REFERENCES sites(id),
  site_name TEXT,
  worker TEXT,
  type TEXT,
  auto_scan BOOLEAN DEFAULT FALSE,
  scan_interval INT DEFAULT 30
);

CREATE TABLE video_results (
  job_id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id),
  data JSONB
);

CREATE TABLE safety_reports (
  site_id TEXT PRIMARY KEY REFERENCES sites(id),
  data JSONB,
  generated_at TIMESTAMPTZ
);
```

---

## Part 2: Safety Tab in ReviewMode

### Architecture

```
ReviewMode.jsx
  └── tab: 'safety'
        └── SafetyPanel.jsx
              ├── Button → runSafetyAnalysis(siteId, 'mock_vj_001')   [POST /api/safety/analyze]
              └── Display ← fetchSafetyReport(siteId)                  [GET  /api/safety/report/:id]
```

### How the Model Fits In

The Safety Agent uses a **two-phase architecture**. Understanding this is important because it determines what the UI can show with or without a running LLM:

| Phase | LLM Required | What It Produces | UI Section |
|-------|-------------|-------------------|------------|
| Phase 1: Deterministic OSHA checks | No | Violations list, PPE compliance, zone adherence, overall risk | Risk badge, Violations cards, PPE grid, Zone grid |
| Phase 2: Executive summary | Yes (Ollama or Claude) | Narrative summary text | Executive Summary box |

**With Ollama running:** All sections render, including a detailed narrative summary.

**Without Ollama:** Everything still renders. The summary falls back to:
> `[Auto-generated] 17 safety violations detected. Overall risk: critical. See violations list for details.`

The LLM provider is selected by `LLM_PROVIDER` in `.env`:

| Value | Provider | Requires |
|-------|----------|----------|
| `ollama` (default) | Local Ollama | `ollama serve` + model pulled |
| `claude` | Anthropic API | `ANTHROPIC_API_KEY` in `.env` |

### SafetyPanel Component

**File:** `gui/src/components/SafetyPanel.jsx`

**Props:** `siteId` — the selected site ID from ReviewMode

**Sections rendered:**

| Section | Data Source | Description |
|---------|-----------|-------------|
| **Run Analysis button** | `runSafetyAnalysis()` | Triggers POST, shows loading state, then fetches report |
| **Overall Risk badge** | `report.overall_risk` | Colored pill — critical/high=red, medium=yellow, low=green |
| **Executive Summary** | `report.summary` | Orange-tinted info box with LLM-generated (or fallback) narrative |
| **Violations list** | `report.violations[]` | Expandable cards with severity dot, zone, type badge, description, workers affected |
| **PPE Compliance grid** | `report.ppe_compliance` | Zone names with green checkmark / red X |
| **Zone Adherence grid** | `report.zone_adherence` | Same layout as PPE grid |

**Human-in-the-loop:** Each violation card has a "Dismiss" button. Dismissed violations get strikethrough + reduced opacity. This is local state only — not persisted. The intent is to let a site superintendent review AI findings and flag false positives before they escalate to alerts.

### API Endpoints Used

Both endpoints already existed from Update 3. No backend changes were needed.

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/api/safety/analyze` | POST | `{ site_id, video_job_id }` | `SafetyReport` |
| `/api/safety/report/{site_id}` | GET | — | `SafetyReport` |

**File:** `gui/src/api/safety.js` — existing API client functions.

### ReviewMode Integration

**File:** `gui/src/views/ReviewMode.jsx` — three changes:

1. Import: `import SafetyPanel from '../components/SafetyPanel'`
2. Tab array: `['briefing', 'zones', 'alerts', 'media', 'safety']`
3. Tab content: Safety Analysis header with "PoC" badge + description + `<SafetyPanel siteId={selectedSite} />`

---

## Files Touched

```
app/config.py                        — MODIFIED: added SUPABASE_URL, SUPABASE_KEY
requirements.txt                     — MODIFIED: added supabase + pinned all deps
.env                                 — CREATED: (gitignored) LLM + Supabase credentials
scripts/seed_supabase.py             — CREATED: idempotent Supabase seed script
gui/src/components/SafetyPanel.jsx   — CREATED: safety PoC component
gui/src/views/ReviewMode.jsx         — MODIFIED: added safety tab (import + array + render)
```

---

## How to Test

### 1. Seed Supabase

```bash
# Create tables in Supabase SQL Editor first (see SQL above)

# Then seed data
.venv/bin/python scripts/seed_supabase.py

# Verify: check Supabase dashboard → Table Editor → all 6 tables have rows
```

### 2. Safety Tab (frontend only)

```bash
cd gui && npm run dev
# Open http://localhost:5173
# Select a site → click "Safety" tab
# You should see the "Run Analysis" button and "PoC" badge
```

### 3. End-to-End

```bash
# Terminal 1: start backend
source .venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2: start frontend
cd gui && npm run dev

# In browser: select a site → Safety tab → click "Run Analysis"
# Violations, risk badge, compliance grids should all render
# Summary will be auto-generated fallback if Ollama isn't running
```

### 4. With Local LLM (optional, for full summary)

```bash
# Start Ollama
ollama serve
ollama pull llama3.2

# Re-run analysis — summary will now be a detailed narrative
```

### 5. Human-in-the-Loop

```
Click "Run Analysis" → expand a violation → click "Dismiss"
→ violation gets strikethrough + reduced opacity
→ click again to "Restore"
```

---

## What's Next

- Persist dismissals to Supabase (currently local state only)
- Read from Supabase tables instead of in-memory storage
- Wire Video Agent output into `video_results` table automatically
- Add safety trend tracking (compare reports over time)
