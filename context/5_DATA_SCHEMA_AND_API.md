# IronMiner — Data Schema & API Reference

> **Base URL**: `http://localhost:8000`  
> **Supabase project**: `https://hspavankkjudjizeaxjs.supabase.co`  
> All REST requests/responses are JSON. Authenticated endpoints use no auth in dev (Supabase RLS not enforced).

---

## Supabase Tables

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `sites` | `id` (text) | Site records with zone data |
| `alerts` | `id` (text) | Safety / productivity alerts |
| `briefings` | `site_id` (text) | Daily site briefing text |
| `feeds` | `id` (text) | Camera feed configurations |
| `video_results` | `job_id` (text) | Structured CV output per video job (JSONB `data` column) |
| `safety_reports` | `site_id` (text) | Latest safety report per site (JSONB `data` column, upserted) |

> `video_results.data` and `safety_reports.data` are JSONB blobs — the full Pydantic model serialised via `model_dump(mode="json")`.

---

## Data Schemas

### Site

```ts
Site {
  id: string                 // e.g. "s1"
  name: string
  address?: string
  status: "active" | "review" | "inactive"
  progress?: number          // 0-100
  congestion: "low" | "medium" | "high"
  trades: number
  workers: number
  frames: number
  last_scan?: datetime
  zones: Zone[]
}

Zone {
  zone: string               // zone name
  congestion: number         // 1-5
  trades: string[]
  workers: number
  status: "ok" | "warning" | "critical"
}
```

### Alert

```ts
Alert {
  id: string                 // e.g. "a_001"
  site_id: string
  site_name: string
  severity: "high" | "medium" | "low"
  title: string
  detail: string
  source_agent: "safety" | "productivity" | "video"
  created_at: datetime
  acknowledged: boolean
}
```

### Video Processing

```ts
VideoJob {
  job_id: string
  status: "queued" | "processing" | "completed" | "failed"
  site_id: string
  filename?: string
  uploaded_by?: string
  file_path?: string
  total_frames?: number
  processed_frames: number
  frames: FrameData[]
  created_at: datetime
  error?: string
}

VideoProcessingResult {        // stored in video_results.data
  job_id: string
  site_id: string
  frames: FrameData[]
  zones: ZoneAnalysis[]
  trade_proximities: TradeProximity[]
  temporal_events: TemporalEvent[]
  metadata: object
}

ZoneAnalysis {
  zone_id: string
  zone_name: string
  workers: WorkerDetection[]
  equipment: EquipmentDetection[]
  hazards: HazardDetection[]
  egress: EgressStatus[]
  material_stacks: MaterialStack[]
  trades_present: string[]
  area_sqft?: number
}

WorkerDetection {
  worker_id: string
  trade: string               // "electrical" | "plumbing" | "framing" | etc.
  ppe: PPEDetection
  elevation_ft: number
  on_scaffold: boolean
  on_ladder: boolean
  three_point_contact?: boolean
  near_edge: boolean          // within 6 ft of unprotected edge
  under_suspended_load: boolean
  in_crane_swing_radius: boolean
}

PPEDetection {
  hard_hat: boolean
  hi_vis_vest: boolean
  safety_glasses: boolean
  fall_harness: boolean
  harness_tied_off: boolean
  gloves: boolean
  hearing_protection: boolean
}

EquipmentDetection {
  equipment_id: string
  type: "crane" | "forklift" | "scaffold" | "ladder" | "grinder" | "welder" | "powder_tool"
  active: boolean
  load_suspended: boolean     // crane only
  signal_person_visible: boolean
  signal_person_line_of_sight: boolean
}

HazardDetection {
  hazard_id: string
  type: "hot_work" | "electrical_exposure" | "standing_water" | "combustibles_nearby"
  zone_id: string
  description: string
  fire_watch_present: boolean
  loto_signage_visible: boolean
}

EgressStatus {
  path_id: string
  zone_id: string
  blocked: boolean
  blocking_material?: string
  emergency_access: boolean
}

TradeProximity {
  zone_id: string
  trade_a: string
  trade_b: string
  separation_ft: number
  overhead_work_above_crew: boolean
  description: string
}

TemporalEvent {
  timestamp: number           // seconds from video start
  zone_id: string
  event_type: "worker_entered" | "worker_exited" | "congestion_change" | "hazard_appeared" | "hazard_resolved"
  detail: string
  worker_count_delta: number
}
```

