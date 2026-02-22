"""In-memory storage for hackathon. Replace with a real DB later if needed."""
from __future__ import annotations
from datetime import datetime, timezone

from app.models.site import Site, Zone, ZoneStatus
from app.models.alert import Alert, AlertSeverity
from app.models.video import VideoJob, FrameData, VideoProcessingResult
from app.models.analysis import SafetyReport, ProductivityReport, TradeOverlap
from app.models.streaming import FeedConfig

now = datetime.now(timezone.utc)

# ── Seed data (ported from manager.jsx) ──────────────────────────────────────

SITES: dict[str, Site] = {
    "s1": Site(
        id="s1", name="Riverside Tower", address="1400 River Rd, Block C",
        status="active", progress=64, congestion="high",
        trades=5, workers=23, frames=142, last_scan=now,
        zones=[
            Zone(zone="Zone A — Ground Level West", congestion=2, trades=["Concrete"], workers=4, status=ZoneStatus.ok),
            Zone(zone="Zone B — Level 3 East Scaffolding", congestion=5, trades=["Electrical", "Plumbing", "Framing"], workers=9, status=ZoneStatus.critical),
            Zone(zone="Zone C — North Exterior", congestion=3, trades=["Framing", "Crane Ops"], workers=6, status=ZoneStatus.warning),
            Zone(zone="Zone D — South Parking / Staging", congestion=1, trades=["Delivery"], workers=2, status=ZoneStatus.ok),
            Zone(zone="Zone E — Level 2 Interior", congestion=3, trades=["HVAC", "Electrical"], workers=5, status=ZoneStatus.warning),
        ],
    ),
    "s2": Site(
        id="s2", name="Harbor Warehouse", address="Dock 9, Industrial Port",
        status="active", progress=38, congestion="medium",
        trades=3, workers=14, frames=87, last_scan=now,
        zones=[
            Zone(zone="Zone A — West Bay", congestion=2, trades=["Steel Erection"], workers=5, status=ZoneStatus.ok),
            Zone(zone="Zone B — East Bay", congestion=3, trades=["Concrete", "Plumbing"], workers=6, status=ZoneStatus.warning),
            Zone(zone="Zone C — South Access Road", congestion=4, trades=["Delivery", "Staging"], workers=3, status=ZoneStatus.critical),
        ],
    ),
    "s3": Site(
        id="s3", name="Oakfield Homes Ph.2", address="Oakfield Estate, Lots 14-28",
        status="review", progress=91, congestion="low",
        trades=0, workers=0, frames=0, last_scan=now,
        zones=[],
    ),
}

_alert_id = 0


def _next_alert_id() -> str:
    global _alert_id
    _alert_id += 1
    return f"a_{_alert_id:03d}"


ALERTS: dict[str, Alert] = {}

_seed_alerts = [
    ("s1", "Riverside Tower", AlertSeverity.high, "3 trades stacked in Zone B — east scaffolding",
     "Electrical, plumbing, and framing crews all working within the same 400 sq ft area on level 3. Movement corridors are blocked by staged conduit. Recommend staggering electrical to afternoon shift.", "productivity"),
    ("s1", "Riverside Tower", AlertSeverity.high, "No hard hats detected near crane swing radius",
     "Two workers in the northeast corner are within the crane's operational radius without visible hard hats. This area had the same issue flagged yesterday.", "safety"),
    ("s2", "Harbor Warehouse", AlertSeverity.medium, "Material staging blocking vehicle path",
     "Lumber delivery staged across the main access road on the south side. Prevents equipment from reaching the west bay. Appeared between morning and midday scans.", "productivity"),
    ("s1", "Riverside Tower", AlertSeverity.low, "Formwork removal ahead of schedule — level 1",
     "Shores on level 1 east deck are 60% removed, ahead of the projected timeline. Positive progress indicator.", "productivity"),
]

for site_id, site_name, sev, title, detail, source in _seed_alerts:
    aid = _next_alert_id()
    ALERTS[aid] = Alert(
        id=aid, site_id=site_id, site_name=site_name,
        severity=sev, title=title, detail=detail,
        source_agent=source, created_at=now,
    )

