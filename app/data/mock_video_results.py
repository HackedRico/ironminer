"""Hardcoded Video Agent output for PoC testing.

Simulates what VideoAgent.process() would return after analyzing
construction footage from site s1 (Riverside Tower).

Same hazard scenarios as the original free-text version, now expressed
as structured classifiers for deterministic Safety Agent ingestion.
"""
from __future__ import annotations

from app.models.video import (
    EquipmentDetection,
    EgressStatus,
    FrameData,
    HazardDetection,
    MaterialStack,
    PPEDetection,
    TemporalEvent,
    TradeProximity,
    VideoProcessingResult,
    WorkerDetection,
    ZoneAnalysis,
)

MOCK_VIDEO_RESULT = VideoProcessingResult(
    job_id="mock_vj_001",
    site_id="s1",
    frames=[
        FrameData(
            id="frame_001",
            site_id="s1",
            timestamp=1700000000.0,
            image_data="",
            filename="riverside_cam1_08h15.jpg",
        ),
        FrameData(
            id="frame_002",
            site_id="s1",
            timestamp=1700000300.0,
            image_data="",
            filename="riverside_cam1_08h20.jpg",
        ),
        FrameData(
            id="frame_003",
            site_id="s1",
            timestamp=1700000600.0,
            image_data="",
            filename="riverside_cam1_08h25.jpg",
        ),
    ],
    # ── Zone A — Ground Level West ──────────────────────────────────────────
    # 4 workers pouring concrete footings. 1 missing safety glasses (vibrator),
    # 2 missing hi-vis near roadway edge. Otherwise compliant.
    zones=[
        ZoneAnalysis(
            zone_id="zone_a",
            zone_name="Zone A — Ground Level West",
            trades_present=["concrete"],
            area_sqft=1200.0,
            workers=[
                WorkerDetection(
                    worker_id="w_a1",
                    trade="concrete",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, safety_glasses=True, gloves=True),
                ),
                WorkerDetection(
                    worker_id="w_a2",
                    trade="concrete",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, safety_glasses=True, gloves=True),
                ),
                WorkerDetection(
                    worker_id="w_a3",
                    trade="concrete",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=False, safety_glasses=False, gloves=True),
                    # operating vibrator without safety glasses, near roadway without hi-vis
                ),
                WorkerDetection(
                    worker_id="w_a4",
                    trade="concrete",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=False, safety_glasses=True, gloves=True),
                    # near roadway without hi-vis
                ),
            ],
            equipment=[],
            hazards=[],
            egress=[],
            material_stacks=[],
        ),
        # ── Zone B — Level 3 East Scaffolding ───────────────────────────────
        # 9 workers, 3 trades in 400 sqft. 2 electricians at scaffold edge (30 ft)
        # without harness tie-off. 1 plumber under unsecured plank. 3 missing hard
        # hats. Powder-actuated tool near plumbing. Extension cords in standing water.
        # Corridors blocked by staged conduit.
        ZoneAnalysis(
            zone_id="zone_b",
            zone_name="Zone B — Level 3 East Scaffolding",
            trades_present=["electrical", "plumbing", "framing"],
            area_sqft=400.0,
            workers=[
                # Electricians — 2 at scaffold edge without harness tie-off, missing hard hats
                WorkerDetection(
                    worker_id="w_b1",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=False, fall_harness=True, harness_tied_off=False),
                    elevation_ft=30.0,
                    on_scaffold=True,
                    near_edge=True,
                ),
                WorkerDetection(
                    worker_id="w_b2",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=False, fall_harness=True, harness_tied_off=False),
                    elevation_ft=30.0,
                    on_scaffold=True,
                    near_edge=True,
                ),
                WorkerDetection(
                    worker_id="w_b3",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                # Plumbers — 1 crouching under unsecured scaffold plank, missing hard hat
                WorkerDetection(
                    worker_id="w_b4",
                    trade="plumbing",
                    ppe=PPEDetection(hard_hat=False),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                WorkerDetection(
                    worker_id="w_b5",
                    trade="plumbing",
                    ppe=PPEDetection(hard_hat=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                WorkerDetection(
                    worker_id="w_b6",
                    trade="plumbing",
                    ppe=PPEDetection(hard_hat=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                # Framing crew — using powder-actuated tool
                WorkerDetection(
                    worker_id="w_b7",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=True, hearing_protection=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                WorkerDetection(
                    worker_id="w_b8",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
                WorkerDetection(
                    worker_id="w_b9",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True),
                    elevation_ft=30.0,
                    on_scaffold=True,
                ),
            ],
            equipment=[
                EquipmentDetection(
                    equipment_id="eq_b1",
                    type="powder_tool",
                    active=True,
                ),
            ],
            hazards=[
                HazardDetection(
                    hazard_id="hz_b1",
                    type="standing_water",
                    zone_id="zone_b",
                    description="Extension cords running through standing water near east wall",
                ),
            ],
            egress=[
                EgressStatus(
                    path_id="eg_b1",
                    zone_id="zone_b",
                    blocked=True,
                    blocking_material="staged conduit bundles and pipe sections",
                ),
            ],
            material_stacks=[],
        ),
        # ── Zone C — North Exterior ─────────────────────────────────────────
        # 6 workers in crane zone. 2 in crane swing radius without hard hats.
        # 1 worker under suspended load. Signal person behind obstruction.
        # Framing crew has adequate fall protection.
        ZoneAnalysis(
            zone_id="zone_c",
            zone_name="Zone C — North Exterior",
            trades_present=["framing", "crane_ops"],
            area_sqft=2000.0,
            workers=[
                # Workers in crane swing radius, no hard hats
                WorkerDetection(
                    worker_id="w_c1",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=False),
                    in_crane_swing_radius=True,
                ),
                WorkerDetection(
                    worker_id="w_c2",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=False),
                    in_crane_swing_radius=True,
                ),
                # Worker directly under suspended load
                WorkerDetection(
                    worker_id="w_c3",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True, fall_harness=True, harness_tied_off=True),
                    under_suspended_load=True,
                ),
                # Framing crew with proper fall protection on north face
                WorkerDetection(
                    worker_id="w_c4",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True, fall_harness=True, harness_tied_off=True),
                    elevation_ft=20.0,
                    near_edge=False,
                ),
                WorkerDetection(
                    worker_id="w_c5",
                    trade="framing",
                    ppe=PPEDetection(hard_hat=True, fall_harness=True, harness_tied_off=True),
                    elevation_ft=20.0,
                    near_edge=False,
                ),
                # Crane signal person
                WorkerDetection(
                    worker_id="w_c6",
                    trade="crane_ops",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
                ),
            ],
            equipment=[
                EquipmentDetection(
                    equipment_id="eq_c1",
                    type="crane",
                    active=True,
                    load_suspended=True,
                    signal_person_visible=True,
                    signal_person_line_of_sight=False,  # behind obstruction
                ),
            ],
            hazards=[],
            egress=[],
            material_stacks=[],
        ),
        # ── Zone D — South Parking / Staging ────────────────────────────────
        # 2 workers with proper PPE. Lumber stacks > 6 ft without cross-bracing.
        # Delivery truck blocking emergency access. Egress partially blocked by rebar.
        ZoneAnalysis(
            zone_id="zone_d",
            zone_name="Zone D — South Parking / Staging",
            trades_present=["delivery"],
            area_sqft=3000.0,
            workers=[
                WorkerDetection(
                    worker_id="w_d1",
                    trade="delivery",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, safety_glasses=True, gloves=True),
                ),
                WorkerDetection(
                    worker_id="w_d2",
                    trade="delivery",
                    ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, safety_glasses=True, gloves=True),
                ),
            ],
            equipment=[],
            hazards=[],
            egress=[
                EgressStatus(
                    path_id="eg_d1",
                    zone_id="zone_d",
                    blocked=True,
                    blocking_material="delivery truck",
                    emergency_access=True,  # emergency vehicle lane blocked
                ),
                EgressStatus(
                    path_id="eg_d2",
                    zone_id="zone_d",
                    blocked=True,
                    blocking_material="rebar bundles",
                    emergency_access=False,
                ),
            ],
            material_stacks=[
                MaterialStack(
                    zone_id="zone_d",
                    material_type="lumber",
                    height_ft=8.0,
                    cross_braced=False,
                ),
            ],
        ),
        # ── Zone E — Level 2 Interior ───────────────────────────────────────
        # 5 workers — HVAC + electrical. Angle grinder hot work without fire watch.
        # Sparks near stacked insulation. Electrical work on live panel without LOTO.
        # 1 worker on ladder without 3-point contact. 2 missing safety glasses.
        ZoneAnalysis(
            zone_id="zone_e",
            zone_name="Zone E — Level 2 Interior",
            trades_present=["hvac", "electrical"],
            area_sqft=600.0,
            workers=[
                # HVAC — cutting ductwork, no safety glasses
                WorkerDetection(
                    worker_id="w_e1",
                    trade="hvac",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=False),
                ),
                WorkerDetection(
                    worker_id="w_e2",
                    trade="hvac",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=False),
                ),
                # Electrical — working on live panel
                WorkerDetection(
                    worker_id="w_e3",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=True),
                ),
                WorkerDetection(
                    worker_id="w_e4",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=True),
                ),
                # Worker on ladder without 3-point contact
                WorkerDetection(
                    worker_id="w_e5",
                    trade="electrical",
                    ppe=PPEDetection(hard_hat=True, safety_glasses=True),
                    on_ladder=True,
                    elevation_ft=6.0,
                    three_point_contact=False,
                ),
            ],
            equipment=[
                EquipmentDetection(
                    equipment_id="eq_e1",
                    type="grinder",
                    active=True,
                ),
            ],
            hazards=[
                HazardDetection(
                    hazard_id="hz_e1",
                    type="hot_work",
                    zone_id="zone_e",
                    description="Angle grinder cutting ductwork, sparks landing near stacked insulation",
                    fire_watch_present=False,
                ),
                HazardDetection(
                    hazard_id="hz_e2",
                    type="electrical_exposure",
                    zone_id="zone_e",
                    description="Work on live electrical panel without lockout/tagout signage",
                    loto_signage_visible=False,
                ),
            ],
            egress=[],
            material_stacks=[],
        ),
    ],
    # ── Trade proximities ────────────────────────────────────────────────────
    trade_proximities=[
        TradeProximity(
            zone_id="zone_b",
            trade_a="electrical",
            trade_b="plumbing",
            separation_ft=3.0,
            overhead_work_above_crew=True,
            description=(
                "Electrical pulling wire overhead while plumbing routes drain pipe below. "
                "Risk of dropped tools/materials onto plumbing crew."
            ),
        ),
        TradeProximity(
            zone_id="zone_b",
            trade_a="framing",
            trade_b="plumbing",
            separation_ft=5.0,
            overhead_work_above_crew=False,
            description="Framing crew using powder-actuated tool near plumbing crew without barrier separation.",
        ),
    ],
    # ── Temporal events ──────────────────────────────────────────────────────
    temporal_events=[
        TemporalEvent(
            timestamp=1700000000.0,
            zone_id="zone_b",
            event_type="congestion_change",
            detail="Moderate congestion with 6 workers (electrical and plumbing only). Corridors partially passable.",
            worker_count_delta=0,
        ),
        TemporalEvent(
            timestamp=1700000300.0,
            zone_id="zone_b",
            event_type="worker_entered",
            detail="Framing crew (3 workers) entered Zone B, increasing density to 9 workers. Corridors now blocked.",
            worker_count_delta=3,
        ),
        TemporalEvent(
            timestamp=1700000300.0,
            zone_id="zone_c",
            event_type="hazard_appeared",
            detail="Crane began operations. 2 workers moved into crane swing radius without PPE.",
            worker_count_delta=0,
        ),
        TemporalEvent(
            timestamp=1700000600.0,
            zone_id="zone_e",
            event_type="hazard_appeared",
            detail="Hot work began in Zone E without fire watch setup.",
            worker_count_delta=0,
        ),
        TemporalEvent(
            timestamp=1700000600.0,
            zone_id="zone_d",
            event_type="hazard_appeared",
            detail="Delivery truck arrived, blocking emergency access lane.",
            worker_count_delta=0,
        ),
    ],
    metadata={
        "camera_sources": ["cam1", "cam3", "cam4"],
        "analysis_model": "mock_data",
        "confidence_avg": 0.87,
    },
)