### Safety Analysis

```ts
SafetyReport {                 // stored in safety_reports.data
  site_id: string
  violations: SafetyViolation[]
  ppe_compliance: { [zone_name: string]: boolean }
  zone_adherence: { [zone_name: string]: boolean }
  overall_risk: "low" | "medium" | "high" | "critical"
  summary: string             // LLM-generated 3-paragraph executive summary
  generated_at: datetime
}

SafetyViolation {
  zone: string
  type: "ppe_missing" | "zone_breach" | "clearance_issue" | "blocked_corridor"
  description: string         // includes OSHA CFR reference
  severity: "high" | "medium" | "low"
  workers_affected: number
}
```

### Productivity Analysis

```ts
ProductivityReport {
  site_id: string
  zones: Zone[]
  trade_overlaps: TradeOverlap[]
  congestion_trend: "improving" | "stable" | "worsening"
  resource_suggestions: string[]
  summary: string
  generated_at: datetime
}

TradeOverlap {
  zone: string
  trades: string[]
  severity: "minor" | "moderate" | "severe"
  recommendation: string
}
```

### Streaming / Feeds

```ts
FeedConfig {
  id: string                  // e.g. "cam1"
  label: string
  site_id: string
  site_name: string
  worker?: string             // for helmet-cam feeds
  type: "fixed" | "helmet"
  auto_scan: boolean
  scan_interval: number       // seconds
}
```

---

## REST Endpoints

### Sites — `/api/sites`

| Method | Path | Query Params | Body | Returns |
|--------|------|-------------|------|---------|
| `GET` | `/api/sites` | `status?` | — | `Site[]` |
| `POST` | `/api/sites` | — | `{ name, address? }` | `Site` |
| `GET` | `/api/sites/:id` | — | — | `Site` |
| `GET` | `/api/sites/:id/frames` | `limit=50, offset=0` | — | `FrameData[]` |
| `GET` | `/api/sites/:id/briefing` | — | — | `{ text, generated_at }` |
| `GET` | `/api/sites/:id/timeline` | — | — | `[]` *(stub)* |

---

### Alerts — `/api/alerts`

| Method | Path | Query Params | Body | Returns |
|--------|------|-------------|------|---------|
| `GET` | `/api/alerts` | `site_id?, severity?, acknowledged?, limit=50` | — | `Alert[]` |
| `POST` | `/api/alerts` | — | `AlertCreate` | `Alert` |
| `GET` | `/api/alerts/:id` | — | — | `Alert` |
| `PATCH` | `/api/alerts/:id/acknowledge` | — | — | `Alert` |

---

### Safety Agent — `/api/safety`

| Method | Path | Body | Returns | Notes |
|--------|------|------|---------|-------|
| `POST` | `/api/safety/analyze` | `{ site_id, video_job_id }` | `SafetyReport` | Runs Phase 1 (deterministic OSHA checks) + Phase 2 (LLM summary). Saves to Supabase. |
| `GET` | `/api/safety/report/:site_id` | — | `SafetyReport` | Fetches latest saved report |
| `GET` | `/api/safety/report/:site_id/violations` | `severity?` | `SafetyViolation[]` | Filtered violation list |
| `POST` | `/api/safety/analyze-frame` | `{}` | — | *(not implemented)* |

> **Frontend fallback**: If backend is unavailable, `SafetyPanel.jsx` fetches `safety_reports` directly from Supabase using the anon key.

---

### Productivity Agent — `/api/productivity`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/productivity/analyze` | `{ site_id, video_job_id }` | `ProductivityReport` |
| `GET` | `/api/productivity/report/:site_id` | — | `ProductivityReport` |
| `GET` | `/api/productivity/report/:site_id/zones` | — | `Zone[]` |
| `GET` | `/api/productivity/report/:site_id/overlaps` | — | `TradeOverlap[]` |
| `GET` | `/api/productivity/report/:site_id/suggestions` | — | `string[]` |
| `GET` | `/api/productivity/trend/:site_id` | `hours=24` | `{ trend, data_points }` |

