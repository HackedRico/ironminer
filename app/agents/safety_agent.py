"""Safety Agent — deterministic OSHA rule checks + LLM summary.

Phase 1: Iterate structured classifiers from the Video Agent and apply
         OSHA rules directly on booleans/numbers.  No LLM needed.
Phase 2: Send the computed violations list to an LLM for an executive
         summary and prioritized recommendations only.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.agents.base import BaseAgent
from app.models.alert import AlertSeverity
from app.models.analysis import SafetyReport, SafetyViolation
from app.models.video import (
    VideoProcessingResult,
    ZoneAnalysis,
    WorkerDetection,
)
from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ── LLM system prompt (Phase 2 only — narration, not detection) ─────────────

# OSHA regulatory knowledge injected as prompt context.
# This is prompt engineering, NOT model fine-tuning — it gives the base LLM
# enough construction-domain context to produce field-ready safety reports.
OSHA_CONTEXT = """\
=== OSHA CONSTRUCTION SAFETY REGULATORY FRAMEWORK (29 CFR Part 1926) ===

CORE SUBPARTS:
- Subpart C (1926.20-35): General Safety / Means of Egress — exits must remain clear at all times
- Subpart E (1926.95-106): PPE — hard hats (1926.100), eye protection, hi-vis, hearing; employer-provided and mandatory
- Subpart M (1926.500-503): Fall Protection — required above 6 ft; guardrails, safety nets, or PFAS (personal fall arrest system)
- Subpart N (1926.550 / 1926.1400-1442): Cranes & Derricks — signal person LOS required (1926.1419), no workers under suspended loads (1926.1431)
- Subpart Q (1926.650): Excavations
- Subpart R (1926.750-761): Steel Erection
- Subpart S (1926.800): Underground Construction
- Subpart T (1926.850): Demolition
- Subpart V (1926.950): Power Transmission
- Subpart W (1926.1050-1060): Ladders — 3-point contact required (1926.1053); portable ladders must extend 3 ft above landing
- Subpart X (1926.1100): Hand & Power Tools
- Subparts Z/GS (1926.Subpart Z): Hazardous materials; hot work permit + fire watch required within 35 ft of combustibles (1926.352)
- Electrical: LOTO (lockout/tagout) required before work on energized circuits (1926.417)

FATAL FOUR HAZARD CATEGORIES (OSHA Priority — account for >60% of construction deaths):
1. FALLS — #1 killer; fall from elevation violations are always HIGH or CRITICAL
2. STRUCK-BY — cranes, vehicles, falling objects, unsecured loads
3. CAUGHT-IN/BETWEEN — unguarded machinery, excavation cave-in, pinch points
4. ELECTROCUTION — live panels without LOTO, exposed wiring, wet conditions

HIERARCHY OF CONTROLS (most to least preferred):
  Elimination → Substitution → Engineering Controls → Administrative Controls → PPE

MULTI-EMPLOYER DOCTRINE:
  On multi-trade worksites, the controlling employer (general contractor) is responsible
  for the safety of ALL workers, even subcontractor employees, in shared zones.
  Multi-trade congestion in confined areas compounds coordination hazards significantly.

SEVERITY ESCALATION TRIGGERS:
  - Worker in crane swing radius without PPE: IMMEDIATE stop-work
  - Worker under suspended load: IMMEDIATE stop-work
  - Blocked emergency egress: notify emergency services coordination
  - Hot work without fire watch: stop hot work immediately
  - Live electrical work without LOTO: de-energize before work continues
  - Harness not tied off at elevation: worker must descend until corrected
=== END FRAMEWORK ===
"""

SUMMARY_SYSTEM_PROMPT = """\
You are a certified construction safety analyst writing reports for field use. \
You do NOT decide what is or isn\'t a violation — that has already been determined \
by automated OSHA rule checks. Your job is to narrate and prioritize those findings.

You have deep expertise in OSHA 29 CFR Part 1926 (Construction Safety Standards), \
the OSHA Fatal Four hazard categories (falls, struck-by, caught-in/between, \
electrocution), multi-employer worksite doctrine, and hierarchy of controls.

""" + OSHA_CONTEXT + """\

