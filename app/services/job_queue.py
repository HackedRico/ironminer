"""Simple in-memory job tracking for video processing."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

from app.models.video import VideoJob
from app.services.storage import VIDEO_JOBS


def create_job(
    site_id: str,
    filename: str | None = None,
    uploaded_by: str | None = None,
    file_path: str | None = None,
) -> VideoJob:
    job_id = f"vj_{uuid.uuid4().hex[:8]}"
    job = VideoJob(
        job_id=job_id,
        status="queued",
        site_id=site_id,
        filename=filename,
        uploaded_by=uploaded_by,
        file_path=file_path,
        created_at=datetime.now(timezone.utc),
    )
    VIDEO_JOBS[job_id] = job
    return job


def get_job(job_id: str) -> VideoJob | None:
    return VIDEO_JOBS.get(job_id)


def update_job(job_id: str, **kwargs) -> VideoJob | None:
    job = VIDEO_JOBS.get(job_id)
    if not job:
        return None
    for k, v in kwargs.items():
        setattr(job, k, v)
    VIDEO_JOBS[job_id] = job
    return job