---

### Video Agent — `/api/video`

| Method | Path | Form / Body | Returns | Notes |
|--------|------|-------------|---------|-------|
| `POST` | `/api/video/upload` | `file, site_id?, uploaded_by?, frame_interval=5.0` | `VideoJob` | Saves file to `uploads/` |
| `GET` | `/api/video/jobs` | `site_id?, status?` | `VideoJob[]` | |
| `GET` | `/api/video/jobs/:job_id` | — | `VideoJob` | |
| `GET` | `/api/video/jobs/:job_id/result` | — | `VideoProcessingResult` | |
| `POST` | `/api/video/jobs/:job_id/complete` | `VideoProcessingResult` | `VideoProcessingResult` | Internal callback — Video Agent posts result when done |
| `POST` | `/api/video/analyze-frame` | `{}` | — | *(not implemented)* |

---

### Streaming — `/api/streaming`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/streaming/feeds` | `site_id?` | `FeedConfig[]` |
| `POST` | `/api/streaming/feeds` | `FeedCreate` | `FeedConfig` |
| `GET` | `/api/streaming/feeds/:id` | — | `FeedConfig` |
| `POST` | `/api/streaming/feeds/:id/scan` | — | `LiveScanResult` |
| `POST` | `/api/streaming/feeds/:id/auto-scan` | `{ enabled, interval_seconds }` | `{ enabled, interval_seconds }` |

---

## WebSocket Endpoints

| Path | Channel | Purpose |
|------|---------|---------|
| `ws://localhost:8000/api/streaming/ws/live/:feed_id` | `live:{feed_id}` | Real-time frame stream from a camera feed |
| `ws://localhost:8000/api/streaming/ws/alerts` | `alerts` | Push new alerts to connected clients |
| `ws://localhost:8000/api/streaming/ws/comms/:feed_id` | `comms:{feed_id}` | Manager ↔ Field worker two-way chat |

WebSocket messages for `ws/comms`:
```json
// Send / receive
{ "from": "Manager", "text": "Move crew out of Zone B", "time": "2026-02-21T20:00:00Z" }
```

---

## Frontend API Modules (`gui/src/api/`)

| File | Functions |
|------|-----------|
| `client.js` | `api(path, options)` — base fetch with 3s timeout, `wsUrl(path)` |
| `sites.js` | `fetchSites()`, `fetchSite(id)`, `fetchBriefing(id)` |
| `alerts.js` | `fetchAlerts(params)`, `acknowledgeAlert(id)` |
| `safety.js` | `runSafetyAnalysis(siteId, videoJobId)`, `fetchSafetyReport(siteId)`, `fetchViolations(siteId, severity?)` |
| `productivity.js` | `runProductivityAnalysis(...)`, `fetchProductivityReport(...)` |
| `video.js` | `uploadVideo(file, siteId)`, `fetchJobStatus(jobId)`, `fetchJobResult(jobId)` |
| `streaming.js` | `fetchFeeds(siteId?)`, `registerFeed(...)`, `scanFeed(feedId)` |

### Direct Supabase fallback (`gui/src/lib/supabase.js`)

Used when backend is unavailable:
```js
fetchSafetyReportFromSupabase(siteId)
// → { data: SafetyReport | null, error: string | null }
// Reads directly from safety_reports table using the anon (publishable) key
```

---

## Environment Variables

### Backend (`.env`)
```
SUPABASE_URL=https://hspavankkjudjizeaxjs.supabase.co
SUPABASE_KEY=sb_secret_...          # service role key — never expose to browser
LLM_PROVIDER=ollama                 # "ollama" | "claude"
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### Frontend (`gui/.env`)
```
VITE_SUPABASE_URL=https://hspavankkjudjizeaxjs.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...  # anon/publishable key — safe for browser
VITE_API_URL=                         # leave empty to use same origin (localhost:5173 proxied to 8000)
```
