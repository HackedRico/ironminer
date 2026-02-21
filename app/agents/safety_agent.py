"""Safety Agent — PPE detection, violations, zone adherence.

Sends Video Agent zone analysis data + OSHA safety knowledge to an LLM
and parses the response into a structured SafetyReport.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.agents.base import BaseAgent
from app.models.alert import AlertSeverity
from app.models.analysis import SafetyReport, SafetyViolation
from app.models.video import VideoProcessingResult
from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

OSHA_SYSTEM_PROMPT = """\
You are an OSHA-certified construction safety analyst. You review spatial zone \
analysis data from construction site video footage and produce structured safety \
violation reports.

Apply the following OSHA standards when evaluating the data:

**PPE Requirements (29 CFR 1926.100-106)**
- Hard hats required in all active work zones and areas exposed to overhead hazards
- High-visibility vests required near vehicle traffic and roadway edges
- Safety glasses/goggles required during cutting, grinding, and powder-actuated tool use
- Hearing protection required near high-noise operations
- Fall protection harnesses required when working at heights above 6 ft

**Fall Protection (29 CFR 1926.500-503)**
- Guardrails, safety nets, or personal fall arrest systems (PFAS) required at 6 ft+
- Scaffold edges must have guardrails or workers must be tied off
- Ladder safety: maintain 3-point contact at all times

**Scaffolding Safety (29 CFR 1926.450-454)**
- All planks must be secured and fully decked
- Scaffold access via proper ladder or stairway
- No work under unsecured scaffold components

**Electrical Safety (29 CFR 1926.400-449)**
- Lockout/tagout (LOTO) required before working on electrical panels
- Maintain safe clearances from live circuits
- No extension cords through standing water

**Struck-by Hazards (29 CFR 1926.1400-1442)**
- No workers under suspended loads
- Exclusion barricades required within crane swing radius
- Signal persons must have clear line of sight to crane operator

**Housekeeping & Egress (29 CFR 1926.25, 1926.34)**
- Egress paths must remain clear at all times
- Material staging must not block emergency vehicle access
- Stacked materials must be stable and cross-braced above 6 ft

**Hot Work (29 CFR 1926.352-354)**
- Fire watch required when hot work is within 35 ft of combustibles
- Fire extinguisher must be within 20 ft of hot work area

**Multi-trade Coordination**
- Trades operating in close proximity need barrier separation or scheduling offsets
- Overhead work above other crews requires netting or exclusion zones

---

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "violations": [
    {
      "zone": "<zone name>",
      "type": "<ppe_missing|zone_breach|clearance_issue|blocked_corridor>",
      "description": "<specific violation with OSHA reference>",
      "severity": "<high|medium|low>",
      "workers_affected": <number>
    }
  ],
  "ppe_compliance": {
    "<zone name>": <true if compliant, false if not>
  },
  "zone_adherence": {
    "<zone name>": <true if zones properly maintained, false if not>
  },
  "overall_risk": "<low|medium|high|critical>",
  "summary": "<2-3 paragraph executive summary with key findings and OSHA references>"
}
"""


def _build_user_prompt(video_result: VideoProcessingResult) -> str:
    """Format VideoProcessingResult data into a structured user prompt."""
    sections = [f"Site ID: {video_result.site_id}", f"Job ID: {video_result.job_id}", ""]

    sections.append("## Zone Analyses")
    for zone, analysis in video_result.zone_analyses.items():
        sections.append(f"\n### {zone}\n{analysis}")

    sections.append("\n## Entity Relationships")
    for key, desc in video_result.entity_relationships.items():
        sections.append(f"\n### {key}\n{desc}")

    if video_result.temporal_chain:
        sections.append("\n## Temporal Chain (chronological observations)")
        for entry in video_result.temporal_chain:
            sections.append(f"- {entry}")

    sections.append(
        "\n---\nAnalyze the above data for OSHA safety violations. "
        "Return your findings as JSON."
    )
    return "\n".join(sections)


def _parse_llm_response(raw: str, site_id: str) -> SafetyReport:
    """Parse LLM JSON response into a SafetyReport. Falls back on error."""
    # Strip markdown code fences if the LLM wraps the JSON
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (with optional language tag) and closing fence
        lines = cleaned.split("\n")
        lines = lines[1:]  # drop opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error("Failed to parse LLM response as JSON: %s", raw[:500])
        return SafetyReport(
            site_id=site_id,
            summary=f"LLM returned non-JSON response. Raw output:\n{raw[:1000]}",
            overall_risk="medium",
            generated_at=datetime.now(timezone.utc),
        )

    violations = []
    for v in data.get("violations", []):
        try:
            violations.append(
                SafetyViolation(
                    zone=v["zone"],
                    type=v["type"],
                    description=v["description"],
                    severity=AlertSeverity(v.get("severity", "medium")),
                    workers_affected=int(v.get("workers_affected", 1)),
                )
            )
        except (KeyError, ValueError) as exc:
            logger.warning("Skipping malformed violation: %s (%s)", v, exc)

    return SafetyReport(
        site_id=site_id,
        violations=violations,
        ppe_compliance=data.get("ppe_compliance", {}),
        zone_adherence=data.get("zone_adherence", {}),
        overall_risk=data.get("overall_risk", "medium"),
        summary=data.get("summary", ""),
        generated_at=datetime.now(timezone.utc),
    )


class SafetyAgent(BaseAgent):
    async def process(
        self, site_id: str, video_result: VideoProcessingResult
    ) -> SafetyReport:
        llm = get_llm_client()
        user_prompt = _build_user_prompt(video_result)

        logger.info("SafetyAgent: sending %d chars to LLM", len(user_prompt))
        raw_response = await llm.chat(system=OSHA_SYSTEM_PROMPT, user=user_prompt)
        logger.info("SafetyAgent: received %d chars from LLM", len(raw_response))

        return _parse_llm_response(raw_response, site_id)
