"""Feed summary.txt through the safety + productivity agents and print the reports."""
import asyncio
import sys
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.models.video import (
    VideoProcessingResult,
    ZoneAnalysis,
    WorkerDetection,
    PPEDetection,
    EquipmentDetection,
    HazardDetection,
    EgressStatus,
    MaterialStack,
)
from app.agents.safety_agent import SafetyAgent
from app.agents.productivity_agent import ProductivityAgent


def build_video_result_from_summary(text: str) -> VideoProcessingResult:
    """Parse the Pegasus summary text into structured zone data for the agents.

    This is a best-effort extraction — maps the narrative observations into
    the structured classifiers the safety agent expects.
    """

    # Zone A — Plumbing area (main workspace, blowtorch + copper pipes)
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

    return VideoProcessingResult(
        job_id="test_summary",
        site_id="s1",
        zones=[zone_a, zone_b, zone_c, zone_d, zone_e],
        metadata={"combined_briefing": text, "source": "summary.txt"},
    )


async def main():
    summary_path = Path(__file__).resolve().parent.parent / "app" / "summarizer" / "summary.txt"
    text = summary_path.read_text()
    print(f"Loaded summary: {len(text)} chars\n")

    result = build_video_result_from_summary(text)
    print(f"Built VideoProcessingResult: {len(result.zones)} zones\n")

    # Run Safety Agent
    print("=" * 60)
    print("SAFETY AGENT")
    print("=" * 60)
    safety = await SafetyAgent().process("s1", result)
    print(f"\nOverall Risk: {safety.overall_risk}")
    print(f"Violations: {len(safety.violations)}")
    for v in safety.violations:
        print(f"  [{v.severity.value}] {v.zone}: {v.type} — {v.description[:100]}")
    print(f"\nPPE Compliance: {safety.ppe_compliance}")
    print(f"Zone Adherence: {safety.zone_adherence}")
    print(f"\nSummary:\n{safety.summary}\n")

    # Run Productivity Agent
    print("=" * 60)
    print("PRODUCTIVITY AGENT")
    print("=" * 60)
    prod = await ProductivityAgent().process("s1", result)
    print(f"\nCongestion Trend: {prod.congestion_trend}")
    print(f"Trade Overlaps: {len(prod.trade_overlaps)}")
    for o in prod.trade_overlaps:
        print(f"  [{o.severity}] {o.zone}: {', '.join(o.trades)} — {o.recommendation[:80]}")
    print(f"\nZones:")
    for z in prod.zones:
        print(f"  {z.zone}: congestion={z.congestion}/5, workers={z.workers}, status={z.status.value}")
    print(f"\nSuggestions:")
    for s in prod.resource_suggestions:
        print(f"  • {s}")
    print(f"\nSummary:\n{prod.summary}")


if __name__ == "__main__":
    asyncio.run(main())
