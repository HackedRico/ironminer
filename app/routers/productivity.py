from __future__ import annotations
from fastapi import APIRouter, HTTPException

from app.models.analysis import ProductivityReport, ProductivityAnalyzeRequest, TradeOverlap
from app.models.site import Zone
from app.services.storage import PRODUCTIVITY_REPORTS, VIDEO_RESULTS, SITES
from app.agents.productivity_agent import ProductivityAgent

router = APIRouter()
agent = ProductivityAgent()


@router.post("/analyze", response_model=ProductivityReport)
async def run_productivity_analysis(body: ProductivityAnalyzeRequest):
    video_result = VIDEO_RESULTS.get(body.video_job_id)
    if not video_result:
        raise HTTPException(404, "Video result not found — run video processing first")
    report = await agent.process(site_id=body.site_id, video_result=video_result)
    PRODUCTIVITY_REPORTS[body.site_id] = report
    return report


@router.get("/report/{site_id}", response_model=ProductivityReport)
async def get_productivity_report(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report


@router.get("/report/{site_id}/zones", response_model=list[Zone])
async def get_zones(site_id: str):
    # Return zones from the site directly (populated by analysis or seed data)
    site = SITES.get(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    return site.zones


@router.get("/report/{site_id}/overlaps", response_model=list[TradeOverlap])
async def get_overlaps(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report.trade_overlaps


@router.get("/report/{site_id}/suggestions")
async def get_suggestions(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report.resource_suggestions


@router.get("/trend/{site_id}")
async def get_trend(site_id: str, hours: int = 24):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    trend = report.congestion_trend if report else "stable"
    return {"trend": trend, "data_points": []}
