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


# ── LiveKit models ─────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    room_name: str
    identity: str           # unique participant ID (e.g. "manager-1", "worker-j-martinez")
    display_name: Optional[str] = None


class TokenResponse(BaseModel):
    token: str
    room_name: str
    livekit_url: str        # ws://localhost:7880 — frontend connects here directly


class WorkerInfo(BaseModel):
    identity: str           # unique, e.g. "worker-j-martinez"
    display_name: str       # e.g. "J. Martinez"
    site_id: str
    feed_id: Optional[str] = None   # links to a FeedConfig if applicable
    status: str = "online"          # online | offline | streaming
    room_name: str                  # e.g. "site-s1"
    registered_at: datetime
    last_heartbeat: datetime


class WorkerStatusUpdate(BaseModel):
    status: str             # online | offline | streaming


class WorkerRegisterRequest(BaseModel):
    identity: str
    display_name: str
    site_id: str
    feed_id: Optional[str] = None
