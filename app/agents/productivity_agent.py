"""Productivity Agent — deterministic congestion/overlap + LLM summary.

Phase 1: From VideoProcessingResult.zones and trade_proximities, compute
         trade_overlaps, zone congestion, and congestion_trend. No LLM.
Phase 2: Send narrative (summary_text / zone_analyses) + Phase 1 outputs to LLM
         for executive summary and resource_suggestions.
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

PRODUCTIVITY_SYSTEM_PROMPT = """\
You are a construction productivity analyst. You receive:
1. A narrative summary of the video (e.g. from summary.txt).
2. Deterministic productivity data: trade overlaps (multiple trades in same zone), congestion trend.

Your job — write a short executive summary for the site manager:
- Paragraph 1: Overall congestion and coordination. Which zones have the most overlap or conflict.
- Paragraph 2: Top 1–3 resource or scheduling recommendations (stagger trades, clear corridors, reallocate crew).
- Keep it under 150 words. Direct, actionable.

Respond with ONLY valid JSON (no markdown):
{
  "summary": "<2-paragraph executive summary>",
  "resource_suggestions": ["<suggestion 1>", "<suggestion 2>", ...]
}
"""


def _get_summary_text(result: VideoProcessingResult) -> str:
    """Narrative from summary.txt; video agent stores it in metadata combined_briefing or summary_text."""
    if getattr(result, "summary_text", None):
        return (result.summary_text or "").strip()
    if result.metadata:
        for key in ("summary_text", "combined_briefing"):
            val = result.metadata.get(key)
            if val:
                return str(val).strip()
    return ""


def _run_phase1(result: VideoProcessingResult) -> tuple[list[TradeOverlap], list[Zone], str]:
    """From zones and trade_proximities build trade_overlaps, report zones, and congestion_trend."""
    trade_overlaps: list[TradeOverlap] = []
    report_zones: list[Zone] = []
    trend_inputs: list[str] = []

    for z in result.zones:
        # Map ZoneAnalysis → Zone for report (congestion 1–5 from area/workers)
        workers = len(z.workers)
        area = z.area_sqft or 500.0
        if area > 0 and workers > 0:
            density = workers / (area / 100.0)  # workers per 100 sqft
            if density >= 2.0:
                congestion = 5
                status = ZoneStatus.critical
                trend_inputs.append("worsening")
            elif density >= 1.0:
                congestion = 4
                status = ZoneStatus.critical
                trend_inputs.append("worsening")
            elif density >= 0.5:
                congestion = 3
                status = ZoneStatus.warning
                trend_inputs.append("stable")
            else:
                congestion = 2
                status = ZoneStatus.ok
                trend_inputs.append("improving")
        else:
            congestion = 1
            status = ZoneStatus.ok
        report_zones.append(
            Zone(
                zone=z.zone_name,
                congestion=congestion,
                trades=z.trades_present.copy(),
                workers=workers,
                status=status,
            )
        )
        # Trade overlap: 2+ trades in same zone
        if len(z.trades_present) >= 2:
            area_sqft = z.area_sqft or 400.0
            if area_sqft < 500 and len(z.trades_present) >= 3:
                severity = "severe"
                rec = "Stagger trades or expand work area to reduce coordination risk."
            elif area_sqft < 800:
                severity = "moderate"
                rec = "Monitor for conflicts; consider dedicated handoff times."
            else:
                severity = "minor"
                rec = "Multiple trades present; ensure clear lanes."
            trade_overlaps.append(
                TradeOverlap(
                    zone=z.zone_name,
                    trades=z.trades_present.copy(),
                    severity=severity,
                    recommendation=rec,
                )
            )

    # Trade proximities from result (overhead work, separation)
    for tp in result.trade_proximities:
        zone_name = next((z.zone_name for z in result.zones if z.zone_id == tp.zone_id), tp.zone_id)
        trade_overlaps.append(
            TradeOverlap(
                zone=zone_name,
                trades=[tp.trade_a, tp.trade_b],
                severity="severe" if tp.overhead_work_above_crew and tp.separation_ft < 10 else "moderate",
                recommendation=tp.description or "Maintain separation; avoid overhead work above other crews.",
            )
        )

    if not trend_inputs:
        congestion_trend = "stable"
    elif trend_inputs.count("worsening") >= 2:
        congestion_trend = "worsening"
    elif trend_inputs.count("improving") >= len(trend_inputs) / 2:
        congestion_trend = "improving"
    else:
        congestion_trend = "stable"

    return trade_overlaps, report_zones, congestion_trend


def _build_productivity_prompt(
    result: VideoProcessingResult,
    trade_overlaps: list[TradeOverlap],
    congestion_trend: str,
) -> str:
    summary_text = _get_summary_text(result)
    payload = {
        "narrative_from_video": summary_text or "(no narrative)",
        "congestion_trend": congestion_trend,
        "trade_overlaps": [
            {"zone": o.zone, "trades": o.trades, "severity": o.severity, "recommendation": o.recommendation}
            for o in trade_overlaps
        ],
    }
    if result.temporal_chain:
        payload["temporal_notes"] = result.temporal_chain[:10]
    return json.dumps(payload, indent=2)


def _parse_productivity_response(raw: str) -> tuple[str, list[str]]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)
    try:
        data = json.loads(cleaned)
        summary = data.get("summary", "")
        suggestions = data.get("resource_suggestions", [])
        if isinstance(suggestions, list):
            suggestions = [str(s) for s in suggestions if s]
        return summary, suggestions
    except json.JSONDecodeError:
        logger.warning("ProductivityAgent: LLM returned non-JSON, using raw as summary")
        return raw.strip(), []


class ProductivityAgent(BaseAgent):
    async def process(self, site_id: str, video_result: VideoProcessingResult) -> ProductivityReport:
        # Phase 1 — deterministic
        trade_overlaps, zones, congestion_trend = _run_phase1(video_result)
        logger.info(
            "ProductivityAgent Phase 1: %d overlaps, %d zones, trend=%s",
            len(trade_overlaps),
            len(zones),
            congestion_trend,
        )

        # Phase 2 — LLM summary and suggestions
        summary = ""
        resource_suggestions: list[str] = []
        try:
            llm = get_llm_client()
            user_prompt = _build_productivity_prompt(video_result, trade_overlaps, congestion_trend)
            raw_response = await llm.chat(system=PRODUCTIVITY_SYSTEM_PROMPT, user=user_prompt)
            summary, resource_suggestions = _parse_productivity_response(raw_response)
        except Exception:
            logger.exception("ProductivityAgent Phase 2 LLM failed — using fallback")
            summary_text = _get_summary_text(video_result)
            if summary_text:
                summary = summary_text[:1500] + ("..." if len(summary_text) > 1500 else "")
            else:
                summary = (
                    f"Congestion trend: {congestion_trend}. "
                    f"{len(trade_overlaps)} trade overlap(s) detected. See overlaps and zones for details."
                )
            if trade_overlaps:
                resource_suggestions = [o.recommendation for o in trade_overlaps[:3]]

        return ProductivityReport(
            site_id=site_id,
            zones=zones,
            trade_overlaps=trade_overlaps,
            congestion_trend=congestion_trend,
            resource_suggestions=resource_suggestions,
            summary=summary,
            generated_at=datetime.now(timezone.utc),
        )
