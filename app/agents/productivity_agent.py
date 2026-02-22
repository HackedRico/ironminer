"""Productivity Agent — congestion scoring, trade overlap, resource allocation.

Teammate: implement your productivity analysis logic here.
Input: VideoProcessingResult (fetch via GET /api/video/jobs/{id}/result)
Output: ProductivityReport
"""
from __future__ import annotations
from datetime import datetime, timezone

from app.agents.base import BaseAgent
from app.models.analysis import ProductivityReport
from app.models.video import VideoProcessingResult


def _get_summary_text(video_result: VideoProcessingResult) -> str | None:
    """Summary from local summary.txt (avoids Twelve Labs rate limit)."""
    if video_result.summary_text:
        return video_result.summary_text
    return video_result.metadata.get("summary_text") if video_result.metadata else None


class ProductivityAgent(BaseAgent):
    async def process(self, site_id: str, video_result: VideoProcessingResult) -> ProductivityReport:
        # Use local summary (e.g. summary.txt) when present; no Twelve Labs call
        summary_text = _get_summary_text(video_result)
        if summary_text:
            summary = summary_text.strip()
        else:
            summary = "No productivity analysis run yet."
        return ProductivityReport(
            site_id=site_id,
            summary=summary,
            generated_at=datetime.now(timezone.utc),
        )
