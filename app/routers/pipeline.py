"""
Single endpoint to run the full processing workflow: summary → safety + productivity.
Easily reversible: if you remove this router, use the old per-agent endpoints from the frontend.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.safety_agent import SafetyAgent
from app.agents.productivity_agent import ProductivityAgent
from app.models.video import VideoProcessingResult
from app.models.analysis import SafetyReport, ProductivityReport
from app.services import db
from app.services.storage import PRODUCTIVITY_REPORTS

router = APIRouter()
safety_agent = SafetyAgent()
productivity_agent = ProductivityAgent()

# Default path for summary.txt (relative to process cwd, usually repo root)
DEFAULT_SUMMARY_PATH = Path("app/summarizer/summary.txt")


class RunPipelineRequest(BaseModel):
    site_id: str
    video_job_id: str
    summary_text: str | None = None  # if omitted, backend tries app/summarizer/summary.txt


class RunPipelineResponse(BaseModel):
    safety_report: SafetyReport
    productivity_report: ProductivityReport


def _load_summary_text(provided: str | None) -> str:
    if provided and provided.strip():
        return provided.strip()
    path = DEFAULT_SUMMARY_PATH
    if path.exists():
        return path.read_text().strip()
    return ""


@router.post("/run", response_model=RunPipelineResponse)
async def run_pipeline(body: RunPipelineRequest) -> RunPipelineResponse:
    """
    Run the full workflow: ensure video result has summary_text, then run safety and
    productivity analysis. Returns both reports so the dashboard can show them.
    """
    job_id = body.video_job_id
    site_id = body.site_id
    summary_text = _load_summary_text(body.summary_text)

    # 1) Get or create video result and set summary_text
    result = await db.get_video_result(job_id)
    if result is None:
        result = VideoProcessingResult(
            job_id=job_id,
            site_id=site_id,
            frames=[],
            zones=[],
            trade_proximities=[],
            temporal_events=[],
            metadata={},
            summary_text=summary_text or None,
        )
    else:
        result.summary_text = summary_text or result.summary_text
    await db.save_video_result(job_id, site_id, result)

    # 2) Safety analysis
    safety_report = await safety_agent.process(site_id=site_id, video_result=result)
    await db.save_safety_report(site_id, safety_report)

    # 3) Productivity analysis (stored in PRODUCTIVITY_REPORTS; no db.save_productivity_report yet)
    productivity_report = await productivity_agent.process(site_id=site_id, video_result=result)
    PRODUCTIVITY_REPORTS[site_id] = productivity_report

    return RunPipelineResponse(safety_report=safety_report, productivity_report=productivity_report)
