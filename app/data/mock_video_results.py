"""Hardcoded Video Agent output for PoC testing.

Simulates what VideoAgent.process() would return after analyzing
construction footage from site s1 (Riverside Tower).
"""
from __future__ import annotations

from app.models.video import FrameData, VideoProcessingResult

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
    zone_analyses={
        "Zone A — Ground Level West": (
            "4 workers observed pouring concrete footings. All wearing hard hats "
            "and steel-toe boots. 1 worker operating a vibrator without safety "
            "glasses. No hi-vis vests detected on 2 workers near the roadway edge. "
            "Adequate spacing between workers. No overhead hazards in this area."
        ),
        "Zone B — Level 3 East Scaffolding": (
            "9 workers from 3 trades (electrical, plumbing, framing) crowded into "
            "a 400 sq ft scaffolding area. Movement corridors are blocked by staged "
            "conduit bundles and pipe sections on the walkway. 2 electricians working "
            "at the scaffold edge (approx 30 ft height) without visible harness "
            "tie-offs. 1 plumber crouching under an unsecured scaffold plank. "
            "3 workers missing hard hats. Framing crew using a powder-actuated tool "
            "near plumbing crew without barrier separation. Extension cords running "
            "through standing water near the east wall."
        ),
        "Zone C — North Exterior": (
            "6 workers in the crane operation zone. Tower crane actively swinging "
            "loads overhead. 2 workers in the northeast corner within the crane's "
            "swing radius without hard hats — repeat violation from yesterday. "
            "1 worker standing directly under a suspended load while guiding steel "
            "beams. Framing crew has adequate fall protection on the north face. "
            "Crane signal person present but positioned behind an obstruction with "
            "limited line of sight to the operator."
        ),
        "Zone D — South Parking / Staging": (
            "2 workers managing material deliveries. Lumber stacks exceed 6 ft "
            "height without cross-bracing. Delivery truck parked across the "
            "designated emergency vehicle access lane. Workers wearing proper PPE. "
            "Egress path from the main building to the staging area is partially "
            "blocked by rebar bundles."
        ),
        "Zone E — Level 2 Interior": (
            "5 workers — HVAC and electrical trades working in close proximity. "
            "HVAC crew cutting ductwork with an angle grinder; no fire watch posted. "
            "Sparks observed landing near stacked insulation material. Electrical "
            "crew working on a live panel without lockout/tagout signage. "
            "1 worker on a 6 ft stepladder without 3-point contact. All workers "
            "wearing hard hats but 2 missing safety glasses during cutting operations."
        ),
    },
    entity_relationships={
        "electrical_plumbing_proximity": (
            "Electrical and plumbing crews in Zone B are within 3 ft of each other. "
            "Electrical is pulling wire overhead while plumbing routes drain pipe "
            "below. Risk of dropped tools/materials onto plumbing crew."
        ),
        "crane_ground_workers": (
            "Crane swing radius overlaps with 2 ground workers in Zone C northeast. "
            "No exclusion barricade in place. Workers appear unaware of overhead load."
        ),
        "egress_blockage": (
            "Staged conduit in Zone B and rebar bundles in Zone D partially block "
            "the primary egress route from levels 2-3 to the south parking area. "
            "Secondary egress via north stairwell is clear."
        ),
        "hot_work_combustibles": (
            "Angle grinder operation in Zone E is within 15 ft of stacked insulation. "
            "No fire blanket or fire watch personnel observed. OSHA requires 35 ft "
            "clearance or fire watch for hot work near combustibles."
        ),
    },
    temporal_chain=[
        (
            "08:15 — Moderate congestion in Zone B with 6 workers (electrical and "
            "plumbing only). Corridors partially passable. Zone C crane not yet "
            "operational."
        ),
        (
            "08:20 — Framing crew (3 workers) entered Zone B, increasing density to "
            "9 workers. Corridors now blocked. Crane began operations in Zone C. "
            "2 workers moved into crane swing radius without PPE."
        ),
        (
            "08:25 — Zone B congestion unchanged, staged materials accumulating. "
            "Hot work began in Zone E without fire watch setup. Delivery truck "
            "arrived in Zone D, blocking emergency access lane."
        ),
    ],
    metadata={
        "camera_sources": ["cam1", "cam3", "cam4"],
        "analysis_model": "mock_data",
        "confidence_avg": 0.87,
    },
)
