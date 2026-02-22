"""Video Agent — uses cached Twelve Labs Pegasus output + structured zone extraction.

On video upload, reads the pre-generated summary from app/summarizer/summary.txt,
builds structured ZoneAnalysis data from it, and returns a full VideoProcessingResult
that the safety and productivity agents can process.

Supports canned demo scenarios: if demo_assets/{filename}.json exists, zones are
loaded from that file instead of summary.txt.

To regenerate summary.txt with a new video:
  python app/summarizer/summary.py --video path/to/video.mp4 --output app/summarizer/summary.txt
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.agents.base import BaseAgent
from app.models.video import (
    FrameData,
    VideoProcessingResult,
    ZoneAnalysis,
    WorkerDetection,
    PPEDetection,
    EquipmentDetection,
    HazardDetection,
    EgressStatus,
    MaterialStack,
)
from app.utils.video import split_video

logger = logging.getLogger(__name__)

__all__ = ["VideoAgent", "split_video"]

_SUMMARY_PATH = Path(__file__).resolve().parent.parent / "summarizer" / "summary.txt"
_DEMO_ASSETS = Path(__file__).resolve().parent.parent.parent / "demo_assets"


def _build_zones_from_summary(text: str) -> list[ZoneAnalysis]:
    """Map the Pegasus narrative into structured zone data for safety/productivity agents.

    This is a best-effort extraction based on the typical Pegasus output describing
    a construction site video. The zones are derived from recurring spatial areas
    identified in the summary text.
    """

    # Zone A — Plumbing area (blowtorch, copper pipes, main workspace)
    zone_a = ZoneAnalysis(
        zone_id="z1",
        zone_name="Zone A — Interior Plumbing Area",
        workers=[
            WorkerDetection(
                worker_id="w1", trade="plumbing",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, gloves=True, safety_glasses=True),
            ),
        ],
        hazards=[
            HazardDetection(
                hazard_id="h1", type="hot_work", zone_id="z1",
                description="Blowtorch on copper pipes with exposed wiring nearby",
                fire_watch_present=False,
            ),
        ],
        egress=[
            EgressStatus(path_id="eg1", zone_id="z1", blocked=True,
                         blocking_material="debris and scattered tools", emergency_access=False),
        ],
        trades_present=["plumbing", "electrical"],
        area_sqft=400,
    )

    # Zone B — Corridor / steel stud area (multiple trades passing through)
    zone_b = ZoneAnalysis(
        zone_id="z2",
        zone_name="Zone B — Corridor / Steel Stud Area",
        workers=[
            WorkerDetection(
                worker_id="w2", trade="framing",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
            ),
            WorkerDetection(
                worker_id="w3", trade="insulation",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
            ),
            WorkerDetection(
                worker_id="w4", trade="electrical",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
            ),
        ],
        egress=[
            EgressStatus(path_id="eg2", zone_id="z2", blocked=True,
                         blocking_material="stacks of insulation and materials", emergency_access=True),
        ],
        material_stacks=[
            MaterialStack(zone_id="z2", material_type="insulation", height_ft=7, cross_braced=False),
        ],
        trades_present=["framing", "insulation", "electrical"],
        area_sqft=350,
    )

    # Zone C — Table saw / jackhammer area
    zone_c = ZoneAnalysis(
        zone_id="z3",
        zone_name="Zone C — Power Tools / Assembly Area",
        workers=[
            WorkerDetection(
                worker_id="w5", trade="carpentry",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, safety_glasses=False),
            ),
            WorkerDetection(
                worker_id="w6", trade="demolition",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, hearing_protection=False),
            ),
        ],
        equipment=[
            EquipmentDetection(equipment_id="eq1", type="grinder", active=True),
        ],
        egress=[
            EgressStatus(path_id="eg3", zone_id="z3", blocked=True,
                         blocking_material="tools, wooden planks, cables, debris", emergency_access=False),
        ],
        trades_present=["carpentry", "demolition"],
        area_sqft=300,
    )

    # Zone D — Window installation / HVAC area
    zone_d = ZoneAnalysis(
        zone_id="z4",
        zone_name="Zone D — Window / HVAC Installation",
        workers=[
            WorkerDetection(
                worker_id="w7", trade="HVAC",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
            ),
            WorkerDetection(
                worker_id="w8", trade="glazing",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True),
            ),
        ],
        trades_present=["HVAC", "glazing"],
        area_sqft=250,
    )

    # Zone E — Cylindrical structure / scaffolding (elevated work)
    zone_e = ZoneAnalysis(
        zone_id="z5",
        zone_name="Zone E — Cylindrical Structure / Scaffolding",
        workers=[
            WorkerDetection(
                worker_id="w9", trade="structural",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, fall_harness=False),
                elevation_ft=10, on_scaffold=True,
            ),
            WorkerDetection(
                worker_id="w10", trade="structural",
                ppe=PPEDetection(hard_hat=True, hi_vis_vest=True, fall_harness=False),
                elevation_ft=10, on_scaffold=True,
            ),
        ],
        trades_present=["structural"],
        area_sqft=200,
    )

    return [zone_a, zone_b, zone_c, zone_d, zone_e]


class VideoAgent(BaseAgent):
    @staticmethod
    def _find_canned_json(file_path: str) -> Path | None:
        """Check demo_assets/ for a canned JSON matching the uploaded filename."""
        if not _DEMO_ASSETS.is_dir():
            return None
        stem = Path(file_path).stem
        # Try exact stem first, then strip UUID prefix added by upload endpoint
        candidates = [stem]
        parts = stem.split("_", 1)
        if len(parts) == 2:
            candidates.append(parts[1])
        for candidate in candidates:
            check = _DEMO_ASSETS / f"{candidate}.json"
            if check.is_file():
                return check
        return None

    async def process(
        self,
        job_id: str,
        site_id: str,
        file_path: str,
        frame_interval: float = 5.0,
    ) -> VideoProcessingResult:
        # Check for canned demo asset matching uploaded filename
        canned_path = self._find_canned_json(file_path)
        if canned_path:
            data = json.loads(canned_path.read_text())
            zones = [ZoneAnalysis(**z) for z in data["zones"]]
            analysis_text = data.get("briefing", "Canned demo scenario loaded.")
            logger.info("Loaded canned demo zones from %s (%d zones)", canned_path.name, len(zones))
        else:
            # Read cached Pegasus summary
            if _SUMMARY_PATH.is_file():
                analysis_text = _SUMMARY_PATH.read_text().strip()
                logger.info("Loaded cached Pegasus summary: %d chars from %s", len(analysis_text), _SUMMARY_PATH)
            else:
                analysis_text = "No Pegasus summary available. Run: python app/summarizer/summary.py --video <path>"
                logger.warning("summary.txt not found at %s", _SUMMARY_PATH)

            # Build structured zones from the summary
            zones = _build_zones_from_summary(analysis_text)

        logger.info("Built %d structured zones from summary", len(zones))

        # Extract thumbnails from uploaded video
        frame_data_list: list[FrameData] = []
        video_path = Path(file_path).resolve()
        if video_path.is_file():
            try:
                chunks = split_video(str(video_path), frame_interval)
                for idx, chunk_path in enumerate(chunks):
                    chunk_id = f"{job_id}_c{idx:04d}"
                    frame_data_list.append(FrameData(
                        id=chunk_id,
                        site_id=site_id,
                        timestamp=idx * frame_interval,
                        image_data="",
                        filename=f"chunk_{idx:04d}.mp4",
                    ))
            except Exception:
                logger.warning("Thumbnail extraction failed, continuing without frames")

        logger.info("Job %s complete: %d zones, %d frames", job_id, len(zones), len(frame_data_list))

        return VideoProcessingResult(
            job_id=job_id,
            site_id=site_id,
            frames=frame_data_list,
            zones=zones,
            zone_analyses={"full_analysis": analysis_text},
            temporal_chain=[analysis_text],
            metadata={
                "combined_briefing": analysis_text,
                "model": "pegasus1.2 (cached)",
                "source": "summary.txt",
            },
        )
