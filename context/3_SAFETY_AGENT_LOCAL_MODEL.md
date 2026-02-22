# Update 3 — Safety Agent with Local LLM (Ollama)

> Shipped on `safety-agent` branch. Proves out the Safety Agent against a local Ollama model using hardcoded Video Agent output.

---

## What Changed

The Video Agent pipeline isn't built yet, so this update creates realistic mock data simulating its output, wires up a Safety Agent that runs deterministic OSHA rule checks on structured classifiers and uses a local LLM only for the executive summary, and returns a structured safety report. The LLM provider is abstracted so it can be swapped to Claude with a single env var.

### Architecture

```
Hardcoded Video JSON (structured classifiers)
    ↓
SafetyAgent.process()
    ├── Phase 1: Deterministic OSHA rule checks (no LLM)
    │     └── PPE bools, elevation, equipment flags → SafetyViolation list
    └── Phase 2: LLM (Ollama) — executive summary & recommendations only
          └── Receives computed violations + temporal events → narrative text
```

The LLM does NOT decide what is or isn't a violation — it only narrates and prioritizes the deterministic findings.

---

### 1. Structured Video Agent Classifier Models

**File:** `app/models/video.py` (modified)

The Video Agent outputs typed Pydantic models instead of free-text strings. These represent what a CV pipeline would extract from footage:

| Model | Purpose |
|-------|---------|
| `PPEDetection` | Per-worker booleans: hard_hat, hi_vis_vest, safety_glasses, fall_harness, harness_tied_off, gloves, hearing_protection |
| `WorkerDetection` | Worker ID, trade, PPE, elevation, scaffold/ladder/edge flags, crane radius, suspended load |
| `EquipmentDetection` | Equipment ID, type (crane/forklift/grinder/etc.), active state, crane-specific flags |
| `HazardDetection` | Hazard ID, type (hot_work/electrical_exposure/standing_water), fire watch and LOTO flags |
| `EgressStatus` | Path ID, blocked state, blocking material, emergency access flag |
| `MaterialStack` | Zone, material type, height, cross-bracing flag |
| `ZoneAnalysis` | Aggregates workers, equipment, hazards, egress, material stacks, trades present, area sqft |
| `TradeProximity` | Cross-trade separation distances and overhead work flags |
| `TemporalEvent` | Timestamped events: worker movement, congestion changes, hazard appearances |

**`VideoProcessingResult`** updated fields:
- `zones: list[ZoneAnalysis]` — structured zone data
- `trade_proximities: list[TradeProximity]` — cross-zone trade interactions
- `temporal_events: list[TemporalEvent]` — chronological observations

Old fields (`zone_analyses`, `entity_relationships`, `temporal_chain`) kept as `Optional` deprecated aliases for backward compatibility.

---

### 2. Mock Video Agent Output

**File:** `app/data/mock_video_results.py` (rewritten)

A `VideoProcessingResult` using the new structured classifiers, simulating what `VideoAgent` would produce after analyzing footage from site `s1` (Riverside Tower).

| Field | Content |
|-------|---------|
| `frames` | 3 frame references (08:15, 08:20, 08:25) from `cam1` |
| `zones` | 5 zones with typed worker/equipment/hazard detections |
| `trade_proximities` | 2 cross-trade interactions in Zone B |
| `temporal_events` | 5 chronological events showing congestion building over 10 minutes |

**Hazard scenarios covered (now as structured booleans):**
- Missing hard hats near crane swing radius (`in_crane_swing_radius=True`, `hard_hat=False`)
- Workers without harness tie-offs at 30 ft (`elevation_ft=30.0`, `harness_tied_off=False`)
- Blocked egress corridors (`blocked=True`, `blocking_material="staged conduit..."`)
- Extension cords through standing water (`type="standing_water"`)
- Hot work without fire watch (`type="hot_work"`, `fire_watch_present=False`)
- Live electrical panel without LOTO (`type="electrical_exposure"`, `loto_signage_visible=False`)
- Delivery truck blocking emergency access (`emergency_access=True`, `blocked=True`)
- Worker under suspended crane load (`under_suspended_load=True`)
- Ladder without 3-point contact (`on_ladder=True`, `three_point_contact=False`)
- Multi-trade congestion: 3 trades in 400 sqft (`trades_present` len 3, `area_sqft=400`)
- Overhead work above crew with < 10 ft separation (`overhead_work_above_crew=True`, `separation_ft=3.0`)

