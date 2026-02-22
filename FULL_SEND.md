# Auto-Orchestration Pipeline + UI Push Updates

## What This Does

After a video upload completes processing, safety and productivity analysis now **auto-trigger** in sequence. The UI receives real-time WebSocket updates at each stage. No more manual POST calls.

## Pipeline Flow

```
Video upload → _process_video()
  → VideoAgent.process()
  → save result to db + in-memory
  → broadcast: { stage: "video_complete" }
  → SafetyAgent.process()
  → save safety report to db
  → broadcast: { stage: "safety_complete", data: { overall_risk, violation_count } }
  → ProductivityAgent.process()
  → save productivity report in-memory
  → broadcast: { stage: "productivity_complete", data: { congestion_trend, overlap_count } }
  → broadcast: { stage: "pipeline_complete" }
```

Each agent is wrapped in try/except — one failure doesn't block the rest.

---

## Files Changed

### 1. `app/routers/video.py` — Orchestration Chain

**What changed:** `_process_video` now auto-chains SafetyAgent and ProductivityAgent after video processing, with WebSocket broadcasts at every stage.

**New imports:**
- `SafetyAgent`, `ProductivityAgent`, `ws_manager`, `PRODUCTIVITY_REPORTS`, `datetime`

**New helper:**
```python
def _pipeline_msg(job_id, site_id, stage, data=None) -> dict:
    # Builds the standardized pipeline_update message
```

**Updated `_process_video`:**
- Saves video result to DB (was missing from background task)
- Broadcasts `video_complete`
- Runs `SafetyAgent().process()` → saves report → broadcasts `safety_complete`
- Runs `ProductivityAgent().process()` → stores in `PRODUCTIVITY_REPORTS` → broadcasts `productivity_complete`
- Broadcasts `pipeline_complete` at the end
- On video failure, broadcasts `error` and returns early
- Agent failures broadcast `error` but don't halt the pipeline

---

### 2. `app/routers/streaming.py` — Pipeline WebSocket Endpoint

**Added** `/ws/pipeline/{site_id}` WebSocket endpoint:

```python
@router.websocket("/ws/pipeline/{site_id}")
async def ws_pipeline(ws: WebSocket, site_id: str):
    await ws_manager.connect(f"pipeline:{site_id}", ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(f"pipeline:{site_id}", ws)
```

Same pattern as existing `ws/live/{feed_id}` and `ws/alerts` endpoints.

---

### 3. `app/agents/productivity_agent.py` — Full Implementation

**Replaced** the stub with real analysis logic. Same two-phase architecture as SafetyAgent.

#### Phase 1 — Deterministic Analysis (no LLM)

| Function | What It Does |
|---|---|
| `_score_congestion(zone)` | Worker density per 100 sqft + trade count → score 1-5 |
| `_congestion_to_status(score)` | Maps score to `ok` / `warning` / `critical` |
| `_build_zones(result)` | Iterates `VideoProcessingResult.zones`, builds `Zone` objects |
| `_detect_trade_overlaps(result)` | Flags zones with 2+ trades. Severity: `minor` / `moderate` / `severe` based on trade count + area |
| `_compute_trend(current, previous)` | Compares avg congestion against last report. Returns `improving` / `stable` / `worsening` |
| `_generate_suggestions(zones, overlaps, trend)` | Deterministic recommendations for critical zones and severe overlaps |

**Congestion scoring logic:**
```
density = workers / (area_sqft / 100)

Score 5: density >= 3.0 OR (3+ trades AND 8+ workers)
Score 4: density >= 2.0 OR (3+ trades AND 5+ workers)
Score 3: density >= 1.0 OR 2+ trades
Score 2: density >= 0.5 OR 3+ workers
Score 1: everything else
```

**Trade overlap severity:**
```
severe:   3+ trades AND area < 500 sqft
moderate: 3+ trades OR area < 500 sqft
minor:    everything else (2 trades, normal area)
```

#### Phase 2 — LLM Summary

Sends zone congestion + trade overlap JSON to LLM with a system prompt requesting a 2-paragraph field briefing. Falls back to auto-generated summary if LLM fails.

---

### 4. `gui/src/api/streaming.js` — Frontend Connector

**Added:**
```js
export const connectPipeline = (siteId) =>
  new WebSocket(wsUrl(`/api/streaming/ws/pipeline/${siteId}`))
```

---

## WebSocket Message Format

All pipeline broadcasts use this schema:

```json
{
  "type": "pipeline_update",
  "job_id": "vj_abc123",
  "site_id": "s1",
  "stage": "safety_complete",
  "timestamp": "2026-02-21T12:00:00+00:00",
  "data": {
    "overall_risk": "high",
    "violation_count": 7
  }
}
```

**Stages:**
| Stage | `data` payload |
|---|---|
| `video_complete` | `{}` |
| `safety_complete` | `{ overall_risk, violation_count }` |
| `productivity_complete` | `{ congestion_trend, overlap_count }` |
| `pipeline_complete` | `{}` |
| `error` | `{ error: "description" }` |

---

## Verification

1. **Upload a video** (or use mock data) → confirm safety + productivity agents auto-trigger in server logs
2. **Connect to WebSocket** `ws://localhost:8000/api/streaming/ws/pipeline/{site_id}` → confirm stage updates arrive in sequence
3. **Check reports:**
   - `GET /api/safety/report/{site_id}` → populated SafetyReport
   - `GET /api/productivity/report/{site_id}` → populated ProductivityReport with zones, overlaps, trend, suggestions

## Dependencies

No new packages. Uses existing:
- `app.ws.manager.ws_manager` (ConnectionManager)
- `app.services.llm_client` (Ollama/Claude)
- `app.services.db` (Supabase/in-memory)
- `app.services.storage.PRODUCTIVITY_REPORTS` (in-memory dict)