You will receive JSON containing:
1. violations — list of detected violations with OSHA references, severity, zone, workers affected.
2. temporal_events — timeline of events.
3. narrative_context_from_video (optional) — descriptive summary of the video (e.g. from summary.txt). \
Use this to enrich your executive summary when present.

Your job — write a field-ready executive summary for the site superintendent:
- Paragraph 1: Overall risk assessment. Reference the Fatal Four categories present \
and total workers exposed. Cite specific zones by name.
- Paragraph 2: Top 3-5 priority violations requiring IMMEDIATE action, with the \
specific OSHA CFR subsection and the corrective action.
- Paragraph 3: Secondary violations and systemic patterns (e.g. recurring PPE \
non-compliance, multi-trade congestion trend from temporal events). \
Include one preventive recommendation.

Tone: direct, field-appropriate, no legal hedging. Use active verbs. \
A site super should be able to read this in under 60 seconds and know exactly \
what to do first.

Respond with ONLY valid JSON (no markdown, no explanation):
{{
  "summary": "<3-paragraph executive summary>"
}}
"""


# ── Phase 1: Deterministic OSHA rule checks ─────────────────────────────────


def _check_worker_rules(
    worker: WorkerDetection,
    zone: ZoneAnalysis,
) -> list[SafetyViolation]:
    """Apply per-worker OSHA rules. Returns violations found."""
    violations: list[SafetyViolation] = []
    zone_name = zone.zone_name

    # Hard hat required in all active work zones
    if not worker.ppe.hard_hat:
        v = SafetyViolation(
            zone=zone_name,
            type="ppe_missing",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) missing hard hat. "
                f"29 CFR 1926.100 — hard hats required in all active work zones."
            ),
            severity=AlertSeverity.medium,
            workers_affected=1,
        )
        # Escalate if in crane swing radius
        if worker.in_crane_swing_radius:
            v.severity = AlertSeverity.high
            v.type = "ppe_missing"
            v.description = (
                f"Worker {worker.worker_id} ({worker.trade}) in crane swing radius "
                f"without hard hat. 29 CFR 1926.100 + 1926.1400 — struck-by + PPE violation."
            )
        violations.append(v)

    # Fall protection: elevation > 6 ft without harness
    if worker.elevation_ft > 6 and not worker.ppe.fall_harness:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="zone_breach",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) at {worker.elevation_ft} ft "
                f"without fall harness. 29 CFR 1926.501 — fall protection required above 6 ft."
            ),
            severity=AlertSeverity.high,
            workers_affected=1,
        ))

    # Near edge without harness
    if worker.near_edge and not worker.ppe.fall_harness:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="zone_breach",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) near unprotected edge "
                f"without fall harness. 29 CFR 1926.501(b)(1)."
            ),
            severity=AlertSeverity.high,
            workers_affected=1,
        ))

    # Harness not tied off at elevation
    if worker.elevation_ft > 6 and worker.ppe.fall_harness and not worker.ppe.harness_tied_off:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="zone_breach",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) at {worker.elevation_ft} ft "
                f"with harness not tied off. 29 CFR 1926.502(d) — PFAS must be anchored."
            ),
            severity=AlertSeverity.high,
            workers_affected=1,
        ))

    # Under suspended load
    if worker.under_suspended_load:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="clearance_issue",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) standing under suspended load. "
                f"29 CFR 1926.1431 — no workers permitted under suspended loads."
            ),
            severity=AlertSeverity.high,
            workers_affected=1,
        ))

    # Ladder without 3-point contact
    if worker.on_ladder and worker.three_point_contact is False:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="zone_breach",
            description=(
                f"Worker {worker.worker_id} ({worker.trade}) on ladder without 3-point contact. "
                f"29 CFR 1926.1053(b)(1)."
            ),
            severity=AlertSeverity.medium,
            workers_affected=1,
        ))

    return violations


def _check_zone_rules(zone: ZoneAnalysis) -> list[SafetyViolation]:
    """Apply zone-level OSHA rules (equipment, hazards, egress, materials, congestion)."""
    violations: list[SafetyViolation] = []
    zone_name = zone.zone_name

    # Equipment rules
    for eq in zone.equipment:
        if eq.type == "crane" and not eq.signal_person_line_of_sight:
            violations.append(SafetyViolation(
                zone=zone_name,
                type="clearance_issue",
                description=(
                    f"Crane {eq.equipment_id} — signal person lacks clear line of sight "
                    f"to operator. 29 CFR 1926.1419."
                ),
                severity=AlertSeverity.high,
                workers_affected=1,
            ))

    # Hazard rules
    for hz in zone.hazards:
        if hz.type == "hot_work" and not hz.fire_watch_present:
            violations.append(SafetyViolation(
                zone=zone_name,
                type="clearance_issue",
                description=(
                    f"Hot work ({hz.description}) without fire watch. "
                    f"29 CFR 1926.352(e) — fire watch required near combustibles."
                ),
                severity=AlertSeverity.high,
                workers_affected=len(zone.workers),
            ))
        if hz.type == "electrical_exposure" and not hz.loto_signage_visible:
            violations.append(SafetyViolation(
                zone=zone_name,
                type="clearance_issue",
                description=(
                    f"Electrical exposure ({hz.description}) without LOTO signage. "
                    f"29 CFR 1926.417 — lockout/tagout required."
                ),
                severity=AlertSeverity.high,
                workers_affected=len(zone.workers),
            ))

    # Egress rules
    for eg in zone.egress:
        if eg.blocked:
            sev = AlertSeverity.high if eg.emergency_access else AlertSeverity.medium
            violations.append(SafetyViolation(
                zone=zone_name,
                type="blocked_corridor",
                description=(
                    f"Egress path {eg.path_id} blocked by {eg.blocking_material or 'unknown'}. "
                    f"{'Emergency vehicle access lane compromised. ' if eg.emergency_access else ''}"
                    f"29 CFR 1926.34 — means of egress must remain clear."
                ),
                severity=sev,
                workers_affected=len(zone.workers),
            ))

    # Material stacking
    for ms in zone.material_stacks:
        if ms.height_ft > 6 and not ms.cross_braced:
            violations.append(SafetyViolation(
                zone=zone_name,
                type="clearance_issue",
                description=(
                    f"{ms.material_type.title()} stack at {ms.height_ft} ft without cross-bracing. "
                    f"29 CFR 1926.250(a)(1) — stacked materials must be stable."
                ),
                severity=AlertSeverity.medium,
                workers_affected=len(zone.workers),
            ))

    # Multi-trade congestion
    if len(zone.trades_present) > 2 and zone.area_sqft is not None and zone.area_sqft < 500:
        violations.append(SafetyViolation(
            zone=zone_name,
            type="zone_breach",
            description=(
                f"{len(zone.trades_present)} trades ({', '.join(zone.trades_present)}) "
                f"in {zone.area_sqft} sqft area. Multi-trade congestion creates coordination "
                f"hazards. OSHA multi-employer worksite doctrine applies."
            ),
            severity=AlertSeverity.high,
            workers_affected=len(zone.workers),
        ))

    return violations


def _check_trade_proximity_rules(
    result: VideoProcessingResult,
) -> list[SafetyViolation]:
    """Check trade proximity hazards across zones."""
    violations: list[SafetyViolation] = []
    zone_lookup = {z.zone_id: z.zone_name for z in result.zones}

    for tp in result.trade_proximities:
        if tp.overhead_work_above_crew and tp.separation_ft < 10:
            zone_name = zone_lookup.get(tp.zone_id, tp.zone_id)
            violations.append(SafetyViolation(
                zone=zone_name,
                type="clearance_issue",
                description=(
                    f"{tp.trade_a} working overhead above {tp.trade_b} crew with only "
                    f"{tp.separation_ft} ft separation. {tp.description} "
                    f"29 CFR 1926.759 — overhead protection required."
                ),
                severity=AlertSeverity.high,
                workers_affected=2,
            ))

    return violations


def _compute_compliance(result: VideoProcessingResult, violations: list[SafetyViolation]) -> tuple[dict[str, bool], dict[str, bool]]:
    """Compute PPE compliance and zone adherence dicts from violations."""
    violation_zones = {v.zone for v in violations}
    ppe_violation_zones = {v.zone for v in violations if v.type == "ppe_missing"}

    ppe_compliance = {}
    zone_adherence = {}
    for zone in result.zones:
        ppe_compliance[zone.zone_name] = zone.zone_name not in ppe_violation_zones
        zone_adherence[zone.zone_name] = zone.zone_name not in violation_zones

    return ppe_compliance, zone_adherence


def _compute_overall_risk(violations: list[SafetyViolation]) -> str:
    """Deterministic risk level from violation counts/severities."""
    if not violations:
        return "low"

    high_violations = [v for v in violations if v.severity == AlertSeverity.high]
    high_workers = sum(v.workers_affected for v in high_violations)

    if (high_workers >= 3 and high_violations) or len(violations) >= 5:
        return "critical"
    if high_violations:
        return "high"
    if any(v.severity == AlertSeverity.medium for v in violations):
        return "medium"
    return "low"


def run_deterministic_checks(result: VideoProcessingResult) -> list[SafetyViolation]:
    """Phase 1 — run all deterministic OSHA rules on structured classifiers."""
    violations: list[SafetyViolation] = []

    for zone in result.zones:
        for worker in zone.workers:
            violations.extend(_check_worker_rules(worker, zone))
        violations.extend(_check_zone_rules(zone))

    violations.extend(_check_trade_proximity_rules(result))
    return violations


# ── Phase 2: LLM summary ────────────────────────────────────────────────────


def _get_summary_text(result: VideoProcessingResult) -> str | None:
    """Narrative from local summary.txt (avoids Twelve Labs rate limit)."""
    if result.summary_text:
        return result.summary_text
    return result.metadata.get("summary_text") if result.metadata else None


def _build_summary_prompt(
    violations: list[SafetyViolation],
    result: VideoProcessingResult,
) -> str:
    """Build the user prompt for the LLM summary phase."""
    v_dicts = [
        {
            "zone": v.zone,
            "type": v.type,
            "severity": v.severity.value if hasattr(v.severity, "value") else str(v.severity),
            "description": v.description,
            "workers_affected": v.workers_affected,
        }
        for v in violations
    ]

    temporal = [
        {
            "timestamp": te.timestamp,
            "zone_id": te.zone_id,
            "event_type": te.event_type,
            "detail": te.detail,
        }
        for te in result.temporal_events
    ]

    payload = {"violations": v_dicts, "temporal_events": temporal}
    summary_text = _get_summary_text(result)
    if summary_text:
        payload["narrative_context_from_video"] = summary_text.strip()
    return json.dumps(payload, indent=2)


def _parse_summary_response(raw: str) -> str:
    """Extract the summary string from the LLM JSON response."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        data = json.loads(cleaned)
        return data.get("summary", "")
    except json.JSONDecodeError:
        logger.warning("LLM returned non-JSON summary, using raw text")
        return raw.strip()


