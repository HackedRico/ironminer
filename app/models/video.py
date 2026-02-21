from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class FrameData(BaseModel):
    id: str
    site_id: str
    timestamp: float
    image_data: str  # base64 or URL
    filename: str


class VideoJob(BaseModel):
    job_id: str
    status: str  # queued | processing | completed | failed
    site_id: str
    filename: Optional[str] = None
    uploaded_by: Optional[str] = None
    file_path: Optional[str] = None
    total_frames: Optional[int] = None
    processed_frames: int = 0
    frames: list[FrameData] = []
    created_at: datetime
    error: Optional[str] = None


class VideoProcessingResult(BaseModel):
    job_id: str
    site_id: str
    frames: list[FrameData] = []
    zone_analyses: dict[str, str] = {}
    entity_relationships: dict[str, str] = {}
    temporal_chain: Optional[list[str]] = None
    metadata: dict[str, Any] = {}


class FrameAnalyzeRequest(BaseModel):
    frame_id: str
    image_data: str
