from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.video import VideoJob, VideoProcessingResult
from app.services.storage import VIDEO_JOBS, VIDEO_RESULTS
from app.services.job_queue import create_job, get_job
from app.agents.video_agent import VideoAgent

router = APIRouter()
agent = VideoAgent()


@router.post("/upload", response_model=VideoJob)
async def upload_video(
    file: UploadFile = File(...),
    site_id: Optional[str] = Form(None),
    frame_interval: float = Form(5.0),
):
    sid = site_id or file.filename or "unknown"
    job = create_job(sid)
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
    result = VIDEO_RESULTS.get(job_id)
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
    VIDEO_RESULTS[job_id] = body
    job = get_job(job_id)
    if job:
        job.status = "completed"
        job.frames = body.frames
        job.total_frames = len(body.frames)
        job.processed_frames = len(body.frames)
    return body
