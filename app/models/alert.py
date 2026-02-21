from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class AlertSeverity(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Alert(BaseModel):
    id: str
    site_id: str
    site_name: str
    severity: AlertSeverity
    title: str
    detail: str
    source_agent: str  # safety | productivity | video
    created_at: datetime
    acknowledged: bool = False


class AlertCreate(BaseModel):
    site_id: str
    site_name: str
    severity: AlertSeverity
    title: str
    detail: str
    source_agent: str
