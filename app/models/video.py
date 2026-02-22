from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class FrameData(BaseModel):
    id: str
    site_id: str
    timestamp: float
    image_data: str  # base64 or URL
    filename: str


class VideoJob(BaseModel):
    job_id: str
    status: str  # queued | processing | completed | failed
    site_id: str
    filename: Optional[str] = None
    uploaded_by: Optional[str] = None
    file_path: Optional[str] = None
    total_frames: Optional[int] = None
    processed_frames: int = 0
    frames: list[FrameData] = []
    created_at: datetime
    error: Optional[str] = None


# ── Structured classifiers (Video Agent CV output) ──────────────────────────


class PPEDetection(BaseModel):
    hard_hat: bool = False
    hi_vis_vest: bool = False
    safety_glasses: bool = False
    fall_harness: bool = False
    harness_tied_off: bool = False
    gloves: bool = False
    hearing_protection: bool = False


class WorkerDetection(BaseModel):
    worker_id: str
    trade: str  # electrical, plumbing, framing, etc.
    ppe: PPEDetection = PPEDetection()
    elevation_ft: float = 0.0
    on_scaffold: bool = False
    on_ladder: bool = False
    three_point_contact: Optional[bool] = None  # None if not on ladder
    near_edge: bool = False  # within 6 ft of unprotected edge
    under_suspended_load: bool = False
    in_crane_swing_radius: bool = False


class EquipmentDetection(BaseModel):
    equipment_id: str
    type: str  # crane, forklift, scaffold, ladder, grinder, welder, powder_tool
    active: bool = False
    load_suspended: bool = False  # crane-specific
    signal_person_visible: bool = False
    signal_person_line_of_sight: bool = False


class HazardDetection(BaseModel):
    hazard_id: str
    type: str  # hot_work, electrical_exposure, standing_water, combustibles_nearby
    zone_id: str
    description: str
    fire_watch_present: bool = False
    loto_signage_visible: bool = False


class EgressStatus(BaseModel):
    path_id: str
    zone_id: str
    blocked: bool = False
    blocking_material: Optional[str] = None
    emergency_access: bool = True  # is this an emergency vehicle lane


class MaterialStack(BaseModel):
    zone_id: str
    material_type: str
    height_ft: float
    cross_braced: bool = False


class ZoneAnalysis(BaseModel):
    zone_id: str
    zone_name: str
    workers: list[WorkerDetection] = []
    equipment: list[EquipmentDetection] = []
    hazards: list[HazardDetection] = []
    egress: list[EgressStatus] = []
    material_stacks: list[MaterialStack] = []
    trades_present: list[str] = []
    area_sqft: Optional[float] = None


class TradeProximity(BaseModel):
    zone_id: str
    trade_a: str
    trade_b: str
    separation_ft: float
    overhead_work_above_crew: bool = False
    description: str


class TemporalEvent(BaseModel):
    timestamp: float
    zone_id: str
    event_type: str  # worker_entered, worker_exited, congestion_change, hazard_appeared, hazard_resolved
    detail: str
    worker_count_delta: int = 0


class VideoProcessingResult(BaseModel):
    job_id: str
    site_id: str
    frames: list[FrameData] = []
    zones: list[ZoneAnalysis] = []
    trade_proximities: list[TradeProximity] = []
    temporal_events: list[TemporalEvent] = []
    metadata: dict[str, Any] = {}

    # Local summary (e.g. from summary.txt) — used by safety/productivity agents when Twelve Labs is rate-limited
    summary_text: Optional[str] = None

    # Deprecated — kept for backward compatibility during transition
    zone_analyses: Optional[dict[str, str]] = None
    entity_relationships: Optional[dict[str, str]] = None
    temporal_chain: Optional[list[str]] = None


class FrameAnalyzeRequest(BaseModel):
    frame_id: str
    image_data: str
