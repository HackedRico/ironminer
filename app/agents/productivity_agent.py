"""Productivity Agent — congestion scoring, trade overlap, resource allocation.

Input: VideoProcessingResult (structured zone data from Video Agent)
Output: ProductivityReport
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.agents.base import BaseAgent
from app.models.analysis import ProductivityReport, TradeOverlap
from app.models.site import Zone, ZoneStatus
from app.models.video import VideoProcessingResult, ZoneAnalysis
from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ── LLM summary prompt (Phase 2 — narration only) ────────────────────────────

SUMMARY_SYSTEM_PROMPT = """\
You are a construction productivity analyst writing executive briefings for \
site superintendents. You will receive JSON data with zone congestion scores \
and trade overlap information. Write a concise 2-paragraph field briefing:

Paragraph 1: Overall site productivity status — which zones are congested, \
how many trades are overlapping, and the congestion trend (improving/stable/worsening).

Paragraph 2: Top 2-3 actionable recommendations to reduce congestion and \
improve workflow. Be specific about which trades to reschedule or relocate.

Tone: direct, practical, no jargon. A site super should read this in 30 seconds.

Respond with ONLY valid JSON (no markdown):
{
  "summary": "<2-paragraph briefing>"
}
"""


# ── Zone congestion scoring ──────────────────────────────────────────────────

def _score_congestion(zone: ZoneAnalysis) -> int:
    """Compute congestion score 1-5 from worker density and trade count."""
    worker_count = len(zone.workers)
    trade_count = len(zone.trades_present)
    area = zone.area_sqft or 1000  # default if unknown

    density = worker_count / (area / 100)  # workers per 100 sqft

    if density >= 3.0 or (trade_count >= 3 and worker_count >= 8):
        return 5
    if density >= 2.0 or (trade_count >= 3 and worker_count >= 5):
        return 4
    if density >= 1.0 or trade_count >= 2:
        return 3
    if density >= 0.5 or worker_count >= 3:
        return 2
    return 1


def _congestion_to_status(score: int) -> ZoneStatus:
    if score >= 4:
        return ZoneStatus.critical
    if score >= 3:
        return ZoneStatus.warning
    return ZoneStatus.ok


def _build_zones(result: VideoProcessingResult) -> list[Zone]:
    """Build Zone objects with congestion scores from structured zone data."""
    zones: list[Zone] = []
    for za in result.zones:
        score = _score_congestion(za)
        zones.append(Zone(
            zone=za.zone_name,
            congestion=score,
            trades=za.trades_present,
            workers=len(za.workers),
            status=_congestion_to_status(score),
        ))
    return zones


# ── Trade overlap detection ──────────────────────────────────────────────────

def _detect_trade_overlaps(result: VideoProcessingResult) -> list[TradeOverlap]:
    """Flag zones with 2+ trades sharing the same space."""
    overlaps: list[TradeOverlap] = []
    for za in result.zones:
        if len(za.trades_present) < 2:
            continue

        trade_count = len(za.trades_present)
        area = za.area_sqft or 1000

        if trade_count >= 3 and area < 500:
            severity = "severe"
        elif trade_count >= 3 or area < 500:
            severity = "moderate"
        else:
            severity = "minor"

        if severity == "severe":
            rec = (
                f"Stagger {za.trades_present[0]} to alternate shift. "
                f"{trade_count} trades in {int(area)} sqft is unsafe."
            )
        elif severity == "moderate":
            rec = (
                f"Consider relocating {za.trades_present[-1]} to reduce "
                f"overlap in {za.zone_name}."
            )
        else:
            rec = f"Monitor overlap of {', '.join(za.trades_present)} in {za.zone_name}."

        overlaps.append(TradeOverlap(
            zone=za.zone_name,
            trades=za.trades_present,
            severity=severity,
            recommendation=rec,
        ))
    return overlaps


# ── Congestion trend ─────────────────────────────────────────────────────────

def _compute_trend(
    current_zones: list[Zone],
    previous_report: ProductivityReport | None,
) -> str:
    """Compare current congestion against previous report."""
    if not previous_report or not previous_report.zones:
        return "stable"

    prev_avg = sum(z.congestion for z in previous_report.zones) / len(previous_report.zones)
    curr_avg = sum(z.congestion for z in current_zones) / len(current_zones) if current_zones else 0

    diff = curr_avg - prev_avg
    if diff <= -0.5:
        return "improving"
    if diff >= 0.5:
        return "worsening"
    return "stable"


# ── Resource suggestions ─────────────────────────────────────────────────────

def _generate_suggestions(
    zones: list[Zone],
    overlaps: list[TradeOverlap],
    trend: str,
) -> list[str]:
    """Deterministic recommendations based on congestion and overlaps."""
    suggestions: list[str] = []

    critical_zones = [z for z in zones if z.status == ZoneStatus.critical]
    for z in critical_zones:
        suggestions.append(
            f"Reduce headcount in {z.zone} (congestion {z.congestion}/5, "
            f"{z.workers} workers). Consider splitting across shifts."
        )

    severe_overlaps = [o for o in overlaps if o.severity == "severe"]
    for o in severe_overlaps:
        suggestions.append(
            f"Urgent: {len(o.trades)} trades in {o.zone} — {o.recommendation}"
        )

    if trend == "worsening":
        suggestions.append(
            "Congestion trend is worsening. Review scheduling across all zones."
        )

    if not suggestions:
        suggestions.append("No immediate action required. Site productivity is within normal parameters.")

    return suggestions


# ── LLM summary ──────────────────────────────────────────────────────────────

def _build_summary_prompt(
    zones: list[Zone],
    overlaps: list[TradeOverlap],
    trend: str,
) -> str:
    zone_data = [
        {
            "zone": z.zone,
            "congestion": z.congestion,
            "trades": z.trades,
            "workers": z.workers,
            "status": z.status.value,
        }
        for z in zones
    ]
    overlap_data = [
        {
            "zone": o.zone,
            "trades": o.trades,
            "severity": o.severity,
            "recommendation": o.recommendation,
        }
        for o in overlaps
    ]
    return json.dumps(
        {"zones": zone_data, "trade_overlaps": overlap_data, "congestion_trend": trend},
        indent=2,
    )


def _parse_summary_response(raw: str) -> str:
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


class ProductivityAgent(BaseAgent):
    async def process(
        self, site_id: str, video_result: VideoProcessingResult
    ) -> ProductivityReport:
        # Get previous report for trend comparison
        from app.services.storage import PRODUCTIVITY_REPORTS
        previous = PRODUCTIVITY_REPORTS.get(site_id)

        # Phase 1 — deterministic analysis (no LLM)
        zones = _build_zones(video_result)
        overlaps = _detect_trade_overlaps(video_result)
        trend = _compute_trend(zones, previous)
        suggestions = _generate_suggestions(zones, overlaps, trend)

        logger.info(
            "ProductivityAgent Phase 1: %d zones, %d overlaps, trend=%s",
            len(zones), len(overlaps), trend,
        )

        # Phase 2 — LLM for executive summary
        summary = ""
        try:
            llm = get_llm_client()
            user_prompt = _build_summary_prompt(zones, overlaps, trend)
            logger.info("ProductivityAgent Phase 2: sending %d chars to LLM", len(user_prompt))
            raw_response = await llm.chat(system=SUMMARY_SYSTEM_PROMPT, user=user_prompt)
            logger.info("ProductivityAgent Phase 2: received %d chars from LLM", len(raw_response))
            summary = _parse_summary_response(raw_response)
        except Exception:
            logger.exception("LLM summary failed — deterministic analysis is still valid")
            critical_count = sum(1 for z in zones if z.status == ZoneStatus.critical)
            summary = (
                f"[Auto-generated] {len(zones)} zones analyzed. "
                f"{critical_count} critical, {len(overlaps)} trade overlaps. "
                f"Congestion trend: {trend}."
            )

        return ProductivityReport(
            site_id=site_id,
            zones=zones,
            trade_overlaps=overlaps,
            congestion_trend=trend,
            resource_suggestions=suggestions,
            summary=summary,
            generated_at=datetime.now(timezone.utc),
        )
