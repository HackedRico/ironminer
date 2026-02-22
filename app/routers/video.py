from __future__ import annotations
import asyncio
import logging
import re
import uuid as _uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.video import VideoJob, VideoProcessingResult
from app.services import db
from app.services.job_queue import create_job, get_job, update_job
from app.services.storage import VIDEO_JOBS, VIDEO_RESULTS, PRODUCTIVITY_REPORTS, BRIEFINGS, SITES
from app.agents.video_agent import VideoAgent
from app.agents.safety_agent import SafetyAgent
from app.agents.productivity_agent import ProductivityAgent
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()
agent = VideoAgent()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _sanitize(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", name)


@router.post("/upload", response_model=VideoJob)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    site_id: Optional[str] = Form(None),
    uploaded_by: Optional[str] = Form(None),
    frame_interval: float = Form(5.0),
):
    sid = site_id or file.filename or "unknown"
    original_name = file.filename or "video"
    disk_name = f"{_uuid.uuid4().hex[:8]}_{_sanitize(original_name)}"
    dest = UPLOAD_DIR / disk_name

    data = await file.read()
    dest.write_bytes(data)

    rel_path = f"uploads/{disk_name}"
    job = create_job(sid, filename=original_name, uploaded_by=uploaded_by, file_path=rel_path)
    background_tasks.add_task(_process_video, job.job_id, sid, str(dest), frame_interval)
    return job


def _pipeline_msg(job_id: str, site_id: str, stage: str, data: dict | None = None) -> dict:
    return {
        "type": "pipeline_update",
        "job_id": job_id,
        "site_id": site_id,
        "stage": stage,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data or {},
    }


async def _process_video(job_id: str, site_id: str, file_path: str, frame_interval: float):
    """Run the video agent then auto-chain safety + productivity agents."""
    channel = f"pipeline:{site_id}"
    update_job(job_id, status="processing")
    try:
        result = await agent.process(
            job_id=job_id,
            site_id=site_id,
            file_path=file_path,
            frame_interval=frame_interval,
        )
        VIDEO_RESULTS[job_id] = result
        await db.save_video_result(job_id, site_id, result)
        update_job(
            job_id,
            status="completed",
            total_frames=len(result.frames),
            processed_frames=len(result.frames),
        )
        # Save briefing text so the UI can fetch it
        briefing = result.metadata.get("combined_briefing", "")
        if briefing:
            BRIEFINGS[site_id] = briefing
        logger.info("Job %s completed — %d frames", job_id, len(result.frames))
        await ws_manager.broadcast(channel, _pipeline_msg(job_id, site_id, "video_complete"))
    except Exception as e:
        logger.exception("Job %s failed", job_id)
        update_job(job_id, status="failed", error=str(e))
        await ws_manager.broadcast(
            channel, _pipeline_msg(job_id, site_id, "error", {"error": str(e)}),
        )
        return

    # ── Safety Agent ──────────────────────────────────────────────────────
    try:
        safety_report = await SafetyAgent().process(site_id, result)
        await db.save_safety_report(site_id, safety_report)
        logger.info("Job %s safety done — risk=%s", job_id, safety_report.overall_risk)
        await ws_manager.broadcast(
            channel,
            _pipeline_msg(job_id, site_id, "safety_complete", {
                "overall_risk": safety_report.overall_risk,
                "violation_count": len(safety_report.violations),
            }),
        )
    except Exception:
        logger.exception("Job %s safety agent failed", job_id)
        await ws_manager.broadcast(
            channel, _pipeline_msg(job_id, site_id, "error", {"error": "Safety agent failed"}),
        )

    # ── Productivity Agent ────────────────────────────────────────────────
    prod_report = None
    try:
        prod_report = await ProductivityAgent().process(site_id, result)
        PRODUCTIVITY_REPORTS[site_id] = prod_report
        logger.info("Job %s productivity done — trend=%s", job_id, prod_report.congestion_trend)
        await ws_manager.broadcast(
            channel,
            _pipeline_msg(job_id, site_id, "productivity_complete", {
                "congestion_trend": prod_report.congestion_trend,
                "overlap_count": len(prod_report.trade_overlaps),
            }),
        )
    except Exception:
        logger.exception("Job %s productivity agent failed", job_id)
        await ws_manager.broadcast(
            channel, _pipeline_msg(job_id, site_id, "error", {"error": "Productivity agent failed"}),
        )

    # ── Update site stats from pipeline results ─────────────────────────
    site = SITES.get(site_id)
    if site and prod_report:
        site.zones = prod_report.zones
        total_workers = sum(z.workers for z in prod_report.zones)
        unique_trades = set()
        for z in prod_report.zones:
            unique_trades.update(z.trades)
        site.workers = total_workers
        site.trades = len(unique_trades)
        site.frames = len(result.frames)
        max_cong = max((z.congestion for z in prod_report.zones), default=0)
        site.congestion = "high" if max_cong >= 4 else "medium" if max_cong >= 3 else "low"
        site.last_scan = datetime.now(timezone.utc)

    # ── Pipeline complete ─────────────────────────────────────────────────
    await ws_manager.broadcast(channel, _pipeline_msg(job_id, site_id, "pipeline_complete"))


@router.get("/jobs", response_model=list[VideoJob])
async def list_jobs(site_id: str | None = None, status: str | None = None):
    jobs = list(VIDEO_JOBS.values())
    if site_id:
        jobs = [j for j in jobs if j.site_id == site_id]
    if status:
        jobs = [j for j in jobs if j.status == status]
    return jobs


@router.get("/jobs/{job_id}", response_model=VideoJob)
async def get_job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/jobs/{job_id}/result", response_model=VideoProcessingResult)
async def get_job_result(job_id: str):
    result = await db.get_video_result(job_id)
    if not result:
        raise HTTPException(404, "Result not found — job may still be processing")
    return result


@router.post("/analyze-frame")
async def analyze_frame(body: dict):
    # TODO: run single-frame analysis via agent
    return {"status": "not implemented yet"}


@router.post("/jobs/{job_id}/complete", response_model=VideoProcessingResult)
async def complete_job(job_id: str, body: VideoProcessingResult):
    """Internal callback — Video Agent posts result when done."""
    await db.save_video_result(job_id, body.site_id, body)
    job = get_job(job_id)
    if job:
        job.status = "completed"
        job.frames = body.frames
        job.total_frames = len(body.frames)
        job.processed_frames = len(body.frames)
    return body
