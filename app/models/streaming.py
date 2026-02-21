from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.models.alert import Alert


class FeedConfig(BaseModel):
    id: str
    label: str
    site_id: str
    site_name: str
    worker: Optional[str] = None
    type: str = "fixed"  # fixed | helmet
    auto_scan: bool = False
    scan_interval: int = 30


class FeedCreate(BaseModel):
    label: str
    site_id: str
    site_name: str
    worker: Optional[str] = None
    type: str = "fixed"


class LiveScanResult(BaseModel):
    feed_id: str
    frame_id: str
    scan_text: str
    alerts_generated: list[Alert] = []
    scanned_at: datetime


class AutoScanRequest(BaseModel):
    enabled: bool
    interval_seconds: int = 30
