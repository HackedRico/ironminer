from __future__ import annotations
import re
import uuid as _uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.video import VideoJob, VideoProcessingResult
from app.services.storage import VIDEO_JOBS
from app.services import db
from app.services.job_queue import create_job, get_job
from app.agents.video_agent import VideoAgent

router = APIRouter()
agent = VideoAgent()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def _sanitize(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", name)


@router.post("/upload", response_model=VideoJob)
async def upload_video(
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
    # TODO: kick off agent.process() in background task
    return job


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
