from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DetectionResult(BaseModel):
    bbox: list[float]   # [x1, y1, x2, y2] in original image pixels
    label: str
    confidence: float


class EmbeddedObject(BaseModel):
    id: str
    feed_id: str
    site_id: str
    worker_identity: Optional[str] = None
    crop_b64: str           # base64 JPEG of the cropped region (for thumbnail)
    bbox: list[float]       # [x1, y1, x2, y2]
    label: str
    note: str               # final note text (transcript or typed)
    embedding: list[float]  # 512-dim NV-CLIP vector
    created_at: datetime


class EmbedObjectCreate(BaseModel):
    feed_id: str
    site_id: str
    worker_identity: Optional[str] = None
    frame_b64: str          # full captured frame (base64 JPEG)
    bbox: list[float]       # [x1, y1, x2, y2] of the selected object
    label: str
    note: Optional[str] = None
    audio_b64: Optional[str] = None


class DetectRequest(BaseModel):
    image_b64: str          # base64 JPEG of the frame to detect objects in
