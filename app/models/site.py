from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class ZoneStatus(str, Enum):
    ok = "ok"
    warning = "warning"
    critical = "critical"


class Zone(BaseModel):
    zone: str
    congestion: int  # 1-5
    trades: list[str]
    workers: int
    status: ZoneStatus


class Site(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    status: str = "active"  # active | review | inactive
    progress: Optional[int] = None
    congestion: str = "low"  # low | medium | high
    trades: int = 0
    workers: int = 0
    frames: int = 0
    last_scan: Optional[datetime] = None
    zones: list[Zone] = []


class SiteCreate(BaseModel):
    name: str
    address: Optional[str] = None
