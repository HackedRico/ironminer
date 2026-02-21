from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.models.alert import AlertSeverity
from app.models.site import Zone


class AnalysisResult(BaseModel):
    frame_id: str
    site_id: str
    zone_analysis: str
    relationships: str
    temporal: Optional[str] = None
    briefing: str
    timestamp: datetime


class SafetyViolation(BaseModel):
    zone: str
    type: str  # ppe_missing | zone_breach | clearance_issue | blocked_corridor
    description: str
    severity: AlertSeverity
    workers_affected: int


class SafetyReport(BaseModel):
    site_id: str
    violations: list[SafetyViolation] = []
    ppe_compliance: dict[str, bool] = {}
    zone_adherence: dict[str, bool] = {}
    overall_risk: str = "low"  # low | medium | high | critical
    summary: str = ""
    generated_at: datetime


class TradeOverlap(BaseModel):
    zone: str
    trades: list[str]
    severity: str  # minor | moderate | severe
    recommendation: str


class ProductivityReport(BaseModel):
    site_id: str
    zones: list[Zone] = []
    trade_overlaps: list[TradeOverlap] = []
    congestion_trend: str = "stable"  # improving | stable | worsening
    resource_suggestions: list[str] = []
    summary: str = ""
    generated_at: datetime


class SafetyAnalyzeRequest(BaseModel):
    site_id: str
    video_job_id: str


class ProductivityAnalyzeRequest(BaseModel):
    site_id: str
    video_job_id: str
