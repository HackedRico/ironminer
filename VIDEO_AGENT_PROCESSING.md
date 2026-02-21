# Video Agent Processing Pipeline — Implementation Plan

## Pipeline Architecture

```
Video File (mp4)
    |
    v
[Stage 1] Frame Extraction (decord/ffmpeg)
    |
    v
[Stage 2] Video Enhancement (Real-ESRGAN)
    |
    v
[Stage 3] Object Detection (YOLOv8 + SAM2)
    |
    |-- Worker bounding boxes + segmentation masks
    |-- Equipment bounding boxes + classifications
    |-- PPE sub-detections per worker
    |
    v
[Stage 4] Spatial Reasoning (Claude Vision VLM)
    |
    |-- Zone decomposition
    |-- Trade classification
    |-- Spatial relationships (proximity, elevation, edge detection)
    |-- Hazard identification
    |
    v
[Stage 5] Temporal Analysis (ByteTrack + cross-frame diffing)
    |
    |-- Object tracking (consistent worker IDs)
    |-- TemporalEvent generation
    |-- Congestion change detection
    |
    v
[Stage 6] Schema Assembly
    |
    v
VideoProcessingResult (final output)
    |
    +--> SafetyAgent (deterministic OSHA checks)
    +--> ProductivityAgent (congestion/trade overlap)
    +--> Supabase storage
```

---

## GPU Compute (Vast.ai RTX PRO 6000 S — 48GB VRAM)

| Model | VRAM (approx.) | Notes |
|-------|----------------|-------|
| Real-ESRGAN x2 | ~1.5 GB | Lightweight, fast |
| YOLOv8x (person) | ~1 GB | Batch inference |
| YOLOv8m (PPE) | ~0.5 GB | Per-crop inference |
| SAM2 Hiera Large | ~3 GB | On-demand segmentation |
| ByteTrack | ~0.2 GB | Lightweight tracker |
| **Total** | **~6.2 GB** | Leaves ~42GB headroom |

---

## Stage 1: Frame Extraction

**File:** `app/services/frame_extractor.py`

**Tech:** `decord` (GPU-accelerated video decoding), fallback to `opencv-python-headless`

**Behavior:**
- Accept file path + frame interval (default 5.0s, already parameterized in upload endpoint)
- Return list of `(timestamp_seconds, numpy_array)` tuples
- Quality filtering: skip frames below luminance threshold or with high blur (Laplacian variance)
- Save extracted frames as JPEG to job-specific subdirectory under `uploads/`

---

## Stage 2: Video Enhancement

**File:** `app/services/video_enhancer.py`

**Tech:** Real-ESRGAN (`RealESRGAN_x2plus` model)

**Why Real-ESRGAN:**
- Handles real-world degradation (compression artifacts, noise, blur) — ideal for construction site footage
- 2x upscale improves detection of small objects (PPE, signage) without excessive compute
- Battle-tested, runs efficiently on NVIDIA GPUs via PyTorch
- Frames are already non-consecutive (sampled at intervals), so per-frame enhancement is appropriate

**Behavior:**
- Load `RealESRGAN_x2plus` model, cache as singleton
- Process frames in batches on GPU
- Configurable enhancement level: `none`, `light` (denoise only), `full` (super-resolution)
- Optional — skippable via parameter on upload endpoint

---

## Stage 3: Object Detection

**File:** `app/services/object_detector.py`

**Tech:** YOLOv8/v11 (Ultralytics) + SAM2 (Meta)

**Two-tier approach:**

### Tier 1 — YOLO Detection

| Category | Classes | Notes |
|----------|---------|-------|
| Workers | person | Base COCO class, trade classified by VLM in Stage 4 |
| PPE | hard_hat, hi_vis_vest, safety_glasses, harness, gloves | Fine-tuned PPE model |
| Equipment | crane, forklift, scaffold, ladder, grinder, welder | Mix of COCO + custom |
| Hazards | fire/sparks, water_puddle, exposed_wiring | Custom classes or VLM fallback |

**PPE Detection Strategy:** Two-pass — detect all persons first, crop each person bounding box, run PPE-specific YOLO model on the crop.

### Tier 2 — SAM2 Segmentation (selective)

Used only when precise spatial geometry is needed:
- Worker near unprotected edge
- Worker under suspended load
- Worker on scaffold/ladder
- Feed YOLO bounding boxes as prompts to SAM2 for pixel-precise masks
- Use mask geometry to compute overlap, containment, proximity

---

## Stage 4: Spatial Reasoning (VLM)

**File:** `app/services/spatial_reasoner.py`

**Tech:** Claude Vision (via existing `LLMClient` abstraction)

**Why VLM for spatial reasoning (not pure CV):**
- Trade classification from appearance requires contextual understanding
- Elevation estimation from a single camera requires scene understanding
- "Near edge" detection requires understanding what constitutes an unprotected edge
- Hazard classification (hot work, electrical exposure) requires contextual interpretation

**Three-prompt chain:**

### Prompt 1 — Zone Decomposition + Detection Grounding
```
Given this construction site frame and the following CV detections:
{detections_json}

1. Divide the visible area into logical spatial zones based on activity,
   elevation, and physical boundaries.
2. Assign each detected worker to a zone. Classify their trade.
3. For each worker, assess: elevation (ft), proximity to edges,
   scaffold/ladder status, position relative to overhead loads.
4. Identify equipment and classify by type.
5. Identify hazards: hot work, electrical exposure, standing water, combustibles.

Return structured JSON matching: {zone_analysis_schema}
```