BRIEFINGS: dict[str, str] = {
    "s1": "The biggest issue today is Zone B on level 3. Three different crews — electrical, plumbing, and framing — are all trying to work in the same area at the same time. It's packed. Workers can barely move through, and the conduit staged on the floor is blocking the walkway.\n\nCompared to yesterday, congestion in Zone B got worse. It was two trades yesterday, now it's three. Zone C near the crane also has a safety concern — two workers spotted without hard hats in the swing radius. This is the second day in a row.\n\nThe good news: formwork removal on level 1 is running ahead of schedule. The east deck is clearing out faster than expected.\n\nRecommendation: Move the electrical crew in Zone B to the afternoon shift so they're not overlapping with framing. Address the hard hat issue in Zone C immediately — it's a repeat violation.",
    "s2": "Work is moving steadily but there's a logistics problem on the south side. A lumber delivery got staged right across the main access road, which means equipment can't get to the west bay. This showed up between the morning and midday scans — it wasn't there earlier.\n\nThe east bay has two trades sharing space (concrete and plumbing) but it's manageable for now. No safety flags today.\n\nRecommendation: Get the lumber restaged off the access road before the afternoon equipment run. If it stays, the west bay crew will be idle.",
}

FEEDS: dict[str, FeedConfig] = {
    "cam1": FeedConfig(id="cam1", label="Cam 1 — Crane Top", site_id="s1", site_name="Riverside Tower", type="fixed"),
    "cam2": FeedConfig(id="cam2", label="Cam 2 — J. Martinez", site_id="s1", site_name="Riverside Tower", worker="J. Martinez", type="helmet"),
    "cam3": FeedConfig(id="cam3", label="Cam 3 — Level 3 East", site_id="s1", site_name="Riverside Tower", type="fixed"),
    "cam4": FeedConfig(id="cam4", label="Cam 4 — R. Chen", site_id="s1", site_name="Riverside Tower", worker="R. Chen", type="helmet"),
    "cam5": FeedConfig(id="cam5", label="Cam 5 — South Gate", site_id="s2", site_name="Harbor Warehouse", type="fixed"),
    "cam6": FeedConfig(id="cam6", label="Cam 6 — T. Williams", site_id="s2", site_name="Harbor Warehouse", worker="T. Williams", type="helmet"),
}

VIDEO_JOBS: dict[str, VideoJob] = {}

# Seed mock video result so /api/safety/analyze works out of the box
from app.data.mock_video_results import MOCK_VIDEO_RESULT  # noqa: E402

VIDEO_RESULTS: dict[str, VideoProcessingResult] = {
    MOCK_VIDEO_RESULT.job_id: MOCK_VIDEO_RESULT,
}
FRAMES: dict[str, list[FrameData]] = {}  # site_id -> frames
SAFETY_REPORTS: dict[str, SafetyReport] = {}  # site_id -> latest

# Seed productivity report for s1 so GET /api/productivity/report/s1 returns 200
PRODUCTIVITY_REPORTS: dict[str, ProductivityReport] = {
    "s1": ProductivityReport(
        site_id="s1",
        zones=SITES["s1"].zones,
        trade_overlaps=[
            TradeOverlap(
                zone="Zone B — Level 3 East Scaffolding",
                trades=["Electrical", "Plumbing", "Framing"],
                severity="severe",
                recommendation="Stagger trades or expand work area to reduce coordination risk.",
            ),
            TradeOverlap(
                zone="Zone E — Level 2 Interior",
                trades=["HVAC", "Electrical"],
                severity="moderate",
                recommendation="Monitor for conflicts; consider dedicated handoff times.",
            ),
        ],
        congestion_trend="worsening",
        resource_suggestions=[
            "Stagger electrical crew to afternoon shift in Zone B to reduce overlap with framing.",
            "Clear conduit from corridors in Level 3 East to restore egress.",
        ],
        summary="Zone B (Level 3 East) has three trades in a confined area with high congestion. Zone E has moderate overlap. Overall trend is worsening; recommend staggering trades and clearing corridors.",
        generated_at=now,
    ),
}
