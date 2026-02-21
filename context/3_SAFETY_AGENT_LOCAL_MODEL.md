# Update 3 — Safety Agent with Local LLM (Ollama)

> Shipped on `safety-agent` branch. Proves out the Safety Agent against a local Ollama model using hardcoded Video Agent output.

---

## What Changed

The Video Agent pipeline isn't built yet, so this update creates realistic mock data simulating its output, wires up a Safety Agent that sends that data + OSHA safety knowledge to a local LLM, and returns a structured safety report. The LLM provider is abstracted so it can be swapped to Claude with a single env var.

### Architecture

```
Hardcoded Video JSON ──> SafetyAgent.process() ──> LLMClient (Ollama) ──> SafetyReport
                              |                         |
                         OSHA system prompt        OpenAI-compatible API
                                                   (swap to Claude later)
```

---

### 1. Mock Video Agent Output

**File:** `app/data/mock_video_results.py` (new)

A `VideoProcessingResult` matching the existing schema, simulating what `VideoAgent` would produce after analyzing footage from site `s1` (Riverside Tower).

| Field | Content |
|-------|---------|
| `frames` | 3 frame references (08:15, 08:20, 08:25) from `cam1` |
| `zone_analyses` | 5 zones with detailed spatial observations — workers, equipment, PPE status, hazards |
| `entity_relationships` | 4 cross-zone relationships: trade proximity, crane/ground overlap, egress blockage, hot work near combustibles |
| `temporal_chain` | 3 chronological entries showing congestion building over 10 minutes |

**Hazard scenarios covered:**
- Missing hard hats near crane swing radius (repeat violation)
- Workers without harness tie-offs at 30 ft on scaffolding
- Blocked egress corridors from staged materials
- Extension cords through standing water
- Hot work (angle grinder) within 15 ft of combustibles, no fire watch
- Live electrical panel work without lockout/tagout
- Delivery truck blocking emergency vehicle access
- Worker standing under suspended crane load

The mock result is auto-seeded into `VIDEO_RESULTS` in `storage.py` so `/api/safety/analyze` works out of the box with:
```json
{"site_id": "s1", "video_job_id": "mock_vj_001"}
```

---

### 2. Swappable LLM Client

**File:** `app/services/llm_client.py` (new)

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

### 3. Safety Agent Implementation

**File:** `app/agents/safety_agent.py` (modified)

Replaced the stub with a full OSHA-grounded safety analysis pipeline.

**OSHA System Prompt** covers:
- PPE requirements (29 CFR 1926.100-106) — hard hats, hi-vis, glasses, harnesses
- Fall protection (29 CFR 1926.500-503) — guardrails, nets, PFAS above 6 ft
- Scaffolding safety (29 CFR 1926.450-454) — planking, access, load limits
- Electrical safety (29 CFR 1926.400-449) — lockout/tagout, clearances, wet conditions
- Struck-by hazards (29 CFR 1926.1400-1442) — crane radius, overhead loads, barricades
- Housekeeping & egress (29 CFR 1926.25, 1926.34) — clear paths, material staging
- Hot work (29 CFR 1926.352-354) — fire watch, combustible clearance
- Multi-trade coordination — barrier separation, scheduling offsets

**`process()` flow:**

1. `_build_user_prompt()` — formats zone analyses, entity relationships, and temporal chain into a structured text prompt
2. `llm.chat(system_prompt, user_prompt)` — sends to whichever LLM backend is configured
3. `_parse_llm_response()` — extracts JSON from the LLM response (handles markdown code fences), maps into `SafetyViolation` list with graceful fallback on parse errors
4. Returns a populated `SafetyReport` with violations, `ppe_compliance`, `zone_adherence`, `overall_risk`, and `summary`

---

### 4. Config & Dependencies

**`app/config.py`** — added three env vars:

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `"ollama"` | Which LLM backend to use (`ollama` or `claude`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `llama3.2` | Model to request from Ollama |

**`requirements.txt`** — added `httpx==0.28.1` for async HTTP calls to Ollama.

---

### 5. Ollama Docker Setup

**File:** `docker-compose.yml` (new, project root)

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
app/data/__init__.py             — NEW: empty package init
app/data/mock_video_results.py   — NEW: hardcoded VideoProcessingResult for s1
app/services/llm_client.py       — NEW: LLMClient ABC + Ollama/Claude implementations
app/agents/safety_agent.py       — MODIFIED: full OSHA-aware analysis with LLM
app/services/storage.py          — MODIFIED: seeds mock video result into VIDEO_RESULTS
app/config.py                    — MODIFIED: LLM_PROVIDER, OLLAMA_BASE_URL, OLLAMA_MODEL
requirements.txt                 — MODIFIED: added httpx
docker-compose.yml               — NEW: Ollama service
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

# 3. Start backend
python -m uvicorn app.main:app --reload

# 4. Run safety analysis
curl -X POST http://localhost:8000/api/safety/analyze \
  -H 'Content-Type: application/json' \
  -d '{"site_id":"s1","video_job_id":"mock_vj_001"}'
```

### Expected response

A `SafetyReport` JSON with:
- `violations` — list of `SafetyViolation` objects, each with zone, type (`ppe_missing`, `zone_breach`, `clearance_issue`, `blocked_corridor`), OSHA-referenced description, severity, and workers affected
- `ppe_compliance` — per-zone boolean dict
- `zone_adherence` — per-zone boolean dict
- `overall_risk` — `"high"` or `"critical"` given the mock data
- `summary` — executive summary with OSHA CFR references
- `generated_at` — UTC timestamp

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