### Prompt 2 — Entity-Relationship Mapping
```
Based on the zone analysis, describe spatial relationships:
- Trade proximity: which trades are near each other, estimated separation (ft)
- Overhead work: any trade working above another
- Egress paths: are walkways/corridors blocked?
- Material stacking: any unstable or excessively tall stacks?

Return structured JSON matching: {trade_proximity_schema, egress_schema}
```

### Prompt 3 — Temporal Context (when prior frames exist)
```
Previous frame analysis: {prior_context_json}
Current frame analysis: {current_context_json}

Generate temporal events for: workers entering/exiting zones,
congestion changes, hazards appearing/resolving.

Return structured JSON matching: {temporal_event_schema}
```

**Zone consistency:** Define zones from the first frame and anchor subsequent frames to the same zone schema by passing the zone definition as context.

---

## Stage 5: Temporal Analysis

**File:** `app/services/temporal_analyzer.py`

**Tech:** ByteTrack (integrated with Ultralytics) + zone-level diffing

**Behavior:**
- Track detected persons across sequential frames with consistent `worker_id` values
- Compare zone worker counts between frames → `worker_entered` / `worker_exited` events
- Compare congestion levels → `congestion_change` events
- Compare hazard lists → `hazard_appeared` / `hazard_resolved` events
- Compute `worker_count_delta` for each event

---

## Stage 6: Schema Assembly & Orchestration

**File:** Rewrite `app/agents/video_agent.py`

The `VideoAgent.process()` method orchestrates all stages and assembles the final `VideoProcessingResult`:

```python
async def process(self, job_id, site_id, file_bytes, frame_interval=5.0):
    # 1. Extract frames
    raw_frames = await self.frame_extractor.extract(file_bytes, frame_interval)
    update_job(job_id, status="processing", total_frames=len(raw_frames))

    # 2. Enhance frames (GPU)
    enhanced = await self.enhancer.enhance_frames([f.image for f in raw_frames])

    # 3. Detect objects per frame (GPU, batched)
    detections = [await self.detector.detect_frame(f) for f in enhanced]

    # 4. Spatial reasoning via VLM
    zone_analyses = [await self.reasoner.analyze_frame(f, d) for f, d in zip(enhanced, detections)]
    merged_zones = self.reasoner.merge_zone_analyses(zone_analyses)
    trade_proximities = self.reasoner.compute_trade_proximities(merged_zones)

    # 5. Temporal analysis
    temporal_events = self.temporal.analyze_sequence(zone_analyses)

    # 6. Assemble VideoProcessingResult
    return VideoProcessingResult(...)
```

**Background execution:** FastAPI `BackgroundTasks` kicks off processing after upload. Job status polled via existing endpoints.

---

## Files to Create

| File | Purpose |
|------|---------|
| `app/services/frame_extractor.py` | Video decoding + frame extraction + quality filtering |
| `app/services/video_enhancer.py` | Real-ESRGAN super-resolution wrapper |
| `app/services/object_detector.py` | YOLO + SAM2 detection pipeline |
| `app/services/spatial_reasoner.py` | VLM-based spatial reasoning (Claude Vision prompts) |
| `app/services/temporal_analyzer.py` | Cross-frame tracking + temporal event generation |
| `app/services/gpu_client.py` | Local / Vast.ai GPU inference abstraction |

## Files to Modify

| File | Changes |
|------|---------|
| `app/agents/video_agent.py` | Replace stub with full pipeline orchestration |
| `app/routers/video.py` | Add `BackgroundTasks` to kick off processing on upload |
| `app/config.py` | Add config for model paths, enhancement settings, detection thresholds |
| `requirements.txt` | Add `torch`, `torchvision`, `ultralytics`, `realesrgan`, `decord`, `opencv-python-headless`, `numpy`, `Pillow` |

---

## Implementation Phases

### Phase 1 — Frame Extraction + Background Task Wiring
- Implement `frame_extractor.py` with decord/opencv
- Wire `BackgroundTasks` in video upload router
- Test: upload `dataset/14_production_mp.mp4`, verify frames extracted and job status updates

### Phase 2 — Video Enhancement
- Implement `video_enhancer.py` with Real-ESRGAN
- Integrate into `VideoAgent.process()` after frame extraction
- Test: compare enhanced vs. raw frame quality

### Phase 3 — Object Detection
- Implement `object_detector.py` with YOLOv8 for person + equipment
- Add PPE sub-detection (cropped person regions through PPE model)
- Add SAM2 for selective precise segmentation
- Test: verify bounding boxes and classifications on construction frames

### Phase 4 — Spatial Reasoning
- Implement `spatial_reasoner.py` with Claude Vision prompt chains
- Design prompts that accept CV detections as structured context
- Implement zone merging across frames
- Test: verify output matches `ZoneAnalysis` schema

### Phase 5 — Temporal Analysis
- Implement `temporal_analyzer.py` with ByteTrack
- Implement zone-level diffing for temporal events
- Test: verify `TemporalEvent` generation from multi-frame sequences

### Phase 6 — End-to-End Integration
- Full `VideoAgent.process()` orchestration
- Connect to `SafetyAgent` and `ProductivityAgent` downstream
- End-to-end test: upload video → poll job → retrieve `VideoProcessingResult` → run safety analysis

---

## Challenges & Mitigations

| Challenge | Mitigation |
|-----------|------------|
| PPE model availability | Two-tier: YOLO fast pass + Claude Vision fallback for items YOLO misses |
| VLM rate limits | Batch frames, cache per-frame results, use CV as primary with VLM for enrichment |
| Zone inconsistency across frames | Define zones from first frame, pass zone schema as context to subsequent prompts |
| Processing time per video | Job queue with progress polling; add stage-level progress to `VideoJob` |
| Vast.ai integration | `gpu_client.py` abstracts local vs. remote; swap modes via config |