The mock result is auto-seeded into `VIDEO_RESULTS` in `storage.py` so `/api/safety/analyze` works out of the box with:
```json
{"site_id": "s1", "video_job_id": "mock_vj_001"}
```

---

### 3. Swappable LLM Client

**File:** `app/services/llm_client.py` (unchanged from prior update)

Abstracts LLM calls behind a simple interface so the backend can switch between providers without touching agent code.

```
LLMClient (ABC)
  ├── OllamaClient  — POST to Ollama's OpenAI-compatible endpoint
  └── ClaudeClient   — wraps existing call_claude() from claude_client.py
```

| Class | Endpoint | Notes |
|-------|----------|-------|
| `OllamaClient` | `POST {OLLAMA_BASE_URL}/v1/chat/completions` | Uses `httpx`, 120s timeout, temp 0.3 |
| `ClaudeClient` | Anthropic Messages API via existing wrapper | System + user combined into single message |

**Factory:** `get_llm_client()` reads `LLM_PROVIDER` env var:
- `"ollama"` (default) → `OllamaClient`
- `"claude"` → `ClaudeClient`

---

### 4. Safety Agent — Deterministic Rules + LLM Summary

**File:** `app/agents/safety_agent.py` (rewritten)

Split into two phases: deterministic OSHA rule checks that produce stable, repeatable violations, and an LLM call that only writes the narrative summary.

**Phase 1 — Deterministic OSHA rule checks (no LLM):**

`run_deterministic_checks()` iterates zones and applies rules directly on classifier booleans:

| Rule | Trigger | Violation Type | Severity |
|------|---------|---------------|----------|
| Hard hat missing | `hard_hat == False` | `ppe_missing` | medium (high if in crane radius) |
| Fall protection | `elevation_ft > 6` and `fall_harness == False` | `zone_breach` | high |
| Near edge unprotected | `near_edge == True` and `fall_harness == False` | `zone_breach` | high |
| Harness not tied off | `elevation_ft > 6` and `harness_tied_off == False` | `zone_breach` | high |
| Under suspended load | `under_suspended_load == True` | `clearance_issue` | high |
| Ladder 3-point contact | `on_ladder == True` and `three_point_contact == False` | `zone_breach` | medium |
| Crane signal LOS | crane with `signal_person_line_of_sight == False` | `clearance_issue` | high |
| Hot work no fire watch | `type == "hot_work"` and `fire_watch_present == False` | `clearance_issue` | high |
| Electrical no LOTO | `type == "electrical_exposure"` and `loto_signage_visible == False` | `clearance_issue` | high |
| Blocked egress | `blocked == True` | `blocked_corridor` | high (emergency) / medium |
| Unstable material stack | `height_ft > 6` and `cross_braced == False` | `clearance_issue` | medium |
| Multi-trade congestion | `trades_present > 2` and `area_sqft < 500` | `zone_breach` | high |
| Overhead work proximity | `overhead_work_above_crew == True` and `separation_ft < 10` | `clearance_issue` | high |

Overall risk computed deterministically:
- Any high with workers_affected >= 3 or 5+ total violations → `critical`
- Any high → `high`
- Only medium → `medium`
- Only low or none → `low`

PPE compliance and zone adherence dicts computed directly from violation zones.

**Phase 2 — LLM for summary only:**

The system prompt is slimmed down to: "You are a construction safety report writer. Given detected violations with OSHA references, write an executive summary. Prioritize by severity and workers affected. Include actionable recommendations."