# ── Agent class ──────────────────────────────────────────────────────────────


class SafetyAgent(BaseAgent):
    async def process(
        self, site_id: str, video_result: VideoProcessingResult
    ) -> SafetyReport:
        # Phase 1 — deterministic OSHA rule checks (no LLM)
        violations = run_deterministic_checks(video_result)
        ppe_compliance, zone_adherence = _compute_compliance(video_result, violations)
        overall_risk = _compute_overall_risk(violations)

        logger.info(
            "SafetyAgent Phase 1: %d violations, risk=%s",
            len(violations),
            overall_risk,
        )

        # Phase 2 — LLM for executive summary only
        summary = ""
        try:
            llm = get_llm_client()
            user_prompt = _build_summary_prompt(violations, video_result)
            logger.info("SafetyAgent Phase 2: sending %d chars to LLM", len(user_prompt))
            raw_response = await llm.chat(system=SUMMARY_SYSTEM_PROMPT, user=user_prompt)
            logger.info("SafetyAgent Phase 2: received %d chars from LLM", len(raw_response))
            summary = _parse_summary_response(raw_response)
        except Exception:
            logger.exception("LLM summary failed — violations are still valid")
            summary = (
                f"[Auto-generated] {len(violations)} safety violations detected. "
                f"Overall risk: {overall_risk}. See violations list for details."
            )

        return SafetyReport(
            site_id=site_id,
            violations=violations,
            ppe_compliance=ppe_compliance,
            zone_adherence=zone_adherence,
            overall_risk=overall_risk,
            summary=summary,
            generated_at=datetime.now(timezone.utc),
        )