The LLM receives the already-computed violations list + temporal events as JSON. It writes narrative, not rules. If the LLM fails, violations are still valid — a fallback auto-generated summary is used.

**Mock data produces 25 violations deterministically** — same input always yields the same output with no LLM randomness in the violation detection.

---

### 5. Config & Dependencies

**`app/config.py`** — three env vars:

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `"ollama"` | Which LLM backend to use (`ollama` or `claude`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `llama3.2` | Model to request from Ollama |

**`requirements.txt`** — added `httpx==0.28.1` for async HTTP calls to Ollama.

---

### 6. Ollama Docker Setup

**File:** `docker-compose.yml` (project root)

```yaml
services:
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
volumes:
  ollama_data:
```

Persistent volume keeps downloaded models across container restarts.

---

## Files Touched

```
app/models/video.py              — MODIFIED: added 9 structured classifier models, updated VideoProcessingResult
app/data/mock_video_results.py   — REWRITTEN: same scenarios, structured classifiers instead of prose
app/agents/safety_agent.py       — REWRITTEN: deterministic OSHA rules (Phase 1) + LLM summary only (Phase 2)
app/services/llm_client.py       — UNCHANGED: LLMClient ABC + Ollama/Claude implementations
app/services/storage.py          — UNCHANGED: seeds mock video result into VIDEO_RESULTS
app/config.py                    — UNCHANGED: LLM_PROVIDER, OLLAMA_BASE_URL, OLLAMA_MODEL
app/routers/video.py             — UNCHANGED: Pydantic schema update flows through automatically
app/routers/safety.py            — UNCHANGED: calls SafetyAgent.process() as before
app/models/analysis.py           — UNCHANGED: SafetyViolation/SafetyReport stay the same
requirements.txt                 — UNCHANGED: httpx already present
docker-compose.yml               — UNCHANGED: Ollama service
```

---

## How to Test

### Quick start

```bash
# 1. Install new dependency
pip install httpx==0.28.1

# 2. Start Ollama
docker compose up -d
docker exec -it $(docker ps -q -f ancestor=ollama/ollama) ollama pull llama3.2

# 3. Start backend (wait for startup complete)
python -m uvicorn app.main:app --reload

# Wait for: "INFO: Application startup complete."
# This takes 3-5 seconds for FastAPI to initialize

# 4. Run safety analysis
curl -X POST http://localhost:8000/api/safety/analyze \
  -H 'Content-Type: application/json' \
  -d '{"site_id":"s1","video_job_id":"mock_vj_001"}'
```

**Note:** If running backend + frontend together, you may see initial `ECONNREFUSED` errors in the Vite logs. These are harmless - the frontend auto-retries and succeeds once FastAPI finishes startup (~3-5 seconds).

### Expected response

A `SafetyReport` JSON with:
- `violations` — 25 deterministic violations (same every run), each with zone, type, OSHA-referenced description, severity, and workers affected
- `ppe_compliance` — per-zone boolean dict (Zone A and D compliant, B and C non-compliant)
- `zone_adherence` — per-zone boolean dict (only Zone A fully adherent)
- `overall_risk` — `"critical"` (18 high-severity violations, 25 total)
- `summary` — LLM-written executive summary (this part varies, but violations are stable)
- `generated_at` — UTC timestamp

### Verification: deterministic output

```bash
# Run twice — violations list should be identical both times
# Only the summary text and generated_at timestamp will differ
```

### Verification: structured video result

```bash
# GET the new structured format with typed zones, workers, equipment
curl http://localhost:8000/api/video/jobs/mock_vj_001/result

# Check /docs — OpenAPI schema shows the new nested models
```

### Switching to Claude

```bash
# In .env:
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...

# Restart the server, re-run the same curl command
```

### Retrieving the report later

```bash
# Get the latest report for a site
curl http://localhost:8000/api/safety/report/s1

# Get only high-severity violations
curl http://localhost:8000/api/safety/report/s1/violations?severity=high
```
